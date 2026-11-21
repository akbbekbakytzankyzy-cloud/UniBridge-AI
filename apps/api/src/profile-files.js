// Fills the teacher's profile and publications from their own imported files
// (OneDrive sync, page imports) and from public DOI metadata, so nothing has to
// be typed by hand. Profile values are only proposed: the browser puts them in
// the form and the teacher saves through the normal validated endpoint.
// Publications found in files are added as "unverified", never overwriting rows.
import { Router } from "express";
import { z } from "zod";
import { profileSchema } from "./faculty.js";
import { matchProfileFields, matchTables } from "./profile-match.js";
import { normalizeDoi } from "./scholarly.js";

const labels = Object.fromEntries(profileSchema.fields.map((f) => [f.key, f.label]));
const lower = (v) => String(v ?? "").trim().toLowerCase();
const same = (a, b) => lower(a) === lower(b);
const words = (v) => lower(v).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// How two rows of the same collection are recognised as the same entry.
const rowKey = {
  education: (r) => `${words(r.institution)}|${r.year ?? ""}|${words(r.level)}`,
  training: (r) => `${words(r.title)}|${r.completed_at ?? ""}`,
  awards: (r) => `${words(r.title)}|${r.year ?? ""}`,
};
const pubKey = (p) => `${words(p.title)}|${p.year ?? ""}`;

export function profileFilesRouter(pool, { fetcher = fetch } = {}) {
  const router = Router();
  router.use((req, res, next) =>
    req.user.role === "teacher"
      ? next()
      : res.status(403).json({ error: "Teacher access required" }),
  );

  async function scan(userId) {
    const [{ rows: profile }, { rows: files }] = await Promise.all([
      pool.query("SELECT details,education,training,awards FROM faculty_profiles WHERE user_id=$1", [userId]),
      // Newest first, so a newer version of a file wins over an older one.
      pool.query(
        `SELECT id,title,source_url,origin,content,created_at FROM browser_imports
         WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [userId],
      ),
    ]);
    return { profile: profile[0] || { details: {}, education: [], training: [], awards: [] }, files };
  }
  const sourceOf = (file) => ({
    id: file.id,
    name: file.title || file.source_url,
    origin: file.origin,
    imported_at: file.created_at,
  });

  router.get("/suggestions", async (req, res) => {
    const { profile, files } = await scan(req.user.id);
    const details = profile.details || {};
    const best = new Map();
    const rows = { education: [], training: [], awards: [] };
    const seen = Object.fromEntries(
      Object.keys(rows).map((c) => [c, new Set((profile[c] || []).map(rowKey[c]))]),
    );
    for (const file of files) {
      for (const m of matchProfileFields(file.content))
        if (labels[m.field] && !best.has(m.field))
          best.set(m.field, { field: m.field, label: labels[m.field], value: m.value, found_as: m.label, source: sourceOf(file) });
      const tables = matchTables(file.content);
      for (const c of Object.keys(rows))
        for (const record of tables[c]) {
          const key = rowKey[c](record);
          if (seen[c].has(key)) continue;
          seen[c].add(key);
          rows[c].push({ record, source: sourceOf(file) });
        }
    }
    const empty = [],
      different = [];
    for (const s of best.values()) {
      const current = details[s.field];
      if (current === undefined || current === null || current === "") empty.push(s);
      else if (!same(current, s.value)) different.push({ ...s, current });
    }
    res.json({ empty, different, rows, filesChecked: files.length });
  });

  async function publicationsFromFiles(userId) {
    const { files } = await scan(userId);
    const { rows: existing } = await pool.query("SELECT title,year,doi FROM publications WHERE owner_id=$1", [userId]);
    const doiSeen = new Set(existing.map((p) => p.doi).filter(Boolean));
    const titleSeen = new Set(existing.map(pubKey));
    const found = [];
    for (const file of files)
      for (const p of matchTables(file.content).publications) {
        const doi = p.doi ? normalizeDoi(p.doi) : null;
        if ((doi && doiSeen.has(doi)) || titleSeen.has(pubKey(p))) continue;
        if (doi) doiSeen.add(doi);
        titleSeen.add(pubKey(p));
        found.push({
          title: p.title,
          year: p.year ?? null,
          doi,
          venue: p.venue || "",
          authors: p.authors || "",
          source: sourceOf(file),
        });
      }
    return found;
  }

  router.get("/publications", async (req, res) => {
    res.json({ publications: await publicationsFromFiles(req.user.id) });
  });

  // Adds every publication found in the files that is not in the list yet.
  router.post("/publications/import", async (req, res) => {
    const found = await publicationsFromFiles(req.user.id);
    let added = 0;
    for (const p of found) {
      const r = await pool.query(
        `INSERT INTO publications(owner_id,title,year,doi,venue,authors,source,source_url,imported_at)
         VALUES($1,$2,$3,$4,$5,$6,'file',$7,now()) ON CONFLICT DO NOTHING RETURNING id`,
        [req.user.id, p.title, p.year, p.doi, p.venue.slice(0, 300), p.authors.slice(0, 2000), String(p.source.name).slice(0, 2000)],
      );
      added += r.rows.length;
    }
    res.json({ added, found: found.length });
  });

  // Public metadata for one DOI (OpenAlex, then Crossref), to fill the form.
  router.get("/doi", async (req, res) => {
    const doi = normalizeDoi(z.string().max(400).parse(req.query.doi || ""));
    if (!doi) return res.status(400).json({ error: "Use a DOI such as 10.1234/example" });
    const get = async (url) => {
      const r = await fetcher(url, {
        headers: { Accept: "application/json", "User-Agent": "UniBridgeAI/0.1" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    };
    const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
    try {
      const w = await get(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`);
      return res.json({
        doi,
        title: clip(w.display_name || w.title, 500),
        year: Number.isInteger(w.publication_year) ? w.publication_year : null,
        venue: clip(w.primary_location?.source?.display_name, 300),
        authors: clip((w.authorships || []).map((a) => a.author?.display_name).filter(Boolean).join(", "), 2000),
        source: "OpenAlex",
      });
    } catch {
      /* fall back to Crossref */
    }
    try {
      const { message: m } = await get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
      const year = m.issued?.["date-parts"]?.[0]?.[0];
      return res.json({
        doi,
        title: clip(m.title?.[0], 500),
        year: Number.isInteger(year) ? year : null,
        venue: clip(m["container-title"]?.[0], 300),
        authors: clip((m.author || []).map((a) => [a.given, a.family].filter(Boolean).join(" ")).join(", "), 2000),
        source: "Crossref",
      });
    } catch {
      return res.status(404).json({ error: "No public record found for this DOI" });
    }
  });

  return router;
}
