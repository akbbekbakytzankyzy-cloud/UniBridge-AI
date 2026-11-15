import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/security.js";

test("migration and role-scoped course workflow against embedded PostgreSQL", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await db.exec(
    await readFile(
      new URL("../migrations/001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const [email, role] of [
    ["teacher@test.edu", "teacher"],
    ["student@test.edu", "student"],
    ["outsider@test.edu", "student"],
    ["otherteacher@test.edu", "teacher"],
  ]) {
    await db.query(
      "INSERT INTO users(email,name,role,password_hash) VALUES($1,$2,$3,$4)",
      [email, role, role, await hashPassword("Test-password-123")],
    );
  }
  const app = await createApp(db);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, body, cookie = "", origin = "http://localhost:5173") =>
    fetch(base + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  async function login(email) {
    const r = await request("/auth/login", {
      email,
      password: "Test-password-123",
    });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("set-cookie"), /HttpOnly/);
    return r.headers.get("set-cookie").split(";")[0];
  }
  assert.equal((await request("/courses")).status, 401);
  assert.equal(
    (await request("/auth/login", {}, "", "https://hostile.test")).status,
    403,
  );
  assert.equal(
    (
      await request("/auth/login", {
        email: "teacher@test.edu",
        password: "wrong",
      })
    ).status,
    401,
  );
  const teacher = await login("teacher@test.edu"),
    student = await login("student@test.edu"),
    outsider = await login("outsider@test.edu"),
    otherTeacher = await login("otherteacher@test.edu");
  assert.equal(
    (await request("/courses", { code: "BAD", title: "Forbidden" }, student))
      .status,
    403,
  );
  const created = await request(
    "/courses",
    { code: "AI-101", title: "AI Foundation" },
    teacher,
  );
  assert.equal(created.status, 201);
  const id = (await created.json()).course.id;
  assert.equal(
    (await request(`/courses/${id}/documents`, undefined, student)).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/courses/${id}/enrollments`,
        { email: "student@test.edu" },
        teacher,
      )
    ).status,
    204,
  );
  assert.equal(
    (
      await request(
        `/courses/${id}/enrollments`,
        { email: "student@test.edu" },
        teacher,
      )
    ).status,
    204,
  );
  assert.equal(
    (
      await request(
        `/courses/${id}/documents`,
        { title: "Lecture 1", content: "Neural networks and learning." },
        teacher,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await (
        await request(`/courses/${id}/documents?q=NEURAL`, undefined, student)
      ).json()
    ).documents.length,
    1,
  );
  assert.equal(
    (
      await (
        await request(`/courses/${id}/documents?q=absent`, undefined, student)
      ).json()
    ).documents.length,
    0,
  );
  assert.equal(
    (
      await request(
        `/courses/${id}/documents`,
        { title: "No", content: "No" },
        student,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request(`/courses/${id}/documents`, undefined, outsider)).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/courses/${id}/documents`,
        { title: "No", content: "No" },
        otherTeacher,
      )
    ).status,
    404,
  );
  assert.equal(
    (await (await request("/courses", undefined, outsider)).json()).courses
      .length,
    0,
  );
  assert.equal((await request("/auth/logout", {}, student)).status, 204);
  assert.equal((await request("/auth/me", undefined, student)).status, 401);
  await db.exec("UPDATE sessions SET expires_at=now()-interval '1 hour'");
  assert.equal((await request("/auth/me", undefined, teacher)).status, 401);
});
