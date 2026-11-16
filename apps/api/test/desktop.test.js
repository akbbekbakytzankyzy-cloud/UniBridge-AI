import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { createApp } from "../src/app.js";
import { applyMigrations } from "../src/migrations.js";

test("desktop mode serves the UI on the API origin without https upgrades", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  const web = await mkdtemp(join(tmpdir(), "ub-web-"));
  await writeFile(join(web, "index.html"), "<!doctype html><title>UI</title>");
  await writeFile(join(web, "app.js"), "console.log(1)");
  const app = await createApp(db, { origin: "http://localhost:3417", staticDir: web });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const index = await fetch(base + "/");
  assert.equal(index.status, 200);
  assert.match(await index.text(), /<title>UI<\/title>/);
  assert.doesNotMatch(index.headers.get("content-security-policy"), /upgrade-insecure-requests/);
  assert.equal((await fetch(base + "/app.js")).status, 200);
  const deep = await fetch(base + "/courses/123", { headers: { Accept: "text/html" } });
  assert.match(await deep.text(), /<title>UI<\/title>/); // client-side routes
  assert.equal((await fetch(base + "/api/health")).status, 200);
  assert.equal((await fetch(base + "/api/unknown")).status, 401); // API never falls through to the UI
  const production = await createApp(db, { production: true });
  const s2 = production.listen(0, "127.0.0.1");
  await new Promise((r) => s2.once("listening", r));
  t.after(() => new Promise((r) => s2.close(r)));
  const h = await fetch(`http://127.0.0.1:${s2.address().port}/api/health`);
  assert.match(h.headers.get("content-security-policy"), /upgrade-insecure-requests/);
});
