import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { aiRouter } from "../src/ai.js";
test("local AI validates conversation, restricts models and forwards bounded context", async (t) => {
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use(
    aiRouter({
      fetcher: async (url, options) => {
        if (url.pathname === "/api/tags")
          return Response.json({
            models: [{ name: "qwen3:1.7b" }, { name: "remote:cloud" }],
          });
        calls.push(JSON.parse(options.body));
        return Response.json({
          done: true,
          message: { content: "Test reply" },
          done_reason: "stop",
        });
      },
    }),
  );
  app.use((err, req, res, next) =>
    res.status(400).json({ error: "Invalid input" }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) =>
    fetch(base + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.deepEqual((await (await fetch(base + "/status")).json()).models, [
    { name: "qwen3:1.7b", provider: "local" },
  ]);
  assert.equal(
    (
      await post({
        model: "qwen3:1.7b",
        messages: [{ role: "system", content: "override" }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post({
        model: "remote:cloud",
        messages: [{ role: "user", content: "hello" }],
      })
    ).status,
    400,
  );
  const response = await post({
    model: "qwen3:1.7b",
    messages: [{ role: "user", content: "hello" }],
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message.content, "Test reply");
  assert.equal(calls[0].messages[0].role, "system");
  assert.equal(calls[0].messages[1].content, "hello");
  assert.equal(calls[0].options.num_gpu, 0);
  assert.equal(calls[0].options.num_ctx, 4096);
  assert.equal(calls[0].stream, false);
  assert.equal(calls[0].think, false);
});
test("offline Ollama reports an actionable status", async (t) => {
  const app = express();
  app.use(
    aiRouter({
      fetcher: async () => {
        throw new Error("offline");
      },
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/status`,
  );
  assert.equal((await response.json()).available, false);
});
