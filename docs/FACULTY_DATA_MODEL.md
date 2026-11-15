# Faculty data model

The faculty profile, rather than a course catalogue, is now the primary workspace. This follows the supplied project note and example faculty card. The note describes historical decisions; it is not executable configuration. The sample CSV is demonstrative, not a verified university dataset. No personal records have been imported.

## Tables

- `users`, `sessions`: identity and teacher/student roles.
- `faculty_profiles`: one private profile per account; typed application-validated JSONB for personal/employment details and repeated education, training and awards. Revision numbers reject stale writes.
- `publications`: owner, title, year, normalized DOI, venue, authors, source and verification status. Manual records start unverified; a client cannot assign source or confirmation status.
- `department_exports`: immutable, owner-only snapshots with versioned templates. HR includes profile, education, training and awards; research includes publications and account identity, excluding private HR fields.
- Legacy course/material tables are retained without deletion. Their API remains backwards compatible; the primary UI now presents the faculty workspace.

`schema/profile_schema.json` defines field labels, required fields, types, collections and template sections. The API derives validation from it; the frontend fetches it to render forms. Repeated records use JSONB for this initial bounded profile editor; promote them to separate relational tables when reporting, approvals or independent record updates require it.

## API

All `/api/faculty/*` endpoints require teacher authentication and scope queries to the authenticated account. There is no arbitrary profile-owner parameter.

| Method     | Route                                         | Purpose                                   |
| ---------- | --------------------------------------------- | ----------------------------------------- |
| GET        | /api/faculty/schema                           | Field and template definitions            |
| GET / PUT  | /api/faculty/profile                          | Read / save own profile, revision checked |
| GET / POST | /api/faculty/publications                     | List / add own publication                |
| DELETE     | /api/faculty/publications/:id                 | Remove own publication                    |
| GET / POST | /api/faculty/exports                          | List / generate saved snapshot            |
| GET        | /api/faculty/exports/:id/download?format=csv  | Download own CSV snapshot                 |
| GET        | /api/faculty/exports/:id/download?format=json | Download own JSON snapshot                |

Exports are UniBridgeAI draft formats, not validated DU/my.du import formats. CSV fields are quoted and formula-leading values are neutralized. A snapshot does not update when its source profile changes; generate a new one. Department staff sharing, approval routing, uploads, import adapters and retention/deletion workflows are not yet implemented. Certificate fields contain references only; no attached files are uploaded.

## Storage environments

Production and shared development: PostgreSQL 17 + pgvector through the `pg` driver and Docker Compose. Run `tools/start-database.ps1` in PowerShell 7; it generates a random local database password when `.env` does not exist and applies ordered migrations transactionally. Existing `.env` and database volumes are preserved.

Local UI preview: `npm run dev:local` uses persistent PGlite PostgreSQL with pgvector under ignored `data/local-preview/`. It creates separate local-only teacher/student accounts and writes their random initial passwords to ignored `data/local-access.txt`. This is not the Docker server and is not production mode. Do not use real personnel data in the preview. Do not run both API modes on port 3001 at once. Preview data is not automatically copied to the Docker database.

## Research module

Next: OpenAlex publication-to-employee matching using author IDs, rules, a single local-model prompt and analyst/reviewer agents. Confirm the proposed labeled pairs and publication counts against actual datasets; figures in the historical project note are not independently verified. Keep names and gold labels private. Evaluate F1, paired bootstrap intervals, latency and calls per pair. Do not embed HR fields or send them to external AI providers. pgvector is installed but no semantic/AI search is active.
