import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import { AppError } from "@/lib/errors";

export const PASSWORD_ALGORITHM = "pbkdf2-sha256";
export const PASSWORD_ITERATIONS = 600_000;
export const WORKER_NATIVE_PBKDF2_MAX_ITERATIONS = 100_000;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 32;
const encoder = new TextEncoder();

export type PasswordCredential = {
  algorithm: typeof PASSWORD_ALGORITHM;
  iterations: number;
  salt: string;
  passwordHash: string;
};

export function normalizePassword(value: unknown): string {
  if (typeof value !== "string") {
    throw new AppError("密码格式无效。", 400);
  }
  if (
    value.length < PASSWORD_MIN_LENGTH ||
    value.length > PASSWORD_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new AppError(
      `密码需为 ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} 个字符，且不能包含控制字符。`,
      400,
    );
  }
  return value;
}

export async function hashPassword(
  password: string,
): Promise<PasswordCredential> {
  const normalized = normalizePassword(password);
  const saltBytes = crypto.getRandomValues(
    new Uint8Array(PASSWORD_SALT_BYTES),
  );
  return {
    algorithm: PASSWORD_ALGORITHM,
    iterations: PASSWORD_ITERATIONS,
    salt: bytesToHex(saltBytes),
    passwordHash: bytesToHex(
      await derivePassword(normalized, saltBytes, PASSWORD_ITERATIONS),
    ),
  };
}

export async function verifyPassword(
  password: string,
  credential: PasswordCredential,
): Promise<boolean> {
  const normalized = normalizePassword(password);
  if (
    credential.algorithm !== PASSWORD_ALGORITHM ||
    credential.iterations < 100_000 ||
    credential.iterations > 2_000_000
  ) {
    return false;
  }
  const salt = hexToBytes(credential.salt, PASSWORD_SALT_BYTES);
  const expected = hexToBytes(credential.passwordHash, PASSWORD_HASH_BYTES);
  if (!salt || !expected) return false;
  const actual = await derivePassword(
    normalized,
    salt,
    credential.iterations,
  );
  return constantTimeEqual(actual, expected);
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  // Cloudflare Workers rejects native PBKDF2 requests above 100,000
  // iterations. Existing credentials use 600,000 iterations, so keep a
  // portable implementation for those hashes instead of invalidating them.
  if (iterations > WORKER_NATIVE_PBKDF2_MAX_ITERATIONS) {
    return pbkdf2(sha256, encoder.encode(password), salt, {
      c: iterations,
      dkLen: PASSWORD_HASH_BYTES,
    });
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new Uint8Array(salt),
      iterations,
    },
    key,
    PASSWORD_HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |=
      (left[index % left.length] ?? 0) ^
      (right[index % right.length] ?? 0);
  }
  return difference === 0;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(value: string, expectedLength: number) {
  if (
    value.length !== expectedLength * 2 ||
    !/^[a-f0-9]+$/i.test(value)
  ) {
    return null;
  }
  const bytes = new Uint8Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
