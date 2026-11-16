# Local preview database

The development preview uses PGlite (PostgreSQL 18 in the currently installed package) with pgvector. The Docker deployment uses the separate PostgreSQL configuration described in README. Neither is SQLite.

`data/local-preview.json` may select a directory, e.g. `{"directory":"local-preview-restored"}`. Without this file, the default is `data/local-preview`. Credentials live in ignored `data/local-access.txt`.

## Recovery on 16 November 2026

The old preview failed with an invalid WAL checkpoint. Two API processes had been found running against the same directory; this is a likely cause, not a proven forensic conclusion.

Recovery was performed on a separate copy of `local-preview-backup-before-restart`. The original and backup were not modified by the recovery. A WAL-reset implementation was adapted to the verified PostgreSQL 18 control layout (control version 1800, WAL magic 0xD118, control CRC offset 292). The existing control checksum was valid. The recovered database was used only to produce a logical export; its files were not put directly into service.

All exported application rows were inserted into a freshly migrated `local-preview-restored` database with primary, unique, check and foreign-key constraints enabled. Every restored row was compared with the logical export, and close/reopen succeeded. Recovered business data: 2 accounts, 1 course, 1 enrollment, 1 document, 1 faculty profile and 1 department export. Other business tables were empty in the recoverable snapshot. This verifies consistency of the recovered snapshot, not the survival of any transactions absent from it.

The temporary AI-test database had no business records beyond its two test accounts. It was preserved separately. The local config now selects `local-preview-restored`. Both roles were verified through the running API, including access to the recovered course/document; teacher profile and export checks passed. Passwords were preserved.

The ignored `data/recovered-records.json` contains the logical export, including sensitive authentication data. `data/recovery-verification.json` records counts and validation. Do not upload either, the database directories or snapshots to GitHub.

## Prevention and backups

The standard local launcher reserves port 3001 before opening the database. A second standard launcher fails before touching PGlite. Never open the active directory through another script; the port guard cannot protect against arbitrary programs opening it directly.

Before accepting requests on startup, the launcher saves a consistent PGlite snapshot to `data/backups/<directory>/<timestamp>-<uuid>.tar.gz`, using a temporary file and rename. A test restores a snapshot into a separate PGlite instance and checks that it retains committed data independently of subsequent writes. These are startup restore points, not continuous backups; there is no automatic retention cleanup.

To restore a snapshot, stop the local API, keep the current directory intact, load the tarball with PGlite's `loadDataDir` option into a new empty directory using the compatible package and vector extension, verify rows and relations, close it, then select the new directory in `data/local-preview.json`. Do not overwrite a live database or automatically reset WAL on startup.
