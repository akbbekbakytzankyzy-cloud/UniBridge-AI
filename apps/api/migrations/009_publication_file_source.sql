-- Publications can also come from the teacher's own files (OneDrive / page
-- imports), a DOI lookup or a DU profile import. They stay "unverified" like every import.
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_source_check;
ALTER TABLE publications ADD CONSTRAINT publications_source_check
  CHECK (source IN ('manual','openalex','orcid','file','doi','du'));
