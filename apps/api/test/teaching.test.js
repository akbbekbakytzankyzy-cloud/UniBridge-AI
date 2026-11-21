import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { applyMigrations } from "../src/migrations.js";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/security.js";

test("course owners manage timetable and gradebook; students see only published results", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  const ids = {};
  const roles = {
    teacher: "teacher",
    otherTeacher: "teacher",
    student: "student",
    outsider: "student",
  };
  for (const [name, role] of Object.entries(roles))
    ids[name] = (
      await db.query(
        "INSERT INTO users(email,name,role,password_hash) VALUES($1,$2,$3,$4) RETURNING id",
        [
          name.toLowerCase() + "@test.edu",
          name,
          role,
          await hashPassword("Test-password-123"),
        ],
      )
    ).rows[0].id;
  const course = (
    await db.query(
      "INSERT INTO courses(code,title,teacher_id) VALUES('DB-201','Databases',$1) RETURNING id",
      [ids.teacher],
    )
  ).rows[0].id;
  await db.query("INSERT INTO enrollments(course_id,student_id) VALUES($1,$2)", [
    course,
    ids.student,
  ]);

  const app = await createApp(db);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, cookie = "", body, method) =>
    fetch(base + path, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: {
        Origin: "http://localhost:5173",
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const cookies = {};
  for (const name of Object.keys(ids))
    cookies[name] = (
      await request("/auth/login", "", {
        email: name.toLowerCase() + "@test.edu",
        password: "Test-password-123",
      })
    ).headers
      .get("set-cookie")
      .split(";")[0];
  const T = `/portal/teaching/courses/${course}`;

  // Only the course owner can use the teacher tools.
  assert.equal((await request("/portal/teaching/courses", cookies.student)).status, 403);
  assert.equal((await request(`${T}/students`, cookies.otherTeacher)).status, 404);
  const owned = await (await request("/portal/teaching/courses", cookies.teacher)).json();
  assert.deepEqual(
    owned.courses.map((c) => [c.code, c.students]),
    [["DB-201", 1]],
  );
  const students = await (await request(`${T}/students`, cookies.teacher)).json();
  assert.deepEqual(students.students.map((s) => s.id), [ids.student]);

  // Timetable: validation, create, visible to enrolled student, delete.
  const lecture = {
    title: "SQL joins",
    starts_at: "2026-11-23T04:00:00.000Z",
    ends_at: "2026-11-23T05:30:00.000Z",
    room: "C1.2",
    session_type: "Lecture",
  };
  assert.equal(
    (await request(`${T}/timetable`, cookies.teacher, { ...lecture, ends_at: lecture.starts_at })).status,
    400,
  );
  assert.equal((await request(`${T}/timetable`, cookies.otherTeacher, lecture)).status, 404);
  const created = await request(`${T}/timetable`, cookies.teacher, lecture);
  assert.equal(created.status, 201);
  const event = (await created.json()).event;
  const week = "/portal/timetable?from=2026-11-23&to=2026-11-30";
  const seen = (await (await request(week, cookies.student)).json()).events;
  assert.equal(seen.length, 1);
  assert.equal(seen[0].editable, false);
  assert.equal((await (await request(week, cookies.teacher)).json()).events[0].editable, true);
  assert.equal((await (await request(week, cookies.outsider)).json()).events.length, 0);
  assert.equal(
    (await request(`/portal/teaching/timetable/${event.id}`, cookies.otherTeacher, undefined, "DELETE")).status,
    404,
  );
  assert.equal(
    (await request(`/portal/teaching/timetable/${event.id}`, cookies.teacher, undefined, "DELETE")).status,
    204,
  );
  assert.equal((await (await request(week, cookies.student)).json()).events.length, 0);

  // Gradebook: only enrolled students, scores 0–100, publish before students see it.
  const grade = { student_id: ids.student, assessment: "Midterm", score: 87.5, feedback: "Good work" };
  assert.equal(
    (await request(`${T}/results`, cookies.teacher, { ...grade, student_id: ids.outsider }, "PUT")).status,
    400,
  );
  assert.equal((await request(`${T}/results`, cookies.teacher, { ...grade, score: 120 }, "PUT")).status, 400);
  assert.equal((await request(`${T}/results`, cookies.otherTeacher, grade, "PUT")).status, 404);
  assert.equal((await request(`${T}/results`, cookies.teacher, grade, "PUT")).status, 200);
  const records = async (who) =>
    (await (await request("/portal/academic-records", cookies[who])).json()).records;
  assert.equal((await records("student")).length, 0);
  assert.equal((await records("teacher")).length, 1);

  const key = { student_id: ids.student, assessment: "Midterm" };
  assert.equal((await request(`${T}/results/publish`, cookies.teacher, key)).status, 200);
  const visible = await records("student");
  assert.equal(visible.length, 1);
  assert.equal(Number(visible[0].score), 87.5);
  assert.equal(visible[0].feedback, "Good work");
  assert.equal((await records("outsider")).length, 0);

  // Changing the score unpublishes it until the teacher publishes again.
  await request(`${T}/results`, cookies.teacher, { ...grade, score: 90 }, "PUT");
  assert.equal((await records("student")).length, 0);
  await request(`${T}/results/publish`, cookies.teacher, key);
  assert.equal((await request(`${T}/results/unpublish`, cookies.teacher, key)).status, 200);
  assert.equal((await records("student")).length, 0);

  assert.equal((await request(`${T}/results/delete`, cookies.teacher, key)).status, 204);
  assert.equal((await records("teacher")).length, 0);
  assert.equal((await request(`${T}/results/delete`, cookies.teacher, key)).status, 404);
});
