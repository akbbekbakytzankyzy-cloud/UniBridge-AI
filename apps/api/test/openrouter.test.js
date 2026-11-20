import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { aiRouter } from "../src/ai.js";
test("OpenRouter restricts model, requires records consent, bounds output and hides credentials", async (t) => {
  let calls = 0,
    failure = false;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: "test", role: "teacher" };
    next();
  });
  app.use(
    aiRouter({
      provider: "openrouter",
      apiKey: "test-secret",
      cloudModel: "anthropic/claude-haiku-5.5",
      localEnabled: false,
      pool: { query: async () => ({ rows: [] }) },
      fetcher: async (url, opts) => {
        calls++;
        assert.equal(url.href, "https://openrouter.ai/api/v1/chat/completions");
        assert.equal(opts.headers.Authorization, "Bearer test-secret");
        assert.equal(opts.redirect, "error");
        const body = JSON.parse(opts.body);
        assert.equal(body.max_tokens, 1024);
        assert.equal(body.model, "anthropic/claude-haiku-5.5");
        assert.equal(body.provider.data_collection, "deny");
        assert.equal(body.temperature, undefined);
        if (failure)
          return Response.json(
            { error: { message: "test-secret" } },
            { status: 402 },
          );
        return Response.json({
          choices: [
            { message: { content: "Cloud reply" }, finish_reason: "stop" },
          ],
        });
      },
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const status = await (await fetch(base + "/status")).text();
  assert.ok(!status.includes("test-secret"));
  assert.match(status, /configured/);
  const send = (body) =>
    fetch(base + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-5.5",
        messages: [{ role: "user", content: "Hello" }],
        ...body,
      }),
    });
  assert.equal((await send({ model: "expensive/other" })).status, 400);
  assert.equal((await send({ grounding: "my_records" })).status, 400);
  assert.equal(calls, 0);
  const response = await send({});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message.content, "Cloud reply");
  assert.equal(
    (await send({ grounding: "my_records", cloudConsent: true })).status,
    200,
  );
  failure = true;
  const error = await send({});
  assert.equal(error.status, 503);
  const text = await error.text();
  assert.match(text, /credits/);
  assert.ok(!text.includes("test-secret"));
});

test("imported AI context requires consent and an accepted source belonging to this user", async (t) => {
  let queries = 0, calls = 0, found = false;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { id: "owner", role: "student" }; next(); });
  app.use(aiRouter({ provider: "openrouter", apiKey: "test-key", cloudModel: "test/model", localEnabled: false,
    pool: { query: async (sql, args) => {
      queries++;
      assert.match(sql, /user_id=\$2 AND status='accepted'/);
      assert.equal(args[1], "owner");
      return { rows: found ? [{source_url:"https://du.astanait.edu.kz/profile", content:"Synthetic education",created_at:"2026-01-01"}] : [] };
    }},
    fetcher: async (url, opts) => {
      calls++;
      const prompt = JSON.parse(opts.body).messages[0].content;
      assert.match(prompt, /untrusted evidence/);
      assert.match(prompt, /Synthetic education/);
      return Response.json({choices:[{message:{content:"Education [S1]"},finish_reason:"stop"}]});
    },
  }));
  const server = app.listen(0,"127.0.0.1");
  await new Promise(r => server.once("listening",r));
  t.after(() => new Promise(r => server.close(r)));
  const send = consent => fetch(`http://127.0.0.1:${server.address().port}/chat`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"test/model",sourceId:"10000000-0000-4000-8000-000000000001",cloudConsent:consent,messages:[{role:"user",content:"Summarise"}]})});
  assert.equal((await send(false)).status,400);
  assert.equal(queries,0);
  assert.equal((await send(true)).status,404);
  assert.equal(calls,0);
  found = true;
  assert.equal((await send(true)).status,200);
  assert.equal(calls,1);
});

test("local and cloud chat models are offered together and roles report readiness", async (t) => {
  const hits = [];
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { id: "u", role: "teacher" }; next(); });
  app.use(aiRouter({
    provider: "ollama",
    apiKey: "k",
    fetcher: async (url, opts) => {
      hits.push(url.href);
      if (url.pathname === "/api/tags")
        return Response.json({ models: [{ name: "qwen3:4b" }, { name: "bge-m3:latest" }] });
      if (url.hostname === "openrouter.ai")
        return Response.json({ choices: [{ message: { content: "cloud" }, finish_reason: "stop" }] });
      assert.equal(JSON.parse(opts.body).model, "qwen3:4b");
      return Response.json({ done: true, message: { content: "local" }, done_reason: "stop" });
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const status = await (await fetch(base + "/status")).json();
  assert.equal(status.defaultProvider, "local");
  assert.deepEqual(status.models.map((m) => [m.name, m.provider]), [
    ["qwen3:4b", "local"], ["bge-m3:latest", "local"], ["anthropic/claude-sonnet-5.5", "cloud"],
  ]);
  const role = (id) => status.roles.find((r) => r.id === id);
  assert.equal(role("assistant").cloud, "anthropic/claude-sonnet-5.5");
  assert.equal(role("integration").cloud, "anthropic/claude-opus-5.5");
  assert.equal(role("extraction").cloud, "anthropic/claude-haiku-5.5");
  assert.equal(role("autofill").local, "qwen3:4b");
  assert.equal(role("autofill").cloud, null);
  assert.equal(role("autofill").localReady, true);
  assert.equal(role("embeddings").localReady, true);
  assert.equal(role("integration").cloudReady, true);
  const ask = (model) => fetch(base + "/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "Hi" }] }),
  }).then((r) => r.json());
  const local = await ask("qwen3:4b");
  assert.deepEqual([local.message.content, local.provider], ["local", "ollama"]);
  const cloud = await ask("anthropic/claude-sonnet-5.5");
  assert.deepEqual([cloud.message.content, cloud.provider], ["cloud", "openrouter"]);
  assert.ok(hits.some((h) => h.startsWith("https://openrouter.ai/")));
});
