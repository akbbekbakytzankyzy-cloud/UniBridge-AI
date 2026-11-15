import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { applyMigrations } from "../src/migrations.js";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/security.js";
test("university portal scopes records, timetable and private request drafts", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  const ids = {};
  for (const role of ["teacher", "student", "outsider"]) {
    ids[role] = (
      await db.query(
        "INSERT INTO users(email,name,role,password_hash) VALUES($1,$2,$3,$4) RETURNING id",
        [
          role + "@test.edu",
          role,
          role === "teacher" ? "teacher" : "student",
          await hashPassword("Test-password-123"),
        ],
      )
    ).rows[0].id;
  }
  const course = (
    await db.query(
      "INSERT INTO courses(code,title,teacher_id) VALUES($1,$2,$3) RETURNING id",
      ["UNI-101", "University course", ids.teacher],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO enrollments(course_id,student_id) VALUES($1,$2)",
    [course, ids.student],
  );
  await db.query(
    "INSERT INTO timetable_events(course_id,title,starts_at,ends_at) VALUES($1,'Lecture','2026-11-16T05:00:00Z','2026-11-16T06:00:00Z')",
    [course],
  );
  await db.query(
    "INSERT INTO academic_results(course_id,student_id,assessment,score,published_at) VALUES($1,$2,'Published test',85,now()),($1,$2,'Draft test',90,NULL)",
    [course, ids.student],
  );
  const app = await createApp(db);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (
    path,
    cookie = "",
    body,
    method = body === undefined ? "GET" : "POST",
  ) =>
    fetch(base + path, {
      method,
      headers: {
        Origin: "http://localhost:5173",
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const cookies = {};
  for (const role of Object.keys(ids))
    cookies[role] = (
      await request("/auth/login", "", {
        email: role + "@test.edu",
        password: "Test-password-123",
      })
    ).headers
      .get("set-cookie")
      .split(";")[0];
  assert.equal((await request("/portal/summary")).status, 401);
  assert.equal(
    (await (await request("/portal/summary", cookies.student)).json()).summary
      .courses,
    1,
  );
  assert.equal(
    (await (await request("/portal/summary", cookies.outsider)).json()).summary
      .courses,
    0,
  );
  const schedule = "/portal/timetable?from=2026-11-16&to=2026-11-23";
  assert.equal(
    (await (await request(schedule, cookies.student)).json()).events.length,
    1,
  );
  assert.equal(
    (await (await request(schedule, cookies.outsider)).json()).events.length,
    0,
  );
  assert.equal(
    (
      await request(
        "/portal/timetable?from=2026-11-23&to=2026-11-16",
        cookies.student,
      )
    ).status,
    400,
  );
  assert.equal(
    (await (await request("/portal/academic-records", cookies.teacher)).json())
      .records.length,
    2,
  );
  assert.equal(
    (await (await request("/portal/academic-records", cookies.student)).json())
      .records.length,
    1,
  );
  assert.equal(
    (await (await request("/portal/academic-records", cookies.outsider)).json())
      .records.length,
    0,
  );
  const draft = {
    service: "transcript",
    subject: "My transcript",
    description: "A private request draft",
  };
  assert.equal(
    (
      await request("/portal/requests", cookies.student, {
        ...draft,
        status: "approved",
      })
    ).status,
    400,
  );
  const saved = await request("/portal/requests", cookies.student, draft);
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).request.status, "draft");
  assert.equal(
    (await (await request("/portal/requests", cookies.outsider)).json())
      .requests.length,
    0,
  );
  assert.equal(
    (await request("/portal/student-profile", cookies.teacher)).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/portal/student-profile",
        cookies.student,
        { preferred_name: "Test", phone: "demo" },
        "PUT",
      )
    ).status,
    200,
  );
  assert.equal(
    (await (await request("/portal/student-profile", cookies.outsider)).json())
      .profile.phone,
    "",
  );
});
