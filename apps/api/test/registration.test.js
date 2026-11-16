import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { createApp } from "../src/app.js";
import { applyMigrations } from "../src/migrations.js";

async function serve(t, options) {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  const app = await createApp(db, options);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (path, body, cookie = "") =>
    fetch(base + path, {
      method: "POST",
      headers: { Origin: "http://localhost:5173", "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  return { db, base, post };
}

test("registration is off by default", async (t) => {
  const { base, post } = await serve(t);
  assert.deepEqual(await (await fetch(base + "/auth/options")).json(), { registration: false });
  const r = await post("/auth/register", { name: "New Student", email: "new@test.edu", password: "Long-password-123" });
  assert.equal(r.status, 403);
});

test("self-registration creates a signed-in student only", async (t) => {
  const { db, base, post } = await serve(t, { allowRegistration: true });
  assert.deepEqual(await (await fetch(base + "/auth/options")).json(), { registration: true });
  assert.equal((await post("/auth/register", { name: "Short", email: "a@test.edu", password: "short" })).status, 400);
  assert.equal(
    (await post("/auth/register", { name: "Sneaky", email: "b@test.edu", password: "Long-password-123", role: "teacher" })).status,
    400,
  );
  const created = await post("/auth/register", { name: "New Student", email: "New@Test.edu", password: "Long-password-123" });
  assert.equal(created.status, 201);
  const { user } = await created.json();
  assert.equal(user.role, "student");
  assert.equal(user.email, "new@test.edu");
  const cookie = created.headers.get("set-cookie").split(";")[0];
  const me = await (await fetch(base + "/auth/me", { headers: { Cookie: cookie } })).json();
  assert.equal(me.user.email, "new@test.edu");
  assert.equal((await post("/auth/register", { name: "Again", email: "new@test.edu", password: "Long-password-123" })).status, 409);
  assert.equal((await post("/auth/login", { email: "new@test.edu", password: "Long-password-123" })).status, 200);
  const row = (await db.query("SELECT password_hash FROM users WHERE email='new@test.edu'")).rows[0];
  assert.doesNotMatch(row.password_hash, /Long-password-123/);
});
