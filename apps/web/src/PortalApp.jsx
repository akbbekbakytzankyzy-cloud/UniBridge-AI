import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { Icon } from "./icons.jsx";
import FacultyWorkspace from "./FacultyApp.jsx";
import { TeacherToday } from "./TeachingTools.jsx";
import Courses from "./Courses.jsx";
import UniversityAccounts from "./UniversityAccounts.jsx";
import {
  AcademicRecords,
  AIWorkspace,
  EmptyState,
  PageHeading,
  ServiceRequests,
  StudentProfile,
  Timetable,
} from "./PortalSections.jsx";
const facultyPages = ["My profile", "Publications", "Department forms"];
const externalLinks = [
  {
    name: "Digital University",
    short: "DU",
    url: "https://du.astanait.edu.kz/",
    description: "Official academic administration portal.",
  },
  {
    name: "AITU LMS",
    short: "LMS",
    url: "https://lms.astanait.edu.kz/",
    description: "Official Moodle learning environment.",
  },
  {
    name: "University website",
    short: "AITU",
    url: "https://astanait.edu.kz/",
    description: "University news, information and resources.",
  },
];
function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 7.5 29 12.5 16 17.5 3 12.5Z" />
          <path d="M9 15v5.2c0 1.9 3.1 3.6 7 3.6s7-1.7 7-3.6V15" />
          <path d="M26.5 13.8V21" />
        </svg>
      </span>
      <div>
        UniBridge<span className="brand-ai">AI</span>
        <small>DIGITAL CAMPUS</small>
      </div>
    </div>
  );
}
function PasswordField({ label, name, autoComplete, placeholder, minLength }) {
  const [visible, setVisible] = useState(false);
  return (
    <label>
      {label}
      <span className="password-field">
        <input
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={minLength}
          maxLength={128}
          required
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          title={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => !v)}
        >
          <Icon name={visible ? "eyeOff" : "eye"} size={18} />
        </button>
      </span>
    </label>
  );
}
function Login({ onLogin }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState("signin"),
    [registration, setRegistration] = useState(false);
  useEffect(() => {
    api("/auth/options")
      .then((o) => setRegistration(Boolean(o.registration)))
      .catch(() => setRegistration(false));
  }, []);
  const switchTo = (next) => {
    setMode(next);
    setError("");
  };
  async function submit(e) {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.currentTarget));
    if (mode === "register" && v.password !== v.confirm)
      return setError("Passwords do not match.");
    setBusy(true);
    setError("");
    try {
      let data;
      let loginNotice = "";
      if (mode === "register") {
        data = await api("/auth/register", {
          name: v.name,
          email: v.email,
          password: v.password,
        });
      } else {
        try {
          data = await api("/auth/login", {
            email: v.email,
            password: v.password,
          });
        } catch (loginError) {
          const invoke = window.__TAURI_INTERNALS__?.invoke;
          if (loginError.message !== "Invalid email or password" || !invoke)
            throw loginError;
          let legacyUser;
          try {
            legacyUser = await invoke("verify_legacy_local_account", {
              email: v.email,
              password: v.password,
            });
          } catch {
            throw loginError;
          }
          if (legacyUser.role !== "student")
            throw new Error(
              "This previous local account needs an administrator to move it to the shared server.",
            );
          try {
            data = await api("/auth/register", {
              name: legacyUser.name,
              email: legacyUser.email,
              password: v.password,
            });
          } catch (migrationError) {
            if (migrationError.message.includes("already exists"))
              throw new Error(
                "A website account already uses this email. Sign in with that account's password; the local account was left unchanged.",
              );
            throw migrationError;
          }
          loginNotice =
            "Your previous local login now works on the website too. Older records remain saved on this device and have not been copied to the server.";
        }
      }
      onLogin(data.user, loginNotice);
    } catch (err) {
      setError(
        err.message === "Invalid input"
          ? "Check the fields: a valid email and a password of at least 12 characters are required."
          : err.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="intro">
        <Brand />
        <div className="login-story">
          <h1>Your university, in one place.</h1>
          <p>Courses, records, research and campus services.</p>
        </div>
        <div className="login-bottom">Astana IT University · prototype</div>
      </section>
      <section className="signin">
        <p className="eyebrow">WELCOME TO UNIBRIDGEAI</p>
        <h2>
          {mode === "register"
            ? "Create your account"
            : mode === "forgot"
              ? "Forgot your password?"
              : "Sign in to your campus"}
        </h2>
        <p>
          {mode === "register"
            ? "Student accounts can be created here. Teacher accounts are issued by an administrator."
            : mode === "forgot"
              ? "UniBridgeAI does not send password-reset emails yet."
              : "Access your personal academic workspace."}
        </p>
        {mode === "forgot" ? (
          <div className="forgot-help">
            <p>
              Ask the administrator of your UniBridgeAI installation to reset
              your password.
            </p>
            <p>
              On your own computer (local version): stop the app, run{" "}
              <code>npm run local:reset-password</code> in the project folder,
              then start the app again. The new password is shown in the window
              and saved in <code>data/local-access.txt</code>.
            </p>
            <button type="button" onClick={() => switchTo("signin")}>
              Back to sign in
              <Icon name="arrow" size={18} />
            </button>
          </div>
        ) : (
          <form key={mode} onSubmit={submit}>
            {mode === "register" && (
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Your name"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="Your UniBridgeAI account email"
                maxLength={254}
                required
              />
            </label>
            <PasswordField
              label="Password"
              name="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              placeholder={
                mode === "register" ? "At least 12 characters" : "Enter your password"
              }
              minLength={mode === "register" ? 12 : undefined}
            />
            {mode === "register" && (
              <PasswordField
                label="Repeat password"
                name="confirm"
                autoComplete="new-password"
                placeholder="Repeat the password"
                minLength={12}
              />
            )}
            {mode === "signin" && (
              <button
                type="button"
                className="link-button forgot-link"
                onClick={() => switchTo("forgot")}
              >
                Forgot password?
              </button>
            )}
            <button disabled={busy}>
              {busy
                ? mode === "register"
                  ? "Creating account…"
                  : "Signing in…"
                : mode === "register"
                  ? "Create account"
                  : "Sign in"}
              <Icon name="arrow" size={18} />
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {mode !== "forgot" && registration && (
          <p className="switch-mode">
            {mode === "register" ? "Already have an account?" : "New to UniBridgeAI?"}{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => switchTo(mode === "register" ? "signin" : "register")}
            >
              {mode === "register" ? "Sign in" : "Create an account"}
            </button>
          </p>
        )}
        <p className="signin-note">
          One UniBridgeAI account works on the website and in the desktop app.
        </p>
        <div className="login-links">
          <a
            href="https://du.astanait.edu.kz/"
            target="_blank"
            rel="noreferrer"
          >
            Official DU <Icon name="external" size={13} />
          </a>
          <a
            href="https://lms.astanait.edu.kz/"
            target="_blank"
            rel="noreferrer"
          >
            Official LMS <Icon name="external" size={13} />
          </a>
        </div>
      </section>
    </main>
  );
}
function Dashboard({ user, summary, navigate, onAssistant }) {
  const teacher = user.role === "teacher";
  const stats = [
    {
      icon: "courses",
      label: teacher ? "Teaching courses" : "Enrolled courses",
      value: summary?.courses,
      page: "My courses",
      note: "UniBridgeAI records",
    },
    {
      icon: "calendar",
      label: "University timetable",
      value: "—",
      page: "Timetable",
      note: "Awaiting schedule data",
    },
    {
      icon: teacher ? "research" : "records",
      label: teacher ? "Publications" : "Academic record",
      value: teacher ? summary?.publications : "—",
      page: teacher ? "Publications" : "Academic records",
      note: teacher ? "Your saved records" : "Awaiting academic data",
    },
    {
      icon: "services",
      label: "Service drafts",
      value: summary?.requests,
      page: "Services & requests",
      note: "Private · not submitted",
    },
  ];
  const quick = [
    {
      icon: "calendar",
      name: "Timetable",
      page: "Timetable",
      text: "Plan your week",
    },
    {
      icon: "courses",
      name: "My courses",
      page: "My courses",
      text: "Learning materials",
    },
    {
      icon: "records",
      name: teacher ? "Department forms" : "Academic record",
      page: teacher ? "Department forms" : "Academic records",
      text: teacher ? "Reuse your information" : "View your results",
    },
    {
      icon: "services",
      name: "University services",
      page: "Services & requests",
      text: "Prepare a request",
    },
  ];
  return (
    <>
      <div className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">YOUR DIGITAL UNIVERSITY</p>
          <h1>
            Welcome back, {user.name.split(" ")[0]}
            <span className="greeting-dot">.</span>
          </h1>
          <p>Everything you need for your university day, in one place.</p>
        </div>
        <div className="today-label">
          <Icon name="calendar" />
          <span>
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
      </div>
      <section className="welcome-banner">
        <div>
          <span className="banner-label">UNIBRIDGEAI CAMPUS WORKSPACE</span>
          <h2>A more connected university experience.</h2>
          <p>
            Your learning, academic records and university services
            — together.
          </p>
          <button onClick={() => navigate("My profile")}>
            Open my profile <Icon name="arrow" size={17} />
          </button>
        </div>
        <div className="banner-art" aria-hidden="true">
          <span className="art-ring" />
          <div className="art-square one">
            <Icon name="courses" size={30} />
          </div>
          <div className="art-square two">
            <Icon name="research" size={24} />
          </div>
          <div className="art-square three">
            <Icon name="records" size={24} />
          </div>
          <span className="art-dot" />
        </div>
      </section>
      <div className="stats">
        {stats.map((s) => (
          <button
            className="stat-card"
            key={s.label}
            onClick={() => navigate(s.page)}
          >
            <div className="stat-top">
              <span>{s.label}</span>
              <span className="stat-icon">
                <Icon name={s.icon} />
              </span>
            </div>
            <strong>{s.value ?? "—"}</strong>
            <small>{s.note}</small>
          </button>
        ))}
      </div>
      {teacher && <TeacherToday navigate={navigate} />}
      <div className="dashboard-columns">
        <div>
          <section className="panel quick-panel">
            <div className="section-heading">
              <h2>Quick access</h2>
              <span className="muted">Your everyday tools</span>
            </div>
            <div className="quick-grid">
              {quick.map((q) => (
                <button
                  className="quick-item"
                  key={q.name}
                  onClick={() => navigate(q.page)}
                >
                  <span className="quick-icon">
                    <Icon name={q.icon} size={23} />
                  </span>
                  <strong>{q.name}</strong>
                  <small>{q.text}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Academic updates</h2>
              <span className="tag neutral">Not published yet</span>
            </div>
            <div className="update-empty">
              <span className="empty-icon">
                <Icon name="calendar" size={26} />
              </span>
              <div>
                <h3>Your campus updates will appear here</h3>
                <p>
                  Announcements and academic deadlines will appear when
                  published in UniBridgeAI.
                </p>
                <button
                  className="text-button"
                  onClick={() => navigate("University links")}
                >
                  Open university services <Icon name="arrow" size={15} />
                </button>
              </div>
            </div>
          </section>
        </div>
        <div>
          <section className="ai-card">
            <span className="ai-card-icon">
              <Icon name="ai" size={26} />
            </span>
            <span className="tag">AI preview</span>
            <h2>
              Your academic
              <br />
              AI companion.
            </h2>
            <p>
              Ask questions, draft text and discuss material you paste into the
              chat.
            </p>
            <button onClick={onAssistant}>
              Open the AI assistant <Icon name="arrow" size={16} />
            </button>
            <small>Chat with the configured AI model.</small>
          </section>
          <section className="panel connections-card">
            <div className="section-heading">
              <h2>University resources</h2>
              <Icon name="link" size={18} />
            </div>
            {externalLinks.slice(0, 2).map((l) => (
              <a
                className="system-row"
                key={l.short}
                href={l.url}
                target="_blank"
                rel="noreferrer"
              >
                <span className="system-monogram">{l.short}</span>
                <span>
                  <strong>{l.name}</strong>
                  <small>External reference</small>
                </span>
                <Icon name="external" size={15} />
              </a>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
function UniversityLinks() {
  return (
    <>
      <PageHeading
        title="University links"
        description="Official AITU services, clearly separated from your UniBridgeAI workspace."
      />
      <div className="cards">
        {externalLinks.map((l) => (
          <section className="panel link-card" key={l.name}>
            <span className="system-monogram">{l.short}</span>
            <h2>{l.name}</h2>
            <p>{l.description}</p>
            <span className="tag neutral">External resource</span>
            <a
              className="button secondary"
              href={l.url}
              target="_blank"
              rel="noreferrer"
            >
              Open website <Icon name="external" size={16} />
            </a>
          </section>
        ))}
      </div>
      <section className="panel">
        <h2>About these links</h2>
        <p>
          These links are optional references. UniBridgeAI manages its own
          accounts, courses and records. No DU or LMS API is used.
        </p>
      </section>
    </>
  );
}
function PlannedAcademicPage({ page }) {
  const details = {
    "Study plan": {
      icon: "records",
      title: "Study plan",
      description: "Your programme, curriculum and academic progress.",
      empty: "Your study plan is not available yet",
      text: "Programme modules, credits and prerequisites will be managed in UniBridgeAI. Curriculum setup is the next step.",
    },
    Registration: {
      icon: "courses",
      title: "Course registration",
      description: "Discover available disciplines and manage registration.",
      empty: "Course registration is being prepared",
      text: "The registration workflow will use the UniBridgeAI course catalogue, eligibility rules and enrollment windows.",
    },
    Library: {
      icon: "courses",
      title: "Library & resources",
      description:
        "A place for academic resources and university library services.",
      empty: "No library resources added yet",
      text: "The resource catalogue will bring learning materials and approved research links together.",
    },
    "Thesis & advising": {
      icon: "research",
      title: "Thesis & advising",
      description: "Your research topic, supervisor and advising information.",
      empty: "No advising records yet",
      text: "Thesis topics, supervisors and advising milestones will be managed in this workspace.",
    },
  };
  const d = details[page];
  return (
    <>
      <PageHeading
        eyebrow="ACADEMICS"
        title={d.title}
        description={d.description}
      />
      <EmptyState icon={d.icon} title={d.empty} description={d.text} />
    </>
  );
}
export default function PortalApp() {
  const [assistantOpen, setAssistantOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setAssistantOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(() =>
      new URLSearchParams(window.location.search).has("onedrive")
        ? "University accounts"
        : "Dashboard",
    ),
    [summary, setSummary] = useState(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [menu, setMenu] = useState(false),
    [collapsed, setCollapsed] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem("ub-nav-collapsed") || "{}");
      } catch {
        return {};
      }
    }),
    [dirty, setDirty] = useState(false),
    [signingOut, setSigningOut] = useState(false),
    [sessionNotice, setSessionNotice] = useState("");
  const pendingRemoteSync = useRef(false);
  const [remoteRevision, setRemoteRevision] = useState(0);
  useEffect(() => {
    api("/auth/me")
      .then((d) => setUser(d.user))
      .catch((e) => {
        if (!["Sign in required", "Session expired"].includes(e.message))
          setError(
            "Cannot reach the campus service. Please check that the backend is running.",
          );
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    const events = new EventSource("/api/events");
    const changed = () => {
      pendingRemoteSync.current = true;
      setRemoteRevision((revision) => revision + 1);
    };
    events.addEventListener("changed", changed);
    return () => events.close();
  }, [user]);
  useEffect(() => {
    if (!user || !pendingRemoteSync.current || dirty) return;
    let timer;
    const syncWhenSafe = () => {
      const active = document.activeElement;
      if (
        document.visibilityState === "hidden" ||
        active?.matches?.("input, textarea, select, [contenteditable=true]")
      ) {
        timer = setTimeout(syncWhenSafe, 1000);
        return;
      }
      pendingRemoteSync.current = false;
      window.location.reload();
    };
    timer = setTimeout(syncWhenSafe, 500);
    return () => clearTimeout(timer);
  }, [user, dirty, remoteRevision]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    api("/portal/summary")
      .then((d) => {
        if (active) setSummary(d.summary);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user, page]);
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
  const onCourseCount = useCallback(
    (count) => setSummary((s) => ({ ...s, courses: count })),
    [],
  );
  const navigate = (name) => {
    setPage(name);
    setSearch("");
    setMenu(false);
    setError("");
  };
  const teacher = user?.role === "teacher";
  const groups = [
    {
      title: "WORKSPACE",
      items: [
        ["Dashboard", "dashboard"],
      ],
    },
    {
      title: "ACADEMICS",
      items: [
        ["My courses", "courses"],
        ["Timetable", "calendar"],
        ["Academic records", "records"],
        ["Study plan", "records"],
        ["Registration", "courses"],
        ["Thesis & advising", "research"],
      ],
    },
    {
      title: teacher ? "FACULTY" : "PERSONAL",
      items: [
        ["My profile", "profile"],
        ["University accounts", "link"],
        ...(teacher
          ? [
              ["Publications", "research"],
              ["Department forms", "records"],
            ]
          : []),
      ],
    },
    {
      title: "CAMPUS",
      items: [
        ["Services & requests", "services"],
        ["Library", "courses"],
        ["University links", "link"],
      ],
    },
  ];
  // Remember which sections the user collapsed; the section with the open page stays open.
  const toggleGroup = (title) => {
    const next = { ...collapsed, [title]: !collapsed[title] };
    try {
      localStorage.setItem("ub-nav-collapsed", JSON.stringify(next));
    } catch {
      /* storage unavailable: the choice lasts for this session only */
    }
    return next;
  };
  const pageLabel = (p) =>
    p === "Academic records" ? (teacher ? "Gradebook" : "Academic record") : p;
  const matches = groups
    .flatMap((g) => g.items)
    .filter(([name]) =>
      pageLabel(name).toLowerCase().includes(search.toLowerCase()),
    );
  if (loading)
    return (
      <main className="loading">
        <Brand />
        <p>Opening your campus workspace…</p>
      </main>
    );
  if (!user)
    return (
      <>
        {error && (
          <div className="connection-error" role="alert">
            {error}
          </div>
        )}
        <Login
          onLogin={(u, message) => {
            setUser(u);
            setSessionNotice(message || "");
            setPage("Dashboard");
            setSummary(null);
            setError("");
          }}
        />
      </>
    );
  return (
    <div className={"shell" + (assistantOpen ? " assistant-open" : "")}>
      <aside className={"sidebar " + (menu ? "is-open" : "")}>
        <Brand />
        <div className="institution">
          <span className="institution-mark">A</span>
          <div>
            <strong>Astana IT University</strong>
            <small>UniBridgeAI prototype</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          {groups.map((g) => {
            const open = search ? true : !collapsed[g.title];
            const holdsPage = g.items.some(([name]) => name === page);
            return (
            <div
              className={"nav-group" + (open ? " is-open" : " is-collapsed") + (holdsPage ? " has-active" : "")}
              key={g.title}
            >
              <button
                type="button"
                className="nav-label nav-toggle"
                aria-expanded={open}
                aria-controls={"nav-" + g.title}
                onClick={() => setCollapsed(toggleGroup(g.title))}
              >
                <span>{g.title}</span>
                <Icon name="chevron" size={14} />
              </button>
              <div id={"nav-" + g.title} hidden={!open}>
              {g.items.map(([name, icon]) => (
                <button
                  key={name}
                  className={"nav " + (page === name ? "active" : "")}
                  aria-current={page === name ? "page" : undefined}
                  onClick={() => navigate(name)}
                >
                  <Icon name={icon} size={18} />
                  <span>{pageLabel(name)}</span>
                </button>
              ))}
              </div>
            </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{user.name.slice(0, 1)}</div>
          <div className="account-name">
            <strong>{user.name}</strong>
            <small>{teacher ? "Faculty account" : "Student account"}</small>
            {"__TAURI_INTERNALS__" in window && (
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  import("@tauri-apps/api/core").then(({ invoke }) =>
                    invoke("check_for_updates").catch((e) => setError(String(e))),
                  )
                }
              >
                Check for updates
              </button>
            )}
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            disabled={signingOut}
            onClick={async () => {
              if (
                dirty &&
                !window.confirm("Discard unsaved profile changes and sign out?")
              )
                return;
              setSigningOut(true);
              try {
                await api("/auth/logout", {});
                setUser(null);
                setDirty(false);
                setSummary(null);
              } catch (e) {
                setError(e.message);
              } finally {
                setSigningOut(false);
              }
            }}
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-overlay"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-column">
        <header className="topbar">
          <button
            className="icon-button menu-toggle"
            aria-label="Toggle navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            Campus <span>/</span> <strong>{pageLabel(page)}</strong>
          </div>
          <div className="global-search">
            <Icon name="search" size={18} />
            <input
              aria-label="Find a section"
              placeholder="Find a section…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearch("");
              }}
            />
            {search && (
              <div className="search-results">
                {matches.length ? (
                  matches.map(([name, icon]) => (
                    <button key={name} onClick={() => navigate(name)}>
                      <Icon name={icon} size={16} />
                      {pageLabel(name)}
                    </button>
                  ))
                ) : (
                  <p>No matching section</p>
                )}
              </div>
            )}
          </div>
          <span className="language-label">EN</span>
          <span className="avatar top-avatar">{user.name.slice(0, 1)}</span>
        </header>
        <main className="workspace">
          {sessionNotice && (
            <p role="status" className="notice">
              {sessionNotice}
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {page === "Dashboard" && (
            <Dashboard
              user={user}
              summary={summary}
              navigate={navigate}
              onAssistant={() => setAssistantOpen(true)}
            />
          )}
          {page === "My courses" && (
            <Courses user={user} onCount={onCourseCount} />
          )}
          {page === "Timetable" && <Timetable user={user} />}
          {page === "Academic records" && <AcademicRecords user={user} />}
          {page === "Services & requests" && <ServiceRequests />}
          {page === "University links" && <UniversityLinks />}
          {page === "University accounts" && <UniversityAccounts />}
          {[
            "Study plan",
            "Registration",
            "Library",
            "Thesis & advising",
          ].includes(page) && <PlannedAcademicPage page={page} />}
          {teacher ? (
            <div hidden={!facultyPages.includes(page)}>
              <FacultyWorkspace
                user={user}
                tab={facultyPages.includes(page) ? page : "My profile"}
                visible={facultyPages.includes(page)}
                onDirtyChange={setDirty}
              />
            </div>
          ) : (
            page === "My profile" && <StudentProfile user={user} />
          )}
          <footer className="workspace-footer">
            <span>UniBridgeAI · University platform prototype</span>
            <span>
              Independent platform · AI assistance
            </span>
          </footer>
        </main>
      </div>
      <button
        type="button"
        className="assistant-fab"
        aria-expanded={assistantOpen}
        aria-controls="assistant-panel"
        onClick={() => setAssistantOpen((open) => !open)}
      >
        <Icon name="ai" size={20} />
        <span>{assistantOpen ? "Hide assistant" : "Assistant"}</span>
      </button>
      <aside
        id="assistant-panel"
        className="assistant-drawer"
        aria-label="AI assistant"
        hidden={!assistantOpen}
      >
        <AIWorkspace
          teacher={teacher}
          page={page}
          onClose={() => setAssistantOpen(false)}
        />
      </aside>
    </div>
  );
}
