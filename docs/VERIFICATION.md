# Verification record

Verified locally on 2026-11-15 with Node.js 24.21.0:

- Dependency installation succeeded; npm reported zero known vulnerabilities at install time.
- Frontend production build passed with Vite 7.3.8.
- Three Node test cases passed, including a multi-step integration workflow.
- The full SQL schema, vector extension and HNSW index were created in disposable PGlite PostgreSQL with pgvector.
- Integration assertions covered invalid login, untrusted Origin rejection, anonymous denial, teacher course creation, student write denial, enrollment, keyword search, outsider/other-teacher isolation, logout revocation and session expiry.
- Password tests checked unique salts and incorrect-password rejection.

Limitations: PGlite is an embedded PostgreSQL test runtime, not the configured PostgreSQL 17 Docker service. Docker and Rust/Cargo were not available on this machine. Docker startup, pg wire connectivity, the migration CLI against that service, native builds, signing and macOS behavior are not verified. The frontend was compiled but not manually exercised in a browser. No real dataset, embedding model or external AI provider was connected.

CI is configured to install locked dependencies, run tests and build the web application. It has not run on GitHub yet because these changes have not been pushed.

## Faculty revision verification (2026-11-15)

- All five test cases passed, including the retained legacy workflow.
- New tests cover ordered migration replay, faculty/student isolation, profile revision conflicts, invalid dates and spoofed ownership rejection, DOI normalization/duplicates, publication ownership, immutable export snapshots, HR field exclusion from research exports and CSV formula neutralization.
- Updated React production build passed.
- Persistent local PGlite/pgvector preview started successfully. Browser checks passed for teacher login, profile save and HR form generation with download links. Only synthetic test values were entered.
- PostgreSQL Docker service remains unstarted: neither Docker Desktop nor WSL is installed. `tools/start-database.ps1` prepares startup after those prerequisites are installed. It has not been tested against a Docker engine here.
- Native Tauri builds and DU/my.du import compatibility remain unverified. The local preview is not a shared production database.

## University portal revision

All six automated tests and the Vite production build passed. Browser checks covered teacher course creation, student enrollment, publication of a synthetic material and student read-only access. The local database was migrated to version 003, retaining previous faculty records. See UNIVERSITY_PORTAL.md for current scope. Ollama is the chosen next AI runtime, but no model calls are active.
