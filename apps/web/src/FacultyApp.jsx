import React, { useEffect, useState } from "react";

async function api(path, body, method = body === undefined ? "GET" : "POST") {
  const r = await fetch("/api" + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = r.status === 204 ? {} : await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
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
export default function FacultyApp() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [schema, setSchema] = useState(null),
    [profile, setProfile] = useState(null),
    [publications, setPublications] = useState([]),
    [exports, setExports] = useState([]),
    [tab, setTab] = useState("Overview"),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    api("/auth/me")
      .then((d) => setUser(d.user))
      .catch((e) => {
        if (e.message !== "Sign in required" && e.message !== "Session expired")
          setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (user?.role !== "teacher") return;
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
          setDirty(false);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
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
  if (loading) return <main className="loading">Loading UniBridgeAI…</main>;
  if (!user)
    return (
      <main className="login">
        <section className="intro">
          <div className="brand">◈ UniBridgeAI</div>
          <p className="eyebrow">YOUR ACADEMIC RECORD, CONNECTED</p>
          <h1>
            Enter once.
            <br />
            Use across campus.
          </h1>
          <p>
            Keep your professional profile and publications together. Prepare
            department forms from the information you have already saved.
          </p>
          <div className="chips">
            <span>Faculty profiles</span>
            <span>Research records</span>
            <span>Department forms</span>
          </div>
        </section>
        <section className="signin">
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to UniBridgeAI</h2>
          <p>Use your university-provided account.</p>
          <form
            onSubmit={submit(async (v) => {
              setUser((await api("/auth/login", v)).user);
              setTab("Overview");
            })}
          >
            <label>
              University email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button disabled={busy}>
              {busy ? "Signing in…" : "Sign in →"}
            </button>
          </form>
          {alert}
          <small>Your university assigns your account role.</small>
        </section>
      </main>
    );
  return (
    <div className="shell">
      <aside>
        <div className="brand">◈ UniBridgeAI</div>
        <p className="eyebrow">FACULTY WORKSPACE</p>
        {["Overview", "My profile", "Publications", "Department forms"].map(
          (name) => (
            <button
              key={name}
              className={"nav " + (tab === name ? "active" : "")}
              disabled={busy}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ),
        )}
        <div className="profile">
          <strong>{user.name}</strong>
          <span>{user.role}</span>
          <button
            className="nav"
            disabled={busy}
            onClick={() => {
              if (
                dirty &&
                !window.confirm("Discard unsaved profile changes and sign out?")
              )
                return;
              run(async () => {
                await api("/auth/logout", {});
                setUser(null);
                setProfile(null);
                setSchema(null);
                setPublications([]);
                setExports([]);
                setDirty(false);
              });
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header>
          <span>UniBridgeAI / {tab}</span>
          <span className="badge">{user.role}</span>
        </header>
        {alert}
        {user.role !== "teacher" ? (
          <section className="panel">
            <h1>Welcome, {user.name}.</h1>
            <p>
              Your student account is active. Faculty profiles and department
              forms are restricted to teachers. Student services are not part of
              this pilot yet.
            </p>
          </section>
        ) : !profile || !schema ? (
          <p className="empty">
            {error
              ? "Could not load the workspace. Reload to retry."
              : "Loading your workspace…"}
          </p>
        ) : (
          <>
            {tab === "Overview" && (
              <>
                <p className="eyebrow">YOUR CONNECTED ACADEMIC RECORD</p>
                <h1>Hello, {user.name.split(" ")[0]}.</h1>
                <p className="muted">
                  One profile for the information your university needs.
                </p>
                <div className="stats">
                  <article>
                    <span>Profile</span>
                    <strong className="word">
                      {profile.revision ? "Saved" : "Not started"}
                    </strong>
                  </article>
                  <article>
                    <span>Publications</span>
                    <strong>{publications.length}</strong>
                  </article>
                  <article>
                    <span>Generated forms</span>
                    <strong>{exports.length}</strong>
                  </article>
                </div>
                <div className="cards">
                  <button
                    className="course"
                    onClick={() => setTab("My profile")}
                  >
                    <span className="tag">01 · PROFILE</span>
                    <h3>Your professional information</h3>
                    <p>Employment, education, qualifications and awards.</p>
                    <span>Edit profile →</span>
                  </button>
                  <button
                    className="course"
                    onClick={() => setTab("Publications")}
                  >
                    <span className="tag">02 · RESEARCH</span>
                    <h3>Your publication records</h3>
                    <p>
                      Record publications with identifiers and source details.
                    </p>
                    <span>Manage publications →</span>
                  </button>
                  <button
                    className="course"
                    onClick={() => setTab("Department forms")}
                  >
                    <span className="tag">03 · REUSE</span>
                    <h3>Prepare department forms</h3>
                    <p>Generate a snapshot from your saved information.</p>
                    <span>Open forms →</span>
                  </button>
                </div>
                <section className="roadmap">
                  <h3>Publication matching is the next research module</h3>
                  <p>
                    OpenAlex integration and local AI matching will be evaluated
                    before connecting them to your records. Current publication
                    entries are manual and unverified.
                  </p>
                </section>
              </>
            )}
            {tab === "My profile" && (
              <>
                <h1>My profile</h1>
                <p className="muted">
                  Work email: {user.email}. Fields marked * are required.
                </p>
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
                                          i === index
                                            ? { ...r, [f.key]: v }
                                            : r,
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
                  Manual records are unverified. Adding a record does not
                  confirm authorship.
                </p>
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
                  Generate a private snapshot of your saved information. These
                  are UniBridgeAI draft templates; compatibility with DU/my.du
                  has not been validated.
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
                            setNotice(
                              "Form generated from your saved records.",
                            );
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
                          "/api/faculty/exports/" +
                          ex.id +
                          "/download?format=csv"
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
      </main>
    </div>
  );
}
