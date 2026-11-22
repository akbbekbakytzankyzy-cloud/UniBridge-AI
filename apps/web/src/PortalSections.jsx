import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { Icon } from "./icons.jsx";
import {
  GradeEditor,
  TimetableEditor,
  useGradeActions,
} from "./TeachingTools.jsx";
export function EmptyState({ icon = "records", title, description, action }) {
  return (
    <section className="empty-state">
      <div className="empty-icon">
        <Icon name={icon} size={30} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </section>
  );
}
export function PageHeading({
  eyebrow = "CAMPUS WORKSPACE",
  title,
  description,
  action,
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
const dateString = (d) => new Date(d).toISOString().slice(0, 10);
function monday() {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return dateString(d);
}
export function Timetable({ user }) {
  const teacher = user?.role === "teacher";
  const [from, setFrom] = useState(monday),
    [events, setEvents] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  async function removeEvent(e) {
    if (!window.confirm(`Remove “${e.title}” from the timetable?`)) return;
    try {
      await api(`/portal/teaching/timetable/${e.id}`, undefined, "DELETE");
      setEvents((list) => list.filter((x) => x.id !== e.id));
    } catch (err) {
      setError(err.message);
    }
  }
  const days = Array.from(
    { length: 7 },
    (_, i) => new Date(Date.parse(from) + i * 86400000),
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api(
      `/portal/timetable?from=${from}&to=${dateString(Date.parse(from) + 7 * 86400000)}`,
    )
      .then((d) => {
        if (active) setEvents(d.events);
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
  }, [from, reload]);
  return (
    <>
      <PageHeading
        title="Timetable"
        eyebrow="ACADEMICS"
        description={
          teacher
            ? "Schedule classes for your courses. Enrolled students see them in their timetable."
            : "Your weekly teaching and learning schedule."
        }
      />
      {teacher && (
        <TimetableEditor
          defaultDate={from}
          onCreated={(e) => {
            const day = dateString(e.starts_at);
            const weekStart = dateString(
              Date.parse(day) - ((new Date(day).getUTCDay() + 6) % 7) * 86400000,
            );
            if (weekStart === from) setReload((n) => n + 1);
            else setFrom(weekStart);
          }}
        />
      )}
      <div className="panel calendar-panel">
        <div className="section-heading">
          <h2>
            {days[0].toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
            })}{" "}
            –{" "}
            {days[6].toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </h2>
          <div className="button-group">
            <button
              className="secondary"
              aria-label="Previous week"
              onClick={() =>
                setFrom(dateString(Date.parse(from) - 7 * 86400000))
              }
            >
              ←
            </button>
            <button className="secondary" onClick={() => setFrom(monday())}>
              This week
            </button>
            <button
              className="secondary"
              aria-label="Next week"
              onClick={() =>
                setFrom(dateString(Date.parse(from) + 7 * 86400000))
              }
            >
              →
            </button>
          </div>
        </div>
        <div className="week-strip">
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className={
                dateString(d) === dateString(new Date()) ? "today" : ""
              }
            >
              <small>
                {d.toLocaleDateString("en-GB", {
                  weekday: "short",
                  timeZone: "UTC",
                })}
              </small>
              <strong>{d.getUTCDate()}</strong>
            </div>
          ))}
        </div>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : loading ? (
          <p className="empty">Loading schedule…</p>
        ) : events.length ? (
          <div className="event-list">
            {events.map((e) => (
              <article key={e.id}>
                <div className="event-time">
                  {new Date(e.starts_at).toLocaleString("en-GB", {
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div>
                  <h3>{e.title}</h3>
                  <p>
                    {e.code} · {e.session_type} ·{" "}
                    {e.room || "Room not assigned"}
                  </p>
                </div>
                {e.editable && (
                  <button
                    type="button"
                    className="text-button event-remove"
                    onClick={() => removeEvent(e)}
                  >
                    Remove
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="calendar"
            title="No timetable entries for this week"
            description={
              teacher
                ? "Use “Add a class” above to schedule one for this week."
                : "Your teachers have not scheduled classes for these dates yet."
            }
          />
        )}
      </div>
    </>
  );
}
export function AcademicRecords({ user }) {
  const teacher = user.role === "teacher";
  const [records, setRecords] = useState(null),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [editing, setEditing] = useState(null),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [course, setCourse] = useState("all");
  const refresh = () => setReload((n) => n + 1);
  const gradeAction = useGradeActions(refresh, setError);
  const courses = [...new Map((records || []).map((r) => [r.code, r.code + " — " + r.title])).entries()];
  const visible = (records || []).filter(
    (r) =>
      (status === "all" || (status === "published") === Boolean(r.published_at)) &&
      (course === "all" || r.code === course) &&
      (!query.trim() || `${r.student_name} ${r.assessment}`.toLowerCase().includes(query.trim().toLowerCase())),
  );
  useEffect(() => {
    let active = true;
    api("/portal/academic-records")
      .then((d) => {
        if (active) setRecords(d.records);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user.id, reload]);
  const average = (() => {
    const scores = (records || [])
      .filter((r) => r.score !== null && (teacher || r.published_at))
      .map((r) => Number(r.score));
    return scores.length
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
      : null;
  })();
  return (
    <>
      <PageHeading
        eyebrow="ACADEMICS"
        title={teacher ? "Gradebook" : "Academic record"}
        description={
          teacher
            ? "Enter grades for students in your courses. Students see a grade only after you publish it."
            : "Published assessment results associated with your account."
        }
      />
      {teacher && <GradeEditor onSaved={refresh} editing={editing} />}
      <div className="source-note">
        UniBridgeAI assessment records. Official transcript certification is not
        implemented.
        {average && (
          <>
            {" "}
            Average score: <strong>{average}</strong> / 100.
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : records === null ? (
        <p className="empty">Loading records…</p>
      ) : records.length ? (
        <>
        {teacher && (
          <div className="grade-filters" role="search">
            <input
              type="search"
              aria-label="Search students or assessments"
              placeholder="Search student or assessment"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select aria-label="Course" value={course} onChange={(e) => setCourse(e.target.value)}>
              <option value="all">All courses</option>
              {courses.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
            <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="published">Published</option>
              <option value="unpublished">Not published</option>
            </select>
            <span className="muted grade-count">
              {visible.length} of {records.length}
            </span>
          </div>
        )}
        {!visible.length && <p className="muted">No grades match these filters.</p>}
        {visible.length > 0 && (
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>Course</th>
                {user.role === "teacher" && <th>Student</th>}
                <th>Assessment</th>
                <th>Score / 100</th>
                <th>Feedback</th>
                <th>Status</th>
                {teacher && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={`${r.course_id}-${r.student_id}-${r.assessment}`}>
                  <td>
                    <strong>{r.code}</strong>
                    <br />
                    {r.title}
                  </td>
                  {teacher && <td>{r.student_name}</td>}
                  <td>{r.assessment}</td>
                  <td>{r.score ?? "—"}</td>
                  <td>{r.feedback || "—"}</td>
                  <td>
                    <span className={r.published_at ? "status ok" : "status muted"}>
                      {r.published_at ? "Published" : "Unpublished"}
                    </span>
                  </td>
                  {teacher && (
                    <td className="grade-actions">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          gradeAction(r.published_at ? "unpublish" : "publish", r)
                        }
                      >
                        {r.published_at ? "Unpublish" : "Publish"}
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setEditing({ ...r });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-button danger"
                        onClick={() => gradeAction("delete", r)}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        </>
      ) : (
        <EmptyState
          title="No assessment records yet"
          description={
            teacher
              ? "Use “Enter a grade” above to add the first result."
              : "Your teachers have not published any results yet."
          }
        />
      )}
    </>
  );
}
const services = [
  {
    id: "transcript",
    name: "Academic transcript",
    text: "Prepare a request for your academic record.",
  },
  {
    id: "certificate",
    name: "University certificate",
    text: "Prepare a certificate request for university services.",
  },
  {
    id: "it-support",
    name: "IT support",
    text: "Describe a technical issue with your campus systems.",
  },
  {
    id: "profile-correction",
    name: "Data correction",
    text: "Record details that need to be corrected.",
  },
];
export function ServiceRequests() {
  const [requests, setRequests] = useState([]),
    [selected, setSelected] = useState("transcript"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api("/portal/requests")
      .then((d) => {
        if (active) setRequests(d.requests);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <PageHeading
        title="Services & requests"
        description="Keep your university service requests in one place."
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="service-grid">
        {services.map((s) => (
          <button
            className={"service-card " + (selected === s.id ? "selected" : "")}
            key={s.id}
            onClick={() => setSelected(s.id)}
          >
            <Icon name={s.id === "it-support" ? "help" : "records"} />
            <h3>{s.name}</h3>
            <p>{s.text}</p>
          </button>
        ))}
      </div>
      <div className="two-column">
        <section className="panel">
          <h2>{services.find((s) => s.id === selected).name}</h2>
          <p>
            Drafts are private to your account. University department submission
            is not connected.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const data = Object.fromEntries(new FormData(form));
              setBusy(true);
              setError("");
              setNotice("");
              try {
                const d = await api("/portal/requests", {
                  ...data,
                  service: selected,
                });
                setRequests([d.request, ...requests]);
                form.reset();
                setNotice(
                  "Draft saved. It has not been sent to a university department.",
                );
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Subject
                <input name="subject" required minLength={3} maxLength={160} />
              </label>
              <label>
                Request details
                <textarea
                  name="description"
                  required
                  minLength={3}
                  maxLength={4000}
                  rows={4}
                />
              </label>
              <button>Save request draft</button>
            </fieldset>
          </form>
        </section>
        <section className="panel">
          <h2>My saved drafts</h2>
          {requests.length ? (
            requests.map((r) => (
              <article className="request-item" key={r.id}>
                <span className="tag">Draft · not sent</span>
                <h3>{r.subject}</h3>
                <p>{r.description}</p>
                <small>{new Date(r.created_at).toLocaleDateString()}</small>
              </article>
            ))
          ) : (
            <div className="muted padded">No request drafts saved yet.</div>
          )}
        </section>
      </div>
    </>
  );
}
export function StudentProfile({ user }) {
  const [profile, setProfile] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api("/portal/student-profile")
      .then((d) => {
        if (active) setProfile(d.profile);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user.id]);
  return (
    <>
      <PageHeading
        title="My profile"
        description="Your account and contact information."
      />
      <section className="panel identity-panel">
        <span className="avatar large">{user.name.slice(0, 1)}</span>
        <div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <span className="tag">Student account</span>
        </div>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {profile && (
        <section className="panel">
          <h2>Contact details</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setNotice("");
              setError("");
              try {
                setProfile(
                  (
                    await api(
                      "/portal/student-profile",
                      {
                        preferred_name: profile.preferred_name,
                        phone: profile.phone,
                      },
                      "PUT",
                    )
                  ).profile,
                );
                setNotice("Contact details saved.");
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              <div className="field-grid">
                <label>
                  Preferred name
                  <input
                    value={profile.preferred_name}
                    maxLength={120}
                    onChange={(e) =>
                      setProfile({ ...profile, preferred_name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={profile.phone}
                    maxLength={40}
                    onChange={(e) =>
                      setProfile({ ...profile, phone: e.target.value })
                    }
                  />
                </label>
              </div>
              <button>Save contact details</button>
            </fieldset>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>Academic information</h2>
        <p>
          Programme, group and year of study will appear after academic
          enrollment is set up.
        </p>
      </section>
    </>
  );
}
export function AIWorkspace({ teacher = false }) {
  const [connection, setConnection] = useState(null);
  const [mode, setMode] = useState("local");
  const [model, setModel] = useState("");
  const [grounded, setGrounded] = useState(teacher);
  const [cloudConsent, setCloudConsent] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cloud = mode === "cloud";
  const locals = (connection?.models || []).filter((m) => m.provider === "local");
  const activeModel = cloud
    ? connection?.cloud?.available
      ? connection.cloud.model
      : ""
    : model;
  const online = cloud ? connection?.cloud?.available : connection?.local?.available;
  const locked = busy || messages.length > 0;

  const refresh = async () => {
    try {
      const data = await api("/ai/status");
      setConnection(data);
      const names = data.models.filter((m) => m.provider === "local");
      setModel((current) =>
        names.some((m) => m.name === current)
          ? current
          : names.find((m) => m.name === "qwen3:4b")?.name ||
            names.find((m) => m.name === "qwen3:1.7b")?.name ||
            names[0]?.name ||
            "",
      );
      // Cloud is offered first: prefer it whenever it is configured.
      if (!messages.length)
        setMode(data.cloud?.available ? "cloud" : "local");
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const suggestions = grounded
    ? ["How many publications do I have, and from which years?", "Which of my publications are not verified yet?"]
    : ["What can I do in UniBridgeAI?", "What should I update in my profile?"];

  async function send(e) {
    e?.preventDefault();
    if (busy || !prompt.trim() || !activeModel) return;
    const question = prompt.trim();
    const context = [
      ...messages.slice(-10).map(({ role, content }) => ({ role, content })),
      { role: "user", content: question },
    ];
    setBusy(true);
    setError("");
    try {
      const data = await api("/ai/chat", {
        model: activeModel,
        messages: context,
        // Local chat uses the read-only tools unless it answers from records.
        grounding: cloud
          ? grounded
            ? "my_records"
            : "none"
          : grounded
            ? "my_records"
            : "tools",
        cloudConsent,
      });
      setMessages((previous) => [
        ...previous,
        { role: "user", content: question },
        {
          ...data.message,
          truncated: data.truncated,
          grounding: data.grounding,
          toolsUsed: data.toolsUsed,
        },
      ]);
      setPrompt("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assistant">
      <header className="assistant-head">
        <div>
          <h1>Assistant</h1>
          <p>Ask about your records, the app, or what to update.</p>
        </div>
        <div className="assistant-controls">
          <div className="seg" role="group" aria-label="Where the assistant runs">
            <button
              type="button"
              className={cloud ? "on" : ""}
              aria-pressed={cloud}
              disabled={locked || !connection?.cloud?.available}
              title={connection?.cloud?.available ? "Claude in the cloud" : connection?.cloud?.error}
              onClick={() => setMode("cloud")}
            >
              Cloud
            </button>
            <button
              type="button"
              className={!cloud ? "on" : ""}
              aria-pressed={!cloud}
              disabled={locked}
              onClick={() => setMode("local")}
            >
              Local
            </button>
          </div>
          {!cloud && (
            <select
              className="assistant-model"
              aria-label="Local model"
              value={model}
              disabled={locked}
              onChange={(e) => setModel(e.target.value)}
            >
              {!model && <option value="">No local model</option>}
              {locals.map((m) => (
                <option key={m.name}>{m.name}</option>
              ))}
            </select>
          )}
          <span className={"assistant-status " + (online ? "ok" : "off")} title={online ? "Connected" : "Not connected"}>
            {online ? "Connected" : "Not connected"}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Icon name="help" size={18} />
          </button>
        </div>
      </header>

      {settingsOpen && (
        <section className="assistant-settings" aria-label="Assistant settings">
          {teacher && (
            <label className="check">
              <input
                type="checkbox"
                checked={grounded}
                disabled={locked}
                onChange={(e) => setGrounded(e.target.checked)}
              />
              Use my profile and publications
            </label>
          )}
          {cloud && grounded && (
            <label className="check">
              <input
                type="checkbox"
                checked={cloudConsent}
                disabled={locked}
                onChange={(e) => setCloudConsent(e.target.checked)}
              />
              Allow sending my selected data to OpenRouter for this chat
            </label>
          )}
          <div className="assistant-settings-actions">
            <button type="button" className="ghost" onClick={refresh} disabled={busy}>
              Refresh status
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy || !messages.length}
              onClick={() => {
                setMessages([]);
                setCloudConsent(false);
                setError("");
              }}
            >
              New conversation
            </button>
          </div>
          {connection?.roles && (
            <details className="assistant-roles">
              <summary>Models by task</summary>
              <ul>
                {connection.roles.map((r) => (
                  <li key={r.id}>
                    <strong>{r.title}</strong>
                    <span>{cloud ? r.cloud || "—" : r.local || "—"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!online && (
            <p className="assistant-hint">
              {cloud ? connection?.cloud?.error : connection?.local?.error}
            </p>
          )}
        </section>
      )}

      <div className="assistant-thread" role="log" aria-label="Conversation" aria-live="polite">
        {!messages.length && (
          <div className="assistant-empty">
            <p>How can I help?</p>
            <div className="assistant-suggestions">
              {suggestions.map((text) => (
                <button key={text} type="button" onClick={() => setPrompt(text)} disabled={busy}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div className={"bubble " + m.role} key={i}>
            <div className="bubble-text">{m.content}</div>
            {(m.toolsUsed?.length > 0 || m.grounding || m.truncated) && (
              <small className="bubble-meta">
                {m.toolsUsed?.length > 0 && <>Looked up: {m.toolsUsed.join(", ")}. </>}
                {m.grounding && (
                  <>Used {m.grounding.included} of {m.grounding.publications} publications. </>
                )}
                {m.truncated && <>Reply was cut short.</>}
              </small>
            )}
          </div>
        ))}
        {busy && <div className="bubble assistant typing">Thinking…</div>}
      </div>

      {error && (
        <p className="assistant-error" role="alert">
          {error}
        </p>
      )}

      <form className="composer" onSubmit={send}>
        <textarea
          aria-label="Your message"
          value={prompt}
          disabled={busy}
          maxLength={4000}
          rows={1}
          placeholder="Write a message"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="submit"
          className="send"
          aria-label="Send"
          disabled={busy || !activeModel || !prompt.trim() || (cloud && grounded && !cloudConsent)}
        >
          <Icon name="arrow" size={18} />
        </button>
      </form>
    </div>
  );
}
