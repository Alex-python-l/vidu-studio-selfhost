import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_SESSION_MAX_AGE_SECONDS,
  AuthConfigurationError,
  assertSameOrigin,
  clearedSessionCookie,
  newSessionToken,
  registrationCodeDigest,
  requireCodeRuntimeConfig,
  requireOtpRuntimeConfig,
  sessionCookie,
  sessionTokenDigest,
  sessionTokenFromCookieHeader,
} from "../lib/session-security";
import { AppError, publicErrorDetails } from "../lib/errors";

test("reports every missing email authentication setting", () => {
  assert.throws(
    () => requireOtpRuntimeConfig({}),
    (error: unknown) => {
      assert.ok(error instanceof AuthConfigurationError);
      assert.equal(error.status, 503);
      assert.deepEqual(error.missing, [
        "SUPABASE_URL",
        "SUPABASE_PUBLISHABLE_KEY",
        "TURNSTILE_SECRET_KEY",
        "SESSION_TOKEN_PEPPER",
        "ABUSE_HASH_SECRET",
      ]);
      return true;
    },
  );
});

test("registration codes are case-insensitive HMAC digests with bounded config", async () => {
  assert.deepEqual(
    requireCodeRuntimeConfig({
      sessionTokenPepper: "pepper",
      abuseHashSecret: "abuse",
    }),
    {
      sessionTokenPepper: "pepper",
      abuseHashSecret: "abuse",
    },
  );
  const upper = await registrationCodeDigest("VIDU-START", "pepper");
  const lower = await registrationCodeDigest("vidu-start", "pepper");
  assert.equal(upper, lower);
  assert.match(upper, /^[a-f0-9]{64}$/);
  await assert.rejects(
    registrationCodeDigest("short", "pepper"),
    AppError,
  );
});

test("requires an exact same-origin Origin for cookie mutation requests", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("https://studio.example/api/auth/logout", {
        headers: { Origin: "https://studio.example" },
      }),
    ),
  );
  for (const origin of [
    "",
    "https://evil.example",
    "https://studio.example.evil.test",
  ]) {
    assert.throws(
      () =>
        assertSameOrigin(
          new Request("https://studio.example/api/auth/logout", {
            headers: origin ? { Origin: origin } : {},
          }),
        ),
      (error: unknown) =>
        error instanceof Error &&
        "status" in error &&
        error.status === 403,
    );
  }
});

test("accepts the exact public origin behind a trusted reverse proxy", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("http://127.0.0.1:3100/api/auth/password", {
        headers: {
          Origin: "https://studio.example",
          "x-forwarded-host": "studio.example",
          "x-forwarded-proto": "https",
        },
      }),
    ),
  );

  assert.throws(
    () =>
      assertSameOrigin(
        new Request("http://127.0.0.1:3100/api/auth/password", {
          headers: {
            Origin: "https://evil.example",
            "x-forwarded-host": "studio.example",
            "x-forwarded-proto": "https",
          },
        }),
      ),
    (error: unknown) =>
      error instanceof Error && "status" in error && error.status === 403,
  );
});

test("creates opaque sessions and stores only a keyed digest", async () => {
  const first = newSessionToken();
  const second = newSessionToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);

  const digest = await sessionTokenDigest(first, "pepper-one");
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, first);
  assert.notEqual(
    digest,
    await sessionTokenDigest(first, "pepper-two"),
  );
  assert.notEqual(
    digest,
    await sessionTokenDigest(second, "pepper-one"),
  );
});

test("session cookie is secure and forged cookie values are rejected", () => {
  const token = newSessionToken();
  const header = sessionCookie(token);
  assert.match(header, new RegExp(`Max-Age=${APP_SESSION_MAX_AGE_SECONDS}`));
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=Lax/);
  assert.equal(
    sessionTokenFromCookieHeader(`theme=dark; ${header.split(";", 1)[0]}`),
    token,
  );
  assert.equal(
    sessionTokenFromCookieHeader("vidu-session=../../forged"),
    null,
  );

  const cleared = clearedSessionCookie();
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /HttpOnly/);
});

test("auth errors expose expected messages but hide internal failures", async () => {
  assert.deepEqual(publicErrorDetails(new AppError("请求无效。", 400)), {
    status: 400,
    message: "请求无效。",
  });
  assert.deepEqual(
    publicErrorDetails(
      new Error("D1 constraint auth_identities_provider_subject_unique"),
    ),
    {
      status: 500,
      message: "服务暂时不可用，请稍后重试。",
    },
  );
});
