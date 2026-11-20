-- Draft records proposed from an accepted page import. Nothing here is a
-- confirmed record until the owner confirms it; confirmed rows are never
-- overwritten by a later extraction run.
CREATE TABLE extraction_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES browser_imports(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN ('publication','course','project','certificate','material')),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  missing_fields text[] NOT NULL DEFAULT '{}',
  warnings text[] NOT NULL DEFAULT '{}',
  model text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX extraction_drafts_source ON extraction_drafts(source_id, status);
