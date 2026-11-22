import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { createApp } from "../src/app.js";
import { applyMigrations } from "../src/migrations.js";
import { hashPassword } from "../src/security.js";
import { versionStatuses, duCsv } from "../src/browser-imports.js";
import { sourceGroup } from "../src/import-sources.js";

const DU_JSON = JSON.stringify({
  format: "du-teacher-v1",
  header: { text: "Back\nИванов Иван\nIvanov Ivan\nivanov@example.edu\nSenior lecturer\nSchool of Computing" },
  sections: {
    "Scientific information": {
      headers: ["Work ID", "URL"],
      rows: [[{ text: "0000-0001", links: [] }, { text: "https://orcid.org/0000-0001", links: ["https://orcid.org/0000-0001"] }]],
    },
  },
});

test("import sources are grouped by platform", () => {
  assert.equal(sourceGroup("https://du.astanait.edu.kz/x"), "du");
  assert.equal(sourceGroup("https://my-du.astanait.edu.kz/x"), "mydu");
  assert.equal(sourceGroup("https://lms.astanait.edu.kz/x"), "lms");
  assert.equal(sourceGroup("https://www.scopus.com/authid/1"), "scopus");
  assert.equal(sourceGroup("https://www.researchgate.net/profile/a"), "researchgate");
  assert.equal(sourceGroup("https://anything.example/x", "onedrive"), "onedrive");
});

test("version status: newest is current, superseded is outdated, identical re-download is a duplicate", () => {
  const rows = [
    { id: "c", source_url: "u", content_sha256: "B", created_at: "2026-11-22T10:00:00Z" },
    { id: "b", source_url: "u", content_sha256: "A", created_at: "2026-11-21T10:00:00Z" },
    { id: "d", source_url: "u", content_sha256: "A", created_at: "2026-11-20T10:00:00Z" },
    { id: "x", source_url: "other", content_sha256: "A", created_at: "2026-11-20T10:00:00Z" },
  ];
  const s = versionStatuses(rows);
  // Oldest first: d holds content A; b re-downloads A later, so b is a duplicate;
  // c (new content B) supersedes d, which becomes outdated.
  assert.equal(s.get("c"), "current");
  assert.equal(s.get("b"), "duplicate");
  assert.equal(s.get("d"), "outdated");
  assert.equal(s.get("x"), "current");
});

test("a repeated download of the newest content is marked as a duplicate", () => {
  const rows = [
    { id: "new", source_url: "u", content_sha256: "A", created_at: "2026-11-22T10:00:00Z" },
    { id: "old", source_url: "u", content_sha256: "A", created_at: "2026-11-21T10:00:00Z" },
  ];
  const s = versionStatuses(rows);
  assert.equal(s.get("old"), "current");
  assert.equal(s.get("new"), "duplicate");
});

test("DU profile downloads as CSV with one block per section", () => {
  const csv = duCsv(DU_JSON);
  assert.match(csv, /Section: Scientific information/);
  assert.match(csv, /Work ID,URL/);
  assert.match(csv, /0000-0001,https:\/\/orcid\.org\/0000-0001\n/);
});

test("describe asks the model for a summary, requires consent for cloud and caches the result", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  await db.query("INSERT INTO users(email,name,role,password_hash) VALUES('t@test.edu','Teacher','teacher',$1)", [await hashPassword("Test-password-123")]);
  const { rows: [{ id: uid }] } = await db.query("SELECT id FROM users");
  const { rows: [src] } = await db.query(
    "INSERT INTO browser_imports(user_id,source_url,content,status) VALUES($1,'https://du.astanait.edu.kz/profile','Publications: 3 items, 2024-2025','accepted') RETURNING id",
    [uid],
  );
  const calls = [];
  const ai = {
    cloudConfigured: true,
    localModels: async () => [{ name: "qwen3:4b" }],
    json: async (args) => {
      calls.push(args);
      return { summary: "Three publications from 2024 and 2025." };
    },
  };
  const app = await createApp(db, { ai: { client: ai } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const cookie = (await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" }, body: JSON.stringify({ email: "t@test.edu", password: "Test-password-123" }) })).headers.get("set-cookie").split(";")[0];
  const post = (path, body) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "http://localhost:5173" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

  const cloudNoConsent = await post(`/browser-imports/${src.id}/describe`, { provider: "cloud" });
  assert.equal(cloudNoConsent.status, 400);
  assert.equal(calls.length, 0, "no model call without consent");

  const local = await post(`/browser-imports/${src.id}/describe`, {});
  assert.equal(local.status, 200);
  assert.equal(local.body.summary, "Three publications from 2024 and 2025.");
  assert.equal(calls[0].provider, "local");

  const again = await post(`/browser-imports/${src.id}/describe`, {});
  assert.equal(again.body.cached, true);
  assert.equal(calls.length, 1, "cached description is reused");

  const list = await fetch(base + "/browser-imports", { headers: { Cookie: cookie } }).then((r) => r.json());
  assert.equal(list.imports[0].ai_summary, "Three publications from 2024 and 2025.");
  assert.equal(list.imports[0].version, "current");
});
