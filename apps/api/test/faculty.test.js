import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { createApp } from "../src/app.js";
import { applyMigrations } from "../src/migrations.js";
import { hashPassword } from "../src/security.js";
import { csvCell } from "../src/faculty.js";

test("faculty profiles, private exports and publication ownership", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  await applyMigrations(db);
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0]
      .n,
    2,
  );
  for (const [email, role] of [
    ["teacher@test.edu", "teacher"],
    ["other@test.edu", "teacher"],
    ["student@test.edu", "student"],
  ])
    await db.query(
      "INSERT INTO users(email,name,role,password_hash) VALUES($1,$2,$3,$4)",
      [email, "Test " + role, role, await hashPassword("Test-password-123")],
    );
  const app = await createApp(db);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (
    path,
    cookie,
    body,
    method = body === undefined ? "GET" : "POST",
  ) =>
    fetch(base + path, {
      method,
      headers: {
        Origin: "http://localhost:5173",
        Cookie: cookie || "",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const login = async (email) =>
    (
      await request("/auth/login", "", { email, password: "Test-password-123" })
    ).headers
      .get("set-cookie")
      .split(";")[0];
  const teacher = await login("teacher@test.edu"),
    other = await login("other@test.edu"),
    student = await login("student@test.edu");
  assert.equal((await request("/faculty/profile", student)).status, 403);
  assert.equal((await request("/faculty/profile")).status, 401);
  assert.equal(
    (await request("/faculty/exports", teacher, { template_id: "hr-profile" }))
      .status,
    409,
  );
  const original = {
    revision: 0,
    details: {
      name_cyrillic: "Test Teacher",
      department: "Computing",
      position: "Lecturer",
      hire_date: "2020-09-01",
      employment_fraction: 1,
    },
    education: [
      {
        level: "PhD",
        institution: "Test University",
        year: 2018,
        diploma_number: "PRIVATE-DIPLOMA",
      },
    ],
    training: [],
    awards: [],
  };
  assert.equal(
    (
      await request(
        "/faculty/profile",
        teacher,
        { ...original, owner_id: "spoof" },
        "PUT",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/faculty/profile",
        teacher,
        {
          ...original,
          details: { ...original.details, hire_date: "2020-02-31" },
        },
        "PUT",
      )
    ).status,
    400,
  );
  let r = await request("/faculty/profile", teacher, original, "PUT");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).profile.revision, 1);
  assert.equal(
    (await request("/faculty/profile", teacher, original, "PUT")).status,
    409,
  );
  assert.equal(
    (await (await request("/faculty/profile", other)).json()).profile.revision,
    0,
  );
  const publication = {
    title: '=HYPERLINK("unsafe")',
    year: 2024,
    doi: "10.1234/TEST",
    venue: "Test journal",
    authors: "Test Teacher",
  };
  r = await request("/faculty/publications", teacher, publication);
  assert.equal(r.status, 201);
  const pub = (await r.json()).publication;
  assert.equal(pub.verification_status, "unverified");
  assert.equal(pub.doi, "10.1234/test");
  assert.equal(
    (await request("/faculty/publications", teacher, publication)).status,
    409,
  );
  assert.equal(
    (
      await request("/faculty/publications", teacher, {
        ...publication,
        doi: "",
        verification_status: "confirmed",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/faculty/publications/" + pub.id,
        other,
        undefined,
        "DELETE",
      )
    ).status,
    404,
  );
  assert.equal(
    (await (await request("/faculty/publications", other)).json()).publications
      .length,
    0,
  );
  r = await request("/faculty/exports", teacher, { template_id: "hr-profile" });
  assert.equal(r.status, 201);
  const hr = (await r.json()).export;
  r = await request("/faculty/exports", teacher, {
    template_id: "research-summary",
  });
  assert.equal(r.status, 201);
  const research = (await r.json()).export;
  assert.equal(
    (await request(`/faculty/exports/${hr.id}/download`, other)).status,
    404,
  );
  assert.equal(
    (await request(`/faculty/exports/${hr.id}/download`, student)).status,
    403,
  );
  const researchJson = await (
    await request(
      `/faculty/exports/${research.id}/download?format=json`,
      teacher,
    )
  ).json();
  assert.equal(JSON.stringify(researchJson).includes("PRIVATE-DIPLOMA"), false);
  assert.equal(researchJson.data.publications.length, 1);
  const csv = await (
    await request(`/faculty/exports/${research.id}/download`, teacher)
  ).text();
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.equal(
    (
      await request(
        "/faculty/profile",
        teacher,
        {
          ...original,
          revision: 1,
          details: { ...original.details, department: "Changed" },
        },
        "PUT",
      )
    ).status,
    200,
  );
  const hrJson = await (
    await request(`/faculty/exports/${hr.id}/download?format=json`, teacher)
  ).json();
  assert.equal(hrJson.data.details.department, "Computing");
  assert.equal(
    (
      await request(
        "/faculty/publications/" + pub.id,
        teacher,
        undefined,
        "DELETE",
      )
    ).status,
    204,
  );
  assert.equal(
    (
      await (
        await request(
          `/faculty/exports/${research.id}/download?format=json`,
          teacher,
        )
      ).json()
    ).data.publications.length,
    1,
  );
});

test("CSV escaping prevents spreadsheet formulas and preserves quoting", () => {
  for (const value of ["=1+1", " +1", "@SUM(1)", "-1", "\ttext"])
    assert.ok(csvCell(value).startsWith("\"'"));
  assert.equal(csvCell('a"b'), '"a""b"');
});
