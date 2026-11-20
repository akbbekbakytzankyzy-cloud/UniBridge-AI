# AI providers and models per role

Set server-only values in the repository root `.env` (it is ignored by Git):

```dotenv
AI_PROVIDER=ollama            # which option the chat preselects: ollama (Local) or openrouter (Cloud)
OPENROUTER_API_KEY=replace-with-your-key
```

Local Ollama and cloud OpenRouter are available side by side. In AI workspace each
user chooses **Local** or **Cloud** before a conversation starts. Restart the API after
changing `.env`. Keep keys out of `VITE_*`, desktop bundles, version control and logs.

## Which model does which job

All role models are defined in `apps/api/src/ai-models.js` and can be overridden in `.env`.
AI workspace → *AI roles and models* shows each role with its model and whether it is ready.

| Role | Job | Cloud (OpenRouter) | Local (Ollama) |
| --- | --- | --- | --- |
| Assistant | Chat: records, imports, app help; chooses its own tools | `OPENROUTER_MODEL_ASSISTANT` = `anthropic/claude-sonnet-5.5` | any installed chat model, chosen in the chat |
| Integrations | Map fields of an uploaded export (DU, KPI Excel) | `OPENROUTER_MODEL_INTEGRATION` = `anthropic/claude-opus-5.5` | — |
| Data reading | Accepted page imports → draft records | `OPENROUTER_MODEL_EXTRACTION` = `anthropic/claude-haiku-5.5` | `OLLAMA_MODEL_EXTRACTION` = `qwen3:4b` (used without cloud consent) |
| Profile autofill | Suggest profile values from confirmed data | — (personal data stays local) | `OLLAMA_MODEL_AUTOFILL` = `qwen3:4b`, fallback `qwen3:1.7b` |
| Semantic search | Text → vectors for search by meaning | — | `OLLAMA_MODEL_EMBEDDINGS` = `bge-m3` |

Install the local models once: `ollama pull qwen3:4b`, `ollama pull bge-m3`
(`qwen3:1.7b` on computers with less than 16 GB RAM). Check the OpenRouter model IDs
in the OpenRouter catalog before relying on them; replace an ID in `.env` if it differs.

`OPENROUTER_MODEL` from earlier versions is no longer read; use `OPENROUTER_MODEL_ASSISTANT`.

## Cloud requests

Chat requests go to `https://openrouter.ai/api/v1/chat/completions` with the assistant
model only. Responses are limited to 1024 tokens, one generation per process and
10 requests/minute/IP. No `temperature` is sent (Claude 5.5 models reject non-default
sampling values). Provider routing requests `data_collection: deny`; this is not a claim
of zero retention. No automatic retries or fallback to another model are used.

The UI shows which side answers. Sending saved profile fields, publications or imported
pages to the cloud requires the consent checkbox for that conversation; general questions
send only the conversation and system prompt. Configure a spending limit for the key in
OpenRouter. Multiple users of one server share its key and costs.

Background jobs (data reading, autofill, field mapping, embeddings) call models through
`apps/api/src/ai-client.js`, which asks for JSON matching a schema and validates the result
on the server.

Verified model reference: https://openrouter.ai/anthropic/claude-haiku-5.5
