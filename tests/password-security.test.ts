import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../lib/errors";
import {
  PASSWORD_ALGORITHM,
  PASSWORD_ITERATIONS,
  WORKER_NATIVE_PBKDF2_MAX_ITERATIONS,
  hashPassword,
  normalizePassword,
  verifyPassword,
} from "../lib/password-security";

test("passwords use portable PBKDF2-SHA256 credentials and verify safely", async () => {
  const password = "A-strong-pass-2026!";
  const first = await hashPassword(password);
  const second = await hashPassword(password);

  assert.equal(first.algorithm, PASSWORD_ALGORITHM);
  assert.equal(first.iterations, PASSWORD_ITERATIONS);
  assert.ok(PASSWORD_ITERATIONS > WORKER_NATIVE_PBKDF2_MAX_ITERATIONS);
  assert.match(first.salt, /^[a-f0-9]{32}$/);
  assert.match(first.passwordHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.passwordHash, second.passwordHash);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("A-different-pass-2026!", first), false);
});

test("password input is bounded without trimming user secrets", () => {
  assert.equal(normalizePassword("pass-word"), "pass-word");
  assert.equal(normalizePassword("x".repeat(128)), "x".repeat(128));
  assert.throws(() => normalizePassword("short"), AppError);
  assert.throws(() => normalizePassword(`valid-length\npassword`), AppError);
  assert.throws(() => normalizePassword("x".repeat(129)), AppError);
});
