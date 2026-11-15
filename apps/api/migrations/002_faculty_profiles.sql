CREATE TABLE faculty_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  education jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(education)='array'),
  training jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(training)='array'),
  awards jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(awards)='array'),
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  year integer CHECK (year BETWEEN 1800 AND 2200),
  doi text,
  venue text NOT NULL DEFAULT '',
  authors text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','openalex')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','confirmed','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX publications_owner_doi ON publications(owner_id,doi) WHERE doi IS NOT NULL;
CREATE INDEX publications_owner ON publications(owner_id);
CREATE TABLE department_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id text NOT NULL,
  template_version integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX department_exports_owner ON department_exports(owner_id);
-- The initial course tables remain intact for backwards compatibility.
-- No private profile fields are copied into vector indexes.
