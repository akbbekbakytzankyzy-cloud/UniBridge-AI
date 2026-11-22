import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import ExcelJS from "exceljs";
import { applyMigrations } from "../src/migrations.js";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/security.js";
import { decrypt, encrypt, fileToText } from "../src/onedrive.js";

const GRAPH = "https://graph.microsoft.com/v1.0";

// A small stand-in for Microsoft identity + Graph, so no real account is needed.
function fakeMicrosoft(files) {
  const calls = { token: [] };
  let refreshCount = 0;
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fetch = async (url, options = {}) => {
    url = String(url);
    if (url.includes("/oauth2/v2.0/token")) {
      const body = new URLSearchParams(String(options.body));
      calls.token.push(Object.fromEntries(body));
      if (body.get("grant_type") === "authorization_code")
        return body.get("code") === "good-code" && body.get("code_verifier")
          ? json({ access_token: "access-0", refresh_token: "refresh-0" })
          : json({ error: "invalid_grant" }, 400);
      if (body.get("refresh_token") !== `refresh-${refreshCount}`)
        return json({ error: "invalid_grant" }, 400);
      refreshCount++;
      return json({ access_token: `access-${refreshCount}`, refresh_token: `refresh-${refreshCount}` });
    }
    assert.match(options.headers?.Authorization || "", /^Bearer access-\d+$/);
    if (url.startsWith(`${GRAPH}/me?`)) return json({ userPrincipalName: "teacher@uni.example" });
    if (url.startsWith(`${GRAPH}/me/drive/items/root/children`))
      return json({ value: [{ id: "F1", name: "Teacher data", folder: { childCount: 4 } }] });
    if (url.startsWith(`${GRAPH}/me/drive/items/F1/children`))
      return json({ value: files.map(({ body, ...meta }) => ({ ...meta, file: {} })) });
    const content = url.match(/\/me\/drive\/items\/([^/]+)\/content$/);
    if (content) {
      const f = files.find((x) => x.id === decodeURIComponent(content[1]));
      return new Response(f.body);
    }
    return json({ error: "not found" }, 404);
  };
  return { fetch, calls };
}

test("files convert to text for review", async () => {
  assert.equal((await fileToText("a.csv", Buffer.from("Name,Year\nX,2024"))).trim(), "Name,Year\nX,2024");
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Publications").addRows([["Title", "Year"], ["Graph search", 2025]]);
  const text = await fileToText("p.xlsx", Buffer.from(await book.xlsx.writeBuffer()));
  assert.match(text, /## Sheet: Publications/);
  assert.match(text, /Graph search\t2025/);
  await assert.rejects(() => fileToText("x.pdf", Buffer.from("")), /Unsupported/);
  const cfg = { secretKey: "k" };
  assert.equal(decrypt(cfg, encrypt(cfg, "secret")), "secret");
  assert.throws(() => decrypt({ secretKey: "other" }, encrypt(cfg, "secret")));
});

test("teacher connects OneDrive, picks a folder and new or changed files reach the review queue", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  for (const role of ["teacher", "student"])
    await db.query("INSERT INTO users(email,name,role,password_hash) VALUES($1,$2,$3,$4)", [
      role + "@test.edu",
      role,
      role,
      await hashPassword("Test-password-123"),
    ]);
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Profile").addRows([["Degree", "PhD"], ["Employer", "Test University"]]);
  const files = [
    { id: "a1", name: "publications.csv", size: 40, eTag: "e1", webUrl: "https://uni-my.sharepoint.com/a1", body: "Title,Year\nGraph search,2025" },
    { id: "a2", name: "profile.xlsx", size: 9000, eTag: "e1", webUrl: "https://uni-my.sharepoint.com/a2", body: Buffer.from(await book.xlsx.writeBuffer()) },
    { id: "a3", name: "scan.pdf", size: 100, eTag: "e1", webUrl: "x", body: "" },
    { id: "a4", name: "huge.txt", size: 6 * 1024 * 1024, eTag: "e1", webUrl: "x", body: "" },
  ];
  const ms = fakeMicrosoft(files);
  const app = await createApp(db, {
    onedrive: { clientId: "client-123", secretKey: "test-key", fetch: ms.fetch },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, cookie = "", body, method) =>
    fetch(base + path, {
      method: method || (body === undefined ? "GET" : "POST"),
      redirect: "manual",
      headers: { Origin: "http://localhost:5173", Cookie: cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const cookies = {};
  for (const role of ["teacher", "student"])
    cookies[role] = (await request("/auth/login", "", { email: role + "@test.edu", password: "Test-password-123" })).headers
      .get("set-cookie")
      .split(";")[0];

  assert.equal((await request("/onedrive/status", cookies.student)).status, 403);
  const status = await (await request("/onedrive/status", cookies.teacher)).json();
  assert.equal(status.configured, true);
  assert.equal(status.connected, false);

  // Sign-in URL uses PKCE and our callback; the callback needs the single-use state.
  const { url } = await (await request("/onedrive/connect", cookies.teacher, {})).json();
  const auth = new URL(url);
  assert.equal(auth.searchParams.get("client_id"), "client-123");
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  assert.equal(auth.searchParams.get("redirect_uri"), "http://localhost:5173/api/onedrive-callback");
  assert.match(auth.searchParams.get("scope"), /Files\.Read/);
  const state = auth.searchParams.get("state");
  const bad = await request(`/onedrive-callback?state=${"0".repeat(64)}&code=good-code`);
  assert.equal(bad.headers.get("location"), "/?onedrive=error");
  const ok = await request(`/onedrive-callback?state=${state}&code=good-code`);
  assert.equal(ok.headers.get("location"), "/?onedrive=connected");
  const replay = await request(`/onedrive-callback?state=${state}&code=good-code`);
  assert.equal(replay.headers.get("location"), "/?onedrive=error");

  const stored = (await db.query("SELECT refresh_token_enc FROM onedrive_connections")).rows[0].refresh_token_enc;
  assert.ok(!stored.includes("refresh-0"), "refresh token is encrypted at rest");

  assert.equal((await request("/onedrive/sync", cookies.teacher, {})).status, 400);
  const folders = await (await request("/onedrive/folders", cookies.teacher)).json();
  assert.deepEqual(folders.folders, [{ id: "F1", name: "Teacher data", children: 4 }]);
  assert.equal((await request("/onedrive/folder", cookies.teacher, { id: "F1", path: "Teacher data" }, "PUT")).status, 200);

  const first = await (await request("/onedrive/sync", cookies.teacher, {})).json();
  assert.equal(first.imported, 2);
  assert.deepEqual(first.skipped.map((s) => s.name).sort(), ["huge.txt", "scan.pdf"]);
  const imports = async () => (await (await request("/browser-imports", cookies.teacher)).json()).imports;
  let list = await imports();
  assert.equal(list.length, 2);
  assert.ok(list.every((i) => i.origin === "onedrive" && i.status === "pending"));
  assert.match(list.find((i) => i.title === "profile.xlsx").content, /Degree\tPhD/);
  assert.equal((await (await request("/browser-imports", cookies.student)).json()).imports.length, 0);

  // Unchanged files are not imported twice; a changed file replaces its unreviewed copy.
  const second = await (await request("/onedrive/sync", cookies.teacher, {})).json();
  assert.equal(second.unchanged, 2);
  files[0].eTag = "e2";
  files[0].body = "Title,Year\nGraph search,2025\nNew paper,2026";
  const third = await (await request("/onedrive/sync", cookies.teacher, {})).json();
  assert.equal(third.updated, 1);
  list = await imports();
  assert.equal(list.length, 2);
  assert.match(list.find((i) => i.title === "publications.csv").content, /New paper/);

  // Each sync refreshes the access token; rotated refresh tokens are kept.
  assert.ok(ms.calls.token.filter((c) => c.grant_type === "refresh_token").length >= 3);
  assert.ok(ms.calls.token.every((c) => !c.client_secret));

  assert.equal((await request("/onedrive", cookies.teacher, undefined, "DELETE")).status, 204);
  assert.equal((await (await request("/onedrive/status", cookies.teacher)).json()).connected, false);
  assert.equal((await imports()).length, 2, "imported review items stay after disconnecting");
});

test("OneDrive stays off until the server is configured", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  await db.query("INSERT INTO users(email,name,role,password_hash) VALUES('t@test.edu','t','teacher',$1)", [
    await hashPassword("Test-password-123"),
  ]);
  const app = await createApp(db, { onedrive: { clientId: "", secretKey: "" } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const headers = { Origin: "http://localhost:5173", "Content-Type": "application/json" };
  const login = await fetch(base + "/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: "t@test.edu", password: "Test-password-123" }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const status = await (await fetch(base + "/onedrive/status", { headers: { ...headers, Cookie: cookie } })).json();
  assert.equal(status.configured, false);
  const connect = await fetch(base + "/onedrive/connect", { method: "POST", headers: { ...headers, Cookie: cookie }, body: "{}" });
  assert.equal(connect.status, 503);
});
