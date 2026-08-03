import { ensureRuntimeSchema } from "@/db/runtime-schema";
import { getD1 } from "@/db";
import type {
  AdminAuditEntry,
  AdminInvitationResult,
  AdminInvitationSummary,
  AdminUserSummary,
  AppUserProfile,
  AuthProvider,
  IdentityClaims,
  UserRole,
  UserStatus,
} from "@/lib/account-contracts";
import { AppError } from "@/lib/errors";
import type { PasswordCredential } from "@/lib/password-security";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  credit_balance: number;
  concurrency_limit: number;
  active_task_count: number;
  daily_credit_limit: number;
  password_enabled?: number;
  created_at: string;
  updated_at: string;
};

type AuditRow = {
  id: string;
  actor_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  reason: string;
  request_id: string;
  created_at: string;
};

type InvitationCodeRow = {
  id: string;
  email: string;
  initial_credits: number;
  initial_concurrency_limit: number;
  initial_daily_credit_limit: number;
  max_uses: number;
  use_count: number;
  created_by: string;
};

type AdminInvitationRow = {
  id: string;
  email: string;
  code_hint: string;
  initial_credits: number;
  initial_concurrency_limit: number;
  initial_daily_credit_limit: number;
  max_uses: number;
  use_count: number;
  allow_email_link: number;
  allow_manual_code: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

type PasswordCredentialRow = {
  algorithm: PasswordCredential["algorithm"];
  iterations: number;
  salt: string;
  password_hash: string;
};

const USER_SELECT = `
  SELECT id, email, display_name, role, status, credit_balance,
    concurrency_limit, active_task_count, daily_credit_limit,
    created_at, updated_at
  FROM users
`;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function appUser(row: UserRow, authProvider: AuthProvider): AppUserProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    fullName: row.display_name,
    role: row.role,
    status: row.status,
    authProvider,
  };
}

function adminUser(row: UserRow): AdminUserSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    creditBalance: row.credit_balance,
    concurrencyLimit: row.concurrency_limit,
    activeTaskCount: row.active_task_count,
    dailyCreditLimit: row.daily_credit_limit,
    passwordEnabled: row.password_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateDigest(value: string, label: string) {
  const normalized = value.trim();
  if (
    normalized.length < 32 ||
    normalized.length > 256 ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    throw new AppError(`${label}无效。`, 400);
  }
  return normalized;
}

export async function resolveIdentityClaims(
  claims: IdentityClaims,
): Promise<AppUserProfile | null> {
  await ensureRuntimeSchema();
  if (!claims.emailVerified) return null;

  const d1 = getD1();
  const email = normalizeEmail(claims.email);
  const subject = claims.subject.trim();
  if (!email || !subject) return null;

  const existingIdentity = await d1
    .prepare(`
      ${USER_SELECT}
      WHERE id = (
        SELECT user_id
        FROM auth_identities
        WHERE provider = ? AND provider_subject = ?
      )
      LIMIT 1
    `)
    .bind(claims.provider, subject)
    .first<UserRow>();
  if (existingIdentity) return appUser(existingIdentity, claims.provider);

  // Existing accounts are grandfathered in. A verified identity may bind to
  // the same normalized email, but a new account is only created by invitation.
  const existingUser = await d1
    .prepare(`${USER_SELECT} WHERE email = ? LIMIT 1`)
    .bind(email)
    .first<UserRow>();
  if (!existingUser) return null;
  if (claims.provider === "supabase_email") return null;

  await d1
    .prepare(`
      INSERT OR IGNORE INTO auth_identities (
        id, provider, provider_subject, user_id, verified_email
      ) VALUES (?, ?, ?, ?, ?)
    `)
    .bind(
      crypto.randomUUID(),
      claims.provider,
      subject,
      existingUser.id,
      email,
    )
    .run();

  const rebound = await d1
    .prepare(`
      ${USER_SELECT}
      WHERE id = (
        SELECT user_id
        FROM auth_identities
        WHERE provider = ? AND provider_subject = ?
      )
      LIMIT 1
    `)
    .bind(claims.provider, subject)
    .first<UserRow>();
  return rebound ? appUser(rebound, claims.provider) : null;
}

export const getUserByIdentity = resolveIdentityClaims;

export async function findUserBySessionDigest(
  digest: string,
): Promise<AppUserProfile | null> {
  await ensureRuntimeSchema();
  const tokenDigest = validateDigest(digest, "会话");
  const row = await getD1()
    .prepare(`
      ${USER_SELECT}
      WHERE id = (
        SELECT user_id
        FROM app_sessions
        WHERE token_digest = ?
          AND revoked_at IS NULL
          AND datetime(expires_at) > CURRENT_TIMESTAMP
      )
      LIMIT 1
    `)
    .bind(tokenDigest)
    .first<UserRow>();
  return row ? appUser(row, "supabase_email") : null;
}

export const getUserBySessionDigest = findUserBySessionDigest;

export async function findPasswordCredentialByEmail(
  email: string,
): Promise<{
  user: AppUserProfile;
  credential: PasswordCredential;
} | null> {
  await ensureRuntimeSchema();
  const d1 = getD1();
  const user = await d1
    .prepare(`${USER_SELECT} WHERE email = ? LIMIT 1`)
    .bind(normalizeEmail(email))
    .first<UserRow>();
  if (!user) return null;

  const credential = await d1
    .prepare(`
      SELECT algorithm, iterations, salt, password_hash
      FROM password_credentials
      WHERE user_id = ?
      LIMIT 1
    `)
    .bind(user.id)
    .first<PasswordCredentialRow>();
  if (!credential) return null;

  return {
    user: appUser(user, "password"),
    credential: {
      algorithm: credential.algorithm,
      iterations: credential.iterations,
      salt: credential.salt,
      passwordHash: credential.password_hash,
    },
  };
}

export async function hasValidInvitation(input: {
  email: string;
  inviteTokenDigest: string;
}) {
  await ensureRuntimeSchema();
  const invitation = await getD1()
    .prepare(`
      SELECT 1 AS valid
      FROM invitations
      WHERE email = ? AND token_digest = ?
        AND accepted_at IS NULL
        AND revoked_at IS NULL
        AND datetime(expires_at) > CURRENT_TIMESTAMP
      LIMIT 1
    `)
    .bind(
      normalizeEmail(input.email),
      validateDigest(input.inviteTokenDigest, "邀请链接"),
    )
    .first<{ valid: number }>();
  return invitation?.valid === 1;
}

export async function canRequestEmailOtp(input: {
  email: string;
  inviteTokenDigest?: string;
}) {
  await ensureRuntimeSchema();
  const email = normalizeEmail(input.email);
  const existingIdentity = await getD1()
    .prepare(`
      SELECT 1 AS valid
      FROM auth_identities i
      JOIN users u ON u.id = i.user_id
      WHERE i.provider = 'supabase_email' AND i.verified_email = ?
        AND u.status = 'active'
      LIMIT 1
    `)
    .bind(email)
    .first<{ valid: number }>();
  if (existingIdentity?.valid === 1) return true;
  if (!input.inviteTokenDigest) return false;
  return hasValidInvitation({
    email,
    inviteTokenDigest: input.inviteTokenDigest,
  });
}

export async function acceptEmailInvitation(input: {
  claims: IdentityClaims;
  inviteTokenDigest: string;
}): Promise<AppUserProfile> {
  await ensureRuntimeSchema();
  if (!input.claims.emailVerified) {
    throw new AppError("邮箱尚未通过验证。", 403);
  }

  const alreadyKnown = await resolveIdentityClaims(input.claims);
  if (alreadyKnown) return alreadyKnown;

  const d1 = getD1();
  const email = normalizeEmail(input.claims.email);
  const digest = validateDigest(input.inviteTokenDigest, "邀请链接");
  const invitation = await d1
    .prepare(`
      SELECT id
      FROM invitations
      WHERE token_digest = ?
        AND email = ?
        AND accepted_at IS NULL
        AND revoked_at IS NULL
        AND datetime(expires_at) > CURRENT_TIMESTAMP
      LIMIT 1
    `)
    .bind(digest, email)
    .first<{ id: string }>();
  if (!invitation) {
    throw new AppError("邀请链接无效、已使用或已过期。", 403);
  }

  const existingUser = await d1
    .prepare(`${USER_SELECT} WHERE email = ? LIMIT 1`)
    .bind(email)
    .first<UserRow>();
  if (existingUser) {
    await d1.batch([
      d1
        .prepare(`
          UPDATE invitations
          SET accepted_by = ?, accepted_at = CURRENT_TIMESTAMP
          WHERE id = ? AND token_digest = ? AND email = ?
            AND accepted_at IS NULL AND revoked_at IS NULL
            AND datetime(expires_at) > CURRENT_TIMESTAMP
        `)
        .bind(existingUser.id, invitation.id, digest, email),
      d1
        .prepare(`
          INSERT INTO auth_identities (
            id, provider, provider_subject, user_id, verified_email
          )
          SELECT ?, ?, ?, ?, ?
          WHERE changes() = 1
        `)
        .bind(
          crypto.randomUUID(),
          input.claims.provider,
          input.claims.subject.trim(),
          existingUser.id,
          email,
        ),
      d1
        .prepare(`
          INSERT INTO credit_ledger (
            id, user_id, amount, event, note, actor_user_id, source,
            idempotency_key
          )
          SELECT ?, ?, initial_credits, 'invite_grant', '邀请初始额度',
            created_by, 'invitation', ?
          FROM invitations
          WHERE id = ? AND accepted_by = ? AND accepted_at IS NOT NULL
            AND changes() = 1
        `)
        .bind(
          crypto.randomUUID(),
          existingUser.id,
          `invite:${invitation.id}`,
          invitation.id,
          existingUser.id,
        ),
      d1
        .prepare(`
          UPDATE users
          SET credit_balance = credit_balance + (
                SELECT initial_credits FROM invitations WHERE id = ?
              ),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND changes() = 1
        `)
        .bind(invitation.id, existingUser.id),
    ]);
    const linked = await resolveIdentityClaims(input.claims);
    if (!linked) {
      throw new AppError("邀请已被使用，请重新登录或联系管理员。", 409);
    }
    return linked;
  }

  const userId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const ledgerId = crypto.randomUUID();
  const displayName =
    input.claims.displayName.trim().slice(0, 200) ||
    email.split("@", 1)[0] ||
    email;

  await d1.batch([
    d1
      .prepare(`
        INSERT INTO users (
          id, email, display_name, credit_balance, concurrency_limit,
          role, status, active_task_count, daily_credit_limit,
          daily_credit_spent, daily_credit_date
        )
        SELECT ?, ?, ?, initial_credits, initial_concurrency_limit,
          'user', 'active', 0, initial_daily_credit_limit, 0, NULL
        FROM invitations
        WHERE id = ? AND token_digest = ? AND email = ?
          AND accepted_at IS NULL AND revoked_at IS NULL
          AND datetime(expires_at) > CURRENT_TIMESTAMP
      `)
      .bind(userId, email, displayName, invitation.id, digest, email),
    d1
      .prepare(`
        UPDATE invitations
        SET accepted_by = ?, accepted_at = CURRENT_TIMESTAMP
        WHERE id = ? AND token_digest = ? AND email = ?
          AND accepted_at IS NULL AND revoked_at IS NULL
          AND datetime(expires_at) > CURRENT_TIMESTAMP
          AND changes() = 1
      `)
      .bind(userId, invitation.id, digest, email),
    d1
      .prepare(`
        INSERT INTO auth_identities (
          id, provider, provider_subject, user_id, verified_email
        )
        SELECT ?, ?, ?, ?, ?
        FROM invitations
        WHERE id = ? AND accepted_by = ? AND accepted_at IS NOT NULL
      `)
      .bind(
        identityId,
        input.claims.provider,
        input.claims.subject.trim(),
        userId,
        email,
        invitation.id,
        userId,
      ),
    d1
      .prepare(`
        INSERT INTO credit_ledger (
          id, user_id, amount, event, note, actor_user_id, source,
          idempotency_key
        )
        SELECT ?, ?, initial_credits, 'invite_grant', '邀请初始额度',
          created_by, 'invitation', ?
        FROM invitations
        WHERE id = ? AND accepted_by = ? AND accepted_at IS NOT NULL
      `)
      .bind(
        ledgerId,
        userId,
        `invite:${invitation.id}`,
        invitation.id,
        userId,
      ),
  ]);

  const created = await resolveIdentityClaims(input.claims);
  if (!created) {
    throw new AppError("邀请已被使用，请重新登录或联系管理员。", 409);
  }
  return created;
}

export const acceptInvitation = acceptEmailInvitation;

export async function redeemRegistrationCode(input: {
  email: string;
  tokenDigest: string;
  channel: "email_link" | "manual";
  credential: PasswordCredential;
  requestId: string;
}): Promise<AppUserProfile> {
  await ensureRuntimeSchema();
  const d1 = getD1();
  const email = normalizeEmail(input.email);
  const digest = validateDigest(input.tokenDigest, "访问口令");
  const invitation = await d1
    .prepare(`
      SELECT id, email, initial_credits, initial_concurrency_limit,
        initial_daily_credit_limit, max_uses, use_count, created_by
      FROM invitations
      WHERE token_digest = ?
        AND revoked_at IS NULL
        AND datetime(expires_at) > CURRENT_TIMESTAMP
        AND (email = '' OR email = ?)
        AND (
          (? = 'email_link' AND allow_email_link = 1)
          OR (? = 'manual' AND allow_manual_code = 1)
        )
      LIMIT 1
    `)
    .bind(digest, email, input.channel, input.channel)
    .first<InvitationCodeRow>();
  if (!invitation) {
    throw new AppError("访问口令无效、已停用、已过期或不适用于此邮箱。", 403);
  }

  const existingUser = await d1
    .prepare(`${USER_SELECT} WHERE email = ? LIMIT 1`)
    .bind(email)
    .first<UserRow>();
  if (existingUser) {
    throw new AppError("该邮箱已注册，请直接登录或在账户页修改密码。", 409);
  }

  const userId = crypto.randomUUID();
  const redemptionId = crypto.randomUUID();
  const displayName = email.split("@", 1)[0] || email;
  await d1.batch([
    d1
      .prepare(`
        UPDATE invitations
        SET use_count = use_count + 1
        WHERE id = ? AND use_count < max_uses
          AND revoked_at IS NULL
          AND datetime(expires_at) > CURRENT_TIMESTAMP
      `)
      .bind(invitation.id),
    d1
      .prepare(`
        INSERT INTO users (
          id, email, display_name, credit_balance, concurrency_limit,
          role, status, active_task_count, daily_credit_limit,
          daily_credit_spent, daily_credit_date
        )
        SELECT ?, ?, ?, initial_credits, initial_concurrency_limit,
          'user', 'active', 0, initial_daily_credit_limit, 0, NULL
        FROM invitations
        WHERE id = ? AND changes() = 1
          AND NOT EXISTS (SELECT 1 FROM users WHERE email = ?)
      `)
      .bind(userId, email, displayName, invitation.id, email),
    d1
      .prepare(`
        INSERT INTO invitation_redemptions (
          id, invitation_id, user_id, email
        )
        SELECT ?, ?, ?, ?
        WHERE changes() = 1
      `)
      .bind(redemptionId, invitation.id, userId, email),
    d1
      .prepare(`
        INSERT INTO credit_ledger (
          id, user_id, amount, event, note, actor_user_id, source,
          idempotency_key
        )
        SELECT ?, ?, initial_credits, 'invite_grant', '访问口令初始额度',
          created_by, 'registration_code', ?
        FROM invitations
        WHERE id = ? AND changes() = 1
      `)
      .bind(
        crypto.randomUUID(),
        userId,
        `registration-code:${invitation.id}:${userId}`,
        invitation.id,
      ),
    d1
      .prepare(`
        INSERT INTO password_credentials (
          user_id, algorithm, iterations, salt, password_hash
        )
        SELECT ?, ?, ?, ?, ?
        FROM users
        WHERE id = ?
          AND EXISTS (
            SELECT 1 FROM invitation_redemptions
            WHERE invitation_id = ? AND user_id = ?
          )
      `)
      .bind(
        userId,
        input.credential.algorithm,
        input.credential.iterations,
        input.credential.salt,
        input.credential.passwordHash,
        userId,
        invitation.id,
        userId,
      ),
    d1
      .prepare(`
        INSERT INTO admin_audit_log (
          id, actor_user_id, action, target_type, target_id, reason, request_id
        )
        SELECT ?, ?, 'user.password_set', 'user', ?,
          '通过访问口令注册时设置登录密码', ?
        FROM users
        WHERE id = ?
          AND EXISTS (
            SELECT 1 FROM invitation_redemptions
            WHERE invitation_id = ? AND user_id = ?
          )
      `)
      .bind(
        crypto.randomUUID(),
        userId,
        userId,
        input.requestId,
        userId,
        invitation.id,
        userId,
      ),
  ]);

  const redeemed = await d1
    .prepare(`
      ${USER_SELECT}
      WHERE email = ?
        AND EXISTS (
          SELECT 1
          FROM invitation_redemptions
          WHERE invitation_id = ? AND user_id = users.id
        )
      LIMIT 1
    `)
    .bind(email, invitation.id)
    .first<UserRow>();
  if (!redeemed) {
    throw new AppError("访问口令可用次数已用完，请联系管理员。", 409);
  }
  if (redeemed.status !== "active") {
    throw new AppError("账号已暂停使用。", 403);
  }
  return appUser(redeemed, "password");
}

export async function createAppSession(input: {
  userId: string;
  tokenDigest: string;
  expiresAt: string;
  maxActiveSessions?: number;
}): Promise<void> {
  await ensureRuntimeSchema();
  const digest = validateDigest(input.tokenDigest, "会话");
  const maxActiveSessions = Math.max(
    1,
    Math.min(20, Math.trunc(input.maxActiveSessions ?? 5)),
  );
  const expiresAt = new Date(input.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new AppError("会话过期时间无效。", 400);
  }

  const d1 = getD1();
  const user = await d1
    .prepare("SELECT status FROM users WHERE id = ? LIMIT 1")
    .bind(input.userId)
    .first<{ status: UserStatus }>();
  if (!user || user.status !== "active") {
    throw new AppError("账号不存在或已暂停。", 403);
  }

  await d1.batch([
    d1
      .prepare(`
        UPDATE app_sessions
        SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
        WHERE user_id = ?
          AND revoked_at IS NULL
          AND (
            datetime(expires_at) <= CURRENT_TIMESTAMP
            OR id NOT IN (
              SELECT retained_sessions.id
              FROM (
                SELECT id
                FROM app_sessions
                WHERE user_id = ?
                  AND revoked_at IS NULL
                  AND datetime(expires_at) > CURRENT_TIMESTAMP
                ORDER BY created_at DESC, id DESC
                LIMIT ${maxActiveSessions - 1}
              ) AS retained_sessions
            )
          )
      `)
      .bind(input.userId, input.userId),
    d1
      .prepare(`
        INSERT INTO app_sessions (id, user_id, token_digest, expires_at)
        VALUES (?, ?, ?, ?)
      `)
      .bind(
        crypto.randomUUID(),
        input.userId,
        digest,
        expiresAt.toISOString(),
      ),
  ]);
}

export const createSession = createAppSession;

export async function revokeAppSession(tokenDigest: string): Promise<void> {
  await ensureRuntimeSchema();
  await getD1()
    .prepare(`
      UPDATE app_sessions
      SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
      WHERE token_digest = ?
    `)
    .bind(validateDigest(tokenDigest, "会话"))
    .run();
}

export const revokeSession = revokeAppSession;

export async function revokeUserSessions(input: {
  actorUserId?: string;
  targetUserId?: string;
  requestId?: string;
  userId?: string;
}): Promise<number> {
  await ensureRuntimeSchema();
  const userId = input.targetUserId ?? input.userId;
  if (!userId) throw new AppError("缺少用户 ID。", 400);
  const d1 = getD1();
  const statements = [
    d1
      .prepare(`
        UPDATE app_sessions
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND revoked_at IS NULL
      `)
      .bind(userId),
  ];
  if (input.actorUserId && input.requestId) {
    statements.push(
      auditStatement(d1, {
        actorUserId: input.actorUserId,
        action: "sessions.revoke",
        targetType: "user",
        targetId: userId,
        reason: "管理员撤销用户会话",
        requestId: input.requestId,
      }),
    );
  }
  const results = await d1.batch(statements);
  return Number(results[0]?.meta.changes ?? 0);
}

export async function consumeRateLimit(input: {
  scope?: string;
  action?: string;
  keyDigest?: string;
  bucketHash?: string;
  limit: number;
  windowSeconds: number;
}): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
  windowStart: number;
}> {
  await ensureRuntimeSchema();
  const scope = (input.scope ?? input.action ?? "").trim();
  const keyDigest = validateDigest(
    input.keyDigest ?? input.bucketHash ?? "",
    "限流标识",
  );
  if (
    !scope ||
    scope.length > 80 ||
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    !Number.isInteger(input.windowSeconds) ||
    input.windowSeconds < 1
  ) {
    throw new AppError("限流参数无效。", 400);
  }

  const now = Math.floor(Date.now() / 1_000);
  const windowStart =
    Math.floor(now / input.windowSeconds) * input.windowSeconds;
  const expiresAt = windowStart + input.windowSeconds;
  const d1 = getD1();
  const results = await d1.batch([
    d1
      .prepare(`
        DELETE FROM rate_limit_buckets
        WHERE rowid IN (
          SELECT rowid
          FROM rate_limit_buckets
          WHERE expires_at < ?
          ORDER BY expires_at
          LIMIT 100
        )
      `)
      .bind(now),
    d1
      .prepare(`
      INSERT INTO rate_limit_buckets (
        scope, key_digest, window_start, count, expires_at
      ) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(scope, key_digest, window_start) DO UPDATE SET
        count = count + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE rate_limit_buckets.count < ?
    `)
      .bind(scope, keyDigest, windowStart, expiresAt, input.limit),
  ]);
  return {
    allowed: Number(results[1]?.meta.changes ?? 0) === 1,
    retryAfterSeconds: Math.max(1, expiresAt - now),
    windowStart,
  };
}

export async function releaseRateLimit(input: {
  scope: string;
  keyDigest: string;
  windowStart: number;
}) {
  await ensureRuntimeSchema();
  const scope = input.scope.trim();
  const keyDigest = validateDigest(input.keyDigest, "限流标识");
  if (
    !scope ||
    scope.length > 80 ||
    !Number.isInteger(input.windowStart) ||
    input.windowStart < 0
  ) {
    throw new AppError("限流参数无效。", 400);
  }
  const d1 = getD1();
  await d1.batch([
    d1
      .prepare(`
        UPDATE rate_limit_buckets
        SET count = count - 1, updated_at = CURRENT_TIMESTAMP
        WHERE scope = ? AND key_digest = ? AND window_start = ?
          AND count > 1
      `)
      .bind(scope, keyDigest, input.windowStart),
    d1
      .prepare(`
        DELETE FROM rate_limit_buckets
        WHERE scope = ? AND key_digest = ? AND window_start = ?
          AND count = 1 AND changes() = 0
      `)
      .bind(scope, keyDigest, input.windowStart),
  ]);
}

export async function consumeTaskSubmissionRateLimit(input: {
  keyDigest: string;
  minuteLimit?: number;
  dailyLimit?: number;
}): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  await ensureRuntimeSchema();
  const keyDigest = validateDigest(input.keyDigest, "限流标识");
  const minuteLimit = input.minuteLimit ?? 5;
  const dailyLimit = input.dailyLimit ?? 50;
  const now = Math.floor(Date.now() / 1_000);
  const minuteStart = Math.floor(now / 60) * 60;
  const daySeconds = 24 * 60 * 60;
  const dayStart = Math.floor(now / daySeconds) * daySeconds;
  const d1 = getD1();
  const results = await d1.batch([
    d1
      .prepare(`
        INSERT INTO rate_limit_buckets (
          scope, key_digest, window_start, count, expires_at
        ) VALUES ('task_submit_minute', ?, ?, 1, ?)
        ON CONFLICT(scope, key_digest, window_start) DO UPDATE SET
          count = count + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE rate_limit_buckets.count < ?
      `)
      .bind(keyDigest, minuteStart, minuteStart + 60, minuteLimit),
    d1
      .prepare(`
        INSERT INTO rate_limit_buckets (
          scope, key_digest, window_start, count, expires_at
        )
        SELECT 'task_submit_day', ?, ?, 1, ?
        WHERE changes() = 1
        ON CONFLICT(scope, key_digest, window_start) DO UPDATE SET
          count = count + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE rate_limit_buckets.count < ?
      `)
      .bind(
        keyDigest,
        dayStart,
        dayStart + daySeconds,
        dailyLimit,
      ),
  ]);
  const minuteAccepted = Number(results[0]?.meta.changes ?? 0) === 1;
  const dailyAccepted = Number(results[1]?.meta.changes ?? 0) === 1;
  return {
    allowed: minuteAccepted && dailyAccepted,
    retryAfterSeconds: minuteAccepted
      ? Math.max(1, dayStart + daySeconds - now)
      : Math.max(1, minuteStart + 60 - now),
  };
}

export async function listAdminUsers(input: {
  query?: string;
  cursor?: string;
  limit?: number;
}) {
  await ensureRuntimeSchema();
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 20)));
  const query = input.query?.trim().toLowerCase();
  const cursor = input.cursor?.trim();
  const where: string[] = ["deleted_at IS NULL"];
  const bindings: unknown[] = [];
  if (query) {
    where.push("(lower(email) LIKE ? OR lower(display_name) LIKE ? OR id = ?)");
    bindings.push(`%${query}%`, `%${query}%`, query);
  }
  if (cursor) {
    where.push("id > ?");
    bindings.push(cursor);
  }
  const rows = await getD1()
    .prepare(`
      SELECT id, email, display_name, role, status, credit_balance,
        concurrency_limit, active_task_count, daily_credit_limit,
        created_at, updated_at,
        EXISTS (
          SELECT 1 FROM password_credentials
          WHERE user_id = users.id
        ) AS password_enabled
      FROM users
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY id ASC
      LIMIT ?
    `)
    .bind(...bindings, limit + 1)
    .all<UserRow>();
  const items = rows.results.slice(0, limit).map(adminUser);
  return {
    users: items,
    items,
    nextCursor:
      rows.results.length > limit ? items.at(-1)?.id ?? null : null,
  };
}

export async function updateAdminUser(input: {
  actorUserId: string;
  targetUserId: string;
  role?: UserRole;
  status?: UserStatus;
  concurrencyLimit?: number;
  dailyCreditLimit?: number;
  reason?: string;
  requestId: string;
}) {
  await ensureRuntimeSchema();
  const assignments: string[] = [];
  const bindings: unknown[] = [];
  if (input.role !== undefined) {
    assignments.push("role = ?");
    bindings.push(input.role);
  }
  if (input.status !== undefined) {
    assignments.push("status = ?");
    bindings.push(input.status);
  }
  if (input.concurrencyLimit !== undefined) {
    assignments.push("concurrency_limit = ?");
    bindings.push(input.concurrencyLimit);
  }
  if (input.dailyCreditLimit !== undefined) {
    assignments.push("daily_credit_limit = ?");
    bindings.push(input.dailyCreditLimit);
  }
  if (!assignments.length) throw new AppError("没有可更新的用户字段。", 400);

  const d1 = getD1();
  // MySQL rejects a direct users-to-users subquery in an UPDATE with error 1093.
  // The derived-table snapshot keeps the last-active-admin guard in one statement.
  const results = await d1.batch([
    d1
      .prepare(`
        UPDATE users
        SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND deleted_at IS NULL
          AND (
            role <> 'admin'
            OR (
              COALESCE(?, role) = 'admin'
              AND COALESCE(?, status) = 'active'
            )
            OR EXISTS (
              SELECT 1
              FROM (
                SELECT id
                FROM users
                WHERE role = 'admin'
                  AND status = 'active'
                  AND deleted_at IS NULL
              ) AS active_admins
              WHERE active_admins.id <> users.id
            )
          )
      `)
      .bind(
        ...bindings,
        input.targetUserId,
        input.role ?? null,
        input.status ?? null,
      ),
    d1
      .prepare(`
        INSERT INTO admin_audit_log (
          id, actor_user_id, action, target_type, target_id, reason, request_id
        )
        SELECT ?, ?, 'user.update', 'user', ?, ?, ?
        WHERE changes() = 1
      `)
      .bind(
        crypto.randomUUID(),
        input.actorUserId,
        input.targetUserId,
        input.reason?.trim() || "管理员更新用户",
        input.requestId,
      ),
    d1
      .prepare(`
        UPDATE app_sessions
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND revoked_at IS NULL AND ? = 'suspended'
      `)
      .bind(input.targetUserId, input.status ?? ""),
  ]);
  const updated = Number(results[0]?.meta.changes ?? 0) === 1;

  const row = await d1
    .prepare(`${USER_SELECT} WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(input.targetUserId)
    .first<UserRow>();
  if (!row) throw new AppError("用户不存在。", 404);
  if (!updated) {
    throw new AppError("必须至少保留一名活跃管理员。", 409);
  }
  return adminUser(row);
}

export async function deleteAdminUser(input: {
  actorUserId: string;
  targetUserId: string;
  requestId: string;
}) {
  await ensureRuntimeSchema();
  if (input.actorUserId === input.targetUserId) {
    throw new AppError("不能删除当前登录的管理员账号。", 409);
  }

  const d1 = getD1();
  // Keep the last-active-admin guard atomic while remaining valid on MySQL.
  const results = await d1.batch([
    d1
      .prepare(`
        UPDATE users
        SET status = 'suspended',
            deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND deleted_at IS NULL
          AND (
            role <> 'admin'
            OR EXISTS (
              SELECT 1
              FROM (
                SELECT id
                FROM users
                WHERE role = 'admin'
                  AND status = 'active'
                  AND deleted_at IS NULL
              ) AS active_admins
              WHERE active_admins.id <> users.id
            )
          )
      `)
      .bind(input.targetUserId),
    d1
      .prepare(`
        INSERT INTO admin_audit_log (
          id, actor_user_id, action, target_type, target_id, reason, request_id
        )
        SELECT ?, ?, 'user.delete', 'user', ?, ?, ?
        WHERE changes() = 1
      `)
      .bind(
        crypto.randomUUID(),
        input.actorUserId,
        input.targetUserId,
        "删除用户账号；保留历史任务、额度、媒体索引与审计记录",
        input.requestId,
      ),
    d1
      .prepare(`
        UPDATE app_sessions
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND revoked_at IS NULL
          AND EXISTS (
            SELECT 1 FROM users
            WHERE id = ? AND deleted_at IS NOT NULL
          )
      `)
      .bind(input.targetUserId, input.targetUserId),
  ]);

  if (Number(results[0]?.meta.changes ?? 0) === 1) {
    return {
      userId: input.targetUserId,
      revokedSessions: Number(results[2]?.meta.changes ?? 0),
    };
  }

  const target = await d1
    .prepare(`
      SELECT role, status, deleted_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `)
    .bind(input.targetUserId)
    .first<{ role: UserRole; status: UserStatus; deleted_at: string | null }>();
  if (!target || target.deleted_at) {
    throw new AppError("用户不存在。", 404);
  }
  if (target.role === "admin") {
    throw new AppError("必须至少保留一名活跃管理员。", 409);
  }
  throw new AppError("用户暂时无法删除，请稍后重试。", 409);
}

export async function createAdminInvitation(input: {
  actorUserId: string;
  email: string;
  code: string;
  initialCredits: number;
  initialConcurrencyLimit: number;
  initialDailyCreditLimit: number;
  expiresInDays: number;
  maxUses: number;
  allowEmailLink: boolean;
  allowManualCode: boolean;
  origin: string;
  requestId: string;
  tokenDigest: string;
}): Promise<AdminInvitationResult> {
  await ensureRuntimeSchema();
  const email = input.email ? normalizeEmail(input.email) : "";
  const digest = validateDigest(input.tokenDigest, "邀请链接");
  if (
    !Number.isInteger(input.initialCredits) ||
    input.initialCredits < 0 ||
    input.initialCredits > 1_000_000 ||
    !Number.isInteger(input.initialConcurrencyLimit) ||
    input.initialConcurrencyLimit < 1 ||
    input.initialConcurrencyLimit > 20 ||
    !Number.isInteger(input.initialDailyCreditLimit) ||
    input.initialDailyCreditLimit < 0 ||
    input.initialDailyCreditLimit > 1_000_000 ||
    !Number.isInteger(input.expiresInDays) ||
    input.expiresInDays < 1 ||
    !Number.isInteger(input.maxUses) ||
    input.maxUses < 1 ||
    (!input.allowEmailLink && !input.allowManualCode) ||
    (input.allowEmailLink && !email)
  ) {
    throw new AppError("邀请参数无效。", 400);
  }
  const id = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + input.expiresInDays * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const origin = new URL(input.origin).origin;
  const d1 = getD1();
  const duplicate = await d1
    .prepare("SELECT 1 AS found FROM invitations WHERE token_digest = ? LIMIT 1")
    .bind(digest)
    .first<{ found: number }>();
  if (duplicate?.found === 1) {
    throw new AppError("该访问口令已存在，请换一个口令。", 409);
  }
  await d1.batch([
    d1
      .prepare(`
        INSERT INTO invitations (
          id, email, token_digest, code_hint, initial_credits,
          initial_concurrency_limit, initial_daily_credit_limit, max_uses,
          allow_email_link, allow_manual_code, expires_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        email,
        digest,
        maskRegistrationCode(input.code),
        input.initialCredits,
        input.initialConcurrencyLimit,
        input.initialDailyCreditLimit,
        input.maxUses,
        input.allowEmailLink ? 1 : 0,
        input.allowManualCode ? 1 : 0,
        expiresAt,
        input.actorUserId,
      ),
    auditStatement(d1, {
      actorUserId: input.actorUserId,
      action: "invitation.create",
      targetType: "invitation",
      targetId: id,
      reason: email
        ? `创建访问口令并绑定 ${email}`
        : `创建可共享访问口令（${input.maxUses} 次）`,
      requestId: input.requestId,
    }),
  ]);
  return {
    id,
    email,
    code: input.code,
    inviteUrl: input.allowEmailLink
      ? `${origin}/invite/${encodeURIComponent(input.code)}`
      : null,
    initialCredits: input.initialCredits,
    initialConcurrencyLimit: input.initialConcurrencyLimit,
    initialDailyCreditLimit: input.initialDailyCreditLimit,
    maxUses: input.maxUses,
    allowEmailLink: input.allowEmailLink,
    allowManualCode: input.allowManualCode,
    expiresAt,
  };
}

export async function setUserPassword(input: {
  actorUserId: string;
  targetUserId: string;
  requestId: string;
  credential: PasswordCredential;
  reason?: string;
  preserveSessionDigest?: string | null;
}): Promise<void> {
  await ensureRuntimeSchema();
  const d1 = getD1();
  const user = await d1
    .prepare(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    )
    .bind(input.targetUserId)
    .first<{ id: string }>();
  if (!user) throw new AppError("用户不存在。", 404);

  const statements: D1PreparedStatement[] = [
    d1
      .prepare(`
        INSERT INTO password_credentials (
          user_id, algorithm, iterations, salt, password_hash
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          algorithm = excluded.algorithm,
          iterations = excluded.iterations,
          salt = excluded.salt,
          password_hash = excluded.password_hash,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(
        user.id,
        input.credential.algorithm,
        input.credential.iterations,
        input.credential.salt,
        input.credential.passwordHash,
      ),
  ];
  if (input.preserveSessionDigest !== undefined) {
    statements.push(
      input.preserveSessionDigest
        ? d1
            .prepare(`
              UPDATE app_sessions
              SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
              WHERE user_id = ? AND token_digest <> ? AND revoked_at IS NULL
            `)
            .bind(
              user.id,
              validateDigest(input.preserveSessionDigest, "会话"),
            )
        : d1
            .prepare(`
              UPDATE app_sessions
              SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
              WHERE user_id = ? AND revoked_at IS NULL
            `)
            .bind(user.id),
    );
  }
  statements.push(
    auditStatement(d1, {
      actorUserId: input.actorUserId,
      action: "user.password_set",
      targetType: "user",
      targetId: user.id,
      reason: input.reason ?? "管理员设置或更新登录密码",
      requestId: input.requestId,
    }),
  );
  await d1.batch(statements);
}

export async function removeAdminPassword(input: {
  actorUserId: string;
  targetUserId: string;
  requestId: string;
}): Promise<void> {
  await ensureRuntimeSchema();
  const d1 = getD1();
  const result = await d1
    .prepare(`
      DELETE FROM password_credentials
      WHERE user_id = ?
        AND EXISTS (
          SELECT 1 FROM users
          WHERE id = ? AND deleted_at IS NULL
        )
    `)
    .bind(input.targetUserId, input.targetUserId)
    .run();
  if (Number(result.meta.changes ?? 0) !== 1) {
    throw new AppError("该用户尚未设置登录密码。", 404);
  }
  await auditStatement(d1, {
    actorUserId: input.actorUserId,
    action: "user.password_removed",
    targetType: "user",
    targetId: input.targetUserId,
    reason: "管理员移除登录密码",
    requestId: input.requestId,
  }).run();
}

export async function setAdminPasswordForRecovery(input: {
  email: string;
  requestId: string;
  credential: PasswordCredential;
}): Promise<void> {
  await ensureRuntimeSchema();
  const email = normalizeEmail(input.email);
  const d1 = getD1();
  const user = await d1
    .prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first<{ id: string }>();
  if (!user) {
    throw new AppError("管理员账户不存在。", 404);
  }

  await d1.batch([
    d1
      .prepare(`
        UPDATE users
        SET role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(user.id),
    d1
      .prepare(`
        INSERT INTO password_credentials (
          user_id, algorithm, iterations, salt, password_hash
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          algorithm = excluded.algorithm,
          iterations = excluded.iterations,
          salt = excluded.salt,
          password_hash = excluded.password_hash,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(
        user.id,
        input.credential.algorithm,
        input.credential.iterations,
        input.credential.salt,
        input.credential.passwordHash,
      ),
    auditStatement(d1, {
      actorUserId: user.id,
      action: "user.initialize_admin_password",
      targetType: "user",
      targetId: user.id,
      reason: "通过临时恢复密钥初始化管理员密码",
      requestId: input.requestId,
    }),
  ]);
}

export async function recoverAdminAccess(input: {
  email: string;
  code: string;
  origin: string;
  requestId: string;
  tokenDigest: string;
}): Promise<AdminInvitationResult & { userId: string }> {
  await ensureRuntimeSchema();
  const email = normalizeEmail(input.email);
  const d1 = getD1();
  const user = await d1.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first<{ id: string }>();
  if (!user) throw new AppError("管理员账户不存在。", 404);
  await d1.batch([
    d1.prepare("UPDATE users SET role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id),
    auditStatement(d1, { actorUserId: user.id, action: "user.recover_admin", targetType: "user", targetId: user.id, reason: "创建一次性管理员访问口令", requestId: input.requestId }),
  ]);
  const invitation = await createAdminInvitation({ actorUserId: user.id, email, code: input.code, initialCredits: 0, initialConcurrencyLimit: 1, initialDailyCreditLimit: 500, expiresInDays: 1, maxUses: 1, allowEmailLink: false, allowManualCode: true, origin: input.origin, requestId: input.requestId, tokenDigest: input.tokenDigest });
  return { ...invitation, userId: user.id };
}
export async function listAdminInvitations(): Promise<
  AdminInvitationSummary[]
> {
  await ensureRuntimeSchema();
  const result = await getD1()
    .prepare(`
      SELECT id, email, code_hint, initial_credits, initial_concurrency_limit,
        initial_daily_credit_limit, max_uses, use_count,
        allow_email_link, allow_manual_code, expires_at, revoked_at, created_at
      FROM invitations
      WHERE deleted_at IS NULL
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 100
    `)
    .all<AdminInvitationRow>();
  return result.results.map(adminInvitation);
}

export async function updateAdminInvitation(input: {
  actorUserId: string;
  invitationId: string;
  email: string;
  initialCredits: number;
  initialConcurrencyLimit: number;
  initialDailyCreditLimit: number;
  maxUses: number;
  allowEmailLink: boolean;
  allowManualCode: boolean;
  expiresAt: string;
  revoked: boolean;
  requestId: string;
}): Promise<AdminInvitationSummary> {
  await ensureRuntimeSchema();
  const d1 = getD1();
  const current = await d1
    .prepare(`
      SELECT use_count
      FROM invitations
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `)
    .bind(input.invitationId)
    .first<{ use_count: number }>();
  if (!current) throw new AppError("访问口令不存在。", 404);
  if (input.maxUses < current.use_count) {
    throw new AppError(
      `可用次数不能小于已使用次数 ${current.use_count}。`,
      409,
    );
  }

  const email = input.email ? normalizeEmail(input.email) : "";
  if (
    !Number.isInteger(input.initialCredits) ||
    input.initialCredits < 0 ||
    input.initialCredits > 1_000_000 ||
    !Number.isInteger(input.initialConcurrencyLimit) ||
    input.initialConcurrencyLimit < 1 ||
    input.initialConcurrencyLimit > 20 ||
    !Number.isInteger(input.initialDailyCreditLimit) ||
    input.initialDailyCreditLimit < 0 ||
    input.initialDailyCreditLimit > 1_000_000 ||
    !Number.isInteger(input.maxUses) ||
    input.maxUses < 1 ||
    (!input.allowEmailLink && !input.allowManualCode) ||
    (input.allowEmailLink && !email)
  ) {
    throw new AppError("访问口令配置无效。", 400);
  }
  const expiresAt = new Date(input.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new AppError("访问口令有效期无效。", 400);
  }

  await d1.batch([
    d1
      .prepare(`
        UPDATE invitations
        SET email = ?,
            initial_credits = ?,
            initial_concurrency_limit = ?,
            initial_daily_credit_limit = ?,
            max_uses = ?,
            allow_email_link = ?,
            allow_manual_code = ?,
            expires_at = ?,
            revoked_at = CASE
              WHEN ? = 1 THEN COALESCE(revoked_at, CURRENT_TIMESTAMP)
              ELSE NULL
            END
        WHERE id = ? AND deleted_at IS NULL
      `)
      .bind(
        email,
        input.initialCredits,
        input.initialConcurrencyLimit,
        input.initialDailyCreditLimit,
        input.maxUses,
        input.allowEmailLink ? 1 : 0,
        input.allowManualCode ? 1 : 0,
        expiresAt.toISOString(),
        input.revoked ? 1 : 0,
        input.invitationId,
      ),
    auditStatement(d1, {
      actorUserId: input.actorUserId,
      action: "invitation.update",
      targetType: "invitation",
      targetId: input.invitationId,
      reason: input.revoked
        ? "更新访问口令配置并停用"
        : "更新访问口令配置并启用",
      requestId: input.requestId,
    }),
  ]);

  const updated = await d1
    .prepare(`
      SELECT id, email, code_hint, initial_credits, initial_concurrency_limit,
        initial_daily_credit_limit, max_uses, use_count,
        allow_email_link, allow_manual_code, expires_at, revoked_at, created_at
      FROM invitations
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `)
    .bind(input.invitationId)
    .first<AdminInvitationRow>();
  if (!updated) throw new AppError("访问口令不存在。", 404);
  return adminInvitation(updated);
}

export async function deleteAdminInvitation(input: {
  actorUserId: string;
  invitationId: string;
  requestId: string;
}): Promise<void> {
  await ensureRuntimeSchema();
  const d1 = getD1();
  const current = await d1
    .prepare(`
      SELECT 1 AS found
      FROM invitations
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `)
    .bind(input.invitationId)
    .first<{ found: number }>();
  if (!current) throw new AppError("访问口令不存在。", 404);

  await d1.batch([
    d1
      .prepare(`
        UPDATE invitations
        SET deleted_at = CURRENT_TIMESTAMP,
            revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
        WHERE id = ? AND deleted_at IS NULL
      `)
      .bind(input.invitationId),
    auditStatement(d1, {
      actorUserId: input.actorUserId,
      action: "invitation.delete",
      targetType: "invitation",
      targetId: input.invitationId,
      reason: "删除访问口令；历史兑换与额度账本保留",
      requestId: input.requestId,
    }),
  ]);
}

export async function getAccountOverview(userId: string) {
  await ensureRuntimeSchema();
  const d1 = getD1();
  const user = await d1
    .prepare(`
      SELECT id, email, display_name, credit_balance, concurrency_limit,
        daily_credit_limit,
        EXISTS (
          SELECT 1 FROM password_credentials
          WHERE user_id = users.id
        ) AS password_enabled
      FROM users
      WHERE id = ?
      LIMIT 1
    `)
    .bind(userId)
    .first<{
      id: string;
      email: string;
      display_name: string;
      credit_balance: number;
      concurrency_limit: number;
      daily_credit_limit: number;
      password_enabled: number;
    }>();
  if (!user) throw new AppError("账户不存在。", 404);

  const ledger = await d1
    .prepare(`
      SELECT id, task_id, amount, event, note, source, created_at
      FROM credit_ledger
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    `)
    .bind(userId)
    .all<{
      id: string;
      task_id: string | null;
      amount: number;
      event: string;
      note: string;
      source: string;
      created_at: string;
    }>();

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      creditBalance: user.credit_balance,
      concurrencyLimit: user.concurrency_limit,
      dailyCreditLimit: user.daily_credit_limit,
      passwordEnabled: user.password_enabled === 1,
    },
    ledgerEntries: ledger.results.map((entry) => ({
      id: entry.id,
      taskId: entry.task_id,
      amount: entry.amount,
      event: entry.event,
      note: entry.note,
      source: entry.source,
      createdAt: entry.created_at,
    })),
  };
}
export async function adjustAdminCredits(input: {
  actorUserId: string;
  userId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
  requestId: string;
}) {
  await ensureRuntimeSchema();
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new AppError("额度调整必须是非零整数。", 400);
  }
  const idempotencyKey = `admin:${input.idempotencyKey.trim()}`;
  const d1 = getD1();
  const prior = await d1
    .prepare(`
      SELECT amount
      FROM credit_ledger
      WHERE idempotency_key = ?
      LIMIT 1
    `)
    .bind(idempotencyKey)
    .first<{ amount: number }>();
  if (prior && prior.amount !== input.amount) {
    throw new AppError("幂等键已用于不同的额度调整。", 409);
  }
  const ledgerId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  await d1.batch([
    d1
      .prepare(`
        INSERT OR IGNORE INTO credit_ledger (
          id, user_id, amount, event, note, actor_user_id, source,
          idempotency_key
        )
        SELECT ?, id, ?, 'admin_adjustment', ?, ?, 'admin', ?
        FROM users
        WHERE id = ? AND credit_balance + ? >= 0
      `)
      .bind(
        ledgerId,
        input.amount,
        input.reason,
        input.actorUserId,
        idempotencyKey,
        input.userId,
        input.amount,
      ),
    d1
      .prepare(`
        UPDATE users
        SET credit_balance = credit_balance + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND changes() = 1
      `)
      .bind(input.amount, input.userId),
    d1
      .prepare(`
        INSERT INTO admin_audit_log (
          id, actor_user_id, action, target_type, target_id, reason, request_id
        )
        SELECT ?, ?, 'credits.adjust', 'user', ?, ?, ?
        WHERE changes() = 1
      `)
      .bind(
        auditId,
        input.actorUserId,
        input.userId,
        input.reason,
        input.requestId,
      ),
  ]);

  const row = await d1
    .prepare(`
      SELECT u.credit_balance, l.id AS ledger_id, l.amount AS ledger_amount
      FROM users u
      LEFT JOIN credit_ledger l
        ON l.user_id = u.id AND l.idempotency_key = ?
      WHERE u.id = ?
      LIMIT 1
    `)
    .bind(idempotencyKey, input.userId)
    .first<{
      credit_balance: number;
      ledger_id: string | null;
      ledger_amount: number | null;
    }>();
  if (!row) throw new AppError("用户不存在。", 404);
  if (!row.ledger_id) {
    throw new AppError("扣减后余额不能小于零。", 409);
  }
  if (row.ledger_amount !== input.amount) {
    throw new AppError("幂等键已用于不同的额度调整。", 409);
  }
  return {
    userId: input.userId,
    creditBalance: row.credit_balance,
    amount: input.amount,
    idempotencyKey: input.idempotencyKey,
  };
}

export const adjustUserCredits = adjustAdminCredits;

export async function listAdminAudit(input: {
  cursor?: string;
  auditCursor?: string;
  ledgerCursor?: string;
  limit?: number;
}) {
  await ensureRuntimeSchema();
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 30)));
  const auditCursor = decodeAuditCursor(
    input.auditCursor ?? input.cursor,
    "审计",
  );
  const ledgerCursor = decodeAuditCursor(input.ledgerCursor, "账本");
  const d1 = getD1();
  const auditRows = await d1
    .prepare(`
      SELECT id, actor_user_id, action, target_type, target_id, reason,
        request_id, created_at
      FROM admin_audit_log
      WHERE (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `)
    .bind(
      auditCursor?.createdAt ?? null,
      auditCursor?.createdAt ?? null,
      auditCursor?.createdAt ?? null,
      auditCursor?.id ?? null,
      limit + 1,
    )
    .all<AuditRow>();
  const ledgerRows = await d1
    .prepare(`
      SELECT id, user_id, task_id, amount, event, note, actor_user_id,
        source, created_at
      FROM credit_ledger
      WHERE (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `)
    .bind(
      ledgerCursor?.createdAt ?? null,
      ledgerCursor?.createdAt ?? null,
      ledgerCursor?.createdAt ?? null,
      ledgerCursor?.id ?? null,
      limit + 1,
    )
    .all<{
      id: string;
      user_id: string;
      task_id: string | null;
      amount: number;
      event: string;
      note: string;
      actor_user_id: string | null;
      source: string;
      created_at: string;
    }>();
  const auditItems = auditRows.results.slice(0, limit).map(toAuditEntry);
  const ledgerItems = ledgerRows.results.slice(0, limit).map((entry) => ({
    id: entry.id,
    userId: entry.user_id,
    taskId: entry.task_id,
    amount: entry.amount,
    event: entry.event,
    note: entry.note,
    actorUserId: entry.actor_user_id,
    source: entry.source,
    createdAt: entry.created_at,
  }));
  const lastAudit =
    auditRows.results.length > limit ? auditRows.results[limit - 1] : null;
  const lastLedger =
    ledgerRows.results.length > limit ? ledgerRows.results[limit - 1] : null;
  const nextAuditCursor = lastAudit
    ? encodeAuditCursor(lastAudit.created_at, lastAudit.id)
    : null;
  const nextLedgerCursor = lastLedger
    ? encodeAuditCursor(lastLedger.created_at, lastLedger.id)
    : null;

  return {
    entries: auditItems,
    items: auditItems,
    ledgerEntries: ledgerItems,
    nextCursor: nextAuditCursor,
    nextAuditCursor,
    nextLedgerCursor,
  };
}

export const listAdminAuditEntries = listAdminAudit;

export async function bootstrapAdminByEmail(email: string) {
  await ensureRuntimeSchema();
  // Use a derived snapshot because MySQL cannot read users directly while
  // updating users in the same statement.
  const result = await getD1()
    .prepare(`
      UPDATE users
      SET role = 'admin', updated_at = CURRENT_TIMESTAMP
      WHERE email = ?
        AND NOT EXISTS (
          SELECT 1
          FROM (
            SELECT id
            FROM users
            WHERE role = 'admin'
          ) AS existing_admins
        )
    `)
    .bind(normalizeEmail(email))
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

function auditStatement(
  d1: D1Database,
  input: {
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    requestId: string;
  },
) {
  return d1
    .prepare(`
      INSERT INTO admin_audit_log (
        id, actor_user_id, action, target_type, target_id, reason, request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      crypto.randomUUID(),
      input.actorUserId,
      input.action,
      input.targetType,
      input.targetId,
      input.reason,
      input.requestId,
    );
}

function toAuditEntry(row: AuditRow): AdminAuditEntry {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    requestId: row.request_id,
    createdAt: row.created_at,
  };
}

function adminInvitation(row: AdminInvitationRow): AdminInvitationSummary {
  return {
    id: row.id,
    email: row.email,
    codeHint: row.code_hint,
    initialCredits: row.initial_credits,
    initialConcurrencyLimit: row.initial_concurrency_limit,
    initialDailyCreditLimit: row.initial_daily_credit_limit,
    maxUses: row.max_uses,
    useCount: row.use_count,
    allowEmailLink: row.allow_email_link === 1,
    allowManualCode: row.allow_manual_code === 1,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

function encodeAuditCursor(createdAt: string, id: string) {
  return `${createdAt}|${id}`;
}

function decodeAuditCursor(value?: string, label = "审计") {
  if (!value) return null;
  const separator = value.lastIndexOf("|");
  if (separator < 1 || separator === value.length - 1) {
    throw new AppError(`${label}游标无效。`, 400);
  }
  return {
    createdAt: value.slice(0, separator),
    id: value.slice(separator + 1),
  };
}

function maskRegistrationCode(code: string) {
  const normalized = code.trim().toUpperCase();
  return normalized.length <= 4
    ? normalized
    : `${normalized.slice(0, 2)}••${normalized.slice(-2)}`;
}
