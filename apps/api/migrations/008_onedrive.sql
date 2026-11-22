-- Automatic import of teacher files from Microsoft OneDrive (Microsoft Graph).
-- A teacher connects their own Microsoft account and chooses one folder.
-- New or changed files in that folder become review items in browser_imports
-- (origin 'onedrive'); records are created only after the teacher confirms drafts.
CREATE TABLE onedrive_connections (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_name text NOT NULL DEFAULT '',
  refresh_token_enc text NOT NULL,
  folder_id text,
  folder_path text NOT NULL DEFAULT '',
  last_sync_at timestamptz,
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Short-lived OAuth state for the sign-in redirect (PKCE verifier included).
CREATE TABLE onedrive_auth_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  expires_at timestamptz NOT NULL
);
-- One row per synced file, so a file is imported again only when it changes.
CREATE TABLE onedrive_files (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  etag text NOT NULL,
  name text NOT NULL,
  import_id uuid REFERENCES browser_imports(id) ON DELETE SET NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
ALTER TABLE browser_imports
  ADD COLUMN origin text NOT NULL DEFAULT 'browser' CHECK (origin IN ('browser','onedrive')),
  ADD COLUMN title text NOT NULL DEFAULT '';
