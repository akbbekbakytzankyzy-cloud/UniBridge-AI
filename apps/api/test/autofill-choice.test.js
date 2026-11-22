import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { createApp } from "../src/app.js";
import { applyMigrations } from "../src/migrations.js";
import { hashPassword } from "../src/security.js";

test("autofill lets the owner choose the model: only configured cloud models with consent, only installed local models", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  await db.query("INSERT INTO users(email,name,role,password_hash) VALUES('t@test.edu','Teacher','teacher',$1)", [await hashPassword("Test-password-123")]);
  const { rows: [{ id: uid }] } = await db.query("SELECT id FROM users");
  await db.query("INSERT INTO faculty_profiles(user_id,details,revision) VALUES($1,'{}'::jsonb,1)", [uid]);
  await db.query("INSERT INTO publications(owner_id,title,year,verification_status) VALUES($1,'Confirmed paper',2025,'confirmed')", [uid]);
  const calls = [];
  const ai = {
    cloudConfigured: true,
    localModels: async () => [{ name: "qwen3:4b" }],
    json: async (args) => {
      calls.push(args);
      return { suggestions: [] };
    },
  };
  const app = await createApp(db, { ai: { client: ai } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const cookie = (await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" }, body: JSON.stringify({ email: "t@test.edu", password: "Test-password-123" }) })).headers.get("set-cookie").split(";")[0];
  const post = (path, body) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "http://localhost:5173" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

  const options = await fetch(base + "/autofill/options", { headers: { Cookie: cookie } }).then((r) => r.json());
  assert.ok(options.cloud.models.length >= 1, "cloud models are listed");
  assert.deepEqual(options.local.models, ["qwen3:4b"]);

  // Cloud without consent, or with a model that is not configured, never reaches the model.
  assert.equal((await post("/autofill/profile/suggest", { provider: "cloud", model: options.cloud.models[0] })).status, 400);
  assert.equal((await post("/autofill/profile/suggest", { provider: "cloud", model: "vendor/unknown", cloudConsent: true })).status, 400);
  // Local model that is not installed is refused, not replaced silently.
  assert.equal((await post("/autofill/profile/suggest", { provider: "local", model: "llama3:8b" })).status, 400);
  assert.equal(calls.length, 0);

  const ok = await post("/autofill/profile/suggest", { provider: "cloud", model: options.cloud.models[0], cloudConsent: true, sources: ["publications"] });
  assert.equal(ok.status, 200);
  assert.equal(calls[0].provider, "cloud");
  assert.equal(calls[0].model, options.cloud.models[0]);
  assert.match(calls[0].user, /Confirmed paper/);

  const local = await post("/autofill/profile/suggest", { provider: "local", model: "qwen3:4b", sources: ["publications"] });
  assert.equal(local.status, 200);
  assert.equal(calls[1].provider, "local");
  assert.equal(calls[1].model, "qwen3:4b");
});
