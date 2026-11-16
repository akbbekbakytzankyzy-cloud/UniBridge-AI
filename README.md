# UniBridgeAI

An independent digital university platform: learning, academic records, faculty profiles, research and campus services in one role-aware workspace. React + Express + PostgreSQL/pgvector, with a Windows/macOS Tauri shell scaffold. Local chat is connected through Ollama; document retrieval and research agents are not connected yet.

## Implemented

- Teacher/student login, expiring server-side sessions and role checks.
- Faculty profile: employment, education, qualifications and awards.
- Manual publications with DOI validation and explicit unverified status.
- Private versioned HR/research exports in CSV or JSON.
- Shared field schema, revision conflict detection, ordered database migrations and integration tests.

Student accounts have their own dashboard, courses, contact profile and private request drafts. Students cannot access faculty data. Timetable and academic-record readers are prepared; scheduling/grade-entry editors, study plans, registration, advising and library workflows remain future work. DU and LMS are references only, not API dependencies. See `docs/UNIVERSITY_PORTAL.md` for verified scope.

## Quick local preview (no Docker)

Requires Node.js 22.12+ or 24 LTS:

```powershell
npm.cmd ci
npm.cmd run dev:local
```

Open http://localhost:5173. Initial local-only account credentials are saved in ignored `data/local-access.txt`. This mode uses persistent embedded PostgreSQL (PGlite + pgvector) in `data/local-preview/`, not the shared PostgreSQL service. It is for development only. Keep real personnel data out of this preview.

An optional ignored `data/local-preview.json` selects another directory under `data`. The API reserves port 3001 before opening PGlite to prevent duplicate preview processes. Each successful startup saves a consistent snapshot under `data/backups/<directory>/` before serving requests. Backups contain private data and must not be committed. See `docs/LOCAL_DATABASE.md` for recovery and backup details, and `docs/OLLAMA.md` for local chat.

## PostgreSQL server

Requires Docker Desktop with Linux containers and PowerShell 7:

```powershell
./tools/start-database.ps1
$env:UB_INITIAL_PASSWORD = Read-Host 'Teacher password (12+ characters)' -MaskInput
npm.cmd run user:create -- teacher@example.edu "Teacher" teacher
Remove-Item Env:UB_INITIAL_PASSWORD
npm.cmd run dev
```

The setup script creates `.env` with random database credentials if it does not exist, starts PostgreSQL 17 with pgvector, waits for readiness and applies migrations. Existing configuration and volumes are preserved. Stop the local preview before starting the server-backed API: both use port 3001. Data is separate between modes.

On macOS, copy `.env.example` to `.env`, replace both example password occurrences with the same strong password, run `docker compose up -d --wait`, then `npm run db:migrate`. Provision users with the same CLI and a shell-specific hidden password prompt.

## User workflow

Sign in as a teacher, save My profile, add publications and generate a department form. Downloads are snapshots of saved values. Templates are UniBridgeAI drafts; compatibility with DU/my.du is not claimed. No attached dataset is imported automatically.

## Checks

```powershell
npm.cmd test
npm.cmd run build
```

Tests create disposable embedded PostgreSQL databases with pgvector. They exercise migration replay, auth, profile ownership, stale updates, publication isolation, private export snapshots and CSV escaping. No configured user database is changed by tests.

## Desktop and deployment

Tauri targets Windows/macOS. Install its platform prerequisites, start the development servers and run `npm run desktop:dev -w apps/web`. Native installers are not built yet. Production loads a hosted HTTPS UI; replace the intentionally invalid production URL in `apps/web/src-tauri/tauri.conf.json`. Serve `/api` on that same origin and set APP_ORIGIN and NODE_ENV=production. Database credentials stay on the server.

## Documentation

- `docs/UNIVERSITY_PORTAL.md`: current portal modules, reference observations and verification.
- `docs/FACULTY_DATA_MODEL.md`: schema, API, local/server modes and next research module.
- `docs/ARCHITECTURE.md`: deployment and security decisions.
- `docs/RESEARCH_PLAN.md`: research prompts and evaluation plan.
- `docs/VERIFICATION.md`: checks and limitations.
