// Shared model calls for background AI jobs (data reading, autofill, field
// mapping, embeddings). The chat route keeps its own request code.
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

export class AIUnavailableError extends Error {}

export function createAIClient({
  fetcher = fetch,
  apiKey = process.env.OPENROUTER_API_KEY || "",
  ollamaUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  timeoutMs = 120000,
} = {}) {
  const local = new URL(ollamaUrl);
  if (
    local.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(local.hostname)
  )
    throw new Error("Ollama must use a loopback HTTP address");

  async function localModels() {
    const r = await fetcher(new URL("/api/tags", local), {
      signal: AbortSignal.timeout(4000),
      redirect: "error",
    });
    if (!r.ok) throw new AIUnavailableError("Ollama unavailable");
    const data = await r.json();
    return (data.models || [])
      .filter((m) => !m.remote_model && !m.remote_host && !m.name.includes(":cloud"))
      .map((m) => ({ name: m.name, size: m.size }));
  }

  // Returns the parsed JSON object the model produced for `schema`.
  async function json({ provider, model, system, user, schema, maxTokens = 2048 }) {
    const messages = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    let text;
    if (provider === "cloud") {
      if (!apiKey) throw new AIUnavailableError("OpenRouter key is not configured");
      const r = await fetcher(OPENROUTER, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          max_tokens: maxTokens,
          response_format: {
            type: "json_schema",
            json_schema: { name: "result", strict: true, schema },
          },
          provider: { data_collection: "deny", require_parameters: true },
        }),
      });
      if (!r.ok) throw new AIUnavailableError(`OpenRouter returned ${r.status}`);
      const raw = await r.json();
      text = raw.choices?.[0]?.message?.content;
    } else {
      const r = await fetcher(new URL("/api/chat", local), {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          messages,
          format: schema,
          options: { temperature: 0, seed: 42, num_ctx: 8192, num_gpu: 0 },
          keep_alive: "5m",
        }),
      });
      if (!r.ok) throw new AIUnavailableError("Ollama could not answer");
      const raw = await r.json();
      text = raw.message?.content;
    }
    if (typeof text !== "string" || !text.trim())
      throw new AIUnavailableError("The model returned an empty answer");
    const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new AIUnavailableError("The model did not return valid JSON");
    }
  }

  async function embed(model, texts) {
    const r = await fetcher(new URL("/api/embed", local), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!r.ok) throw new AIUnavailableError("Ollama embeddings unavailable");
    const data = await r.json();
    if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length)
      throw new AIUnavailableError("Unexpected embeddings response");
    return data.embeddings;
  }

  return { cloudConfigured: Boolean(apiKey), localModels, json, embed };
}
