-- Teacher-entered timetable and gradebook.
-- Course owners create timetable events and assessment results for students
-- enrolled in their courses. Students see a result only after it is published.
ALTER TABLE academic_results
  ADD COLUMN feedback text NOT NULL DEFAULT '' CHECK (length(feedback) <= 1000),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX academic_results_student ON academic_results(student_id);
ALTER TABLE timetable_events
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
