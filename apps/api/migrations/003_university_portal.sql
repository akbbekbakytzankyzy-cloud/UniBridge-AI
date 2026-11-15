CREATE TABLE student_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE timetable_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  room text NOT NULL DEFAULT '',
  session_type text NOT NULL DEFAULT 'Class'
);
CREATE INDEX timetable_course_time ON timetable_events(course_id,starts_at);
CREATE TABLE academic_results (
  course_id uuid NOT NULL,
  student_id uuid NOT NULL,
  assessment text NOT NULL,
  score numeric(6,2) CHECK (score BETWEEN 0 AND 100),
  published_at timestamptz,
  PRIMARY KEY(course_id,student_id,assessment),
  FOREIGN KEY(course_id,student_id) REFERENCES enrollments(course_id,student_id) ON DELETE CASCADE
);
CREATE TABLE service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service text NOT NULL CHECK(service IN ('transcript','certificate','it-support','profile-correction')),
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status='draft'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_requests_owner ON service_requests(owner_id,created_at);
-- Registrar/LMS ingestion and approval workflows are not implemented yet.
-- No timetable or grades are synthesized by this migration.
