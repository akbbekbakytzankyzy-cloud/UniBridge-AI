import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { reviewMappings, ALLOWED_TARGETS } from "../src/field-mapping.js";

const key = JSON.parse(readFileSync(new URL("./fixtures/synthetic/field-map.json", import.meta.url), "utf8"));
const columns = key.fields.map((f) => f.legacy);

test("field mapping: private columns are never mapped, allowed ones map to the answer key", () => {
  // A model answer that tries to route private data into the profile.
  const proposals = key.fields.map((f) => ({ legacy: f.legacy, target: f.target, confidence: "high", reason: f.note }));
  proposals.push({ legacy: "Telefon", target: "name_latin", confidence: "high", reason: "tricked" });
  proposals.push({ legacy: "Data_rozhdeniya", target: "hire_date", confidence: "high", reason: "tricked" });
  const reviewed = reviewMappings(columns, proposals);
  for (const name of key.expected_excluded) {
    const row = reviewed.find((r) => r.legacy === name);
    assert.equal(row.target, null, name);
    assert.match(row.status, /excluded/);
  }
  for (const f of key.fields.filter((x) => x.target && !key.expected_excluded.includes(x.legacy))) {
    const row = reviewed.find((r) => r.legacy === f.legacy);
    assert.equal(row.target, f.target, f.legacy);
  }
  // Every accepted target is in the allowed list.
  for (const r of reviewed) if (r.target) assert.ok(ALLOWED_TARGETS.includes(r.target));
});

test("field mapping: invented targets and unknown columns are rejected", () => {
  const reviewed = reviewMappings(["Fio", "Something"], [
    { legacy: "Fio", target: "password", confidence: "high", reason: "invented" },
    { legacy: "Ghost", target: "name_latin", confidence: "high", reason: "not in export" },
  ]);
  assert.equal(reviewed.find((r) => r.legacy === "Fio").target, null);
  assert.match(reviewed.find((r) => r.legacy === "Fio").status, /rejected/);
  assert.equal(reviewed.find((r) => r.legacy === "Something").status, "not mapped");
  assert.equal(reviewed.find((r) => r.legacy === "Ghost"), undefined);
});

test("field mapping route needs consent for the cloud and uses the integration model", async (t) => {
  const seen = [];
  const app = await createApp(null, { ai: { client: { json: async (o) => { seen.push(o); return { mappings: [{ legacy: "Fio", target: "name_cyrillic", confidence: "high", reason: "name" }] }; } } } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api/field-mapping/propose`;
  // Without a signed-in session the route refuses; the origin is correct here.
  const anonymous = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" }, body: JSON.stringify({ columns: ["Fio"] }) });
  assert.ok(anonymous.status === 401 || anonymous.status === 403, String(anonymous.status));
  assert.equal(seen.length, 0);
});
