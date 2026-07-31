import type {
  ProviderKeyKind,
  UserRole,
  UserStatus,
} from "@/lib/account-contracts";
import { normalizePassword } from "@/lib/password-security";

const MAX_QUERY_LENGTH = 120;
const MAX_CURSOR_LENGTH = 256;
const MAX_REASON_LENGTH = 500;
const MAX_EMAIL_LENGTH = 320;
const MAX_INVITE_CODE_LENGTH = 64;
const MAX_USER_ID_LENGTH = 128;
const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AdminRequestError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export type AdminUserPatch = {
  role?: UserRole;
  status?: UserStatus;
  concurrencyLimit?: number;
  dailyCreditLimit?: number;
  revokeSessions: boolean;
};

export type AdminInvitationInput = {
  email: string;
  code: string;
  initialCredits: number;
  initialConcurrencyLimit: number;
  initialDailyCreditLimit: number;
  expiresInDays: number;
  maxUses: number;
  allowEmailLink: boolean;
  allowManualCode: boolean;
};

export type AdminInvitationPatch = {
  email: string;
  initialCredits: number;
  initialConcurrencyLimit: number;
  initialDailyCreditLimit: number;
  expiresAt: string;
  maxUses: number;
  allowEmailLink: boolean;
  allowManualCode: boolean;
  revoked: boolean;
};

export type AdminCreditAdjustmentPayload = {
  userId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
};

export type AdminProviderKeyActivation = {
  provider: ProviderKeyKind;
  activeKeyId: string;
};

export type AdminProviderKeyCreate = {
  provider: ProviderKeyKind;
  label: string;
  apiKey: string;
};

export type AdminProviderKeyDelete = {
  provider: ProviderKeyKind;
  keyId: string;
};

export function parseAdminUsersQuery(url: URL) {
  const query = cleanOptionalText(
    url.searchParams.get("query"),
    MAX_QUERY_LENGTH,
    "搜索关键词",
  );
  const cursor = cleanOptionalText(
    url.searchParams.get("cursor"),
    MAX_CURSOR_LENGTH,
    "游标",
  );

  return { query, cursor, limit: 20 };
}

export async function parseAdminPassword(request: Request): Promise<string> {
  const body = await readJsonObject(request);
  return normalizePassword(body.password);
}
export async function parseAdminUserPatch(
  request: Request,
): Promise<AdminUserPatch> {
  const body = await readJsonObject(request);
  const role =
    body.role === undefined
      ? undefined
      : body.role === "user" ||
          body.role === "support" ||
          body.role === "admin"
        ? body.role
        : invalid("账号角色不合法。");
  const status =
    body.status === undefined
      ? undefined
      : body.status === "active" || body.status === "suspended"
        ? body.status
        : invalid("账号状态不合法。");
  const concurrencyLimit = optionalInteger(
    body.concurrencyLimit,
    "并发上限",
    1,
    20,
  );
  const dailyCreditLimit = optionalInteger(
    body.dailyCreditLimit,
    "每日额度上限",
    0,
    1_000_000,
  );
  const revokeSessions =
    body.revokeSessions === undefined
      ? false
      : typeof body.revokeSessions === "boolean"
        ? body.revokeSessions
        : invalid("撤销会话标记不合法。");

  if (
    role === undefined &&
    status === undefined &&
    concurrencyLimit === undefined &&
    dailyCreditLimit === undefined &&
    !revokeSessions
  ) {
    throw new AdminRequestError("至少提交一项用户变更。");
  }

  return {
    role,
    status,
    concurrencyLimit,
    dailyCreditLimit,
    revokeSessions,
  };
}

export async function parseAdminProviderKeyActivation(
  request: Request,
): Promise<AdminProviderKeyActivation> {
  const body = await readJsonObject(request);
  return {
    provider: providerKind(body.provider),
    activeKeyId: providerKeyId(body.activeKeyId),
  };
}

export async function parseAdminProviderKeyCreate(
  request: Request,
): Promise<AdminProviderKeyCreate> {
  const body = await readJsonObject(request);
  const apiKey = requiredText(body.apiKey, "API Key", 512);
  if (apiKey.length < 8 || /\s/.test(apiKey)) {
    throw new AdminRequestError("API Key 格式不合法。");
  }
  return {
    provider: providerKind(body.provider),
    label: requiredText(body.label, "Key 名称", 40),
    apiKey,
  };
}

export async function parseAdminProviderKeyDelete(
  request: Request,
): Promise<AdminProviderKeyDelete> {
  const body = await readJsonObject(request);
  const keyId = providerKeyId(body.keyId);
  if (!keyId.startsWith("managed_")) {
    throw new AdminRequestError("环境 Key 不能在管理后台删除。");
  }
  return {
    provider: providerKind(body.provider),
    keyId,
  };
}

export async function parseAdminInvitation(
  request: Request,
): Promise<AdminInvitationInput> {
  const body = await readJsonObject(request);
  const allowEmailLink = optionalBoolean(
    body.allowEmailLink,
    "邮箱链接开关",
    true,
  );
  const allowManualCode = optionalBoolean(
    body.allowManualCode,
    "手动口令开关",
    false,
  );
  if (!allowEmailLink && !allowManualCode) {
    throw new AdminRequestError("邮箱链接和手动口令至少启用一种。");
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (allowEmailLink && !email) {
    throw new AdminRequestError("启用邮箱链接时必须填写邮箱。");
  }
  if (email && !isEmail(email)) {
    throw new AdminRequestError("请输入有效的邮箱地址。");
  }
  const code = requiredText(
    body.code,
    "访问口令",
    MAX_INVITE_CODE_LENGTH,
  ).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{5,63}$/.test(code)) {
    throw new AdminRequestError("访问口令需为 6 到 64 位字母、数字、短横线或下划线。");
  }

  return {
    email,
    code,
    initialCredits: requiredInteger(body.initialCredits ?? 0, "初始额度", 0, 1_000_000),
    initialConcurrencyLimit: requiredInteger(
      body.initialConcurrencyLimit ?? 1,
      "初始并发数",
      1,
      20,
    ),
    initialDailyCreditLimit: requiredInteger(
      body.initialDailyCreditLimit ?? 500,
      "每日额度上限",
      0,
      1_000_000,
    ),
    expiresInDays: requiredInteger(body.expiresInDays ?? 7, "有效天数", 1, 365),
    maxUses: requiredInteger(body.maxUses ?? 1, "可用次数", 1, 10_000),
    allowEmailLink,
    allowManualCode,
  };
}

export async function parseAdminInvitationPatch(
  request: Request,
): Promise<AdminInvitationPatch> {
  const body = await readJsonObject(request);
  const allowEmailLink = requiredBoolean(
    body.allowEmailLink,
    "邮箱链接开关",
  );
  const allowManualCode = requiredBoolean(
    body.allowManualCode,
    "手动口令开关",
  );
  if (!allowEmailLink && !allowManualCode) {
    throw new AdminRequestError("邮箱链接和手动口令至少启用一种。");
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (allowEmailLink && !email) {
    throw new AdminRequestError("启用邮箱链接时必须填写邮箱。");
  }
  if (email && !isEmail(email)) {
    throw new AdminRequestError("请输入有效的邮箱地址。");
  }

  return {
    email,
    initialCredits: requiredInteger(
      body.initialCredits,
      "初始额度",
      0,
      1_000_000,
    ),
    initialConcurrencyLimit: requiredInteger(
      body.initialConcurrencyLimit,
      "初始并发数",
      1,
      20,
    ),
    initialDailyCreditLimit: requiredInteger(
      body.initialDailyCreditLimit,
      "每日额度上限",
      0,
      1_000_000,
    ),
    expiresAt: requiredIsoDate(body.expiresAt, "有效期"),
    maxUses: requiredInteger(body.maxUses, "可用次数", 1, 10_000),
    allowEmailLink,
    allowManualCode,
    revoked: requiredBoolean(body.revoked, "停用状态"),
  };
}

export async function parseCreditAdjustment(
  request: Request,
): Promise<AdminCreditAdjustmentPayload> {
  const body = await readJsonObject(request);
  const amount = requiredInteger(body.amount, "调整额度", -1_000_000, 1_000_000);
  if (amount === 0) {
    throw new AdminRequestError("调整额度不能为 0。");
  }

  const idempotencyKey = requiredText(
    body.idempotencyKey,
    "幂等键",
    64,
  );
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new AdminRequestError("幂等键格式不合法。");
  }

  return {
    userId: requiredText(body.userId, "用户 ID", MAX_USER_ID_LENGTH),
    amount,
    reason: requiredText(body.reason, "调整原因", MAX_REASON_LENGTH),
    idempotencyKey,
  };
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new AdminRequestError("缺少来源校验信息。", 403);
  }

  let requestOrigin: string;
  try {
    const url = new URL(request.url);
    const forwardedHost = firstForwarded(request.headers.get("x-forwarded-host"));
    const forwardedProto =
      firstForwarded(request.headers.get("x-forwarded-proto")) ??
      (url.protocol === "http:" ? "http" : "https");
    requestOrigin = forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : url.origin;
  } catch {
    throw new AdminRequestError("来源校验失败。", 403);
  }

  if (origin !== requestOrigin) {
    throw new AdminRequestError("请求来源不受信任。", 403);
  }
}

export function requestIdFrom(request: Request): string {
  const candidate = request.headers.get("x-request-id")?.trim();
  if (candidate && /^[a-zA-Z0-9._:-]{8,128}$/.test(candidate)) {
    return candidate;
  }
  return crypto.randomUUID();
}

export function adminApiError(error: unknown, requestId: string): Response {
  if (
    error instanceof AdminRequestError ||
    (error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status >= 400 &&
      error.status < 500)
  ) {
    const status =
      error instanceof AdminRequestError
        ? error.status
        : (error as { status: number }).status;
    const message =
      error instanceof Error ? error.message : "请求无法处理。";
    return Response.json({ error: message, requestId }, { status });
  }

  return Response.json(
    { error: "服务暂时不可用，请稍后重试。", requestId },
    { status: 500 },
  );
}

export function cleanUserId(value: string): string {
  const decoded = decodeURIComponent(value).trim();
  if (
    !decoded ||
    decoded.length > MAX_USER_ID_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    throw new AdminRequestError("用户 ID 不合法。");
  }
  return decoded;
}

export function cleanInvitationId(value: string): string {
  const decoded = decodeURIComponent(value).trim();
  if (
    !decoded ||
    decoded.length > MAX_USER_ID_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    throw new AdminRequestError("访问口令 ID 不合法。");
  }
  return decoded;
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new AdminRequestError("请求体必须是有效 JSON。");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminRequestError("请求体必须是 JSON 对象。");
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new AdminRequestError(`${name}不能为空。`);
  }
  const cleaned = value.trim();
  if (
    !cleaned ||
    cleaned.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(cleaned)
  ) {
    throw new AdminRequestError(`${name}格式不合法。`);
  }
  return cleaned;
}

function cleanOptionalText(
  value: string | null,
  maxLength: number,
  name: string,
): string | undefined {
  if (value === null || value.trim() === "") return undefined;
  if (value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new AdminRequestError(`${name}格式不合法。`);
  }
  return value.trim();
}

function requiredInteger(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new AdminRequestError(`${name}必须是 ${min} 到 ${max} 之间的整数。`);
  }
  return Number(value);
}

function optionalInteger(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;
  return requiredInteger(value, name, min, max);
}

function optionalBoolean(
  value: unknown,
  name: string,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new AdminRequestError(`${name}不合法。`);
  }
  return value;
}

function requiredBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new AdminRequestError(`${name}不合法。`);
  }
  return value;
}

function requiredIsoDate(value: unknown, name: string): string {
  const cleaned = requiredText(value, name, 64);
  const date = new Date(cleaned);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() < 2000 ||
    date.getUTCFullYear() > 2100
  ) {
    throw new AdminRequestError(`${name}不合法。`);
  }
  return date.toISOString();
}

function providerKind(value: unknown): ProviderKeyKind {
  return value === "vidu" || value === "gemini"
    ? value
    : invalid("服务类型不合法。");
}

function providerKeyId(value: unknown): string {
  const keyId = requiredText(value, "Key 标识", 64).toLowerCase();
  if (!/^(?:default|[a-z0-9][a-z0-9_]{0,63})$/.test(keyId)) {
    throw new AdminRequestError("Key 标识不合法。");
  }
  return keyId;
}

function invalid(message: string): never {
  throw new AdminRequestError(message);
}

function isEmail(value: string): boolean {
  return (
    value.length <= MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function firstForwarded(value: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}
