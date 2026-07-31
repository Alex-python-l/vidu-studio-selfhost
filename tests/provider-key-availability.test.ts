import assert from "node:assert/strict";
import test from "node:test";
import {
  checkProviderKeyAvailability,
  inspectProviderKey,
} from "../lib/provider-key-availability";

test("checks Vidu keys with the read-only credits endpoint", async () => {
  let requestUrl = "";
  let authorization = "";
  const result = await checkProviderKeyAvailability(
    "vidu",
    "vidu-secret-value",
    (async (input, init) => {
      requestUrl = String(input);
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  );

  assert.equal(
    requestUrl,
    "https://api.vidu.com/ent/v2/credits?show_detail=true",
  );
  assert.equal(authorization, "Token vidu-secret-value");
  assert.deepEqual(result, {
    status: "available",
    message: "Vidu Key 可用性检测通过。",
  });
});

test("checks Gemini keys without placing secrets in the URL", async () => {
  let requestUrl = "";
  let apiKeyHeader = "";
  const result = await checkProviderKeyAvailability(
    "gemini",
    "gemini-secret-value",
    (async (input, init) => {
      requestUrl = String(input);
      apiKeyHeader = new Headers(init?.headers).get("x-goog-api-key") ?? "";
      return new Response("{}", { status: 403 });
    }) as typeof fetch,
  );

  assert.equal(
    requestUrl,
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
  );
  assert.equal(apiKeyHeader, "gemini-secret-value");
  assert.equal(result.status, "unavailable");
  assert.doesNotMatch(result.message, /gemini-secret-value/);
});

test("treats rate limits and network failures as inconclusive reminders", async () => {
  const rateLimited = await checkProviderKeyAvailability(
    "gemini",
    "gemini-secret-value",
    (async () => new Response("{}", { status: 429 })) as typeof fetch,
  );
  const networkFailure = await checkProviderKeyAvailability(
    "vidu",
    "vidu-secret-value",
    (async () => {
      throw new Error("network unavailable");
    }) as typeof fetch,
  );

  assert.equal(rateLimited.status, "unknown");
  assert.equal(networkFailure.status, "unknown");
  assert.doesNotMatch(networkFailure.message, /vidu-secret-value/);
});

test("reads Vidu credits and concurrency without exposing the key", async () => {
  const snapshot = await inspectProviderKey(
    "vidu",
    "vidu-secret-value",
    (async () =>
      Response.json({
        remains: [
          {
            type: "metered",
            credit_remain: 120,
            concurrency_limit: 2,
            current_concurrency: 1,
            queue_count: 3,
          },
          {
            type: "test",
            credit_remain: "30",
            concurrency_limit: 1,
            current_concurrency: 0,
            queue_count: 0,
          },
        ],
      })) as typeof fetch,
  );

  assert.equal(snapshot.status, "available");
  assert.equal(snapshot.remainingCredits, 150);
  assert.equal(snapshot.concurrencyLimit, 3);
  assert.equal(snapshot.currentConcurrency, 1);
  assert.equal(snapshot.queueCount, 3);
  assert.doesNotMatch(JSON.stringify(snapshot), /vidu-secret-value/);
});

test("reads wrapped Vidu package balances when remains are absent", async () => {
  const snapshot = await inspectProviderKey(
    "vidu",
    "vidu-secret-value",
    (async () =>
      Response.json({
        data: {
          remains: [],
          packages: [
            { credit_remain: 420, concurrency: 2 },
            { credit_remain: "80", concurrency: 1 },
          ],
        },
      })) as typeof fetch,
  );

  assert.equal(snapshot.status, "available");
  assert.equal(snapshot.remainingCredits, 500);
  assert.equal(snapshot.concurrencyLimit, 3);
  assert.match(snapshot.message, /额度与并发已同步/);
});

test("reads deeply wrapped and formatted Vidu balance fields", async () => {
  const snapshot = await inspectProviderKey(
    "vidu",
    "vidu-secret-value",
    (async () =>
      Response.json({
        result: {
          data: {
            account: {
              credits_balance: "12,345",
              concurrency_limit: 4,
            },
          },
        },
      })) as typeof fetch,
  );

  assert.equal(snapshot.status, "available");
  assert.equal(snapshot.remainingCredits, 12_345);
  assert.equal(snapshot.concurrencyLimit, 4);
});

test("reads object-shaped Vidu remains collections", async () => {
  const snapshot = await inspectProviderKey(
    "vidu",
    "vidu-secret-value",
    (async () =>
      Response.json({
        data: {
          remains: {
            metered: {
              credit_remain: 900,
              concurrency_limit: 2,
            },
            concurrent: {
              credit_remain: "100",
              concurrency_limit: 1,
            },
          },
        },
      })) as typeof fetch,
  );

  assert.equal(snapshot.remainingCredits, 1_000);
  assert.equal(snapshot.concurrencyLimit, 3);
});

test("combines Vidu general and exclusive credit collections", async () => {
  const snapshot = await inspectProviderKey(
    "vidu",
    "vidu-secret-value",
    (async () =>
      Response.json({
        remains: [],
        general_remains: [{ credit_remain: 300, concurrency_limit: 2 }],
        exclusive_remains: [{ credit_remain: "200" }],
        packages: [],
      })) as typeof fetch,
  );

  assert.equal(snapshot.remainingCredits, 500);
  assert.equal(snapshot.concurrencyLimit, 2);
});

test("reports zero when Vidu returns explicitly empty credit collections", async () => {
  const snapshot = await inspectProviderKey(
    "vidu",
    "vidu-secret-value",
    (async () =>
      Response.json({
        packages: [],
        remains: [],
        queue_count: 0,
        general_remains: [],
        exclusive_remains: [],
      })) as typeof fetch,
  );

  assert.equal(snapshot.status, "available");
  assert.equal(snapshot.remainingCredits, 0);
  assert.match(snapshot.message, /额度与并发已同步/);
});

test("does not report a successful Vidu balance sync without quota fields", async () => {
  const snapshot = await inspectProviderKey(
    "vidu",
    "vidu-secret-value",
    (async () => Response.json({ data: {} })) as typeof fetch,
  );

  assert.equal(snapshot.status, "available");
  assert.equal(snapshot.remainingCredits, null);
  assert.match(snapshot.message, /未返回可识别的额度明细/);
});

test("explains that Gemini API keys do not own an independent balance", async () => {
  const snapshot = await inspectProviderKey(
    "gemini",
    "gemini-secret-value",
    (async () => Response.json({ models: [] })) as typeof fetch,
  );

  assert.equal(snapshot.status, "available");
  assert.equal(snapshot.remainingCredits, null);
  assert.match(snapshot.message, /Google Cloud 项目/);
  assert.match(snapshot.message, /没有独立余额/);
});
