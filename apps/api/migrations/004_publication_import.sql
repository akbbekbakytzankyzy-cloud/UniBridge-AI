-- Imported publication records keep their source identifier so repeated imports
-- never create duplicates and never overwrite existing (possibly confirmed) rows.
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_source_check;
ALTER TABLE publications ADD CONSTRAINT publications_source_check
  CHECK (source IN ('manual','openalex','orcid'));
ALTER TABLE publications
  ADD COLUMN external_id text,
  ADD COLUMN source_url text,
  ADD COLUMN imported_at timestamptz;
CREATE UNIQUE INDEX publications_owner_external
  ON publications(owner_id,source,external_id) WHERE external_id IS NOT NULL;
