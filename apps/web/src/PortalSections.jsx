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
export function AIWorkspace({ teacher = false }) {
  const [cloudConsent, setCloudConsent] = useState(false);
  const [grounded, setGrounded] = useState(teacher);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [connection, setConnection] = useState(null);
  const [mode, setMode] = useState("local");
  const cloud = mode === "cloud";
  const localModels = (connection?.models || []).filter(
    (m) => m.provider === "local",
  );
  const [model, setModel] = useState("");
  const activeModel = cloud
    ? connection?.cloud?.available
      ? connection.cloud.model
      : ""
    : model;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    try {
      const data = await api("/ai/status");
      setConnection(data);
      const locals = data.models.filter((m) => m.provider === "local");
      setModel((current) =>
        locals.some((m) => m.name === current)
          ? current
          : locals.find((m) => m.name === "qwen3:4b")?.name ||
            locals.find((m) => m.name === "qwen3:1.7b")?.name ||
            locals[0]?.name ||
            "",
      );
      setMode((current) =>
        messages.length
          ? current
          : data.defaultProvider === "cloud" && data.cloud?.available
            ? "cloud"
            : data.local?.available
              ? "local"
              : data.cloud?.available
                ? "cloud"
                : "local",
      );
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  const ideas = grounded
    ? [
        "Сколько у меня публикаций и за какие годы?",
        "List my publications from 2024 with their DOIs.",
        "Which of my publications are not verified yet?",
      ]
    : [
        "Explain precision, recall and F1 with a simple example.",
        "Help me draft an academic project introduction.",
        "What evidence is needed to match a publication to an author?",
      ];
  async function send(e) {
    e.preventDefault();
    if (busy || !prompt.trim()) return;
    const question = prompt.trim();
    // Keep five complete turns, followed by the new question.
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
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="UNIBRIDGE INTELLIGENCE"
        title="AI workspace"
        description="Ask your AI assistant in English, Russian or Kazakh."
      />
      <section className="panel ai-chat">
        <div
          className="ai-mode"
          role="radiogroup"
          aria-label="Where the assistant runs"
        >
          {[
            ["local", "Local", "Ollama on this computer"],
            [
              "cloud",
              "Cloud",
              connection?.cloud?.model || "Claude via OpenRouter",
            ],
          ].map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              className={mode === id ? "active" : ""}
              disabled={busy || messages.length > 0}
              onClick={() => {
                setMode(id);
                setCloudConsent(false);
              }}
            >
              <strong>{label}</strong>
              <small>{hint}</small>
            </button>
          ))}
        </div>
        <div className="chat-controls">
          {!cloud && (
            <label>
              Local model
              <select
                aria-label="Local model"
                value={model}
                disabled={busy || messages.length > 0}
                onChange={(e) => setModel(e.target.value)}
              >
                {!model && <option value="">No local model available</option>}
                {localModels.map((m) => (
                  <option key={m.name}>{m.name}</option>
                ))}
              </select>
            </label>
          )}
          {teacher && (
            <label className="inline-check">
              <input
                type="checkbox"
                checked={grounded}
                disabled={busy || messages.length > 0}
                onChange={(e) => setGrounded(e.target.checked)}
              />
              Answer from my profile and publications
            </label>
          )}
          <button type="button" disabled={busy} onClick={refresh}>
            Refresh connection
          </button>
          <button
            type="button"
            disabled={busy || !messages.length}
            onClick={() => {
              setMessages([]);
              setCloudConsent(false);
              setError("");
            }}
          >
            New chat
          </button>
        </div>
        <p role="status">
          {connection === null
            ? "Checking AI configuration…"
            : cloud
              ? connection.cloud?.available
                ? `Cloud: ${connection.cloud.model} via OpenRouter`
                : connection.cloud?.error
              : connection.local?.available
                ? model
                  ? `Local: ${model} via Ollama`
                  : "Ollama is running. Download a local chat model first."
                : connection.local?.error}
        </p>
        <p className="chat-note">
          {cloud
            ? "Messages and conversation context are sent to OpenRouter and its model provider. Saved records are sent only with your permission below. No passwords or API keys are included."
            : grounded
              ? "Answers use your saved UniBridgeAI profile and publication list, sent only to the local model on this computer. Check cited records [P1], [PROFILE] before relying on an answer."
              : "This preview uses only text you send here. University records and files are not connected."}{" "}
          Chat history is kept in this page until you leave or start a new chat;
          the last five turns are sent as context.
        </p>
        {connection?.roles && (
          <details className="ai-roles">
            <summary>AI roles and models</summary>
            <ul>
              {connection.roles.map((r) => (
                <li key={r.id}>
                  <strong>{r.title}</strong>
                  <span>{r.task}</span>
                  <span className="ai-role-models">
                    {r.cloud && (
                      <em className={r.cloudReady ? "ready" : "missing"}>
                        Cloud: {r.cloud}
                        {r.cloudReady ? "" : " (key not configured)"}
                      </em>
                    )}
                    {r.local && (
                      <em className={r.localReady ? "ready" : "missing"}>
                        Local: {r.local}
                        {r.localFallback ? ` or ${r.localFallback}` : ""}
                        {r.localReady || r.id === "assistant"
                          ? ""
                          : ` (run: ollama pull ${r.local})`}
                      </em>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {cloud && grounded && (
          <label className="inline-check">
            <input
              type="checkbox"
              checked={cloudConsent}
              disabled={busy || messages.length > 0}
              onChange={(e) => setCloudConsent(e.target.checked)}
            />
            I agree to send selected profile fields and publications to
            OpenRouter for this conversation.
          </label>
        )}
        {!messages.length && (
          <div className="prompt-grid">
            {ideas.map((p) => (
              <button
                type="button"
                className="prompt-card"
                key={p}
                disabled={busy}
                onClick={() => setPrompt(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <div
          className="chat-messages"
          role="log"
          aria-label="Conversation"
          aria-live="polite"
        >
          {messages.map((m, i) => (
            <article className={"chat-message " + m.role} key={i}>
              <strong>{m.role === "user" ? "You" : "UniBridgeAI"}</strong>
              <div>{m.content}</div>
              {m.grounding && (
                <small>
                  Based on your records: {m.grounding.included} of{" "}
                  {m.grounding.publications} publications included.
                </small>
              )}
              {m.toolsUsed?.length > 0 && (
                <small>
                  Looked up in: {m.toolsUsed.join(", ")} (read-only).
                </small>
              )}
              {m.truncated && (
                <small>
                  Response reached the length limit. Ask a follow-up to
                  continue.
                </small>
              )}
            </article>
          ))}
          {busy && (
            <p role="status">
              Generating a reply… The first response may take longer while the
              model loads.
            </p>
          )}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={send}>
          <label>
            Your message
            <textarea
              aria-label="Your message"
              value={prompt}
              disabled={busy}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={4000}
              rows={4}
              placeholder="Ask a question or paste a short passage…"
            />
          </label>
          <div className="prompt-footer">
            <span>{prompt.length}/4000 characters</span>
            <button
              disabled={
                busy ||
                !activeModel ||
                !prompt.trim() ||
                (cloud && grounded && !cloudConsent)
              }
            >
              {busy ? "Thinking…" : "Send message"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
