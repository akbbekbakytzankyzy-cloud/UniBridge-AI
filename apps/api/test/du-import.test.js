import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { applyMigrations } from "../src/migrations.js";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/security.js";
import {
  guessTitle,
  parseDuCapture,
  titleMatch,
  verifyPublications,
} from "../src/du-import.js";

// A made-up teacher in the exact shape du-capture.js produces.
const c = (text, links = []) => ({ text, links });
const capture = {
  format: "du-teacher-v1",
  source: "https://du.astanait.edu.kz/teacher/1",
  captured_at: "2026-11-22T10:00:00.000Z",
  header: {
    text: [
      "Назад",
      "Серікова Айгүл Маратқызы",
      "Serikova Aigul",
      "Aigul.Serikova@example.edu",
      "Старший преподаватель",
      "School of Testing/Школа тестирования/Тестілеу мектебі",
      "Academic info / Академические данные",
      "Scientific degree / Учёная степень",
      "Doctor PhD/Доктор PhD/PhD докторы",
      "Academic status / Академический статус",
      "Associate Professor(reader)/Ассоциированный профессор (docent)/Қауымдастырылған профессор (доцент)",
      "Scientific interests / Научные интересы",
      "machine learning",
    ].join("\n"),
    links: [],
  },
  sections: {
    Education: {
      headers: [
        "#",
        "Educational institution",
        "Year of admission",
        "Year of graduation",
        "Specialization",
        "Academic Degree",
      ],
      rows: [
        [
          c("1"),
          c("Test State University"),
          c("2008"),
          c("2012"),
          c("Informatics"),
          c("Bachelor"),
        ],
        [
          c("2"),
          c("Test Technical University"),
          c("2016"),
          c("2020"),
          c("Computer Science"),
          c("Doctorate"),
        ],
      ],
    },
    "Academic degree/Academic title": {
      headers: ["#", "Name", "Speciality"],
      rows: [],
    },
    "Scientific information": {
      headers: [
        "№",
        "Scientific work ID",
        "Scientific work H-index",
        "Scientific work url",
        "Platform Type",
      ],
      rows: [
        [
          c("1"),
          c(""),
          c("h-index - 3"),
          c("Link", ["https://scholar.google.com/citations?user=abc"]),
          c("Google Scholar"),
        ],
        [
          c("2"),
          c("57000000001"),
          c("h-index - 2"),
          c("Link", [
            "https://www.scopus.com/authid/detail.uri?authorId=57000000001",
          ]),
          c("SCOPUS"),
        ],
        [
          c("3"),
          c("A-1234-2019"),
          c("h-index - 1"),
          c("Link", ["https://publons.com/researcher/1/"]),
          c("Web of Science"),
        ],
        [
          c("4"),
          c("ORCID"),
          c(""),
          c("Link", ["https://orcid.org/0000-0002-1825-0097"]),
          c("ORCID"),
        ],
      ],
    },
    Articles: {
      headers: [
        "#",
        "Full citation: Authors, Title, Journal, Year, Pages. DOI",
        "Type",
        "Link or DOI",
        "Publication Date",
      ],
      rows: [
        [
          c("1"),
          c(
            "Serikova A., Petrov B. (2022). Graph search for campus data. Test Journal of Computing, 4(2), 1-10. https://doi.org/10.1234/tjc.2022.1",
            ["https://doi.org/10.1234/tjc.2022.1"],
          ),
          c("Scopus/Web of Science"),
          c(""),
          c(""),
        ],
        [
          c("2"),
          c(
            "Serikova A. (2021). Some other paper. Journal X. DOI: 10.1234/wrong.1",
          ),
          c("КОКСОН"),
          c(""),
          c(""),
        ],
        [
          c("3"),
          c(
            "Serikova A. (2020). A paper without identifiers. Local Bulletin, 2020, №1.",
          ),
          c("Other"),
          c(""),
          c(""),
        ],
        [
          c("4"),
          c(
            "Serikova A., Petrov B. (2022). Graph search for campus data. Test Journal of Computing. https://doi.org/10.1234/tjc.2022.1",
          ),
          c("Scopus/Web of Science"),
          c(""),
          c(""),
        ],
      ],
    },
    "Scientific projects": {
      headers: [
        "#",
        "Full Information: Title, Supervisor (PI), funding organisation",
        "From",
        "To",
        "Budget",
        "Role",
        "Status",
      ],
      rows: [
        [
          c(""),
          c("Smart campus analytics. Ministry grant."),
          c("2021"),
          c("2023"),
          c("10 млн.тг."),
          c("Исследователь"),
          c("Сompleted"),
        ],
      ],
    },
    Certificates: {
      headers: ["#", "Description", "Certificate type", "Action"],
      rows: [
        [
          c("1"),
          c("Certificate of Research Methodology course"),
          c("Qualification"),
          c(""),
        ],
      ],
    },
    "Work experience": {
      headers: [
        "#",
        "Organization name",
        "Address",
        "Position",
        "Lenght of service",
        "From",
        "To",
        "Experience type",
      ],
      rows: [
        [
          c("1"),
          c("Test University"),
          c("Astana"),
          c("Senior Lecturer"),
          c("3"),
          c("2020"),
          c("2023"),
          c("Profile"),
        ],
      ],
    },
    Developments: {
      headers: ["#", "Name"],
      rows: [
        [
          c("1"),
          c("Textbook «Testing in Practice», 2023. https://example.edu/book/1"),
        ],
      ],
    },
    "Intellectual property": { headers: ["#", "Patent type"], rows: [] },
  },
};
const content = JSON.stringify(capture);

test("DU profile capture maps to profile fields, sections and publications", () => {
  const p = parseDuCapture(content);
  assert.equal(p.details.name_cyrillic, "Серікова Айгүл Маратқызы");
  assert.equal(p.details.name_latin, "Serikova Aigul");
  assert.equal(p.details.position, "Старший преподаватель");
  assert.equal(p.details.department, "School of Testing / Школа тестирования");
  assert.equal(p.details.degree, "Doctor PhD / Доктор PhD");
  assert.match(p.details.academic_title, /^Associate Professor/);
  assert.equal(p.details.orcid, "0000-0002-1825-0097");
  assert.equal(p.details.scopus_author_id, "57000000001");
  assert.equal(p.details.wos_researcher_id, "A-1234-2019");
  assert.match(p.details.google_scholar_url, /scholar\.google\.com/);
  assert.deepEqual(p.sections.education[1], {
    level: "Doctorate",
    institution: "Test Technical University",
    specialty: "Computer Science",
    year: 2020,
  });
  assert.equal(
    p.sections.training[0].title,
    "Certificate of Research Methodology course",
  );
  assert.deepEqual(p.sections.employment[0], {
    organization: "Test University",
    position: "Senior Lecturer",
    from_year: 2020,
    to_year: 2023,
    experience_type: "Profile",
  });
  assert.equal(p.sections.projects[0].status, "Completed");
  assert.equal(p.sections.materials[0].link, "https://example.edu/book/1");
  assert.equal(p.publications.length, 4);
  assert.equal(p.publications[0].doi, "10.1234/tjc.2022.1");
  assert.equal(p.publications[0].year, 2022);
  assert.equal(p.publications[2].doi, null);
  assert.equal(p.publications[2].title_guess, "A paper without identifiers");
  assert.equal(p.publications[3].duplicate_of, 0);
  assert.ok(
    titleMatch("Graph search for campus data", p.publications[0].citation) >
      0.9,
  );
});

test("teacher reviews and applies a DU import; DOIs are checked against registries", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await applyMigrations(db);
  for (const role of ["teacher", "student"])
    await db.query(
      "INSERT INTO users(email,name,role,password_hash) VALUES($1,$2,$3,$4)",
      [role + "@test.edu", role, role, await hashPassword("Test-password-123")],
    );
  const teacherId = (
    await db.query("SELECT id FROM users WHERE role='teacher'")
  ).rows[0].id;
  const imp = (
    await db.query(
      "INSERT INTO browser_imports(user_id,source_url,content) VALUES($1,$2,$3) RETURNING id",
      [teacherId, capture.source, content],
    )
  ).rows[0].id;
  // Fake OpenAlex: one real title, one DOI pointing to another paper.
  const registry = async (url) => {
    url = String(url);
    if (url.includes("tjc.2022.1"))
      return Response.json({
        display_name: "Graph search for campus data",
        publication_year: 2022,
        primary_location: {
          source: { display_name: "Test Journal of Computing" },
        },
        authorships: [{ author: { display_name: "Aigul Serikova" } }],
      });
    if (url.includes("wrong.1") && url.includes("openalex"))
      return Response.json({
        display_name: "Completely unrelated chemistry study",
        publication_year: 2021,
      });
    return new Response("not found", { status: 404 });
  };
  const app = await createApp(db, {
    scholarlyFetch: registry,
    onedrive: { clientId: "", secretKey: "" },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, cookie = "", body) =>
    fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: "http://localhost:5173",
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const login = async (role) =>
    (
      await request("/auth/login", "", {
        email: role + "@test.edu",
        password: "Test-password-123",
      })
    ).headers
      .get("set-cookie")
      .split(";")[0];
  const teacher = await login("teacher");
  const student = await login("student");

  assert.equal((await request(`/du-import/${imp}`, student)).status, 403);
  const preview = await (await request(`/du-import/${imp}`, teacher)).json();
  assert.equal(preview.fields.find((f) => f.field === "orcid").status, "new");
  assert.deepEqual(
    preview.publications.map((p) => p.status),
    ["verified", "check", "check", "duplicate"],
  );
  assert.match(preview.publications[1].issues[0], /another article/);
  assert.match(preview.publications[2].issues[0], /No DOI/);
  assert.deepEqual(preview.summary, {
    verified: 1,
    translated: 0,
    found: 0,
    check: 2,
    duplicate: 1,
    exists: 0,
  });

  const applied = await (
    await request(`/du-import/${imp}/apply`, teacher, {
      fields: preview.fields.map((f) => f.field),
      sections: [
        "education",
        "training",
        "employment",
        "projects",
        "materials",
      ],
      publications: [0, 2, 3],
    })
  ).json();
  assert.equal(applied.publications, 2, "duplicate skipped");
  assert.deepEqual(applied.sections, {
    education: 2,
    training: 1,
    employment: 1,
    projects: 1,
    materials: 1,
  });

  const profile = (await (await request("/faculty/profile", teacher)).json())
    .profile;
  assert.equal(profile.details.name_cyrillic, "Серікова Айгүл Маратқызы");
  assert.equal(profile.details.scopus_author_id, "57000000001");
  assert.equal(profile.education.length, 2);
  assert.equal(profile.employment[0].organization, "Test University");
  const pubs = (await (await request("/faculty/publications", teacher)).json())
    .publications;
  const verified = pubs.find((p) => p.doi === "10.1234/tjc.2022.1");
  assert.equal(verified.venue, "Test Journal of Computing");
  assert.equal(verified.verification_status, "unverified");
  assert.ok(pubs.find((p) => p.title === "A paper without identifiers"));

  // Applying again adds nothing twice.
  const again = await (
    await request(`/du-import/${imp}/apply`, teacher, {
      sections: ["education"],
      publications: [0, 2],
    })
  ).json();
  assert.equal(again.publications, 0);
  assert.equal(again.sections.education, 0);
  const second = await (await request(`/du-import/${imp}`, teacher)).json();
  assert.equal(second.summary.exists, 2);
});

test("citation titles are read from the usual DU formats", () => {
  assert.equal(
    guessTitle(
      "Ivanova A., Petrov B. (2021). Study of control systems. Journal X, 2(1), 3-9.",
    ),
    "Study of control systems",
  );
  assert.equal(
    guessTitle(
      "Serikov A.E., Abitova G.A. Information technology for personality prediction based on resume analysis. Bulletin of Test University. 2023;(2(10)):45-50.",
    ),
    "Information technology for personality prediction based on resume analysis",
  );
  assert.equal(
    guessTitle(
      '3. F. Dael, G. Test, "Comparative Effectiveness of Classification Algorithms", 2024 IEEE Conference',
    ),
    "Comparative Effectiveness of Classification Algorithms",
  );
  assert.equal(
    guessTitle("https://www.scopus.com/record/1; DOI: 10.1109/X.1"),
    "",
  );
});

test("publication checks: translation, DOI only, issue DOI and DOI found by title", async () => {
  const json = (b) => Response.json(b);
  const fetcher = async (url) => {
    url = decodeURIComponent(String(url));
    if (url.includes("works/doi:10.1234/ru"))
      return json({
        display_name: "Weather prediction with artificial intelligence",
        publication_year: 2024,
      });
    if (url.includes("works/doi:10.1234/only"))
      return json({
        display_name: "Roasting in fluidized bed furnaces",
        publication_year: 2021,
      });
    if (url.includes("works/doi:10.1234/issue"))
      return json({ display_name: "", publication_year: 2022 });
    if (
      url.includes("works?") &&
      url.includes("Neural network modeling of agglomeration")
    )
      return json({
        results: [
          {
            doi: "https://doi.org/10.1234/found",
            display_name:
              "Neural Network Modeling of Agglomeration Firing Process",
            publication_year: 2022,
          },
        ],
      });
    return new Response("", { status: 404 });
  };
  const pubs = [
    {
      citation:
        "Mukashev D. (2024). ПРОГНОЗ ПОГОДЫ НА ОСНОВЕ ИСКУССТВЕННОГО ИНТЕЛЛЕКТА. Вестник.",
      doi: "10.1234/ru",
      year: 2024,
    },
    {
      citation: "https://www.scopus.com/record/1; DOI: 10.1234/only",
      doi: "10.1234/only",
      year: null,
    },
    {
      citation: "Авторы (2022). Автоматизация сбора данных. Вестник КазАТК.",
      doi: "10.1234/issue",
      year: 2022,
    },
    {
      citation:
        "Abitova G. (2022). Neural network modeling of agglomeration firing process. IJECE.",
      doi: null,
      year: 2022,
      title_guess: "Neural network modeling of agglomeration firing process",
    },
  ];
  const r = await verifyPublications(pubs, fetcher);
  assert.deepEqual(
    r.map((p) => p.status),
    ["translated", "verified", "check", "found"],
  );
  assert.match(r[0].issues[0], /English title/);
  assert.match(r[1].issues[0], /taken from the DOI record/);
  assert.match(r[2].issues[0], /journal issue/);
  assert.equal(r[3].doi, "10.1234/found");
});
