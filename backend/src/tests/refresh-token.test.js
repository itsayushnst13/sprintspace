import test from "node:test";
import assert from "node:assert/strict";
import { createOpaqueRefreshToken, hashRefreshToken } from "../security/refresh-token.js";

test("refresh tokens are opaque and have sufficient entropy", () => {
  const token = createOpaqueRefreshToken();
  assert.equal(token.length, 64);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
});

test("refresh token hashes are deterministic and one-way shaped", () => {
  const token = createOpaqueRefreshToken();
  const first = hashRefreshToken(token);
  const second = hashRefreshToken(token);
  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.notEqual(first, token);
});

test("different refresh tokens produce different hashes", () => {
  assert.notEqual(hashRefreshToken(createOpaqueRefreshToken()), hashRefreshToken(createOpaqueRefreshToken()));
});
