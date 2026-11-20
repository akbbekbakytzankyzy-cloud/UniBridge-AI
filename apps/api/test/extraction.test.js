import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { createApp } from "../src/app.js";
import { applyMigrations } from "../src/migrations.js";
import { hashPassword } from "../src/security.js";

const fixture = (f) => JSON.parse(readFileSync(new URL(`./fixtures/synthetic/${f}`, import.meta.url), "utf8"));
const pages = fixture("pages.json");
const answers = fixture("answers.json");

// Stand-in for the model: returns a fixed, schema-shaped answer per page.
// The answer key is never passed to it.
const modelAnswers = {
  P1: { records: [
    { record_type: "publication", title: "Smart Campus Energy Optimization", fields: { year: 2025, date: null, doi: "10.5555/syn.2025.001", venue: "Journal of Synthetic Systems", term: null, credits: null, start_year: null, end_year: null, budget: null, certificate_number: null }, missing: [], warnings: [] },
    { record_type: "publication", title: "Textbook of Applied Data Mining", fields: { year: 2024, date: null, doi: null, venue: "Demo Press", term: null, credits: null, start_year: null, end_year: null, budget: null, certificate_number: null }, missing: ["doi"], warnings: [] },
    { record_type: "publication", title: "Smart Campus Energy Optimisation", fields: { year: 2025, date: null, doi: "10.5555/syn.2025.001", venue: "Journal of Synthetic Systems", term: null, credits: null, start_year: null, end_year: null, budget: null, certificate_number: null }, missing: [], warnings: ["Duplicate of the first record with the same DOI"] },
  ] },
  P2: { records: [
    { record_type: "certificate", title: "Teaching Excellence Course", fields: { year: null, date: "2024-03-12", doi: null, venue: null, term: null, credits: null, start_year: null, end_year: null, budget: null, certificate_number: null }, missing: ["certificate_number"], warnings: [] },
  ] },
  P3: { records: [
    { record_type: "material", title: "Problem set 2", fields: { year: null, date: null, doi: null, venue: null, term: null, credits: null, start_year: null, end_year: null, budget: null, certificate_number: null }, missing: ["year"], warnings: ["Year not given on the page"] },
  ] },
};

test("extraction makes drafts only, reports missing values and never confirms without the owner", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  await db.query("INSERT INTO users(email,name,role,password_hash) VALUES('t@test.edu','Teacher','teacher',$1)", [await hashPassword("Test-password-123")]);
  const { rows: [{ id: userId }] } = await db.query("SELECT id FROM users WHERE email='t@test.edu'");
  const sourceIds = {};
  for (const p of pages) {
    const { rows } = await db.query(
      "INSERT INTO browser_imports(user_id,source_url,content,status) VALUES($1,$2,$3,'accepted') RETURNING id",
      [userId, p.sourceUrl, p.text],
    );
    sourceIds[p.id] = rows[0].id;
  }
  const seenPrompts = [];
  const ai = {
    json: async ({ user, schema, provider }) => {
      seenPrompts.push(user);
      assert.equal(provider, "local");
      assert.ok(schema.required.includes("records"));
      const page = pages.find((p) => user.includes(p.text.slice(0, 40)));
      return modelAnswers[page.id];
    },
  };
  const app = await createApp(db, { ai: { client: ai } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const login = await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" }, body: JSON.stringify({ email: "t@test.edu", password: "Test-password-123" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const call = (path, method = "POST", body = {}) => fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "http://localhost:5173" }, body: method === "GET" ? undefined : JSON.stringify(body) });

  // The page text reaches the model as data, between markers.
  const r1 = await call(`/extraction/sources/${sourceIds.P1}/extract`);
  assert.equal(r1.status, 201);
  assert.match(seenPrompts[0], /PAGE TEXT START/);
  // Cloud use without consent is refused.
  assert.equal((await call(`/extraction/sources/${sourceIds.P2}/extract`, "POST", { provider: "cloud" })).status, 400);

  await call(`/extraction/sources/${sourceIds.P2}/extract`);
  await call(`/extraction/sources/${sourceIds.P3}/extract`);
  const drafts = (await (await call("/extraction/drafts", "GET")).json()).drafts;
  assert.equal(drafts.length, 5);
  // Nothing reaches the publication list before the owner confirms.
  assert.equal((await db.query("SELECT count(*)::int AS n FROM publications")).rows[0].n, 0);
  // Missing values stay missing: no invented budget, certificate number or year.
  const cert = drafts.find((d) => d.record_type === "certificate");
  assert.equal(cert.data.date, "2024-03-12");
  assert.equal(cert.data.certificate_number, undefined);
  assert.deepEqual(cert.missing_fields, ["certificate_number"]);
  const material = drafts.find((d) => d.data.title === "Problem set 2");
  assert.equal(material.data.year, undefined);
  // The duplicate is kept as a warning, not as a second confirmed record.
  const dup = drafts.find((d) => d.warnings.some((w) => /Duplicate/.test(w)));
  assert.ok(dup);

  // Confirm the first publication; the duplicate is rejected.
  const pub = drafts.find((d) => d.data.title === "Smart Campus Energy Optimization");
  assert.equal((await call(`/extraction/drafts/${pub.id}/confirm`)).status, 200);
  assert.equal((await call(`/extraction/drafts/${dup.id}/reject`)).status, 200);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM publications")).rows[0].n, 1);
  // Re-running extraction replaces only pending drafts, never confirmed ones.
  await call(`/extraction/sources/${sourceIds.P1}/extract`);
  const after = await db.query("SELECT status, count(*)::int AS n FROM extraction_drafts WHERE source_id=$1 GROUP BY status", [sourceIds.P1]);
  assert.ok(after.rows.some((r) => r.status === "confirmed" && r.n === 1));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM publications WHERE doi='10.5555/syn.2025.001'")).rows[0].n, 1);
  // Another user's source cannot be extracted.
  await db.query("INSERT INTO users(email,name,role,password_hash) VALUES('o@test.edu','Other','teacher',$1)", [await hashPassword("Test-password-123")]);
  const other = await (await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" }, body: JSON.stringify({ email: "o@test.edu", password: "Test-password-123" }) })).headers.get("set-cookie").split(";")[0];
  const denied = await fetch(`${base}/extraction/sources/${sourceIds.P1}/extract`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: other, Origin: "http://localhost:5173" }, body: "{}" });
  assert.equal(denied.status, 404);
  assert.ok(answers.P1.must_not_create);
});
