import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

const input = z
  .object({
    model: z.string().min(1).max(100),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(8000),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .refine(
    (v) =>
      v.messages.at(-1).role === "user" &&
      v.messages.every((m, i) => m.role === (i % 2 ? "assistant" : "user")),
    "Invalid conversation order",
  );
const system =
  "You are UniBridgeAI, a university assistant. Respond in the user's language. Help explain concepts, draft text and analyze text supplied in this conversation. You have NO access to university records, files, grades, deadlines or external tools. Never claim to have retrieved or changed records. Ask for relevant text when needed. Distinguish suggestions from verified facts and acknowledge uncertainty. Be concise.";

export function aiRouter({
  fetcher = fetch,
  baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  timeoutMs = 120000,
} = {}) {
  const url = new URL(baseUrl);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("Ollama must use a loopback HTTP address");
  const router = Router();
  let busy = false;
  async function models() {
    const response = await fetcher(new URL("/api/tags", url), {
      signal: AbortSignal.timeout(4000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Ollama unavailable");
    const data = await response.json();
    return (data.models || [])
      .filter(
        (m) => !m.remote_model && !m.remote_host && !m.name.includes(":cloud"),
      )
      .map((m) => ({ name: m.name, size: m.size }));
  }
  router.get("/status", async (req, res) => {
    try {
      res.json({ available: true, models: await models() });
    } catch {
      res.json({
        available: false,
        models: [],
        error: "Start Ollama on this computer, then refresh the connection.",
      });
    }
  });
  router.post(
    "/chat",
    rateLimit({
      windowMs: 60000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many requests. Try again in a minute." },
    }),
    async (req, res, next) => {
      let v;
      try {
        v = input.parse(req.body);
      } catch (e) {
        return next(e);
      }
      if (busy)
        return res.status(429).json({
          error: "The local model is busy. Please try again shortly.",
        });
      busy = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const disconnected = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on("close", disconnected);
      try {
        if (!(await models()).some((m) => m.name === v.model))
          return res.status(400).json({
            error:
              "Choose an installed local model and refresh the connection.",
          });
        const response = await fetcher(new URL("/api/chat", url), {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: v.model,
            stream: false,
            think: false,
            messages: [{ role: "system", content: system }, ...v.messages],
            options: {
              temperature: 0.2,
              num_predict: 350,
              num_ctx: 4096,
              num_gpu: 0,
            },
            keep_alive: "5m",
          }),
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => ({}));
          const crashed =
            /terminated|memory|allocate|runner|llama-server/i.test(
              failure.error || "",
            );
          const error = new Error("Generation failed");
          error.runnerCrashed = crashed;
          throw error;
        }
        const data = await response.json();
        if (
          !data.done ||
          typeof data.message?.content !== "string" ||
          !data.message.content.trim()
        )
          throw new Error("Empty response");
        res.json({
          message: { role: "assistant", content: data.message.content },
          model: v.model,
          truncated: data.done_reason === "length",
        });
      } catch (error) {
        if (!res.destroyed)
          res.status(controller.signal.aborted ? 504 : 503).json({
            error: controller.signal.aborted
              ? "The model timed out after two minutes. Try a shorter question."
              : error.runnerCrashed
                ? "Ollama is running, but the model process stopped. Close memory-heavy applications and retry, or choose qwen3:1.7b."
                : "Ollama could not answer. Check that it is running and the model is available.",
          });
      } finally {
        clearTimeout(timer);
        res.off("close", disconnected);
        busy = false;
      }
    },
  );
  return router;
}
