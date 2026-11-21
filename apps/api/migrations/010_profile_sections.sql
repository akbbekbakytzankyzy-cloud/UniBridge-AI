-- Profile sections that DU already holds: work experience, research projects
-- and teaching materials/service. Same shape as education/training/awards.
ALTER TABLE faculty_profiles
  ADD COLUMN employment jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(employment)='array'),
  ADD COLUMN projects jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(projects)='array'),
  ADD COLUMN materials jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(materials)='array');
