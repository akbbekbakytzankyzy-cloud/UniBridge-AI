import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { Icon } from "./icons.jsx";
export default function Courses({ user, onCount }) {
  const [courses, setCourses] = useState([]),
    [selected, setSelected] = useState(null),
    [docs, setDocs] = useState([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  async function refresh() {
    const d = await api("/courses");
    setCourses(d.courses);
    onCount(d.courses.length);
  }
  useEffect(() => {
    let active = true;
    api("/courses")
      .then((d) => {
        if (active) {
          setCourses(d.courses);
          onCount(d.courses.length);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id, onCount]);
  useEffect(() => {
    setDocs([]);
    setQuery("");
    if (!selected) return;
    let active = true;
    api(`/courses/${selected.id}/documents`)
      .then((d) => {
        if (active) setDocs(d.documents);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [selected]);
  async function run(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const submit = (fn) => (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    run(() => fn(Object.fromEntries(new FormData(f)), f));
  };
  return (
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
      {!selected ? (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">ACADEMICS</p>
              <h1>
                {user.role === "teacher" ? "Teaching courses" : "My courses"}
              </h1>
              <p>
                Course spaces and learning materials available to your account.
              </p>
            </div>
          </div>
          <div className="source-note">
            <span className="status-dot" /> Courses and materials managed in
            UniBridgeAI.
          </div>
          {loading ? (
            <p className="empty">Loading courses…</p>
          ) : courses.length ? (
            <div className="cards course-list">
              {courses.map((c, i) => (
                <button
                  className="course"
                  onClick={() => setSelected(c)}
                  key={c.id}
                >
                  <div className={"course-cover tone-" + (i % 3)}>
                    <Icon name="courses" size={38} />
                    <span>{c.code}</span>
                  </div>
                  <div className="course-body">
                    <h3>{c.title}</h3>
                    <p>{c.teacher_name}</p>
                    <span>
                      Open course <Icon name="arrow" size={16} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <section className="empty-state">
              <Icon name="courses" size={36} />
              <h3>No courses assigned yet</h3>
              <p>
                {user.role === "teacher"
                  ? "Create a course to start building your teaching workspace."
                  : "Your courses will appear after a teacher enrolls your UniBridgeAI account."}
              </p>
            </section>
          )}
          {user.role === "teacher" && (
            <section className="panel">
              <h2>Create a course</h2>
              <form
                className="inline"
                onSubmit={submit(async (v, f) => {
                  await api("/courses", v);
                  await refresh();
                  f.reset();
                  setNotice("Course created.");
                })}
              >
                <label>
                  Course code
                  <input
                    name="code"
                    minLength={2}
                    maxLength={30}
                    required
                    placeholder="e.g. AI-101"
                  />
                </label>
                <label>
                  Course name
                  <input
                    name="title"
                    minLength={2}
                    maxLength={150}
                    required
                    placeholder="Course title"
                  />
                </label>
                <button disabled={busy}>Create course</button>
              </form>
            </section>
          )}
        </>
      ) : (
        <>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setSelected(null)}
          >
            ← All courses
          </button>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{selected.code}</p>
              <h1>{selected.title}</h1>
              <p>{selected.teacher_name}</p>
            </div>
          </div>
          <section className="panel">
            <form
              className="inline"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () =>
                  setDocs(
                    (
                      await api(
                        `/courses/${selected.id}/documents?q=${encodeURIComponent(query)}`,
                      )
                    ).documents,
                  ),
                );
              }}
            >
              <label>
                Find course material
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={200}
                  placeholder="Search by keyword"
                />
              </label>
              <button disabled={busy}>Search</button>
            </form>
          </section>
          {docs.length ? (
            docs.map((d) => (
              <article className="panel" key={d.id}>
                <span className="tag">Learning material</span>
                <h3>{d.title}</h3>
                <p className="document">{d.content}</p>
              </article>
            ))
          ) : (
            <section className="empty-state compact">
              <Icon name="records" />
              <h3>No materials found</h3>
              <p>Published course materials will appear here.</p>
            </section>
          )}
          {user.role === "teacher" && (
            <div className="two-column">
              <section className="panel">
                <h2>Add learning material</h2>
                <form
                  onSubmit={submit(async (v, f) => {
                    await api(`/courses/${selected.id}/documents`, v);
                    setDocs(
                      (await api(`/courses/${selected.id}/documents`))
                        .documents,
                    );
                    setQuery("");
                    f.reset();
                    setNotice("Material published.");
                  })}
                >
                  <label>
                    Title
                    <input name="title" required maxLength={200} />
                  </label>
                  <label>
                    Content
                    <textarea
                      name="content"
                      required
                      rows={5}
                      maxLength={100000}
                    />
                  </label>
                  <button disabled={busy}>Publish material</button>
                </form>
              </section>
              <section className="panel">
                <h2>Enroll a student</h2>
                <p>Use an existing UniBridgeAI student account.</p>
                <form
                  onSubmit={submit(async (v, f) => {
                    await api(`/courses/${selected.id}/enrollments`, v);
                    f.reset();
                    setNotice("Student enrolled.");
                  })}
                >
                  <label>
                    Student email
                    <input name="email" type="email" required />
                  </label>
                  <button disabled={busy}>Enroll student</button>
                </form>
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}
