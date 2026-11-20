# OpenRouter chat

Set server-only values in the repository root `.env`:

```dotenv
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=replace-with-your-key
OPENROUTER_MODEL=anthropic/claude-haiku-5.5
```

The local launcher loads this file; the PostgreSQL server launcher also loads it. Restart the API after changes. Keep keys out of `VITE_*`, desktop bundles, version control and logs. `.env` is ignored. Rotate any key shared in a chat and replace only its value locally.

AI workspace uses the authenticated API, which sends messages to `https://openrouter.ai/api/v1/chat/completions`. The configured model is the only allowed cloud model. Responses are limited to 1024 tokens, one generation per process and 10 requests/minute/IP. The provider routing requests `data_collection: deny`; this is not a claim of zero retention. No automatic retries or fallback to another model are used. The status endpoint reports configuration, not proof of successful inference or sufficient balance.

The UI identifies the cloud provider. Sending saved profile fields and publications additionally requires the records-consent checkbox for that conversation. General questions send only the conversation and system prompt. Configure a spending limit for the key in OpenRouter. Multiple users share the server key and its costs.

Set `AI_PROVIDER=ollama` and restart to use local inference again. OpenRouter credentials are never sent to Ollama. This change connects chat; it does not implement account discovery, external account login, web search or profile-autofill agents.

Verified model reference: https://openrouter.ai/anthropic/claude-haiku-5.5
