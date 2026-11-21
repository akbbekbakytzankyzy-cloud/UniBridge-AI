import React, { useEffect, useState } from "react";
import { api } from "./api.js";

// Teacher-only forms for the Timetable and Gradebook pages.
// The server checks course ownership again on every request.

function useTeachingCourses() {
  const [courses, setCourses] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api("/portal/teaching/courses")
      .then((d) => active && setCourses(d.courses))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  return { courses, error };
}

function NoCourses() {
  return (
    <p className="muted">
      Create a course in <strong>My courses</strong> first, then add students to
      it.
    </p>
  );
}

const sessionTypes = ["Lecture", "Practice", "Lab", "Seminar", "Exam", "Class"];

export function TimetableEditor({ defaultDate, onCreated }) {
  const { courses, error: loadError } = useTeachingCourses();
  const [form, setForm] = useState({
      course: "",
      title: "",
      date: defaultDate,
      start: "09:00",
      end: "10:30",
      room: "",
      session_type: "Lecture",
    }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => setForm((f) => ({ ...f, date: defaultDate })), [defaultDate]);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const courseId = form.course || courses?.[0]?.id || "";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // The browser's local time zone turns the date and times into exact moments.
      const starts = new Date(`${form.date}T${form.start}`),
        ends = new Date(`${form.date}T${form.end}`);
      const { event } = await api(`/portal/teaching/courses/${courseId}/timetable`, {
        title: form.title,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        room: form.room,
        session_type: form.session_type,
      });
      setNotice(`Added “${event.title}”.`);
      setForm({ ...form, title: "" });
      onCreated(event);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel teaching-editor">
      <h2>Add a class</h2>
      {loadError && <p className="error">{loadError}</p>}
      {courses && !courses.length && <NoCourses />}
      {courses?.length > 0 && (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <div className="teaching-grid">
              <label>
                Course
                <select value={courseId} onChange={set("course")}>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Topic
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={form.title}
                  onChange={set("title")}
                  placeholder="e.g. SQL joins"
                />
              </label>
              <label>
                Type
                <select value={form.session_type} onChange={set("session_type")}>
                  {sessionTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input type="date" required value={form.date} onChange={set("date")} />
              </label>
              <label>
                Starts
                <input type="time" required value={form.start} onChange={set("start")} />
              </label>
              <label>
                Ends
                <input type="time" required value={form.end} onChange={set("end")} />
              </label>
              <label>
                Room
                <input maxLength={60} value={form.room} onChange={set("room")} placeholder="e.g. C1.2" />
              </label>
            </div>
            <button type="submit">{busy ? "Adding…" : "Add to timetable"}</button>
          </fieldset>
        </form>
      )}
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
    </section>
  );
}

export function GradeEditor({ onSaved, editing }) {
  const { courses, error: loadError } = useTeachingCourses();
  const [course, setCourse] = useState(""),
    [students, setStudents] = useState([]),
    [form, setForm] = useState({ student_id: "", assessment: "", score: "", feedback: "" }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const courseId = course || courses?.[0]?.id || "";

  useEffect(() => {
    if (!courseId) return;
    let active = true;
    setStudents([]);
    api(`/portal/teaching/courses/${courseId}/students`)
      .then((d) => active && setStudents(d.students))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [courseId]);

  // "Edit" in the gradebook table fills the form with that row.
  useEffect(() => {
    if (!editing) return;
    setCourse(editing.course_id);
    setForm({
      student_id: editing.student_id,
      assessment: editing.assessment,
      score: editing.score ?? "",
      feedback: editing.feedback || "",
    });
  }, [editing]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const studentId = form.student_id || students[0]?.id || "";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(
        `/portal/teaching/courses/${courseId}/results`,
        {
          student_id: studentId,
          assessment: form.assessment,
          score: Number(form.score),
          feedback: form.feedback,
        },
        "PUT",
      );
      setNotice("Saved as unpublished. Publish it when students should see it.");
      setForm({ ...form, score: "", feedback: "" });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel teaching-editor">
      <h2>Enter a grade</h2>
      {loadError && <p className="error">{loadError}</p>}
      {courses && !courses.length && <NoCourses />}
      {courses?.length > 0 && (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <div className="teaching-grid">
              <label>
                Course
                <select
                  value={courseId}
                  onChange={(e) => {
                    setCourse(e.target.value);
                    setForm({ ...form, student_id: "" });
                  }}
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Student
                <select value={studentId} onChange={set("student_id")} required>
                  {!students.length && <option value="">No students enrolled</option>}
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assessment
                <input
                  required
                  maxLength={80}
                  value={form.assessment}
                  onChange={set("assessment")}
                  placeholder="e.g. Midterm"
                />
              </label>
              <label>
                Score (0–100)
                <input
                  type="number"
                  required
                  min={0}
                  max={100}
                  step={0.01}
                  value={form.score}
                  onChange={set("score")}
                />
              </label>
              <label className="wide">
                Feedback for the student (optional)
                <input maxLength={1000} value={form.feedback} onChange={set("feedback")} />
              </label>
            </div>
            <button type="submit" disabled={!studentId}>
              {busy ? "Saving…" : "Save grade"}
            </button>
          </fieldset>
        </form>
      )}
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
    </section>
  );
}

export function useGradeActions(onChange, setError) {
  return async (action, r) => {
    if (action === "delete" && !window.confirm(`Delete “${r.assessment}” for ${r.student_name}?`))
      return;
    try {
      await api(`/portal/teaching/courses/${r.course_id}/results/${action}`, {
        student_id: r.student_id,
        assessment: r.assessment,
      });
      onChange();
    } catch (e) {
      setError(e.message);
    }
  };
}
