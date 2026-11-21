import { Router } from "express";
import { z } from "zod";

// Teacher tools for the timetable and gradebook.
// Every route is limited to the teacher who owns the course; students and
// other teachers get 403/404. Students read the results through
// GET /api/portal/academic-records, which only returns published rows.
export function teachingRouter(pool) {
  const router = Router();

  router.use((req, res, next) =>
    req.user.role === "teacher"
      ? next()
      : res.status(403).json({ error: "Teacher access required" }),
  );

  async function ownedCourse(req, res, courseId) {
    const id = z.uuid().parse(courseId);
    const { rows } = await pool.query(
      "SELECT id,code,title FROM courses WHERE id=$1 AND teacher_id=$2",
      [id, req.user.id],
    );
    if (!rows[0]) res.status(404).json({ error: "Course not found" });
    return rows[0];
  }

  router.get("/courses", async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id,c.code,c.title,
        (SELECT count(*)::int FROM enrollments e WHERE e.course_id=c.id) AS students
      FROM courses c WHERE c.teacher_id=$1 ORDER BY c.code`,
      [req.user.id],
    );
    res.json({ courses: rows });
  });

  router.get("/courses/:id/students", async (req, res) => {
    const course = await ownedCourse(req, res, req.params.id);
    if (!course) return;
    const { rows } = await pool.query(
      `SELECT u.id,u.name,u.email FROM enrollments e JOIN users u ON u.id=e.student_id
      WHERE e.course_id=$1 ORDER BY u.name`,
      [course.id],
    );
    res.json({ students: rows });
  });

  const eventInput = z
    .object({
      title: z.string().trim().min(2).max(160),
      starts_at: z.iso.datetime({ offset: true }),
      ends_at: z.iso.datetime({ offset: true }),
      room: z.string().trim().max(60).default(""),
      session_type: z
        .enum(["Lecture", "Practice", "Lab", "Seminar", "Exam", "Class"])
        .default("Class"),
    })
    .strict()
    .refine((v) => Date.parse(v.ends_at) > Date.parse(v.starts_at), {
      message: "The class must end after it starts",
      path: ["ends_at"],
    })
    .refine(
      (v) => Date.parse(v.ends_at) - Date.parse(v.starts_at) <= 12 * 3600000,
      { message: "A class can last at most 12 hours", path: ["ends_at"] },
    );

  router.post("/courses/:id/timetable", async (req, res) => {
    const course = await ownedCourse(req, res, req.params.id);
    if (!course) return;
    const v = eventInput.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO timetable_events(course_id,title,starts_at,ends_at,room,session_type)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id,title,starts_at,ends_at,room,session_type`,
      [course.id, v.title, v.starts_at, v.ends_at, v.room, v.session_type],
    );
    res.status(201).json({ event: { ...rows[0], code: course.code } });
  });

  router.delete("/timetable/:eventId", async (req, res) => {
    const id = z.uuid().parse(req.params.eventId);
    const { rowCount } = await pool.query(
      `DELETE FROM timetable_events t USING courses c
      WHERE t.id=$1 AND c.id=t.course_id AND c.teacher_id=$2`,
      [id, req.user.id],
    );
    if (!rowCount) return res.status(404).json({ error: "Class not found" });
    res.status(204).end();
  });

  const resultKey = z.object({
    student_id: z.uuid(),
    assessment: z.string().trim().min(1).max(80),
  });

  router.put("/courses/:id/results", async (req, res) => {
    const course = await ownedCourse(req, res, req.params.id);
    if (!course) return;
    const v = resultKey
      .extend({
        score: z.number().min(0).max(100),
        feedback: z.string().trim().max(1000).default(""),
      })
      .strict()
      .parse(req.body);
    const enrolled = await pool.query(
      "SELECT 1 FROM enrollments WHERE course_id=$1 AND student_id=$2",
      [course.id, v.student_id],
    );
    if (!enrolled.rows[0])
      return res
        .status(400)
        .json({ error: "The student is not enrolled in this course" });
    // Changing a score sends it back to unpublished so the teacher reviews it again.
    const { rows } = await pool.query(
      `INSERT INTO academic_results(course_id,student_id,assessment,score,feedback)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(course_id,student_id,assessment) DO UPDATE SET
        score=EXCLUDED.score, feedback=EXCLUDED.feedback, updated_at=now(),
        published_at=CASE WHEN academic_results.score IS DISTINCT FROM EXCLUDED.score
          THEN NULL ELSE academic_results.published_at END
      RETURNING assessment,score,feedback,published_at`,
      [course.id, v.student_id, v.assessment, v.score, v.feedback],
    );
    res.json({ result: rows[0] });
  });

  async function setPublished(req, res, published) {
    const course = await ownedCourse(req, res, req.params.id);
    if (!course) return;
    const v = resultKey.strict().parse(req.body);
    const { rows } = await pool.query(
      `UPDATE academic_results SET published_at=${published ? "now()" : "NULL"}, updated_at=now()
      WHERE course_id=$1 AND student_id=$2 AND assessment=$3 RETURNING published_at`,
      [course.id, v.student_id, v.assessment],
    );
    if (!rows[0]) return res.status(404).json({ error: "Result not found" });
    res.json({ published_at: rows[0].published_at });
  }
  router.post("/courses/:id/results/publish", (req, res) =>
    setPublished(req, res, true),
  );
  router.post("/courses/:id/results/unpublish", (req, res) =>
    setPublished(req, res, false),
  );

  router.post("/courses/:id/results/delete", async (req, res) => {
    const course = await ownedCourse(req, res, req.params.id);
    if (!course) return;
    const v = resultKey.strict().parse(req.body);
    const { rowCount } = await pool.query(
      "DELETE FROM academic_results WHERE course_id=$1 AND student_id=$2 AND assessment=$3",
      [course.id, v.student_id, v.assessment],
    );
    if (!rowCount) return res.status(404).json({ error: "Result not found" });
    res.status(204).end();
  });

  return router;
}
