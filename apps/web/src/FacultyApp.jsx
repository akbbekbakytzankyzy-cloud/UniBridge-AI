import React, { useEffect, useState } from "react";
import { api } from "./api.js";
function Field({ field, value, onChange }) {
  const numeric = ["year", "number"].includes(field.type);
  return (
    <label>
      {field.label}
      {field.required ? " *" : ""}
      <input
        required={field.required}
        type={numeric ? "number" : field.type === "date" ? "date" : "text"}
        min={field.min ?? (numeric ? 1800 : undefined)}
        max={field.max ?? (numeric ? 2200 : undefined)}
        step={field.type === "number" ? "any" : undefined}
        maxLength={numeric ? undefined : 300}
        value={value ?? ""}
        onChange={(e) =>
          onChange(
            numeric && e.target.value !== ""
              ? Number(e.target.value)
              : e.target.value,
          )
        }
      />
    </label>
  );
}

export default function FacultyWorkspace({ user, tab, onDirtyChange }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [schema, setSchema] = useState(null),
    [profile, setProfile] = useState(null),
    [publications, setPublications] = useState([]),
    [exports, setExports] = useState([]),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      api("/faculty/schema"),
      api("/faculty/profile"),
      api("/faculty/publications"),
      api("/faculty/exports"),
    ])
      .then(([s, p, pubs, ex]) => {
        if (active) {
          setSchema(s);
          setProfile(p.profile);
          setPublications(pubs.publications);
          setExports(ex.exports);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user.id]);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  async function run(fn) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function submit(fn) {
    return (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      run(() => fn(Object.fromEntries(new FormData(f)), f));
    };
  }
  const changeProfile = (key, value) => {
    setProfile((p) => ({ ...p, [key]: value }));
    setDirty(true);
  };
  const alert = (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </>
  );

  return (
    <div className="faculty-content">
      {alert}
      {!schema || !profile ? (
        <p className="empty">
          {error
            ? "Unable to load your profile. Reload to retry."
            : "Loading your profile…"}
        </p>
      ) : (
        <>
          {tab === "My profile" && (
            <>
              <h1>My profile</h1>
              <p className="muted">
                Work email: {user.email}. Fields marked * are required.
              </p>
              <ProfileSuggestions
                profile={profile}
                busy={busy}
                run={run}
                onApplied={(p) => setProfile(p)}
                setNotice={setNotice}
              />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    const { updated_at, ...payload } = profile;
                    setProfile(
                      (await api("/faculty/profile", payload, "PUT")).profile,
                    );
                    setDirty(false);
                    setNotice(
                      "Profile saved. You can now generate department forms.",
                    );
                  });
                }}
              >
                <fieldset disabled={busy}>
                  <section className="panel">
                    <h2>Personal and employment details</h2>
                    <div className="field-grid">
                      {schema.fields.map((f) => (
                        <Field
                          key={f.key}
                          field={f}
                          value={profile.details[f.key]}
                          onChange={(v) =>
                            changeProfile("details", {
                              ...profile.details,
                              [f.key]: v,
                            })
                          }
                        />
                      ))}
                    </div>
                  </section>
                  {Object.entries(schema.collections).map(
                    ([key, collection]) => (
                      <section className="panel" key={key}>
                        <h2>{collection.label}</h2>
                        {profile[key].map((entry, index) => (
                          <div className="record" key={index}>
                            <div className="field-grid">
                              {collection.fields.map((f) => (
                                <Field
                                  key={f.key}
                                  field={f}
                                  value={entry[f.key]}
                                  onChange={(v) =>
                                    changeProfile(
                                      key,
                                      profile[key].map((r, i) =>
                                        i === index ? { ...r, [f.key]: v } : r,
                                      ),
                                    )
                                  }
                                />
                              ))}
                            </div>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() =>
                                changeProfile(
                                  key,
                                  profile[key].filter((_, i) => i !== index),
                                )
                              }
                            >
                              Remove entry
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="secondary"
                          disabled={profile[key].length >= 100}
                          onClick={() =>
                            changeProfile(key, [...profile[key], {}])
                          }
                        >
                          Add entry
                        </button>
                      </section>
                    ),
                  )}
                  <div className="savebar">
                    <span>
                      {dirty
                        ? "Unsaved changes"
                        : profile.revision
                          ? "Saved revision " + profile.revision
                          : "Not saved yet"}
                    </span>
                    <button disabled={busy}>Save profile</button>
                  </div>
                </fieldset>
              </form>
            </>
          )}
          {tab === "Publications" && (
            <>
              <h1>Publications</h1>
              <p className="muted">
                Manual records are unverified. Adding a record does not confirm
                authorship.
              </p>
              <section className="panel">
                <h2>Import from ORCID and OpenAlex</h2>
                <p className="muted">
                  Uses the ORCID saved in My profile. Imported records are
                  added as unverified; existing records are never changed.
                </p>
                <button
                  type="button"
                  disabled={busy || dirty}
                  onClick={() =>
                    run(async () => {
                      const r = await api("/faculty/publications/import", {});
                      setPublications(
                        (await api("/faculty/publications")).publications,
                      );
                      setNotice(
                        `Imported ${r.added} new record(s); ${r.skipped} already present. Found: OpenAlex ${r.fetched.openalex ?? 0}, ORCID ${r.fetched.orcid ?? 0}.` +
                          (r.errors.length
                            ? " Not reached: " + r.errors.join("; ")
                            : ""),
                      );
                    })
                  }
                >
                  Import publications
                </button>
              </section>
              <section className="panel">
                <h2>Add a publication</h2>
                <form
                  onSubmit={submit(async (v, f) => {
                    await api("/faculty/publications", {
                      ...v,
                      year: v.year ? Number(v.year) : null,
                    });
                    setPublications(
                      (await api("/faculty/publications")).publications,
                    );
                    f.reset();
                    setNotice("Publication added as unverified.");
                  })}
                >
                  <fieldset disabled={busy}>
                    <div className="field-grid">
                      {[
                        { key: "title", label: "Title", required: true },
                        {
                          key: "year",
                          label: "Publication year",
                          type: "year",
                        },
                        { key: "doi", label: "DOI (10.xxxx/...)" },
                        { key: "venue", label: "Journal or conference" },
                        { key: "authors", label: "Authors" },
                      ].map((f) => (
                        <label key={f.key}>
                          {f.label}
                          <input
                            name={f.key}
                            required={f.required}
                            type={f.type ? "number" : "text"}
                            min={f.type ? 1800 : undefined}
                            max={f.type ? 2200 : undefined}
                            maxLength={
                              f.key === "authors"
                                ? 2000
                                : f.key === "title"
                                  ? 500
                                  : 300
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <button>Add publication</button>
                  </fieldset>
                </form>
              </section>
              {publications.map((p) => (
                <article className="panel" key={p.id}>
                  <span className="tag">
                    {p.verification_status} · {p.source}
                  </span>
                  <h3>{p.title}</h3>
                  <p>
                    {[p.authors, p.venue, p.year, p.doi]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Remove this publication record?"))
                        run(async () => {
                          await api(
                            "/faculty/publications/" + p.id,
                            undefined,
                            "DELETE",
                          );
                          setPublications(
                            publications.filter((x) => x.id !== p.id),
                          );
                        });
                    }}
                  >
                    Remove publication
                  </button>
                </article>
              ))}
              {!publications.length && (
                <p className="empty">No publications added yet.</p>
              )}
            </>
          )}
          {tab === "Department forms" && (
            <>
              <h1>Department forms</h1>
              <p className="muted">
                Generate a private snapshot of your saved information. These are
                UniBridgeAI draft templates; compatibility with DU/my.du has not
                been validated.
              </p>
              {dirty && (
                <p className="notice">
                  Save your profile changes before generating a form.
                </p>
              )}
              <div className="cards">
                {schema.templates.map((t) => (
                  <section className="panel" key={t.id}>
                    <span className="tag">Template v{t.version}</span>
                    <h3>{t.name}</h3>
                    <p>Includes: {t.sections.join(", ")}.</p>
                    <button
                      disabled={busy || dirty || !profile.revision}
                      onClick={() =>
                        run(async () => {
                          await api("/faculty/exports", {
                            template_id: t.id,
                          });
                          setExports((await api("/faculty/exports")).exports);
                          setNotice("Form generated from your saved records.");
                        })
                      }
                    >
                      Generate form
                    </button>
                  </section>
                ))}
              </div>
              <h2>Generated snapshots</h2>
              {exports.map((ex) => (
                <section className="panel export-row" key={ex.id}>
                  <div>
                    <h3>
                      {schema.templates.find((t) => t.id === ex.template_id)
                        ?.name || ex.template_id}
                    </h3>
                    <small>
                      {new Date(ex.created_at).toLocaleString()} · Template v
                      {ex.template_version}
                    </small>
                  </div>
                  <div className="download-links">
                    <a
                      href={
                        "/api/faculty/exports/" + ex.id + "/download?format=csv"
                      }
                      download
                    >
                      Download CSV
                    </a>
                    <a
                      href={
                        "/api/faculty/exports/" +
                        ex.id +
                        "/download?format=json"
                      }
                      download
                    >
                      Download JSON
                    </a>
                  </div>
                </section>
              ))}
              {!exports.length && (
                <p className="empty">
                  No forms generated yet. Save your profile to get started.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ProfileSuggestions({ profile, busy, run, onApplied, setNotice }) {
  const [items, setItems] = useState([]);
  const [chosen, setChosen] = useState({});
  const [info, setInfo] = useState("");
  const suggest = () =>
    run(async () => {
      const r = await api("/autofill/profile/suggest", {});
      setItems(r.suggestions || []);
      setChosen(Object.fromEntries((r.suggestions || []).map((s) => [s.field, true])));
      setInfo(
        (r.suggestions || []).length
          ? "Suggestions come from your confirmed data only. Tick the ones to fill."
          : r.note || "No suggestions found in your confirmed data.",
      );
    });
  const apply = () =>
    run(async () => {
      const values = Object.fromEntries(
        items.filter((s) => chosen[s.field]).map((s) => [s.field, s.value]),
      );
      if (!Object.keys(values).length) return;
      const r = await api(
        "/autofill/profile/apply",
        { revision: profile.revision, values },
      );
      onApplied({ ...profile, revision: r.revision, ...Object.fromEntries(Object.entries(values)) });
      setItems([]);
      setNotice(`Filled ${r.applied.length} field(s) from your confirmed data. Review and save the profile.`);
    });
  return (
    <section className="panel">
      <h2>Fill empty fields from my data</h2>
      <p className="muted">
        A local AI model suggests values for empty fields using only what you confirmed
        (ORCID, OpenAlex, confirmed publications and records). Filled fields are never changed.
      </p>
      <button type="button" disabled={busy} onClick={suggest}>
        Suggest values
      </button>
      {info && <p role="status">{info}</p>}
      {items.map((s) => (
        <label key={s.field} className="inline-check">
          <input
            type="checkbox"
            checked={!!chosen[s.field]}
            disabled={busy}
            onChange={(e) => setChosen((c) => ({ ...c, [s.field]: e.target.checked }))}
          />{" "}
          <strong>{s.field}</strong>: {s.value} <small>(source {s.source}: {s.reason})</small>
        </label>
      ))}
      {items.length > 0 && (
        <button type="button" disabled={busy} onClick={apply}>
          Fill selected fields
        </button>
      )}
    </section>
  );
}
