import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { createApp } from "../src/app.js";
import { applyMigrations } from "../src/migrations.js";
import { hashPassword } from "../src/security.js";
import { normalizeDoi } from "../src/scholarly.js";

// SYNTHETIC fixtures: invented researcher, works and identifiers.
const ORCID = "0000-0002-1825-0097";
const openAlexPage = {
  meta: { next_cursor: null },
  results: [
    {
      id: "https://openalex.org/W100",
      doi: "https://doi.org/10.9999/SYNTH.1",
      display_name: "Synthetic study of matching",
      publication_year: 2024,
      primary_location: { source: { display_name: "Journal of Tests" } },
      authorships: [
        { author: { display_name: "A. Example" } },
        { author: { display_name: "B. Sample" } },
      ],
    },
    {
      id: "https://openalex.org/W101",
      doi: null,
      display_name: "Conference note without DOI",
      publication_year: 2023,
      primary_location: null,
      authorships: [],
    },
  ],
};
const orcidWorks = {
  group: [
    {
      "work-summary": [
        {
          "put-code": 1,
          "display-index": "1",
          title: { title: { value: "Synthetic study of matching" } },
          "publication-date": { year: { value: "2024" } },
          "journal-title": { value: "Journal of Tests" },
          "external-ids": {
            "external-id": [
              { "external-id-type": "doi", "external-id-value": "10.9999/synth.1" },
            ],
          },
        },
      ],
    },
    {
      "work-summary": [
        {
          "put-code": 2,
          title: { title: { value: "ORCID-only book chapter" } },
          "publication-date": { year: { value: "2022" } },
          "external-ids": { "external-id": [] },
        },
      ],
    },
  ],
};

test("DOI normalisation", () => {
  assert.equal(normalizeDoi("https://doi.org/10.1000/ABC"), "10.1000/abc");
  assert.equal(normalizeDoi("doi: 10.1000/x"), "10.1000/x");
  assert.equal(normalizeDoi("not a doi"), null);
  assert.equal(normalizeDoi(null), null);
});

test("publication import and record-grounded chat", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  for (const [email, role] of [
    ["teacher@test.edu", "teacher"],
    ["student@test.edu", "student"],
  ])
    await db.query(
      "INSERT INTO users(email,name,role,password_hash) VALUES($1,$2,$3,$4)",
      [email, "Test " + role, role, await hashPassword("Test-password-123")],
    );
  let offline = false;
  const scholarlyFetch = async (url) => {
    const u = new URL(url);
    if (offline) throw new Error("network down");
    if (u.hostname === "api.openalex.org") {
      assert.equal(u.searchParams.get("filter"), `author.orcid:${ORCID}`);
      return Response.json(openAlexPage);
    }
    if (u.hostname === "pub.orcid.org") return Response.json(orcidWorks);
    throw new Error("unexpected host " + u.hostname);
  };
  const chats = [];
  const ollama = async (url, options) => {
    if (url.pathname === "/api/tags")
      return Response.json({ models: [{ name: "qwen3:1.7b" }] });
    chats.push(JSON.parse(options.body));
    return Response.json({
      done: true,
      message: { content: "Answer [P1]" },
      done_reason: "stop",
    });
  };
  const app = await createApp(db, { scholarlyFetch, ai: { fetcher: ollama } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, cookie, body, method = body === undefined ? "GET" : "POST") =>
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
    (await request("/auth/login", "", { email, password: "Test-password-123" })).headers
      .get("set-cookie")
      .split(";")[0];
  const teacher = await login("teacher@test.edu");
  const student = await login("student@test.edu");

  // Import needs a saved ORCID and is teacher-only.
  assert.equal((await request("/faculty/publications/import", student, {})).status, 403);
  assert.equal((await request("/faculty/publications/import", teacher, {})).status, 409);
  const saved = await request(
    "/faculty/profile",
    teacher,
    {
      revision: 0,
      details: {
        name_cyrillic: "Тест Преподаватель",
        department: "Computing",
        position: "Professor",
        hire_date: "2020-09-01",
        employment_fraction: 1,
        phone: "+7 700 000 0000",
        orcid: ORCID,
      },
      education: [],
      training: [],
      awards: [{ title: "Synthetic award", issuer: "Test board", year: 2021 }],
    },
    "PUT",
  );
  assert.equal(saved.status, 200, await saved.clone().text());

  // A manual record that the import must not touch.
  await request("/faculty/publications", teacher, {
    title: "Manually entered paper",
    year: 2020,
    doi: "",
    venue: "",
    authors: "",
  });
  await db.query("UPDATE publications SET verification_status='confirmed'");

  const first = await (await request("/faculty/publications/import", teacher, {})).json();
  assert.deepEqual(first.fetched, { openalex: 2, orcid: 2 });
  assert.equal(first.added, 3); // 2 OpenAlex + ORCID-only chapter; DOI duplicate skipped
  assert.equal(first.skipped, 1);
  const second = await (await request("/faculty/publications/import", teacher, {})).json();
  assert.equal(second.added, 0);
  assert.equal(second.skipped, 4);
  const pubs = (await (await request("/faculty/publications", teacher)).json()).publications;
  assert.equal(pubs.length, 4);
  const synth = pubs.find((p) => p.doi === "10.9999/synth.1");
  assert.equal(synth.source, "openalex");
  assert.equal(synth.authors, "A. Example, B. Sample");
  assert.equal(synth.verification_status, "unverified");
  assert.equal(pubs.find((p) => p.title === "Manually entered paper").verification_status, "confirmed");

  offline = true;
  const failed = await request("/faculty/publications/import", teacher, {});
  assert.equal(failed.status, 502);

  // Grounded chat: teacher only, own records only, sensitive fields excluded.
  const ask = (cookie, grounding) =>
    request("/ai/chat", cookie, {
      model: "qwen3:1.7b",
      messages: [{ role: "user", content: "Сколько у меня публикаций?" }],
      grounding,
    });
  assert.equal((await ask(student, "my_records")).status, 403);
  const reply = await (await ask(teacher, "my_records")).json();
  assert.deepEqual(reply.grounding, { publications: 4, included: 4 });
  const sent = chats.at(-1);
  const context = sent.messages[0].content;
  assert.match(context, /publications: 4 \(with DOI: 1; confirmed: 1\)/);
  assert.match(context, /2024: 1/);
  assert.match(context, /Synthetic study of matching/);
  assert.match(context, /\[AWARDS1\] title: Synthetic award/);
  assert.doesNotMatch(context, /\+7 700|hire_date|employment_fraction/);
  assert.equal(sent.options.temperature, 0);
  assert.equal(sent.options.num_ctx, 8192);
  const plain = await (await ask(teacher, "none")).json();
  assert.equal(plain.grounding, null);
  assert.doesNotMatch(chats.at(-1).messages[0].content, /RECORDS/);
});
