import assert from "node:assert/strict";
import test from "node:test";
import {
  AdminRequestError,
  cleanInvitationId,
  parseAdminInvitation,
  parseAdminInvitationPatch,
  parseAdminPassword,
  parseAdminProviderKeyCreate,
  parseAdminProviderKeyDelete,
  parseAdminProviderKeyActivation,
  parseAdminUserPatch,
  parseAdminUsersQuery,
  parseCreditAdjustment,
  requestIdFrom,
  requireSameOrigin,
} from "../lib/admin-data";

function jsonRequest(
  path: string,
  body: unknown,
  origin = "https://studio.example",
) {
  return new Request(`https://studio.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify(body),
  });
}

test("admin user query trims bounded query and cursor", () => {
  const result = parseAdminUsersQuery(
    new URL("https://studio.example/api/admin/users?query=%20alice%20&cursor=next"),
  );
  assert.deepEqual(result, {
    query: "alice",
    cursor: "next",
    limit: 20,
  });
  assert.throws(
    () =>
      parseAdminUsersQuery(
        new URL(
          `https://studio.example/api/admin/users?query=${"x".repeat(121)}`,
        ),
      ),
    AdminRequestError,
  );
});

test("admin writes require an exact same origin", () => {
  requireSameOrigin(
    jsonRequest("/api/admin/invitations", {}, "https://studio.example"),
  );
  assert.throws(
    () =>
      requireSameOrigin(
        jsonRequest("/api/admin/invitations", {}, "https://evil.example"),
      ),
    (error: unknown) =>
      error instanceof AdminRequestError && error.status === 403,
  );
  assert.throws(
    () =>
      requireSameOrigin(
        new Request("https://studio.example/api/admin/invitations", {
          method: "POST",
        }),
      ),
    AdminRequestError,
  );
});

test("access code input unifies email-link and manual redemption settings", async () => {
  const parsed = await parseAdminInvitation(
    jsonRequest("/api/admin/invitations", {
      email: " Invited@Example.com ",
      code: " vidu-start ",
      allowManualCode: true,
    }),
  );
  assert.deepEqual(parsed, {
    email: "invited@example.com",
    code: "VIDU-START",
    initialCredits: 0,
    initialConcurrencyLimit: 1,
    initialDailyCreditLimit: 500,
    expiresInDays: 7,
    maxUses: 1,
    allowEmailLink: true,
    allowManualCode: true,
  });

  await assert.rejects(
    parseAdminInvitation(
      jsonRequest("/api/admin/invitations", {
        email: "invalid",
        code: "short",
        initialCredits: -1,
      }),
    ),
    AdminRequestError,
  );
  await assert.rejects(
    parseAdminInvitation(
      jsonRequest("/api/admin/invitations", {
        code: "VIDU-SHARED",
        allowEmailLink: false,
        allowManualCode: false,
      }),
    ),
    AdminRequestError,
  );
});

test("access code updates validate channels, expiry, and bounded settings", async () => {
  const parsed = await parseAdminInvitationPatch(
    jsonRequest("/api/admin/invitations/invite-1", {
      email: " Updated@Example.com ",
      initialCredits: 50,
      initialConcurrencyLimit: 4,
      initialDailyCreditLimit: 900,
      maxUses: 8,
      expiresAt: "2026-08-15T08:30:00.000Z",
      allowEmailLink: true,
      allowManualCode: false,
      revoked: true,
    }),
  );
  assert.deepEqual(parsed, {
    email: "updated@example.com",
    initialCredits: 50,
    initialConcurrencyLimit: 4,
    initialDailyCreditLimit: 900,
    maxUses: 8,
    expiresAt: "2026-08-15T08:30:00.000Z",
    allowEmailLink: true,
    allowManualCode: false,
    revoked: true,
  });
  assert.equal(cleanInvitationId("invite-1"), "invite-1");

  await assert.rejects(
    parseAdminInvitationPatch(
      jsonRequest("/api/admin/invitations/invite-1", {
        email: "",
        initialCredits: 0,
        initialConcurrencyLimit: 0,
        initialDailyCreditLimit: -1,
        maxUses: 1,
        expiresAt: "not-a-date",
        allowEmailLink: false,
        allowManualCode: false,
        revoked: false,
      }),
    ),
    AdminRequestError,
  );
});

test("credit adjustment requires non-zero integer, reason, and UUID key", async () => {
  const parsed = await parseCreditAdjustment(
    jsonRequest("/api/admin/credit-adjustments", {
      userId: "user-1",
      amount: -25,
      reason: "撤销误发额度",
      idempotencyKey: "91b2f11f-bc61-42f8-bae2-8c7f6a9d5001",
    }),
  );
  assert.equal(parsed.amount, -25);
  assert.equal(parsed.userId, "user-1");

  for (const body of [
    {
      userId: "user-1",
      amount: 0,
      reason: "noop",
      idempotencyKey: "91b2f11f-bc61-42f8-bae2-8c7f6a9d5001",
    },
    {
      userId: "user-1",
      amount: 1.5,
      reason: "fraction",
      idempotencyKey: "91b2f11f-bc61-42f8-bae2-8c7f6a9d5001",
    },
    {
      userId: "user-1",
      amount: 10,
      reason: "",
      idempotencyKey: "not-a-uuid",
    },
  ]) {
    await assert.rejects(
      parseCreditAdjustment(
        jsonRequest("/api/admin/credit-adjustments", body),
      ),
      AdminRequestError,
    );
  }
});

test("admin password input uses the same bounds as password login", async () => {
  assert.equal(
    await parseAdminPassword(
      jsonRequest("/api/admin/users/user-1/password", {
        password: "A-strong-pass-2026!",
      }),
    ),
    "A-strong-pass-2026!",
  );
  await assert.rejects(
    parseAdminPassword(
      jsonRequest("/api/admin/users/user-1/password", { password: "short" }),
    ),
  );
});
test("user patch accepts bounded fields and rejects empty updates", async () => {
  assert.deepEqual(
    await parseAdminUserPatch(
      jsonRequest("/api/admin/users/user-1", {
        role: "admin",
        status: "suspended",
        concurrencyLimit: 2,
        dailyCreditLimit: 500,
        revokeSessions: true,
      }),
    ),
    {
      role: "admin",
      status: "suspended",
      concurrencyLimit: 2,
      dailyCreditLimit: 500,
      revokeSessions: true,
    },
  );

  await assert.rejects(
    parseAdminUserPatch(jsonRequest("/api/admin/users/user-1", {})),
    AdminRequestError,
  );
  await assert.rejects(
    parseAdminUserPatch(
      jsonRequest("/api/admin/users/user-1", { concurrencyLimit: 0 }),
    ),
    AdminRequestError,
  );
});


test("provider key activation accepts only known providers and safe aliases", async () => {
  assert.deepEqual(
    await parseAdminProviderKeyActivation(
      jsonRequest("/api/admin/provider-keys", {
        provider: "vidu",
        activeKeyId: " Primary_China ",
      }),
    ),
    { provider: "vidu", activeKeyId: "primary_china" },
  );

  await assert.rejects(
    parseAdminProviderKeyActivation(
      jsonRequest("/api/admin/provider-keys", {
        provider: "openai",
        activeKeyId: "primary",
      }),
    ),
    AdminRequestError,
  );
  await assert.rejects(
    parseAdminProviderKeyActivation(
      jsonRequest("/api/admin/provider-keys", {
        provider: "gemini",
        activeKeyId: "../../secret",
      }),
    ),
    AdminRequestError,
  );
});
test("request IDs are sanitized before entering the audit contract", () => {
  const accepted = requestIdFrom(
    new Request("https://studio.example", {
      headers: { "x-request-id": "req_admin_1234" },
    }),
  );
  assert.equal(accepted, "req_admin_1234");

  const generated = requestIdFrom(
    new Request("https://studio.example", {
      headers: { "x-request-id": "unsafe request id" },
    }),
  );
  assert.match(generated, /^[0-9a-f-]{36}$/i);
});

test("admin key input validates managed secrets without exposing environment slots", async () => {
  assert.deepEqual(
    await parseAdminProviderKeyCreate(
      jsonRequest("/api/admin/provider-keys", {
        provider: "gemini",
        label: " 生产分析 Key ",
        apiKey: "gemini-test-key-123456",
      }),
    ),
    {
      provider: "gemini",
      label: "生产分析 Key",
      apiKey: "gemini-test-key-123456",
    },
  );
  assert.deepEqual(
    await parseAdminProviderKeyDelete(
      jsonRequest("/api/admin/provider-keys", {
        provider: "vidu",
        keyId: "managed_1234abcd",
      }),
    ),
    { provider: "vidu", keyId: "managed_1234abcd" },
  );

  for (const body of [
    { provider: "vidu", label: "短 Key", apiKey: "short" },
    { provider: "vidu", label: "含空格", apiKey: "invalid key value" },
    { provider: "openai", label: "错误服务", apiKey: "valid-key-value" },
  ]) {
    await assert.rejects(
      parseAdminProviderKeyCreate(
        jsonRequest("/api/admin/provider-keys", body),
      ),
      AdminRequestError,
    );
  }
  await assert.rejects(
    parseAdminProviderKeyDelete(
      jsonRequest("/api/admin/provider-keys", {
        provider: "vidu",
        keyId: "default",
      }),
    ),
    AdminRequestError,
  );
});
