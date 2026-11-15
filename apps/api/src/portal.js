import { Router } from "express";
import { z } from "zod";
export function portalRouter(pool) {
  const router = Router();
  router.get("/summary", async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
      (SELECT count(*)::int FROM courses c WHERE c.teacher_id=$1 OR EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id=c.id AND e.student_id=$1)) AS courses,
      (SELECT count(*)::int FROM service_requests WHERE owner_id=$1) AS requests,
      (SELECT count(*)::int FROM publications WHERE owner_id=$1) AS publications,
      (SELECT count(*)::int FROM department_exports WHERE owner_id=$1) AS exports`,
      [req.user.id],
    );
    res.json({
      summary: rows[0],
      connections: {
        du: "not-connected",
        lms: "not-connected",
        ai: "not-connected",
      },
    });
  });
  router.get("/timetable", async (req, res) => {
    const from = z.iso.date().parse(req.query.from),
      to = z.iso.date().parse(req.query.to);
    const span = Date.parse(to) - Date.parse(from);
    if (span <= 0 || span > 32 * 86400000)
      return res
        .status(400)
        .json({ error: "Choose a date range of 1–32 days" });
    const { rows } = await pool.query(
      `SELECT t.id,t.title,t.starts_at,t.ends_at,t.room,t.session_type,c.code,c.title AS course_title
      FROM timetable_events t JOIN courses c ON c.id=t.course_id
      WHERE t.starts_at >= $2::date AND t.starts_at < $3::date
      AND (c.teacher_id=$1 OR EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id=c.id AND e.student_id=$1)) ORDER BY t.starts_at`,
      [req.user.id, from, to],
    );
    res.json({ events: rows, source: "unibridge" });
  });
  router.get("/academic-records", async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.code,c.title,u.name AS student_name,r.assessment,r.score,r.published_at
      FROM academic_results r JOIN courses c ON c.id=r.course_id JOIN users u ON u.id=r.student_id
      WHERE ($2='teacher' AND c.teacher_id=$1) OR ($2='student' AND r.student_id=$1 AND r.published_at IS NOT NULL)
      ORDER BY c.code,u.name,r.assessment`,
      [req.user.id, req.user.role],
    );
    res.json({ records: rows, officialTranscript: false });
  });
  router.get("/student-profile", async (req, res) => {
    if (req.user.role !== "student")
      return res.status(403).json({ error: "Student access required" });
    const { rows } = await pool.query(
      "SELECT preferred_name,phone,updated_at FROM student_profiles WHERE user_id=$1",
      [req.user.id],
    );
    res.json({ profile: rows[0] || { preferred_name: "", phone: "" } });
  });
  router.put("/student-profile", async (req, res) => {
    if (req.user.role !== "student")
      return res.status(403).json({ error: "Student access required" });
    const v = z
      .object({
        preferred_name: z.string().trim().max(120),
        phone: z.string().trim().max(40),
      })
      .strict()
      .parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO student_profiles(user_id,preferred_name,phone) VALUES($1,$2,$3)
      ON CONFLICT(user_id) DO UPDATE SET preferred_name=EXCLUDED.preferred_name,phone=EXCLUDED.phone,updated_at=now() RETURNING preferred_name,phone,updated_at`,
      [req.user.id, v.preferred_name, v.phone],
    );
    res.json({ profile: rows[0] });
  });
  router.get("/requests", async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id,service,subject,description,status,created_at FROM service_requests WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
      [req.user.id],
    );
    res.json({ requests: rows });
  });
  router.post("/requests", async (req, res) => {
    const v = z
      .object({
        service: z.enum([
          "transcript",
          "certificate",
          "it-support",
          "profile-correction",
        ]),
        subject: z.string().trim().min(3).max(160),
        description: z.string().trim().min(3).max(4000),
      })
      .strict()
      .parse(req.body);
    const { rows } = await pool.query(
      "INSERT INTO service_requests(owner_id,service,subject,description) VALUES($1,$2,$3,$4) RETURNING id,service,subject,description,status,created_at",
      [req.user.id, v.service, v.subject, v.description],
    );
    res.status(201).json({ request: rows[0] });
  });
  return router;
}
