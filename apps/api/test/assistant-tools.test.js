import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { createApp } from "../src/app.js";
import { applyMigrations } from "../src/migrations.js";
import { hashPassword } from "../src/security.js";

test("the assistant answers from its own records through read-only tools", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  for (const e of ["mine@test.edu", "other@test.edu"])
    await db.query("INSERT INTO users(email,name,role,password_hash) VALUES($1,$1,'teacher',$2)", [e, await hashPassword("Test-password-123")]);
  const ids = Object.fromEntries((await db.query("SELECT email,id FROM users")).rows.map((r) => [r.email, r.id]));
  await db.query("INSERT INTO publications(owner_id,title,year,verification_status) VALUES($1,'Smart Campus Energy Optimization',2025,'confirmed')", [ids["mine@test.edu"]]);
  await db.query("INSERT INTO publications(owner_id,title,year,verification_status) VALUES($1,'Secret Other Persons Paper',2024,'confirmed')", [ids["other@test.edu"]]);

  const seen = [];
  const writes = [];
  const ai = { json: async ({ model, user, schema }) => {
    seen.push(user);
    assert.equal(model, "qwen3:4b");
    assert.ok(schema.required.includes("tool"));
    if (!/TOOL RESULTS SO FAR/.test(user))
      return { tool: "search_my_records", args: { query: "Energy" }, answer: null };
    return { tool: null, args: {}, answer: "You have one article: Smart Campus Energy Optimization (2025) [publications]." };
  } };
  const app = await createApp(db, { ai: { client: ai, fetcher: async (url) => {
    if (url.pathname === "/api/tags") return Response.json({ models: [{ name: "qwen3:4b" }] });
    if (url.pathname === "/api/chat") return Response.json({ done: true, message: { content: "Plain reply" }, done_reason: "stop" });
    return Response.json({});
  } } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const login = async (e) => (await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" }, body: JSON.stringify({ email: e, password: "Test-password-123" }) })).headers.get("set-cookie").split(";")[0];
  const cookie = await login("mine@test.edu");
  // The chat uses local models when the model is installed; here the status check
  // is answered by the mock fetcher below, so use the local path directly.
  const r = await fetch(base + "/ai/chat", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "http://localhost:5173" }, body: JSON.stringify({ model: "qwen3:4b", grounding: "tools", messages: [{ role: "user", content: "what articles do I have about energy?" }] }) });
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  assert.deepEqual(body.toolsUsed, ["search_my_records"]);
  assert.match(body.message.content, /Smart Campus Energy/);
  // The tool result that reached the model contains only this user's data.
  const toolResult = seen.at(-1);
  assert.match(toolResult, /Smart Campus Energy/);
  assert.doesNotMatch(toolResult, /Secret Other Persons Paper/);
  // Nothing was written by the assistant.
  assert.equal((await db.query("SELECT count(*)::int AS n FROM publications")).rows[0].n, 2);
  assert.equal(writes.length, 0);
  // The default chat (grounding none) does not call tools.
  const plain = await fetch(base + "/ai/chat", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "http://localhost:5173" }, body: JSON.stringify({ model: "qwen3:4b", grounding: "none", messages: [{ role: "user", content: "Hi" }] }) });
  assert.equal(plain.status, 200);
  const plainBody = await plain.json();
  assert.equal(plainBody.toolsUsed, undefined);
  assert.equal(plainBody.message.content, "Plain reply");
});
