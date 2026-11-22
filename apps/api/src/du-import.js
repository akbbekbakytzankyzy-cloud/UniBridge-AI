// Turns a captured DU teacher profile (format "du-teacher-v1", collected by
// du-capture.js) into UniBridgeAI profile fields, profile sections and
// publications, and checks each publication: DOI found in OpenAlex/Crossref,
// title matches the citation, duplicates, missing year or DOI. Nothing is saved
// until the teacher applies the reviewed result.
import { Router } from "express";
import { z } from "zod";
import { normalizeDoi } from "./scholarly.js";
import { profileSchema } from "./faculty.js";

const clip = (v, n = 300) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);
const words = (v) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const yearOf = (v) => {
  const m = String(v ?? "").match(/\b(19[5-9]\d|20\d\d|21\d\d)\b/);
  return m ? Number(m[0]) : null;
};
// "Doctor PhD/Доктор PhD/PhD докторы" → keep the parts in Latin and Russian.
const firstParts = (v) =>
  clip(
    String(v ?? "")
      .split("/")
      .slice(0, 2)
      .join(" / "),
  );

function columnIndex(headers, ...patterns) {
  const i = headers.findIndex((h) => patterns.some((p) => p.test(h)));
  return i;
}
const cell = (row, i) =>
  i >= 0 ? row[i] || { text: "", links: [] } : { text: "", links: [] };

const CYRILLIC = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/;
// Text of a citation without links and identifiers.
const plain = (citation) =>
  String(citation)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\bdoi:?\s*10\.\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
// "Ivanov A.A., Petrov B." / "A. Ivanov, B. Petrov" — a list of authors.
const looksLikeAuthors = (s) =>
  /(\b\p{Lu}\.\s?){1,3}/u.test(s) &&
  s.split(/[,;&]| and /).length >= 2 &&
  !/\b\p{Ll}{4,}\s\p{Ll}{4,}\s\p{Ll}{4,}/u.test(s);

// Best guess of the title in a free-text DU citation (used when there is no DOI).
export function guessTitle(citation) {
  const text = plain(citation).replace(/^\d+\.\s+/, "");
  const tidy = (s) => {
    let t = clip(s.replace(/^[\s/–—.,:"“«-]+|[\s/–—.,:;"”»-]+$/g, ""), 500);
    if ((t.match(/«/g) || []).length > (t.match(/»/g) || []).length) t += "»";
    return t;
  };
  // "Authors (Year). Title. Journal…" — the most common DU form, checked first
  // because journal and conference names are often the quoted part.
  const afterYear = text.match(
    /\((?:19|20)\d\d\)\s*[.,]?\s*[/–-]?\s*(.+?)(?:\s*[./]\s+(?:\p{Lu}|\/\/|In:)|\s\/|$)/u,
  );
  if (afterYear && tidy(afterYear[1]).length >= 8) return tidy(afterYear[1]);
  const quoted = text.match(/(?:^|[\s,.])[“"«]([^”"»“«]{15,300})[”"»]/);
  if (quoted) return tidy(quoted[1]);
  // "Authors. Title. Journal. 2023;…" — drop a leading "Surname I.I., Surname I." list,
  // then take the first long segment that is not an author list.
  const noAuthors = text.replace(
    /^(?:\p{Lu}[\p{L}'’-]+,?\s+(?:\p{Lu}\.\s?){1,3}(?:,|\s(?:and|и|&))?\s*)+/u,
    "",
  );
  const parts = noAuthors.split(/(?<=[^\s.]{3})\.\s+|\s\/\/?\s|\s[-–]\s/);
  const candidate = parts.find(
    (p) =>
      p.length >= 20 &&
      !looksLikeAuthors(p) &&
      !/^(vol|no|pp|issn|isbn|doi)\b/i.test(p),
  );
  return candidate ? tidy(candidate) : "";
}

export function isDuCapture(content) {
  return (
    typeof content === "string" &&
    content.startsWith('{"format":"du-teacher-v1"')
  );
}

export function parseDuCapture(content) {
  const data = JSON.parse(content);
  if (data?.format !== "du-teacher-v1" || typeof data.sections !== "object")
    throw new Error("Not a DU profile capture");
  const lines = String(data.header?.text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const details = {};
  // Header order on DU: Back, Cyrillic name, Latin name, e-mail, position, school.
  const start = /^(назад|back|артқа)$/i.test(lines[0] || "") ? 1 : 0;
  const after = (re) => {
    const i = lines.findIndex((l) => re.test(l));
    const next = lines[i + 1] || "";
    // The next line is the value unless it is the next label ("Academic status / …").
    const isLabel =
      /^(scientific|academic|teaching)\b[^/]*\/\s*[А-Яа-яЁё]/i.test(next);
    return i >= 0 && next && !isLabel ? next : "";
  };
  if (/[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/.test(lines[start] || ""))
    details.name_cyrillic = clip(lines[start]);
  if (/^[A-Za-z' .-]+$/.test(lines[start + 1] || ""))
    details.name_latin = clip(lines[start + 1]);
  const emailAt = lines.findIndex((l) =>
    /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(l),
  );
  if (emailAt >= 0) {
    if (lines[emailAt + 1] && !/academic info/i.test(lines[emailAt + 1]))
      details.position = clip(lines[emailAt + 1]);
    if (lines[emailAt + 2] && !/academic info/i.test(lines[emailAt + 2]))
      details.department = firstParts(lines[emailAt + 2]);
  }
  const degree = after(/scientific degree|учёная степень|ученая степень/i);
  if (degree) details.degree = firstParts(degree);
  const title = after(/academic status|академический статус/i);
  if (title) details.academic_title = firstParts(title);

  const sec = (name) =>
    data.sections[
      Object.keys(data.sections).find((k) => k.toLowerCase().startsWith(name))
    ] || { headers: [], rows: [] };

  // Scientific information: ORCID, Scopus, Web of Science, Google Scholar.
  const sci = sec("scientific information");
  {
    const idCol = columnIndex(sci.headers, /work id/i);
    const urlCol = columnIndex(sci.headers, /url/i);
    const typeCol = columnIndex(sci.headers, /platform/i);
    for (const row of sci.rows) {
      const type = cell(row, typeCol).text.toLowerCase();
      const id = cell(row, idCol).text;
      const links = [
        ...cell(row, urlCol).links,
        ...row.flatMap((c) => c.links),
      ];
      const all = [id, ...links].join(" ");
      const orcid = all.match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/i);
      if (orcid && !details.orcid) details.orcid = orcid[0].toUpperCase();
      if (/scopus/.test(type)) {
        const m = all.match(/authorId=(\d{6,})/i) || id.match(/^\d{6,}$/);
        if (m) details.scopus_author_id = m[1] || m[0];
      }
      if (
        /web of science|publons|wos/.test(type) &&
        /^[A-Z]{1,3}-\d{4}-\d{4}$/i.test(id)
      )
        details.wos_researcher_id = id.toUpperCase();
      if (/google scholar/.test(type)) {
        const g = links.find((l) => /scholar\.google\./.test(l));
        if (g) details.google_scholar_url = clip(g, 300);
      }
    }
  }

  const sections = {
    education: [],
    training: [],
    employment: [],
    projects: [],
    materials: [],
  };
  // Education
  {
    const s = sec("education");
    const inst = columnIndex(s.headers, /institution/i),
      grad = columnIndex(s.headers, /graduation/i),
      spec = columnIndex(s.headers, /speciali/i),
      deg = columnIndex(s.headers, /degree/i);
    for (const row of s.rows) {
      const institution = clip(cell(row, inst).text);
      if (!institution) continue;
      sections.education.push({
        level: clip(cell(row, deg).text) || "Not specified",
        institution,
        ...(clip(cell(row, spec).text) && {
          specialty: clip(cell(row, spec).text),
        }),
        ...(yearOf(cell(row, grad).text) && {
          year: yearOf(cell(row, grad).text),
        }),
      });
    }
  }
  // Certificates → professional development
  {
    const s = sec("certificates");
    const desc = columnIndex(s.headers, /description/i),
      type = columnIndex(s.headers, /type/i);
    for (const row of s.rows) {
      const t = clip(cell(row, desc).text);
      if (t)
        sections.training.push({
          title: t,
          ...(clip(cell(row, type).text) && {
            certificate_reference: `DU: ${clip(cell(row, type).text, 80)}`,
          }),
        });
    }
  }
  // Work experience
  {
    const s = sec("work experience");
    const org = columnIndex(s.headers, /organi[sz]ation/i),
      pos = columnIndex(s.headers, /position/i),
      from = columnIndex(s.headers, /^from$/i),
      to = columnIndex(s.headers, /^to$/i),
      type = columnIndex(s.headers, /experience type/i);
    for (const row of s.rows) {
      const organization = clip(cell(row, org).text);
      if (!organization) continue;
      sections.employment.push({
        organization,
        ...(clip(cell(row, pos).text) && {
          position: clip(cell(row, pos).text),
        }),
        ...(yearOf(cell(row, from).text) && {
          from_year: yearOf(cell(row, from).text),
        }),
        ...(yearOf(cell(row, to).text) && {
          to_year: yearOf(cell(row, to).text),
        }),
        ...(clip(cell(row, type).text) && {
          experience_type: clip(cell(row, type).text),
        }),
      });
    }
  }
  // Scientific projects
  {
    const s = sec("scientific projects");
    const info = columnIndex(s.headers, /information|title/i),
      from = columnIndex(s.headers, /^from$/i),
      to = columnIndex(s.headers, /^to$/i),
      budget = columnIndex(s.headers, /budget/i),
      role = columnIndex(s.headers, /role/i),
      status = columnIndex(s.headers, /status/i);
    for (const row of s.rows) {
      const t = clip(cell(row, info).text);
      if (!t) continue;
      sections.projects.push({
        title: t,
        ...(yearOf(cell(row, from).text) && {
          from_year: yearOf(cell(row, from).text),
        }),
        ...(yearOf(cell(row, to).text) && {
          to_year: yearOf(cell(row, to).text),
        }),
        ...(clip(cell(row, budget).text) && {
          budget: clip(cell(row, budget).text),
        }),
        ...(clip(cell(row, role).text) && { role: clip(cell(row, role).text) }),
        ...(clip(cell(row, status).text) && {
          status: clip(cell(row, status).text.replace(/^С/, "C")),
        }),
      });
    }
  }
  // Developments (textbooks, courses, committee work) with their links
  {
    const s = sec("developments");
    const name = columnIndex(s.headers, /name/i);
    for (const row of s.rows) {
      const text = cell(row, name).text;
      if (!text.trim()) continue;
      const link = (
        cell(row, name).links[0] ||
        text.match(/https?:\/\/\S+/)?.[0] ||
        ""
      ).replace(/[).,;]+$/, "");
      sections.materials.push({
        title: clip(
          text.replace(/https?:\/\/\S+/g, "").replace(/\s+\)/g, ")"),
          300,
        ),
        ...(link && { link: clip(link, 300) }),
      });
    }
  }

  // Articles → publications (checked later)
  const publications = [];
  {
    const s = sec("articles");
    const cit = columnIndex(s.headers, /citation/i),
      type = columnIndex(s.headers, /^type$/i),
      link = columnIndex(s.headers, /link|doi/i),
      date = columnIndex(s.headers, /date/i);
    for (const row of s.rows) {
      const citation = cell(row, cit).text;
      if (!citation.trim()) continue;
      const links = row.flatMap((c) => c.links);
      const all = [citation, cell(row, link).text, ...links].join(" ");
      const doiMatch = all.match(/10\.\d{4,9}\/[^\s;,"'<>]+/i);
      const doi = doiMatch
        ? normalizeDoi(doiMatch[0].replace(/[.)\]]+$/, ""))
        : null;
      const year =
        yearOf(cell(row, date).text) ||
        yearOf(citation.match(/\((19|20)\d\d\)/)?.[0]) ||
        yearOf(citation);
      publications.push({
        citation: clip(citation, 2000),
        doi,
        year,
        type: clip(cell(row, type).text, 80),
        title_guess: guessTitle(citation),
        links: links.slice(0, 5),
      });
    }
  }
  // Duplicates: same DOI, or the same citation text.
  const seen = new Map();
  publications.forEach((p, i) => {
    const key = p.doi || words(p.citation).slice(0, 160);
    if (seen.has(key)) p.duplicate_of = seen.get(key);
    else seen.set(key, i);
  });

  return {
    details,
    sections,
    publications,
    source: clip(data.source, 300),
    captured_at: data.captured_at || null,
  };
}

// Share of the record's title words that appear in the DU citation.
export function titleMatch(title, citation) {
  const t = words(title)
    .split(" ")
    .filter((w) => w.length > 3);
  if (!t.length) return 0;
  const c = new Set(words(citation).split(" "));
  return t.filter((w) => c.has(w)).length / t.length;
}

const doiCache = new Map();
async function lookupDoi(fetcher, doi) {
  if (doiCache.has(doi)) return doiCache.get(doi);
  const get = async (url) => {
    const r = await fetcher(url, {
      headers: { Accept: "application/json", "User-Agent": "UniBridgeAI/0.1" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
    return r.json();
  };
  let result = null;
  try {
    const w = await get(
      `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`,
    );
    result = {
      title: clip(w.display_name || w.title, 500),
      year: Number.isInteger(w.publication_year) ? w.publication_year : null,
      venue: clip(w.primary_location?.source?.display_name),
      authors: clip(
        (w.authorships || [])
          .map((a) => a.author?.display_name)
          .filter(Boolean)
          .join(", "),
        2000,
      ),
      registry: "OpenAlex",
    };
  } catch {
    try {
      const { message: m } = await get(
        `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      );
      const y = m.issued?.["date-parts"]?.[0]?.[0];
      result = {
        title: clip(m.title?.[0], 500),
        year: Number.isInteger(y) ? y : null,
        venue: clip(m["container-title"]?.[0]),
        authors: clip(
          (m.author || [])
            .map((a) => [a.given, a.family].filter(Boolean).join(" "))
            .join(", "),
          2000,
        ),
        registry: "Crossref",
      };
    } catch (e) {
      result = e.status === 404 ? { notFound: true } : { unavailable: true };
    }
  }
  if (!result.unavailable) doiCache.set(doi, result);
  return result;
}

const searchCache = new Map();
// Up to three OpenAlex works whose title matches the search text.
async function searchTitle(fetcher, title) {
  const key = words(title);
  if (searchCache.has(key)) return searchCache.get(key);
  try {
    const url = `https://api.openalex.org/works?per-page=3&select=doi,display_name,publication_year,primary_location,authorships&search=${encodeURIComponent(title.slice(0, 200))}`;
    const r = await fetcher(url, {
      headers: { Accept: "application/json", "User-Agent": "UniBridgeAI/0.1" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const results = ((await r.json()).results || [])
      .map((w) => ({
        doi: normalizeDoi(w.doi || ""),
        title: clip(w.display_name, 500),
        year: Number.isInteger(w.publication_year) ? w.publication_year : null,
        venue: clip(w.primary_location?.source?.display_name),
        authors: clip(
          (w.authorships || [])
            .map((a) => a.author?.display_name)
            .filter(Boolean)
            .join(", "),
          2000,
        ),
        registry: "OpenAlex search",
      }))
      .filter((w) => w.doi && w.title);
    searchCache.set(key, results);
    return results;
  } catch {
    return null;
  }
}

// Adds a check result to every publication.
export async function verifyPublications(publications, fetcher, existing = []) {
  const existingDoi = new Set(existing.map((p) => p.doi).filter(Boolean));
  const existingTitle = new Set(existing.map((p) => words(p.title)));
  const queue = publications.map((p, i) => [p, i]);
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [p] = next;
      p.issues = [];
      if (p.duplicate_of !== undefined) {
        p.status = "duplicate";
        p.issues.push(`Same as item ${p.duplicate_of + 1} in DU`);
        continue;
      }
      if (p.doi) {
        const meta = await lookupDoi(fetcher, p.doi);
        if (meta.notFound) {
          p.status = "check";
          p.issues.push("DOI not found in OpenAlex or Crossref");
        } else if (meta.unavailable) {
          p.status = "check";
          p.issues.push("DOI registries could not be reached; check later");
        } else if (!meta.title) {
          p.status = "check";
          p.issues.push(
            "This DOI has no article title — it is probably the journal issue's DOI, not the article's",
          );
        } else {
          p.record = meta;
          const own = plain(p.citation);
          const score = titleMatch(meta.title, p.citation);
          const yearsAgree =
            !p.year || !meta.year || Math.abs(p.year - meta.year) <= 1;
          if (score >= 0.6) p.status = "verified";
          else if (own.split(" ").filter((w) => w.length > 3).length < 3) {
            // DU holds only a link/DOI for this item: the registry supplies the title.
            p.status = "verified";
            p.issues.push(
              "DU has no title for this item; the title was taken from the DOI record",
            );
          } else if (
            CYRILLIC.test(own) &&
            !CYRILLIC.test(meta.title) &&
            yearsAgree
          ) {
            p.status = "translated";
            p.issues.push(
              `The registry lists the English title: “${meta.title}”. Check that it is the same article`,
            );
          } else {
            p.status = "check";
            p.issues.push(
              `The DOI belongs to another article: “${meta.title}”`,
            );
          }
          if (!yearsAgree)
            p.issues.push(`Year in DU ${p.year}, registry ${meta.year}`);
        }
      } else {
        // No DOI: look the title up in OpenAlex and propose the DOI when it clearly matches.
        const found =
          p.title_guess && p.title_guess.length >= 20
            ? await searchTitle(fetcher, p.title_guess)
            : null;
        const hit = found?.find(
          (w) =>
            titleMatch(w.title, p.citation) >= 0.85 &&
            (!p.year || !w.year || Math.abs(p.year - w.year) <= 1),
        );
        if (hit) {
          p.status = "found";
          p.doi = hit.doi;
          p.record = hit;
          p.issues.push(`DOI found by title search: ${hit.doi}`);
        } else {
          p.status = "check";
          p.issues.push("No DOI: title read from the citation text");
        }
      }
      if (!p.year && !p.record?.year) p.issues.push("No year");
      const title = p.record?.title || p.title_guess;
      if (
        (p.doi && existingDoi.has(p.doi)) ||
        (title && existingTitle.has(words(title)))
      ) {
        p.status = "exists";
        p.issues.push("Already in your publication list");
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return publications;
}

const SECTION_KEYS = {
  education: (r) => `${words(r.institution)}|${r.year ?? ""}|${words(r.level)}`,
  training: (r) => words(r.title),
  employment: (r) => `${words(r.organization)}|${r.from_year ?? ""}`,
  projects: (r) => `${words(r.title).slice(0, 120)}|${r.from_year ?? ""}`,
  materials: (r) => words(r.title).slice(0, 160),
};
const DETAIL_KEYS = new Set(profileSchema.fields.map((f) => f.key));

export function duImportRouter(pool, { fetcher = fetch } = {}) {
  const router = Router();
  router.use((req, res, next) =>
    req.user.role === "teacher"
      ? next()
      : res.status(403).json({ error: "Teacher access required" }),
  );

  async function load(req, res) {
    const id = z.uuid().parse(req.params.id);
    const { rows } = await pool.query(
      "SELECT id,content FROM browser_imports WHERE id=$1 AND user_id=$2",
      [id, req.user.id],
    );
    if (!rows[0])
      return res.status(404).json({ error: "Import not found" }) && null;
    if (!isDuCapture(rows[0].content))
      return (
        res.status(400).json({ error: "This import is not a DU profile" }) &&
        null
      );
    try {
      return { id, parsed: parseDuCapture(rows[0].content) };
    } catch {
      return (
        res.status(400).json({ error: "The DU profile could not be read" }) &&
        null
      );
    }
  }
  async function current(userId) {
    const [{ rows: p }, { rows: pubs }] = await Promise.all([
      pool.query(
        "SELECT details,education,training,employment,projects,materials,revision FROM faculty_profiles WHERE user_id=$1",
        [userId],
      ),
      pool.query("SELECT title,doi FROM publications WHERE owner_id=$1", [
        userId,
      ]),
    ]);
    return { profile: p[0] || null, publications: pubs };
  }

  router.get("/:id", async (req, res) => {
    const loaded = await load(req, res);
    if (!loaded) return;
    const { profile, publications } = await current(req.user.id);
    const { details, sections, source, captured_at } = loaded.parsed;
    const fields = Object.entries(details)
      .filter(([k]) => DETAIL_KEYS.has(k))
      .map(([field, value]) => {
        const now = profile?.details?.[field];
        return {
          field,
          value,
          current: now ?? null,
          status:
            now === undefined || now === null || now === ""
              ? "new"
              : String(now) === String(value)
                ? "same"
                : "different",
        };
      });
    const sectionView = Object.fromEntries(
      Object.entries(sections).map(([name, rows]) => {
        const have = new Set((profile?.[name] || []).map(SECTION_KEYS[name]));
        return [
          name,
          rows.map((r) => ({
            record: r,
            exists: have.has(SECTION_KEYS[name](r)),
          })),
        ];
      }),
    );
    const checked = await verifyPublications(
      loaded.parsed.publications,
      fetcher,
      publications,
    );
    const summary = {
      verified: checked.filter((p) => p.status === "verified").length,
      translated: checked.filter((p) => p.status === "translated").length,
      found: checked.filter((p) => p.status === "found").length,
      check: checked.filter((p) => p.status === "check").length,
      duplicate: checked.filter((p) => p.status === "duplicate").length,
      exists: checked.filter((p) => p.status === "exists").length,
    };
    res.json({
      source,
      captured_at,
      fields,
      sections: sectionView,
      publications: checked,
      summary,
    });
  });

  const applyInput = z
    .object({
      fields: z.array(z.string().max(60)).max(50).default([]),
      sections: z
        .array(z.enum(Object.keys(SECTION_KEYS)))
        .max(10)
        .default([]),
      publications: z
        .array(z.number().int().min(0).max(1000))
        .max(1000)
        .default([]),
    })
    .strict();

  router.post("/:id/apply", async (req, res) => {
    const loaded = await load(req, res);
    if (!loaded) return;
    const input = applyInput.parse(req.body);
    const { details, sections, publications } = loaded.parsed;
    const { profile } = await current(req.user.id);
    const nextDetails = { ...(profile?.details || {}) };
    const filled = [];
    for (const f of input.fields)
      if (DETAIL_KEYS.has(f) && details[f] !== undefined) {
        nextDetails[f] = details[f];
        filled.push(f);
      }
    const nextSections = {};
    const added = {};
    for (const name of Object.keys(SECTION_KEYS)) {
      const have = [...(profile?.[name] || [])];
      added[name] = 0;
      if (input.sections.includes(name)) {
        const keys = new Set(have.map(SECTION_KEYS[name]));
        for (const r of sections[name])
          if (!keys.has(SECTION_KEYS[name](r)) && have.length < 200) {
            keys.add(SECTION_KEYS[name](r));
            have.push(r);
            added[name]++;
          }
      }
      nextSections[name] = have;
    }
    if (profile)
      await pool.query(
        `UPDATE faculty_profiles SET details=$2::jsonb,education=$3::jsonb,training=$4::jsonb,employment=$5::jsonb,projects=$6::jsonb,materials=$7::jsonb,revision=revision+1,updated_at=now() WHERE user_id=$1`,
        [
          req.user.id,
          JSON.stringify(nextDetails),
          ...[
            "education",
            "training",
            "employment",
            "projects",
            "materials",
          ].map((n) => JSON.stringify(nextSections[n])),
        ],
      );
    else
      await pool.query(
        `INSERT INTO faculty_profiles(user_id,details,education,training,employment,projects,materials) VALUES($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb)`,
        [
          req.user.id,
          JSON.stringify(nextDetails),
          ...[
            "education",
            "training",
            "employment",
            "projects",
            "materials",
          ].map((n) => JSON.stringify(nextSections[n])),
        ],
      );
    // Publications: checked again so the stored title comes from the registry when the DOI matched.
    const chosen = [...new Set(input.publications)].filter(
      (i) => publications[i],
    );
    const { publications: existing } = await current(req.user.id);
    const checked = await verifyPublications(
      chosen.map((i) => publications[i]),
      fetcher,
      existing,
    );
    let pubsAdded = 0;
    for (const p of checked) {
      if (p.status === "duplicate" || p.status === "exists") continue;
      const verified =
        ["verified", "translated", "found"].includes(p.status) && p.record;
      const title = clip(
        verified ? p.record.title : p.title_guess || p.citation,
        500,
      );
      if (!title) continue;
      const r = await pool.query(
        `INSERT INTO publications(owner_id,title,year,doi,venue,authors,source,source_url,imported_at)
         VALUES($1,$2,$3,$4,$5,$6,'du',$7,now()) ON CONFLICT DO NOTHING RETURNING id`,
        [
          req.user.id,
          title,
          (verified && p.record.year) || p.year || null,
          p.doi,
          verified ? p.record.venue : "",
          verified ? p.record.authors : "",
          clip(loaded.parsed.source, 2000),
        ],
      );
      pubsAdded += r.rows.length;
    }
    await pool.query(
      "UPDATE browser_imports SET status='accepted' WHERE id=$1 AND user_id=$2",
      [loaded.id, req.user.id],
    );
    res.json({ fields: filled, sections: added, publications: pubsAdded });
  });

  return router;
}
