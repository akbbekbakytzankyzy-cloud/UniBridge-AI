# Local Ollama chat

The Assistant panel now calls the authenticated Express API, which calls local Ollama:

React :5173 -> POST /api/ai/chat on :3001 -> http://127.0.0.1:11434/api/chat -> local model.

The course Setup Runbook and W2 Lab Guide use local Ollama, /api/tags and qwen3:1.7b. This integration follows that runtime arrangement. Jupyter and uv are for course notebooks, not required for this Node application. The supplied doctor_v2.py is an MHTML page, not an executable diagnostic, and was not run.

## Use

Start the Ollama application. Install the course model with `ollama pull qwen3:1.7b` if needed. Check `curl.exe http://127.0.0.1:11434/api/tags`. Start UniBridgeAI with `npm run dev:local`, sign in, open the Assistant panel (bottom-left button), and select qwen3:1.7b. The selector prefers this model when installed. Refresh connection after adding a model. Model changes require a new chat.

## Scope

Both signed-in roles can chat. Only the supplied messages and a fixed English system instruction are sent. No database records, uploaded documents, university APIs, vector retrieval or agents are connected. The assistant is told to acknowledge this and respond in the user's language. It cannot update records. History stays in page memory; leaving the section clears it. Five previous complete turns are included in each request. No prompts or replies are persisted by the application.

## Requests

GET /api/ai/status checks installed local models. POST /api/ai/chat validates message roles and order, rejects client system messages, and checks the model against installed non-cloud models. Ollama receives system/user/assistant messages, stream=false, think=false, temperature=0.2, num_predict=350, num_ctx=4096 and num_gpu=0 (CPU compatibility mode). This is a general chat preview, not the Week 2 structured classification experiment. JSON Schema outputs and an evaluation harness are future work.

A local runner crash was reproduced with the previous settings; CPU mode with a reduced context succeeded. The status endpoint confirms server reachability, not that inference has succeeded.

The API uses the existing authenticated session and origin protection, limits requests to 10/minute/IP and one active local generation per process, and stops a request after two minutes. The browser renders replies as plain text. Network failures and truncated answers are reported. For a larger shared deployment a proper job queue is required.

OLLAMA_BASE_URL can be supplied in the server process environment; only HTTP loopback hosts are accepted. The default needs no configuration. The local preview does not load .env automatically.

Official API reference: https://docs.ollama.com/api/chat and https://docs.ollama.com/api/tags.

## Local preview recovery

The preview reserves port 3001 before opening PGlite, preventing a second standard API process from opening the same database. Do not open that directory through a separate script while the API is running.

An optional, Git-ignored `data/local-preview.json` selects a database directory beneath `data`, for example `{"directory":"local-preview-ai-test"}`. The default remains `local-preview`. This is an explicit development setting, not automatic corruption recovery.

On this machine the original preview has an invalid WAL checkpoint. Both the original and `local-preview-backup-before-restart` were retained. A separate `local-preview-ai-test` database has the existing test accounts but does not contain the old university records. Recovery of those records remains pending.

Recovery completed on 16 November: the active local config now selects `local-preview-restored`. Recovered records were imported into a clean schema, compared row by row and verified through both authenticated roles. The earlier AI-test database is retained but inactive. See LOCAL_DATABASE.md for details and backup limitations.

## Answers from your own records (added 16 November 2026)

Teachers can tick **Use my profile and publications** in the Assistant panel. For each question the API reads the signed-in teacher's own faculty profile and publication list from the database and sends them to the local model as a bounded RECORDS block (about 14,000 characters, `num_ctx` 8192, `temperature` 0, fixed `seed`). Nothing is fine-tuned or cached in the model; the database is the only source of truth, so answers change as soon as records change.

- Included: names, department, position, degree, academic title, ORCID/OpenAlex IDs, education (without diploma numbers), training (without certificate references), awards, and publications with year, venue, DOI, authors, source and verification status.
- Excluded: phone, hire date, employment fraction, diploma and certificate references.
- Precomputed counts (total, by year, with DOI, confirmed) are included so the small model does not have to count.
- The model is told to cite record IDs such as `[P3]` and to say when the profile does not contain the answer. Student accounts cannot use this mode.

## Importing publications from ORCID and OpenAlex

Save an ORCID in **My profile**, then press **Import publications** on the Publications page. The API calls the public ORCID API (`pub.orcid.org`) and OpenAlex (`api.openalex.org`) from the computer running UniBridgeAI; no key is required. Records are matched by DOI, then by source ID, then by normalised title and year. New rows are added as `unverified`; existing rows, including confirmed ones, are never changed. Repeating the import is safe.

Google Scholar, ResearchGate and LinkedIn have no open API and their terms prohibit automated collection, so they are not imported. Add missing items manually. Private documents (KPI folders, IPP reports) are not imported and must not be committed to this public repository.
