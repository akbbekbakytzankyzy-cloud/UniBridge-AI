import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { createApp } from "../src/app.js";
import { applyMigrations } from "../src/migrations.js";
import { hashPassword } from "../src/security.js";

const profile = JSON.parse(readFileSync(new URL("./fixtures/synthetic/profile.json", import.meta.url), "utf8"));

test("autofill suggests only empty, confirmed-sourced values and never overwrites", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  await db.query("INSERT INTO users(email,name,role,password_hash) VALUES('t@test.edu','Teacher','teacher',$1)", [await hashPassword("Test-password-123")]);
  const { rows: [{ id: uid }] } = await db.query("SELECT id FROM users");
  await db.query("INSERT INTO faculty_profiles(user_id,details,revision) VALUES($1,$2::jsonb,1)", [uid, JSON.stringify({ name_cyrillic: profile.name_cyrillic, department: profile.department, orcid: profile.orcid })]);
  await db.query("INSERT INTO publications(owner_id,title,year,doi,venue,authors,verification_status) VALUES($1,'Smart Campus Energy Optimization',2025,'10.5555/syn.2025.001','Journal of Synthetic Systems','', 'confirmed')", [uid]);
  await db.query("INSERT INTO publications(owner_id,title,year,verification_status) VALUES($1,'Unconfirmed draft',2026,'unverified')", [uid]);

  const { rows: [src] } = await db.query("INSERT INTO browser_imports(user_id,source_url,content,status) VALUES($1,'https://du.astanait.edu.kz/profile/synthetic-2','Degree: Master of Computing (synthetic)','accepted') RETURNING id", [uid]);
  await db.query("INSERT INTO extraction_drafts(user_id,source_id,record_type,data,model,status) VALUES($1,$2,'certificate','{\"title\":\"Degree record\",\"degree_field\":\"Computing\"}'::jsonb,'qwen3:4b','confirmed')", [uid, src.id]);
  const prompts = [];
  let reply = { suggestions: [
    { field: "degree_field", value: "Computing", source: "[D1]", reason: "stated" },
    { field: "name_cyrillic", value: "Changed Name", source: "[ORCID]", reason: "wrong, already filled" },
    { field: "position", value: "Professor", source: "[P1]", reason: "invented" },
  ] };
  const ai = { json: async ({ provider, model, user }) => {
    prompts.push({ provider, model, user });
    if (reply === "fail") throw new Error("down");
    return reply;
  } };
  const app = await createApp(db, { ai: { client: ai } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const cookie = (await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" }, body: JSON.stringify({ email: "t@test.edu", password: "Test-password-123" }) })).headers.get("set-cookie").split(";")[0];
  const call = (path, body) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "http://localhost:5173" }, body: JSON.stringify(body || {}) }).then(async (r) => ({ status: r.status, body: await r.json() }));

  const s = await call("/autofill/profile/suggest");
  assert.equal(s.status, 200);
  // Local model only, and personal fields never reach the prompt.
  assert.ok(prompts.every((p) => p.provider === "local" && p.model === "qwen3:4b"));
  assert.doesNotMatch(prompts[0].user, /phone|hire_date|employment/);
  // Only empty fields with values present in the confirmed data survive.
  assert.deepEqual(s.body.suggestions.map((x) => x.field), ["degree_field"]);
  assert.equal(s.body.dropped, 2);

  // Applying needs the current revision and never overwrites a filled field.
  assert.equal((await call("/autofill/profile/apply", { revision: 99, values: { degree_field: "Computing" } })).status, 409);
  const ok = await call("/autofill/profile/apply", { revision: 1, values: { degree_field: "Computing", name_cyrillic: "Changed Name" } });
  assert.equal(ok.status, 200);
  const { rows: [row] } = await db.query("SELECT details FROM faculty_profiles WHERE user_id=$1", [uid]);
  assert.equal(row.details.degree_field, "Computing");
  assert.equal(row.details.name_cyrillic, profile.name_cyrillic);
  assert.equal(row.details.name_cyrillic === "Changed Name", false);

  // With the local model down, the answer is an honest error, not a guess.
  reply = "fail";
  const down = await call("/autofill/profile/suggest");
  assert.equal(down.status, 503);
});
