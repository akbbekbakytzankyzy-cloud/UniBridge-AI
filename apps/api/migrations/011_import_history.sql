-- Import history: a fingerprint of each snapshot (to spot identical re-downloads)
-- and a cached AI description. The description is a convenience; the snapshot stays the source.
ALTER TABLE browser_imports
  ADD COLUMN content_sha256 text NOT NULL DEFAULT '',
  ADD COLUMN ai_summary text NOT NULL DEFAULT '',
  ADD COLUMN ai_summary_model text NOT NULL DEFAULT '';
UPDATE browser_imports SET content_sha256 = encode(sha256(convert_to(content, 'UTF8')), 'hex');
-- A trigger keeps the fingerprint right on every insert or content change.
CREATE FUNCTION browser_imports_fingerprint() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.content_sha256 := encode(sha256(convert_to(NEW.content, 'UTF8')), 'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER browser_imports_fingerprint BEFORE INSERT OR UPDATE OF content ON browser_imports
  FOR EACH ROW EXECUTE FUNCTION browser_imports_fingerprint();
CREATE INDEX browser_imports_history_idx ON browser_imports(user_id, source_url, created_at);
