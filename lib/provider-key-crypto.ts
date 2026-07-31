import { AppError } from "@/lib/errors";

const AES_KEY_PATTERN = /^[0-9a-f]{64}$/i;
const ENCRYPTION_VERSION = 1;

type ProviderKeyContext = {
  provider: "vidu" | "gemini";
  keyId: string;
};

export type EncryptedProviderKey = {
  ciphertext: string;
  iv: string;
  encryptionVersion: number;
};

export async function encryptProviderApiKey(
  apiKey: string,
  encryptionSecret: unknown,
  context: ProviderKeyContext,
): Promise<EncryptedProviderKey> {
  const key = await importEncryptionKey(encryptionSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: additionalData(context),
    },
    key,
    utf8(apiKey),
  );
  return {
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    iv: toBase64Url(iv),
    encryptionVersion: ENCRYPTION_VERSION,
  };
}

export async function decryptProviderApiKey(
  encrypted: EncryptedProviderKey,
  encryptionSecret: unknown,
  context: ProviderKeyContext,
): Promise<string> {
  if (encrypted.encryptionVersion !== ENCRYPTION_VERSION) {
    throw new AppError("服务 Key 的加密版本不受支持，请重新录入。", 503);
  }
  const key = await importEncryptionKey(encryptionSecret);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64Url(encrypted.iv),
        additionalData: additionalData(context),
      },
      key,
      fromBase64Url(encrypted.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new AppError("服务 Key 无法解密，请由管理员重新录入。", 503);
  }
}

export function providerKeyHint(apiKey: string): string {
  return `••••${apiKey.slice(-4)}`;
}

export function providerKeyEncryptionConfigured(value: unknown): boolean {
  return typeof value === "string" && AES_KEY_PATTERN.test(value.trim());
}

async function importEncryptionKey(value: unknown): Promise<CryptoKey> {
  if (!providerKeyEncryptionConfigured(value)) {
    throw new AppError(
      "管理员录入 Key 的加密配置尚未启用，请先配置 PROVIDER_KEY_ENCRYPTION_SECRET。",
      503,
    );
  }
  return crypto.subtle.importKey(
    "raw",
    fromHex((value as string).trim()),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

function additionalData(
  context: ProviderKeyContext,
): Uint8Array<ArrayBuffer> {
  return utf8(
    `provider-key:${context.provider}:${context.keyId}:v${ENCRYPTION_VERSION}`,
  );
}

function utf8(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value);
  const bytes = new Uint8Array(encoded.length);
  bytes.set(encoded);
  return bytes;
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function toBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
