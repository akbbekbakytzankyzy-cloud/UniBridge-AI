import React, { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { Icon } from "./icons.jsx";
import FacultyWorkspace from "./FacultyApp.jsx";
import Courses from "./Courses.jsx";
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
          <path d="M7 22V10h5v12M20 22V10h5v12M7 16h18M12 10l4-4 4 4" />
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
      const data =
        mode === "register"
          ? await api("/auth/register", {
              name: v.name,
              email: v.email,
              password: v.password,
            })
          : await api("/auth/login", { email: v.email, password: v.password });
      onLogin(data.user);
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
          <span className="pill">University platform concept</span>
          <h1>
            Your university.
            <br />
            Connected.
          </h1>
          <p>
            Learning, research and campus services.
            <br />
            One workspace built around your academic life.
          </p>
          <div className="campus-graphic" aria-hidden="true">
            <div className="campus-tower t1" />
            <div className="campus-tower t2" />
            <div className="campus-tower t3" />
            <div className="campus-bridge" />
            <span>LEARN · CONNECT · DISCOVER</span>
          </div>
        </div>
        <div className="login-bottom">
          Inspired by Astana IT University’s digital ecosystem
        </div>
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
          Use your UniBridgeAI account. This platform has its own authentication
          and data.
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
function Dashboard({ user, summary, navigate }) {
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
            <span className="tag">Local AI preview</span>
            <h2>
              Your academic
              <br />
              AI companion.
            </h2>
            <p>
              Ask questions, draft text and discuss material you paste into the
              chat.
            </p>
            <button onClick={() => navigate("AI workspace")}>
              Explore AI workspace <Icon name="arrow" size={16} />
            </button>
            <small>Chat with an installed local model.</small>
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
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState("Dashboard"),
    [summary, setSummary] = useState(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [menu, setMenu] = useState(false),
    [dirty, setDirty] = useState(false),
    [signingOut, setSigningOut] = useState(false);
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
        ["AI workspace", "ai"],
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
          onLogin={(u) => {
            setUser(u);
            setPage("Dashboard");
            setSummary(null);
            setError("");
          }}
        />
      </>
    );
  return (
    <div className="shell">
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
          {groups.map((g) => (
            <div className="nav-group" key={g.title}>
              <p className="nav-label">{g.title}</p>
              {g.items.map(([name, icon]) => (
                <button
                  key={name}
                  className={"nav " + (page === name ? "active" : "")}
                  aria-current={page === name ? "page" : undefined}
                  onClick={() => navigate(name)}
                >
                  <Icon name={icon} size={18} />
                  <span>{pageLabel(name)}</span>
                  {name === "AI workspace" && (
                    <span className="nav-badge">AI</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{user.name.slice(0, 1)}</div>
          <div className="account-name">
            <strong>{user.name}</strong>
            <small>{teacher ? "Faculty account" : "Student account"}</small>
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
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {page === "Dashboard" && (
            <Dashboard user={user} summary={summary} navigate={navigate} />
          )}
          {page === "My courses" && (
            <Courses user={user} onCount={onCourseCount} />
          )}
          {page === "Timetable" && <Timetable />}
          {page === "Academic records" && <AcademicRecords user={user} />}
          {page === "Services & requests" && <ServiceRequests />}
          {page === "AI workspace" && <AIWorkspace teacher={teacher} />}
          {page === "University links" && <UniversityLinks />}
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
                onDirtyChange={setDirty}
              />
            </div>
          ) : (
            page === "My profile" && <StudentProfile user={user} />
          )}
          <footer className="workspace-footer">
            <span>UniBridgeAI · University platform prototype</span>
            <span>
              Independent platform · Local AI powered by Ollama
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
