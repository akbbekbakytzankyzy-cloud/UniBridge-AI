// One place that decides which model does which job. Each value can be
// overridden in the server's .env; nothing here is a secret.
//
// cloud  = OpenRouter (needs OPENROUTER_API_KEY on the server)
// local  = Ollama on this computer (http://127.0.0.1:11434)
export function roleModels(env = process.env) {
  return {
    assistant: {
      title: "Assistant",
      task: "Chat: answers from your records, imports and app help; picks its own tools",
      cloud: env.OPENROUTER_MODEL_ASSISTANT || "anthropic/claude-sonnet-5.5",
      local: "chosen in the chat",
    },
    integration: {
      title: "Integrations",
      task: "Maps fields of an uploaded export (DU, KPI Excel) to UniBridgeAI fields",
      cloud: env.OPENROUTER_MODEL_INTEGRATION || "anthropic/claude-opus-5.5",
    },
    extraction: {
      title: "Data reading",
      task: "Turns accepted page imports into draft publications, courses and projects",
      cloud: env.OPENROUTER_MODEL_EXTRACTION || "anthropic/claude-haiku-5.5",
      local: env.OLLAMA_MODEL_EXTRACTION || "qwen3:4b",
    },
    autofill: {
      title: "Profile autofill",
      task: "Suggests profile values from your confirmed data; runs only locally",
      local: env.OLLAMA_MODEL_AUTOFILL || "qwen3:4b",
      localFallback: env.OLLAMA_MODEL_AUTOFILL_FALLBACK || "qwen3:1.7b",
    },
    embeddings: {
      title: "Semantic search",
      task: "Turns texts into vectors so the assistant can search by meaning",
      local: env.OLLAMA_MODEL_EMBEDDINGS || "bge-m3",
    },
  };
}

// An Ollama tag such as "bge-m3:latest" satisfies a configured "bge-m3".
export function hasLocalModel(installed, wanted) {
  if (!wanted) return false;
  return installed.some(
    (m) => m.name === wanted || (!wanted.includes(":") && m.name === `${wanted}:latest`),
  );
}
