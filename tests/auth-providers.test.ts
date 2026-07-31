import assert from "node:assert/strict";
import test from "node:test";
import {
  requestSupabaseEmailOtp,
  SupabaseAuthError,
  verifySupabaseEmailOtp,
} from "../lib/supabase-auth";
import { TurnstileError, verifyTurnstile } from "../lib/turnstile";

const config = {
  url: "https://project.supabase.co",
  publishableKey: "public-test-key",
};

test("requests Supabase OTP with upstream CAPTCHA and no invite token", async () => {
  let requestUrl = "";
  let requestBody = "";
  await requestSupabaseEmailOtp(
    { email: "person@example.com", captchaToken: "turnstile-proof" },
    {
      config,
      fetchImpl: async (input, init) => {
        requestUrl = String(input);
        requestBody = String(init?.body);
        return new Response(null, { status: 200 });
      },
    },
  );
  assert.equal(requestUrl, "https://project.supabase.co/auth/v1/otp");
  assert.deepEqual(JSON.parse(requestBody), {
    email: "person@example.com",
    create_user: true,
    gotrue_meta_security: {
      captcha_token: "turnstile-proof",
    },
  });
  assert.doesNotMatch(requestBody, /invite/i);
});

test("accepts only a confirmed Supabase email response", async () => {
  const verified = await verifySupabaseEmailOtp(
    { email: "person@example.com", code: "123456" },
    {
      config,
      fetchImpl: async () =>
        Response.json({
          access_token: "must-not-be-returned",
          user: {
            id: "provider-subject",
            email: "PERSON@example.com",
            email_confirmed_at: "2026-07-27T00:00:00Z",
          },
        }),
    },
  );
  assert.deepEqual(verified, {
    subject: "provider-subject",
    email: "person@example.com",
  });

  await assert.rejects(
    verifySupabaseEmailOtp(
      { email: "person@example.com", code: "123456" },
      {
        config,
        fetchImpl: async () =>
          Response.json({
            user: { id: "provider-subject", email: "person@example.com" },
          }),
      },
    ),
    (error: unknown) =>
      error instanceof SupabaseAuthError &&
      error.code === "invalid_response" &&
      !error.message.includes("provider-subject"),
  );
});

test("maps Supabase provider errors and timeouts to bounded failures", async () => {
  await assert.rejects(
    verifySupabaseEmailOtp(
      { email: "person@example.com", code: "000000" },
      {
        config,
        fetchImpl: async () =>
          new Response("sensitive provider response", { status: 400 }),
      },
    ),
    (error: unknown) =>
      error instanceof SupabaseAuthError &&
      error.code === "invalid_code" &&
      !error.message.includes("sensitive"),
  );

  await assert.rejects(
    requestSupabaseEmailOtp(
      { email: "person@example.com", captchaToken: "turnstile-proof" },
      {
        config,
        fetchImpl: async () => {
          throw new DOMException("provider detail", "TimeoutError");
        },
      },
    ),
    (error: unknown) =>
      error instanceof SupabaseAuthError &&
      error.code === "timeout" &&
      error.status === 504,
  );
});

test("rejects non-HTTPS Supabase URLs before making a request", async () => {
  let called = false;
  await assert.rejects(
    requestSupabaseEmailOtp(
      { email: "person@example.com", captchaToken: "turnstile-proof" },
      {
        config: { ...config, url: "http://project.supabase.co" },
        fetchImpl: async () => {
          called = true;
          return new Response();
        },
      },
    ),
    (error: unknown) =>
      error instanceof SupabaseAuthError &&
      error.code === "configuration" &&
      error.status === 503,
  );
  assert.equal(called, false);
});

test("Turnstile supports fetch injection without a production bypass", async () => {
  await verifyTurnstile(
    {
      token: "official-test-token",
      secret: "official-test-secret",
      idempotencyKey: "request-id",
    },
    {
      fetchImpl: async (_input, init) => {
        assert.ok(init?.body instanceof FormData);
        assert.equal(init.body.get("response"), "official-test-token");
        return Response.json({ success: true });
      },
    },
  );

  await assert.rejects(
    verifyTurnstile(
      {
        token: "bad-token",
        secret: "official-test-secret",
        idempotencyKey: "request-id",
      },
      { fetchImpl: async () => Response.json({ success: false }) },
    ),
    (error: unknown) =>
      error instanceof TurnstileError &&
      error.code === "invalid" &&
      error.status === 400,
  );
});
