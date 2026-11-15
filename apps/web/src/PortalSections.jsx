import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { Icon } from "./icons.jsx";
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
export function Timetable() {
  const [from, setFrom] = useState(monday),
    [events, setEvents] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
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
  }, [from]);
  return (
    <>
      <PageHeading
        title="Timetable"
        eyebrow="ACADEMICS"
        description="Your weekly teaching and learning schedule."
      />
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
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="calendar"
            title="No timetable entries for this week"
            description="No classes have been scheduled in UniBridgeAI for these dates. Timetable editing is the next step."
          />
        )}
      </div>
    </>
  );
}
export function AcademicRecords({ user }) {
  const [records, setRecords] = useState(null),
    [error, setError] = useState("");
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
  }, [user.id]);
  return (
    <>
      <PageHeading
        eyebrow="ACADEMICS"
        title={user.role === "teacher" ? "Gradebook" : "Academic record"}
        description={
          user.role === "teacher"
            ? "Assessment records for your teaching courses."
            : "Published assessment results associated with your account."
        }
      />
      <div className="source-note">
        UniBridgeAI assessment records. Official transcript certification is not
        implemented.
      </div>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : records === null ? (
        <p className="empty">Loading records…</p>
      ) : records.length ? (
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>Course</th>
                {user.role === "teacher" && <th>Student</th>}
                <th>Assessment</th>
                <th>Score / 100</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i}>
                  <td>
                    <strong>{r.code}</strong>
                    <br />
                    {r.title}
                  </td>
                  {user.role === "teacher" && <td>{r.student_name}</td>}
                  <td>{r.assessment}</td>
                  <td>{r.score ?? "—"}</td>
                  <td>{r.published_at ? "Published" : "Unpublished"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No assessment records yet"
          description="Published assessments will appear here. Grade entry and programme-level GPA calculation are not implemented yet."
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
export function AIWorkspace() {
  const [prompt, setPrompt] = useState("");
  const ideas = [
    "Summarize my upcoming deadlines with links to their sources.",
    "Find missing information in my university profile.",
    "Help prepare a department report from my saved records.",
    "Check whether these publications belong to the same author.",
  ];
  return (
    <>
      <PageHeading
        eyebrow="UNIBRIDGE INTELLIGENCE"
        title="AI workspace"
        description="A place to work with your university information, with sources and review."
      />
      <section className="ai-workspace">
        <div className="ai-orb">
          <Icon name="ai" size={38} />
        </div>
        <h2>What would you like to work on?</h2>
        <p>Prepare a question or choose a task below.</p>
        <div className="prompt-grid">
          {ideas.map((p) => (
            <button
              className="prompt-card"
              key={p}
              onClick={() => setPrompt(p)}
            >
              {p}
              <Icon name="arrow" size={16} />
            </button>
          ))}
        </div>
        <label className="prompt-label">
          Your question
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={4000}
            rows={4}
            placeholder="Ask about your courses, records or publications…"
          />
        </label>
        <div className="prompt-footer">
          <span>
            <span className="status-dot amber" /> Ollama is not connected yet.
            Your text stays in this page.
          </span>
          <button disabled>Send to assistant</button>
        </div>
      </section>
      <div className="three-features">
        <article>
          <Icon name="records" />
          <h3>Grounded in sources</h3>
          <p>Planned answers will reference the records they use.</p>
        </article>
        <article>
          <Icon name="profile" />
          <h3>Your access, respected</h3>
          <p>Only information authorized for your account.</p>
        </article>
        <article>
          <Icon name="check" />
          <h3>You review changes</h3>
          <p>Suggestions will require review before updating records.</p>
        </article>
      </div>
    </>
  );
}
