import { aiRouter } from "./ai.js";
import { universityAccountsRouter } from "./university-accounts.js";
import {
  browserCaptureRouter,
  browserImportsRouter,
} from "./browser-imports.js";
import express from "express";
import { join } from "node:path";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { facultyRouter } from "./faculty.js";
import { portalRouter } from "./portal.js";
import { teachingRouter } from "./teaching.js";
import {
  onedriveCallbackRouter,
  onedriveConfig,
  onedriveRouter,
} from "./onedrive.js";
import { extractionRouter } from "./extraction.js";
import { autofillRouter } from "./autofill.js";
import { fieldMappingRouter } from "./field-mapping.js";
import { createAIClient } from "./ai-client.js";
import {
  newToken,
  readSession,
  tokenHash,
  verifyPassword,
  hashPassword,
} from "./security.js";

export async function createApp(
  pool,
  {
    origin = "http://localhost:5173",
    production = false,
    scholarlyFetch = fetch,
    ai = {},
    staticDir = null,
    allowRegistration = false,
    nativeCaptureToken = "",
    onedrive = {},
  } = {},
) {
  const app = express();
  const onedriveCfg = onedriveConfig(process.env, {
    redirectUri: `${origin}/api/onedrive-callback`,
    ...onedrive,
  });
  app.locals.onedrive = onedriveCfg;
  const dummyHash = await hashPassword(newToken());
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    path: "/api",
    maxAge: 8 * 60 * 60 * 1000,
  };
  app.use(
    helmet({
      contentSecurityPolicy: {
        // Local http://localhost serving: WebKit would otherwise rewrite the
        // UI's own scripts to https://localhost and show a blank window.
        directives: { upgradeInsecureRequests: production ? [] : null },
      },
    }),
  );
  async function startSession(res, user) {
    const token = newToken();
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
      [tokenHash(token), user.id],
    );
    res.cookie("ub_session", token, cookieOptions).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  }
  app.use(express.json({ limit: "256kb" }));
  app.use(
    "/api/browser-import",
    browserCaptureRouter(pool, nativeCaptureToken),
  );
  app.use("/api/onedrive-callback", onedriveCallbackRouter(pool, onedriveCfg));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== origin
    )
      return res.status(403).json({ error: "Untrusted request origin" });
    next();
  });
  app.get("/api/health", async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  });
  app.post(
    "/api/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many login attempts. Try again later." },
    }),
    async (req, res) => {
      const input = z
        .object({
          email: z.email().transform((v) => v.toLowerCase()),
          password: z.string().min(1).max(128),
        })
        .parse(req.body);
      const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [
        input.email,
      ]);
      const user = rows[0];
      const valid = await verifyPassword(
        input.password,
        user?.password_hash || dummyHash,
      );
      if (!user || !valid)
        return res.status(401).json({ error: "Invalid email or password" });
      await startSession(res, user);
    },
  );
  // Self-registration creates student accounts only; teacher accounts are
  // still provisioned by an administrator (CLI). Off unless enabled.
  app.get("/api/auth/options", (req, res) =>
    res.json({ registration: allowRegistration }),
  );
  app.post(
    "/api/auth/register",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many sign-up attempts. Try again later." },
    }),
    async (req, res) => {
      if (!allowRegistration)
        return res
          .status(403)
          .json({ error: "Registration is disabled. Ask an administrator." });
      const input = z
        .object({
          name: z.string().trim().min(2).max(120),
          email: z
            .email()
            .max(254)
            .transform((v) => v.toLowerCase()),
          password: z
            .string()
            .min(12, "Use at least 12 characters for the password")
            .max(128),
        })
        .strict()
        .parse(req.body);
      const { rows } = await pool.query(
        "INSERT INTO users(email,name,role,password_hash) VALUES($1,$2,'student',$3) ON CONFLICT(email) DO NOTHING RETURNING *",
        [input.email, input.name, await hashPassword(input.password)],
      );
      if (!rows.length)
        return res
          .status(409)
          .json({ error: "An account with this email already exists." });
      res.status(201);
      await startSession(res, rows[0]);
    },
  );
  app.use("/api", async (req, res, next) => {
    const token = readSession(req.headers.cookie);
    if (!/^[a-f0-9]{64}$/.test(token))
      return res.status(401).json({ error: "Sign in required" });
    const { rows } = await pool.query(
      "SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
      [tokenHash(token)],
    );
    if (!rows[0]) return res.status(401).json({ error: "Session expired" });
    req.user = rows[0];
    next();
  });
  app.get("/api/auth/me", (req, res) => res.json({ user: req.user }));
  app.post("/api/auth/logout", async (req, res) => {
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      tokenHash(readSession(req.headers.cookie)),
    ]);
    res
      .clearCookie("ub_session", { ...cookieOptions, maxAge: undefined })
      .status(204)
      .end();
  });
  const teacher = (req, res, next) =>
    req.user.role === "teacher"
      ? next()
      : res.status(403).json({ error: "Teacher access required" });
  const aiClient = ai.client || createAIClient({ fetcher: ai.fetcher });
  app.use("/api/ai", aiRouter({ ...ai, pool, aiClient }));
  app.use("/api/university-accounts", universityAccountsRouter(pool));
  app.use("/api/extraction", extractionRouter({ pool, ai: aiClient }));
  app.use("/api/autofill", autofillRouter({ pool, ai: aiClient }));
  app.use("/api/field-mapping", fieldMappingRouter({ pool, ai: aiClient }));
  app.use("/api/browser-imports", browserImportsRouter(pool));
  app.use("/api/faculty", facultyRouter(pool, { fetcher: scholarlyFetch }));
  app.use("/api/portal/teaching", teachingRouter(pool));
  app.use("/api/onedrive", onedriveRouter(pool, onedriveCfg));
  app.use("/api/portal", portalRouter(pool));
  app.get("/api/courses", async (req, res) => {
    const { rows } = await pool.query(
      "SELECT c.id,c.code,c.title,u.name AS teacher_name FROM courses c JOIN users u ON u.id=c.teacher_id WHERE c.teacher_id=$1 OR EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id=c.id AND e.student_id=$1) ORDER BY c.code",
      [req.user.id],
    );
    res.json({ courses: rows });
  });
  app.post("/api/courses", teacher, async (req, res) => {
    const v = z
      .object({
        code: z.string().trim().min(2).max(30),
        title: z.string().trim().min(2).max(150),
      })
      .parse(req.body);
    const { rows } = await pool.query(
      "INSERT INTO courses(code,title,teacher_id) VALUES($1,$2,$3) RETURNING id,code,title",
      [v.code, v.title, req.user.id],
    );
    res.status(201).json({ course: rows[0] });
  });
  app.use("/api/courses/:id", async (req, res, next) => {
    const id = z.uuid().parse(req.params.id);
    const { rows } = await pool.query(
      "SELECT c.* FROM courses c WHERE c.id=$1 AND (c.teacher_id=$2 OR EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id=c.id AND e.student_id=$2))",
      [id, req.user.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Course not found" });
    req.course = rows[0];
    next();
  });
  const owner = (req, res, next) =>
    req.course.teacher_id === req.user.id
      ? next()
      : res.status(403).json({ error: "Course owner access required" });
  app.post("/api/courses/:id/enrollments", teacher, owner, async (req, res) => {
    const { email } = z
      .object({ email: z.email().transform((v) => v.toLowerCase()) })
      .parse(req.body);
    const { rows } = await pool.query(
      "SELECT id FROM users WHERE email=$1 AND role='student'",
      [email],
    );
    if (!rows[0])
      return res.status(404).json({ error: "Student account not found" });
    await pool.query(
      "INSERT INTO enrollments(course_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [req.course.id, rows[0].id],
    );
    res.status(204).end();
  });
  app.get("/api/courses/:id/documents", async (req, res) => {
    const q = z
      .string()
      .max(200)
      .parse(req.query.q || "");
    const { rows } = await pool.query(
      "SELECT id,title,content,created_at FROM documents WHERE course_id=$1 AND ($2='' OR strpos(lower(title || ' ' || content),lower($2))>0) ORDER BY created_at DESC LIMIT 100",
      [req.course.id, q],
    );
    res.json({ documents: rows, searchMode: "keyword" });
  });
  app.post("/api/courses/:id/documents", teacher, owner, async (req, res) => {
    const v = z
      .object({
        title: z.string().trim().min(1).max(200),
        content: z.string().trim().min(1).max(100000),
      })
      .parse(req.body);
    const { rows } = await pool.query(
      "INSERT INTO documents(course_id,title,content,created_by) VALUES($1,$2,$3,$4) RETURNING id,title",
      [req.course.id, v.title, v.content, req.user.id],
    );
    res.status(201).json({ document: rows[0] });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  if (staticDir) {
    // Desktop mode: the API also serves the built web UI, so the window, the
    // API and the session cookie share one origin.
    app.use(express.static(staticDir, { index: "index.html", maxAge: 0 }));
    app.use((req, res, next) =>
      req.method === "GET" && req.accepts("html")
        ? res.sendFile(join(staticDir, "index.html"))
        : next(),
    );
  }
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: "Invalid input",
        details: err.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
    if (err.code === "23505")
      return res.status(409).json({ error: "This record already exists" });
    if (err.status === 400 || err.status === 413)
      return res.status(err.status).json({ error: "Invalid request body" });
    console.error("Request failed:", err.code || err.name);
    res.status(503).json({ error: "Service unavailable" });
  });
  return app;
}
