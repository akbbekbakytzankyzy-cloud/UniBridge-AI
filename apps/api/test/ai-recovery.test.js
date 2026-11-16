import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { aiRouter } from "../src/ai.js";
test("runner crash is actionable and releases the generation slot for retry", async (t) => {
  let attempts = 0;
  const app = express();
  app.use(express.json());
  app.use(
    aiRouter({
      fetcher: async (url) => {
        if (url.pathname === "/api/tags")
          return Response.json({ models: [{ name: "llama3.2:latest" }] });
        if (++attempts === 1)
          return Response.json(
            {
              error:
                "llama-server process has terminated: exit status 0xe06d7363",
            },
            { status: 500 },
          );
        return Response.json({
          done: true,
          message: { content: "Recovered" },
          done_reason: "stop",
        });
      },
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const send = () =>
    fetch(`http://127.0.0.1:${server.address().port}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2:latest",
        messages: [{ role: "user", content: "hello" }],
      }),
    });
  const failed = await send();
  assert.equal(failed.status, 503);
  assert.match((await failed.json()).error, /model process stopped/);
  const retry = await send();
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).message.content, "Recovered");
});
