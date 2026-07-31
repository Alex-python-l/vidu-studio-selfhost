import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../lib/errors";
import {
  decryptProviderApiKey,
  encryptProviderApiKey,
  providerKeyEncryptionConfigured,
  providerKeyHint,
} from "../lib/provider-key-crypto";

const encryptionSecret = "11".repeat(32);
const context = { provider: "vidu" as const, keyId: "managed_test" };

test("provider API keys round-trip through authenticated encryption", async () => {
  const apiKey = "vidu-production-key-12345678";
  const encrypted = await encryptProviderApiKey(
    apiKey,
    encryptionSecret,
    context,
  );

  assert.equal(encrypted.encryptionVersion, 1);
  assert.notEqual(encrypted.ciphertext, apiKey);
  assert.equal(providerKeyHint(apiKey), "••••5678");
  assert.equal(
    await decryptProviderApiKey(encrypted, encryptionSecret, context),
    apiKey,
  );
});

test("provider API key encryption rejects invalid secrets and context", async () => {
  assert.equal(providerKeyEncryptionConfigured(encryptionSecret), true);
  assert.equal(providerKeyEncryptionConfigured("short"), false);
  await assert.rejects(
    encryptProviderApiKey("valid-key-value", "short", context),
    AppError,
  );

  const encrypted = await encryptProviderApiKey(
    "valid-key-value",
    encryptionSecret,
    context,
  );
  await assert.rejects(
    decryptProviderApiKey(encrypted, encryptionSecret, {
      provider: "gemini",
      keyId: context.keyId,
    }),
    AppError,
  );
});
