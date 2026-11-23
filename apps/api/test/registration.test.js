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
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });
  return { db, base, post };
}

test("registration is off by default", async (t) => {
  const { base, post } = await serve(t);
  assert.deepEqual(await (await fetch(base + "/auth/options")).json(), {
    registration: false,
  });
  const r = await post("/auth/register", {
    name: "New Student",
    email: "new@test.edu",
    password: "Long-password-123",
  });
  assert.equal(r.status, 403);
});

test("self-registration creates a signed-in student only", async (t) => {
  const { db, base, post } = await serve(t, { allowRegistration: true });
  assert.deepEqual(await (await fetch(base + "/auth/options")).json(), {
    registration: true,
  });
  assert.equal(
    (
      await post("/auth/register", {
        name: "Short",
        email: "a@test.edu",
        password: "short",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post("/auth/register", {
        name: "Sneaky",
        email: "b@test.edu",
        password: "Long-password-123",
        role: "teacher",
      })
    ).status,
    400,
  );
  const created = await post("/auth/register", {
    name: "New Student",
    email: "New@Test.edu",
    password: "Long-password-123",
  });
  assert.equal(created.status, 201);
  const { user } = await created.json();
  assert.equal(user.role, "student");
  assert.equal(user.email, "new@test.edu");
  const cookie = created.headers.get("set-cookie").split(";")[0];
  const me = await (
    await fetch(base + "/auth/me", { headers: { Cookie: cookie } })
  ).json();
  assert.equal(me.user.email, "new@test.edu");
  assert.equal(
    (
      await post("/auth/register", {
        name: "Again",
        email: "new@test.edu",
        password: "Long-password-123",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await post("/auth/register", {
        name: "Same person, different case",
        email: "NEW@test.edu",
        password: "Another-password-123",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await post("/auth/login", {
        email: "new@test.edu",
        password: "Long-password-123",
      })
    ).status,
    200,
  );
  const row = (
    await db.query("SELECT password_hash FROM users WHERE email='new@test.edu'")
  ).rows[0];
  assert.doesNotMatch(row.password_hash, /Long-password-123/);
});

test("university account declarations persist across login and remain private and unverified", async (t) => {
  const { base, post } = await serve(t, {
    allowRegistration: true,
  });
  const signup = await post("/auth/register", {
    name: "Account Owner",
    email: "owner@test.edu",
    password: "Long-password-123",
  });
  const cookie = signup.headers.get("set-cookie").split(";")[0];
  const request = (path, method = "GET", body, session = cookie) =>
    fetch(base + path, {
      method,
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
        Cookie: session,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  assert.equal(
    (await request("/university-accounts", "GET", undefined, "")).status,
    401,
  );
  assert.equal(
    (
      await request("/university-accounts/du", "PUT", {
        loginHint: "owner@astanait.edu.kz",
        password: "never-store",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/university-accounts/du", "PUT", {
        loginHint: "owner",
        status: "connected",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/university-accounts/unknown", "PUT", {
        loginHint: "owner",
      })
    ).status,
    400,
  );
  for (const provider of ["du", "lms", "mydu"]) {
    const result = await request(`/university-accounts/${provider}`, "PUT", {
      loginHint: "owner@astanait.edu.kz",
    });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).account.status, "pending");
  }
  const other = await post("/auth/register", {
    name: "Other User",
    email: "other@test.edu",
    password: "Long-password-123",
  });
  const otherCookie = other.headers.get("set-cookie").split(";")[0];
  assert.deepEqual(
    (
      await (
        await request("/university-accounts", "GET", undefined, otherCookie)
      ).json()
    ).accounts,
    [],
  );
  await request("/university-accounts/du", "DELETE", undefined, otherCookie);
  await post("/auth/logout", {}, cookie);
  const login = await post("/auth/login", {
    email: "owner@test.edu",
    password: "Long-password-123",
  });
  const newCookie = login.headers.get("set-cookie").split(";")[0];
  const secondLogin = await post("/auth/login", {
    email: "owner@test.edu",
    password: "Long-password-123",
  });
  const secondCookie = secondLogin.headers.get("set-cookie").split(";")[0];
  const events = await fetch(base + "/events", {
    headers: { Cookie: newCookie, Accept: "text/event-stream" },
  });
  assert.equal(events.status, 200);
  const eventReader = events.body.getReader();
  await eventReader.read(); // Initial ready frame.
  const nextEvent = eventReader.read();
  await request(
    "/university-accounts/du",
    "PUT",
    { loginHint: "updated-owner@astanait.edu.kz" },
    secondCookie,
  );
  const changedEvent = await nextEvent;
  assert.match(new TextDecoder().decode(changedEvent.value), /event: changed/);
  await eventReader.cancel();
  const saved = await (
    await request("/university-accounts", "GET", undefined, newCookie)
  ).json();
  assert.equal(saved.accounts.length, 3);
  assert.equal(saved.connectionAvailable, false);
  const importCode = (
    await (await request("/browser-imports/code", "POST", {}, newCookie)).json()
  ).code;
  const capture = (token) =>
    fetch(base + "/browser-import/native-capture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        sourceUrl: "https://du.astanait.edu.kz/profile?secret=remove#token",
        content: "Synthetic education record",
      }),
    });
  assert.equal((await capture("a".repeat(64))).status, 401);
  assert.equal((await capture(importCode)).status, 201);
  assert.equal((await capture(importCode)).status, 401);
  const imports = (
    await (
      await request("/browser-imports", "GET", undefined, newCookie)
    ).json()
  ).imports;
  assert.equal(imports.length, 1);
  assert.equal(imports[0].source_url, "https://du.astanait.edu.kz/profile");
  assert.equal(imports[0].status, "pending");
  assert.deepEqual(
    (
      await (
        await request("/browser-imports", "GET", undefined, otherCookie)
      ).json()
    ).imports,
    [],
  );
  assert.equal(
    (
      await request(
        `/browser-imports/${imports[0].id}/accept`,
        "POST",
        {},
        otherCookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/browser-imports/${imports[0].id}/accept`,
        "POST",
        {},
        newCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await (
        await request("/browser-imports", "GET", undefined, newCookie)
      ).json()
    ).imports[0].status,
    "accepted",
  );
  assert.equal(
    (
      await request(
        `/browser-imports/${imports[0].id}`,
        "DELETE",
        undefined,
        newCookie,
      )
    ).status,
    204,
  );
  assert.equal(
    (
      await (
        await request("/browser-imports", "GET", undefined, newCookie)
      ).json()
    ).imports.length,
    0,
  );
  assert.equal(
    (await request("/university-accounts/du", "DELETE", undefined, newCookie))
      .status,
    204,
  );
  assert.equal(
    (
      await (
        await request("/university-accounts", "GET", undefined, newCookie)
      ).json()
    ).accounts.length,
    2,
  );
});
