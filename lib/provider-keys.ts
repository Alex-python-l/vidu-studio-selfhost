import { runtimeEnv as env } from "@/lib/runtime-env";
import { getD1 } from "@/db";
import { ensureRuntimeSchema } from "@/db/runtime-schema";
import type {
  ProviderKeyKind,
  ProviderKeyOption,
  ProviderQuotaSnapshot,
  ProviderKeyStatus,
} from "@/lib/account-contracts";
import { AppError } from "@/lib/errors";
import {
  decryptProviderApiKey,
  encryptProviderApiKey,
  providerKeyEncryptionConfigured,
  providerKeyHint,
} from "@/lib/provider-key-crypto";
import {
  checkProviderKeyAvailability,
  inspectProviderKey,
} from "@/lib/provider-key-availability";

const ENCRYPTION_SECRET_NAME = "PROVIDER_KEY_ENCRYPTION_SECRET";

type ProviderKeySettingRow = {
  provider: ProviderKeyKind;
  active_key_id: string;
  updated_at: string;
};

type ProviderKeySecretRow = {
  key_id: string;
  provider: ProviderKeyKind;
  label: string;
  ciphertext: string;
  iv: string;
  key_hint: string;
  encryption_version: number;
  created_at: string;
};

type EnvironmentProviderKey = ProviderKeyOption & {
  source: "environment";
  hint: null;
  secret: string;
};

const PROVIDERS: Record<
  ProviderKeyKind,
  { label: string; environmentPrefix: string; missingMessage: string }
> = {
  vidu: {
    label: "Vidu",
    environmentPrefix: "VIDU_API_KEY",
    missingMessage: "站点尚未配置 Vidu API Key，请联系管理员完成服务配置。",
  },
  gemini: {
    label: "Gemini",
    environmentPrefix: "GEMINI_API_KEY",
    missingMessage: "站点尚未配置 AI 视频分析服务。",
  },
};

export function providerKeyOptionsFrom(
  provider: ProviderKeyKind,
  values: Record<string, unknown>,
): ProviderKeyOption[] {
  return environmentProviderKeys(provider, values).map(
    ({ id, label, source, hint }) => ({ id, label, source, hint }),
  );
}

export async function listProviderKeyStatuses(): Promise<ProviderKeyStatus[]> {
  await ensureRuntimeSchema();
  const d1 = getD1();
  const settingRows = await d1
    .prepare(`
      SELECT provider, active_key_id, updated_at
      FROM provider_key_settings
    `)
    .all<ProviderKeySettingRow>();
  const managedRows = await d1
    .prepare(`
      SELECT key_id, provider, label, ciphertext, iv, key_hint,
        encryption_version, created_at
      FROM provider_key_secrets
      ORDER BY datetime(created_at) ASC, key_id ASC
    `)
    .all<ProviderKeySecretRow>();
  const settings = new Map(
    settingRows.results.map((row) => [row.provider, row]),
  );
  const values = runtimeValues();

  return (["vidu", "gemini"] as const).map((provider) =>
    providerKeyStatus(
      provider,
      settings.get(provider),
      values,
      managedRows.results.filter((row) => row.provider === provider),
    ),
  );
}

export async function setActiveProviderKey(input: {
  provider: ProviderKeyKind;
  activeKeyId: string;
  actorUserId: string;
  requestId: string;
}): Promise<ProviderKeyStatus> {
  await ensureRuntimeSchema();
  const definition = PROVIDERS[input.provider];
  const activeKeyId = cleanKeyId(input.activeKeyId);
  const values = runtimeValues();
  const d1 = getD1();
  const environmentMatch = environmentProviderKeys(
    input.provider,
    values,
  ).some((candidate) => candidate.id === activeKeyId);
  const managedMatch = environmentMatch
    ? null
    : await d1
        .prepare(`
          SELECT key_id
          FROM provider_key_secrets
          WHERE provider = ? AND key_id = ?
          LIMIT 1
        `)
        .bind(input.provider, activeKeyId)
        .first<{ key_id: string }>();
  if (!environmentMatch && !managedMatch) {
    throw new AppError(
      `${definition.label} Key ${activeKeyId} 尚未配置。`,
      409,
    );
  }
  if (managedMatch && !providerKeyEncryptionConfigured(values[ENCRYPTION_SECRET_NAME])) {
    throw new AppError(
      "管理员录入 Key 的加密配置不可用，暂时不能启用该 Key。",
      503,
    );
  }

  await d1.batch([
    activeKeyStatement(
      d1,
      input.provider,
      activeKeyId,
      input.actorUserId,
    ),
    d1
      .prepare(`
        INSERT INTO admin_audit_log (
          id, actor_user_id, action, target_type, target_id, reason, request_id
        ) VALUES (?, ?, 'provider_key.activate', 'provider_key', ?, ?, ?)
      `)
      .bind(
        crypto.randomUUID(),
        input.actorUserId,
        `${input.provider}:${activeKeyId}`,
        `切换 ${definition.label} 活跃 Key 为 ${activeKeyId}`,
        input.requestId,
      ),
  ]);

  return providerKeyStatusFor(input.provider);
}

export async function createManagedProviderKey(input: {
  provider: ProviderKeyKind;
  label: string;
  apiKey: string;
  actorUserId: string;
  requestId: string;
}): Promise<ProviderKeyStatus> {
  await ensureRuntimeSchema();
  const label = cleanLabel(input.label);
  const keyId = `managed_${crypto.randomUUID().replaceAll("-", "")}`;
  const values = runtimeValues();
  const encrypted = await encryptProviderApiKey(
    input.apiKey,
    values[ENCRYPTION_SECRET_NAME],
    { provider: input.provider, keyId },
  );
  const hint = providerKeyHint(input.apiKey);
  const d1 = getD1();
  await d1.batch([
    d1
      .prepare(`
        INSERT INTO provider_key_secrets (
          key_id, provider, label, ciphertext, iv, key_hint,
          encryption_version, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `)
      .bind(
        keyId,
        input.provider,
        label,
        encrypted.ciphertext,
        encrypted.iv,
        hint,
        encrypted.encryptionVersion,
        input.actorUserId,
      ),
    activeKeyStatement(d1, input.provider, keyId, input.actorUserId),
    d1
      .prepare(`
        INSERT INTO admin_audit_log (
          id, actor_user_id, action, target_type, target_id, reason, request_id
        ) VALUES (?, ?, 'provider_key.create', 'provider_key', ?, ?, ?)
      `)
      .bind(
        crypto.randomUUID(),
        input.actorUserId,
        `${input.provider}:${keyId}`,
        `录入并启用 ${PROVIDERS[input.provider].label} Key ${label}（${hint}）`,
        input.requestId,
      ),
  ]);

  return providerKeyStatusFor(input.provider);
}

export async function deleteManagedProviderKey(input: {
  provider: ProviderKeyKind;
  keyId: string;
  actorUserId: string;
  requestId: string;
}): Promise<ProviderKeyStatus> {
  await ensureRuntimeSchema();
  const keyId = cleanKeyId(input.keyId);
  if (!keyId.startsWith("managed_")) {
    throw new AppError("环境 Key 不能在管理后台删除。", 400);
  }
  const d1 = getD1();
  const row = await d1
    .prepare(`
      SELECT label, key_hint
      FROM provider_key_secrets
      WHERE provider = ? AND key_id = ?
      LIMIT 1
    `)
    .bind(input.provider, keyId)
    .first<{ label: string; key_hint: string }>();
  if (!row) throw new AppError("服务 Key 不存在。", 404);

  const active = await d1
    .prepare(`
      SELECT 1 AS active
      FROM provider_key_settings
      WHERE provider = ? AND active_key_id = ?
      LIMIT 1
    `)
    .bind(input.provider, keyId)
    .first<{ active: number }>();
  if (active) {
    throw new AppError("请先切换到其他活跃 Key，再删除当前 Key。", 409);
  }

  await d1.batch([
    d1
      .prepare(`
        DELETE FROM provider_key_secrets
        WHERE provider = ? AND key_id = ?
      `)
      .bind(input.provider, keyId),
    d1
      .prepare(`
        INSERT INTO admin_audit_log (
          id, actor_user_id, action, target_type, target_id, reason, request_id
        )
        SELECT ?, ?, 'provider_key.delete', 'provider_key', ?, ?, ?
        WHERE changes() = 1
      `)
      .bind(
        crypto.randomUUID(),
        input.actorUserId,
        `${input.provider}:${keyId}`,
        `删除 ${PROVIDERS[input.provider].label} Key ${row.label}（${row.key_hint}）`,
        input.requestId,
      ),
  ]);

  return providerKeyStatusFor(input.provider);
}

export async function requireProviderApiKey(
  provider: ProviderKeyKind,
): Promise<string> {
  await ensureRuntimeSchema();
  const d1 = getD1();
  const setting = await d1
    .prepare(`
      SELECT active_key_id
      FROM provider_key_settings
      WHERE provider = ?
      LIMIT 1
    `)
    .bind(provider)
    .first<{ active_key_id: string }>();
  const values = runtimeValues();
  const environmentCandidates = environmentProviderKeys(provider, values);

  if (setting?.active_key_id) {
    const environmentMatch = environmentCandidates.find(
      (candidate) => candidate.id === setting.active_key_id,
    );
    if (environmentMatch) return environmentMatch.secret;

    const managed = await managedProviderKey(
      d1,
      provider,
      setting.active_key_id,
    );
    if (managed) return decryptManagedProviderKey(managed, values);

    throw new AppError(
      `管理员选择的 ${PROVIDERS[provider].label} Key 已不可用，请在管理后台切换活跃 Key。`,
      503,
    );
  }

  const environmentDefault = defaultEnvironmentKey(environmentCandidates);
  if (environmentDefault) return environmentDefault.secret;

  const managedDefault = await d1
    .prepare(`
      SELECT key_id, provider, label, ciphertext, iv, key_hint,
        encryption_version, created_at
      FROM provider_key_secrets
      WHERE provider = ?
      ORDER BY datetime(created_at) ASC, key_id ASC
      LIMIT 1
    `)
    .bind(provider)
    .first<ProviderKeySecretRow>();
  if (managedDefault) return decryptManagedProviderKey(managedDefault, values);

  throw new AppError(PROVIDERS[provider].missingMessage, 503);
}

export async function isProviderApiKeyConfigured(
  provider: ProviderKeyKind,
): Promise<boolean> {
  try {
    await requireProviderApiKey(provider);
    return true;
  } catch (error) {
    if (error instanceof AppError && error.status === 503) return false;
    throw error;
  }
}

export async function checkActiveProviderKeyAvailability(
  provider: ProviderKeyKind,
) {
  try {
    const apiKey = await requireProviderApiKey(provider);
    return await checkProviderKeyAvailability(provider, apiKey);
  } catch {
    return {
      status: "unknown" as const,
      message: `${PROVIDERS[provider].label} Key 暂时无法完成可用性检测。`,
    };
  }
}

export async function inspectActiveProviderKey(
  provider: ProviderKeyKind,
): Promise<ProviderQuotaSnapshot> {
  try {
    const apiKey = await requireProviderApiKey(provider);
    return await inspectProviderKey(provider, apiKey);
  } catch {
    return {
      provider,
      status: "unknown",
      message: `${PROVIDERS[provider].label} Key 暂时无法读取额度或配额状态。`,
      checkedAt: new Date().toISOString(),
      remainingCredits: null,
      concurrencyLimit: null,
      currentConcurrency: null,
      queueCount: null,
    };
  }
}

async function providerKeyStatusFor(
  provider: ProviderKeyKind,
): Promise<ProviderKeyStatus> {
  const d1 = getD1();
  const setting = await d1
    .prepare(`
      SELECT provider, active_key_id, updated_at
      FROM provider_key_settings
      WHERE provider = ?
      LIMIT 1
    `)
    .bind(provider)
    .first<ProviderKeySettingRow>();
  const managed = await d1
    .prepare(`
      SELECT key_id, provider, label, ciphertext, iv, key_hint,
        encryption_version, created_at
      FROM provider_key_secrets
      WHERE provider = ?
      ORDER BY datetime(created_at) ASC, key_id ASC
    `)
    .bind(provider)
    .all<ProviderKeySecretRow>();
  return providerKeyStatus(
    provider,
    setting ?? undefined,
    runtimeValues(),
    managed.results,
  );
}

function providerKeyStatus(
  provider: ProviderKeyKind,
  setting: ProviderKeySettingRow | undefined,
  values: Record<string, unknown>,
  managedRows: ProviderKeySecretRow[],
): ProviderKeyStatus {
  const definition = PROVIDERS[provider];
  const managedStorageReady = providerKeyEncryptionConfigured(
    values[ENCRYPTION_SECRET_NAME],
  );
  const environmentOptions = providerKeyOptionsFrom(provider, values);
  const managedOptions = managedRows.map<ProviderKeyOption>((row) => ({
    id: row.key_id,
    label: row.label,
    source: "managed",
    hint: row.key_hint,
  }));
  const options = [...environmentOptions, ...managedOptions];
  const selected = setting
    ? options.find((candidate) => candidate.id === setting.active_key_id)
    : defaultOption(options);
  const selectedUsable = Boolean(
    selected &&
      (selected.source === "environment" || managedStorageReady),
  );

  return {
    provider,
    label: definition.label,
    configured: selectedUsable,
    activeKeyId: selected?.id ?? null,
    selectedKeyId: setting?.active_key_id ?? selected?.id ?? null,
    selectionPersisted: Boolean(setting),
    missingSelectedKey: Boolean(setting && !selected),
    managedStorageReady,
    options,
    updatedAt: setting?.updated_at ?? null,
  };
}

function environmentProviderKeys(
  provider: ProviderKeyKind,
  values: Record<string, unknown>,
): EnvironmentProviderKey[] {
  const prefix = PROVIDERS[provider].environmentPrefix;
  const candidates = new Map<string, EnvironmentProviderKey>();
  const legacy = secretValue(values[prefix]);
  if (legacy) {
    candidates.set("default", {
      id: "default",
      label: "默认环境 Key",
      source: "environment",
      hint: null,
      secret: legacy,
    });
  }

  const pattern = new RegExp(`^${prefix}_([A-Z0-9][A-Z0-9_]{0,63})$`);
  for (const [name, value] of Object.entries(values)) {
    const match = pattern.exec(name);
    const secret = secretValue(value);
    if (!match || !secret) continue;
    const id = match[1].toLowerCase();
    if (candidates.has(id)) continue;
    candidates.set(id, {
      id,
      label: match[1].replaceAll("_", " "),
      source: "environment",
      hint: null,
      secret,
    });
  }

  return [...candidates.values()].sort((left, right) => {
    if (left.id === "default") return -1;
    if (right.id === "default") return 1;
    return left.id.localeCompare(right.id);
  });
}

async function managedProviderKey(
  d1: D1Database,
  provider: ProviderKeyKind,
  keyId: string,
): Promise<ProviderKeySecretRow | null> {
  return d1
    .prepare(`
      SELECT key_id, provider, label, ciphertext, iv, key_hint,
        encryption_version, created_at
      FROM provider_key_secrets
      WHERE provider = ? AND key_id = ?
      LIMIT 1
    `)
    .bind(provider, keyId)
    .first<ProviderKeySecretRow>();
}

async function decryptManagedProviderKey(
  row: ProviderKeySecretRow,
  values: Record<string, unknown>,
): Promise<string> {
  return decryptProviderApiKey(
    {
      ciphertext: row.ciphertext,
      iv: row.iv,
      encryptionVersion: row.encryption_version,
    },
    values[ENCRYPTION_SECRET_NAME],
    { provider: row.provider, keyId: row.key_id },
  );
}

function activeKeyStatement(
  d1: D1Database,
  provider: ProviderKeyKind,
  keyId: string,
  actorUserId: string,
): D1PreparedStatement {
  return d1
    .prepare(`
      INSERT INTO provider_key_settings (
        provider, active_key_id, updated_by, updated_at
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(provider) DO UPDATE SET
        active_key_id = excluded.active_key_id,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(provider, keyId, actorUserId);
}

function defaultEnvironmentKey(candidates: EnvironmentProviderKey[]) {
  return (
    candidates.find((candidate) => candidate.id === "default") ??
    candidates[0]
  );
}

function defaultOption(candidates: ProviderKeyOption[]) {
  return (
    candidates.find((candidate) => candidate.id === "default") ??
    candidates[0]
  );
}

function runtimeValues(): Record<string, unknown> {
  const values: Record<string, unknown> = { ...process.env };
  for (const [key, value] of Object.entries(
    env as unknown as Record<string, unknown>,
  )) {
    values[key] = value;
  }
  return values;
}

function secretValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanLabel(value: string) {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > 40 || /[\u0000-\u001f\u007f]/.test(cleaned)) {
    throw new AppError("Key 名称格式不合法。", 400);
  }
  return cleaned;
}

function cleanKeyId(value: string) {
  const cleaned = value.trim().toLowerCase();
  if (!/^(?:default|[a-z0-9][a-z0-9_]{0,63})$/.test(cleaned)) {
    throw new AppError("Key 标识不合法。", 400);
  }
  return cleaned;
}
