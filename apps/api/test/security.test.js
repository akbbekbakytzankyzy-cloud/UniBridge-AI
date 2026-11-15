import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  newToken,
  readSession,
} from "../src/security.js";
test("passwords use unique salts and reject incorrect passwords", async () => {
  const first = await hashPassword("long-passphrase-123");
  assert.notEqual(first, await hashPassword("long-passphrase-123"));
  assert.equal(await verifyPassword("long-passphrase-123", first), true);
  assert.equal(await verifyPassword("incorrect", first), false);
});
test("session tokens are random and extracted exactly", () => {
  const token = newToken();
  assert.equal(token.length, 64);
  assert.notEqual(token, newToken());
  assert.equal(readSession(`other=1; ub_session=${token}`), token);
  assert.equal(readSession("fake_ub_session=bad"), "");
});
