// Imports a researcher's public publication list from ORCID and OpenAlex.
// Both are open scholarly APIs; no key is required. Imported rows are always
// "unverified" and existing rows are never changed.

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
const DOI_RE = /^10\.\d{4,9}\/\S+$/i;
const MAX_OPENALEX_PAGES = 5;

export function normalizeDoi(value) {
  if (typeof value !== "string") return null;
  const doi = value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
  return DOI_RE.test(doi) && doi.length <= 300 ? doi : null;
}

const clip = (value, max) => {
  const s = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};
const year = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1800 && n <= 2200 ? n : null;
};

async function getJson(fetcher, url) {
  const response = await fetcher(url, {
    headers: { Accept: "application/json", "User-Agent": "UniBridgeAI/0.1" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function fetchOrcidWorks(orcid, fetcher = fetch) {
  const data = await getJson(
    fetcher,
    `https://pub.orcid.org/v3.0/${orcid}/works`,
  );
  const works = [];
  for (const group of data.group || []) {
    const summaries = group["work-summary"] || [];
    // ORCID lists the owner's preferred version with the highest display index.
    const w = [...summaries].sort(
      (a, b) => Number(b["display-index"] || 0) - Number(a["display-index"] || 0),
    )[0];
    const title = clip(w?.title?.title?.value, 500);
    if (!w || !title) continue;
    const ids = w["external-ids"]?.["external-id"] || [];
    const doi = normalizeDoi(
      ids.find((x) => x["external-id-type"] === "doi")?.["external-id-value"],
    );
    works.push({
      source: "orcid",
      external_id: String(w["put-code"]),
      title,
      year: year(w["publication-date"]?.year?.value),
      venue: clip(w["journal-title"]?.value, 300),
      authors: "",
      doi,
      source_url: `https://orcid.org/${orcid}`,
    });
  }
  return works;
}

export async function fetchOpenAlexWorks(orcid, fetcher = fetch) {
  const works = [];
  let cursor = "*";
  for (let page = 0; cursor && page < MAX_OPENALEX_PAGES; page++) {
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("filter", `author.orcid:${orcid}`);
    url.searchParams.set("per-page", "200");
    url.searchParams.set("cursor", cursor);
    url.searchParams.set(
      "select",
      "id,doi,display_name,publication_year,primary_location,authorships",
    );
    const data = await getJson(fetcher, url);
    for (const w of data.results || []) {
      const title = clip(w.display_name, 500);
      if (!title) continue;
      works.push({
        source: "openalex",
        external_id: String(w.id || "").replace("https://openalex.org/", ""),
        title,
        year: year(w.publication_year),
        venue: clip(w.primary_location?.source?.display_name, 300),
        authors: clip(
          (w.authorships || [])
            .map((a) => a.author?.display_name)
            .filter(Boolean)
            .join(", "),
          2000,
        ),
        doi: normalizeDoi(w.doi),
        source_url: w.id || null,
      });
    }
    cursor = data.meta?.next_cursor || null;
  }
  return works;
}

const titleKey = (w) =>
  w.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() +
  "|" +
  (w.year ?? "");

export async function importPublications(
  pool,
  ownerId,
  orcid,
  fetcher = fetch,
) {
  if (!ORCID_RE.test(orcid || "")) throw new Error("Invalid ORCID");
  const result = { fetched: {}, added: 0, skipped: 0, errors: [] };
  const batches = [];
  // OpenAlex first: it carries the author list and venue, so it wins on DOI ties.
  for (const [source, load] of [
    ["openalex", fetchOpenAlexWorks],
    ["orcid", fetchOrcidWorks],
  ]) {
    try {
      const works = await load(orcid, fetcher);
      result.fetched[source] = works.length;
      batches.push(...works);
    } catch (e) {
      result.fetched[source] = 0;
      result.errors.push(`${source}: ${e.message}`);
    }
  }
  const { rows } = await pool.query(
    "SELECT title,year,doi FROM publications WHERE owner_id=$1",
    [ownerId],
  );
  const seenDoi = new Set(rows.map((r) => r.doi).filter(Boolean));
  const seenTitle = new Set(rows.map(titleKey));
  for (const w of batches) {
    if ((w.doi && seenDoi.has(w.doi)) || seenTitle.has(titleKey(w))) {
      result.skipped++;
      continue;
    }
    const inserted = await pool.query(
      `INSERT INTO publications(owner_id,title,year,doi,venue,authors,source,external_id,source_url,imported_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) ON CONFLICT DO NOTHING RETURNING id`,
      [
        ownerId,
        w.title,
        w.year,
        w.doi,
        w.venue,
        w.authors,
        w.source,
        w.external_id || null,
        w.source_url,
      ],
    );
    if (inserted.rows.length) result.added++;
    else result.skipped++;
    if (w.doi) seenDoi.add(w.doi);
    seenTitle.add(titleKey(w));
  }
  return result;
}
