import React, { useEffect, useState } from "react";
import { api } from "./api.js";

// Review screen for a full DU profile import: profile fields, sections and
// publications with the result of the automatic checks. Nothing is saved
// until the teacher presses "Add selected to my profile".
const FIELD_LABELS = {
  name_cyrillic: "Full name (Cyrillic)",
  name_latin: "Full name (Latin)",
  department: "Department",
  position: "Position",
  degree: "Academic degree",
  academic_title: "Academic title",
  orcid: "ORCID",
  scopus_author_id: "Scopus Author ID",
  wos_researcher_id: "Web of Science ResearcherID",
  google_scholar_url: "Google Scholar",
};
const SECTION_LABELS = {
  education: "Education",
  training: "Certificates → professional development",
  employment: "Work experience",
  projects: "Research projects",
  materials: "Developments (textbooks, courses, service)",
};
const STATUS = {
  verified: { label: "✓ Verified by DOI", cls: "tag" },
  translated: { label: "✓ English title in registry", cls: "tag" },
  found: { label: "✓ DOI found by title", cls: "tag" },
  check: { label: "Check", cls: "tag warn" },
  duplicate: { label: "Duplicate in DU", cls: "tag neutral" },
  exists: { label: "Already added", cls: "tag neutral" },
};

export default function DuImportReview({ importId, onApplied }) {
  const [data, setData] = useState(null),
    [fields, setFields] = useState({}),
    [sections, setSections] = useState({}),
    [pubs, setPubs] = useState({}),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    api(`/du-import/${importId}`)
      .then((d) => {
        if (!active) return;
        setData(d);
        setFields(
          Object.fromEntries(
            d.fields.map((f) => [f.field, f.status === "new"]),
          ),
        );
        setSections(
          Object.fromEntries(
            Object.entries(d.sections).map(([k, rows]) => [
              k,
              rows.some((r) => !r.exists),
            ]),
          ),
        );
        setPubs(
          Object.fromEntries(
            d.publications.map((p, i) => [
              i,
              !["duplicate", "exists"].includes(p.status),
            ]),
          ),
        );
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [importId]);

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const r = await api(`/du-import/${importId}/apply`, {
        fields: Object.keys(fields).filter((k) => fields[k]),
        sections: Object.keys(sections).filter((k) => sections[k]),
        publications: Object.keys(pubs)
          .filter((k) => pubs[k])
          .map(Number),
      });
      const rows = Object.values(r.sections).reduce((a, b) => a + b, 0);
      setNotice(
        `Added: ${r.fields.length} profile fields, ${rows} section rows, ${r.publications} publications. Open My profile and Publications to review them.`,
      );
      onApplied?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="error">{error}</p>;
  if (!data)
    return (
      <p className="muted">
        Reading the DU profile and checking every DOI… this takes a few seconds.
      </p>
    );
  const s = data.summary;
  const toggleAllPubs = (status, on) =>
    setPubs((p) => ({
      ...p,
      ...Object.fromEntries(
        data.publications
          .map((x, i) => [i, x.status === status ? on : p[i]])
          .filter(([, v]) => v !== undefined),
      ),
    }));

  return (
    <div className="du-review">
      <p className="source-note">
        Collected from DU{" "}
        {data.captured_at
          ? `on ${new Date(data.captured_at).toLocaleString()}`
          : ""}
        . Publications: <strong>{s.verified}</strong> verified by DOI,{" "}
        {s.translated} with an English title in the registry, {s.found} DOIs
        found by title, <strong>{s.check}</strong> to check, {s.duplicate}{" "}
        duplicates, {s.exists} already in your list.
      </p>

      <h3>Profile fields</h3>
      {data.fields.map((f) => (
        <label key={f.field} className="inline-check">
          <input
            type="checkbox"
            checked={!!fields[f.field]}
            disabled={busy || f.status === "same"}
            onChange={(e) =>
              setFields({ ...fields, [f.field]: e.target.checked })
            }
          />{" "}
          <strong>{FIELD_LABELS[f.field] || f.field}:</strong> {f.value}
          {f.status === "different" && (
            <small className="warn-text">
              {" "}
              (now: {String(f.current)} — tick to replace)
            </small>
          )}
          {f.status === "same" && (
            <small className="muted"> (already the same)</small>
          )}
        </label>
      ))}

      <h3>Profile sections</h3>
      {Object.entries(data.sections).map(([name, rows]) => {
        const fresh = rows.filter((r) => !r.exists).length;
        return (
          <details key={name}>
            <summary>
              <label
                className="inline-check"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={!!sections[name]}
                  disabled={busy || !fresh}
                  onChange={(e) =>
                    setSections({ ...sections, [name]: e.target.checked })
                  }
                />{" "}
                {SECTION_LABELS[name] || name}: {fresh} new
                {rows.length - fresh
                  ? `, ${rows.length - fresh} already there`
                  : ""}
              </label>
            </summary>
            <ul className="du-rows">
              {rows.map((r, i) => (
                <li key={i} className={r.exists ? "muted" : ""}>
                  {Object.values(r.record).join(" · ")}
                </li>
              ))}
            </ul>
          </details>
        );
      })}

      <h3>Publications ({data.publications.length})</h3>
      <div className="button-group">
        <button
          type="button"
          className="secondary"
          onClick={() => toggleAllPubs("check", false)}
        >
          Untick “Check”
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => toggleAllPubs("check", true)}
        >
          Tick “Check”
        </button>
      </div>
      <ol className="du-pubs">
        {data.publications.map((p, i) => {
          const st = STATUS[p.status] || STATUS.check;
          const locked = p.status === "duplicate" || p.status === "exists";
          return (
            <li key={i} className={locked ? "muted" : ""}>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={!!pubs[i]}
                  disabled={busy || locked}
                  onChange={(e) => setPubs({ ...pubs, [i]: e.target.checked })}
                />{" "}
                <span className={st.cls}>{st.label}</span>{" "}
                <strong>
                  {p.record?.title || p.title_guess || p.citation.slice(0, 160)}
                </strong>
                {(p.record?.year || p.year) && ` (${p.record?.year || p.year})`}
              </label>
              {p.record?.venue && <div className="muted">{p.record.venue}</div>}
              {p.doi && (
                <div>
                  <a
                    href={`https://doi.org/${p.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    doi:{p.doi}
                  </a>
                </div>
              )}
              {p.issues?.length > 0 && (
                <div className="warn-text">{p.issues.join(" · ")}</div>
              )}
              <details>
                <summary>DU citation</summary>
                <small>{p.citation}</small>
              </details>
            </li>
          );
        })}
      </ol>

      {error && <p className="error">{error}</p>}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : (
        <button type="button" disabled={busy} onClick={apply}>
          {busy ? "Saving…" : "Add selected to my profile"}
        </button>
      )}
    </div>
  );
}
