import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  // Legacy database defaults stay unchanged for safe forward migration.
  // All new account creation explicitly writes 0 credits and concurrency 1.
  creditBalance: integer("credit_balance").notNull().default(1000),
  concurrencyLimit: integer("concurrency_limit").notNull().default(3),
  role: text("role", { enum: ["user", "support", "admin"] })
    .notNull()
    .default("user"),
  status: text("status", { enum: ["active", "suspended"] })
    .notNull()
    .default("active"),
  activeTaskCount: integer("active_task_count").notNull().default(0),
  dailyCreditLimit: integer("daily_credit_limit").notNull().default(500),
  dailyCreditSpent: integer("daily_credit_spent").notNull().default(0),
  dailyCreditDate: text("daily_credit_date"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const videoTasks = sqliteTable(
  "video_tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    viduTaskId: text("vidu_task_id"),
    kind: text("kind", {
      enum: ["reference", "replacement", "motion"],
    }).notNull(),
    title: text("title").notNull(),
    prompt: text("prompt").notNull().default(""),
    model: text("model").notNull().default(""),
    state: text("state").notNull().default("submitting"),
    duration: integer("duration").notNull().default(5),
    resolution: text("resolution").notNull().default("720p"),
    aspectRatio: text("aspect_ratio").notNull().default("16:9"),
    inputSummary: text("input_summary").notNull().default("{}"),
    reservedCredits: integer("reserved_credits").notNull().default(0),
    chargedCredits: integer("charged_credits").notNull().default(0),
    outputUrl: text("output_url"),
    coverUrl: text("cover_url"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("video_tasks_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("video_tasks_vidu_task_idx").on(table.viduTaskId),
  ],
);

export const creditLedger = sqliteTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: text("task_id"),
    amount: integer("amount").notNull(),
    event: text("event").notNull(),
    note: text("note").notNull().default(""),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull().default("system"),
    idempotencyKey: text("idempotency_key"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("credit_ledger_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    uniqueIndex("credit_ledger_idempotency_unique").on(table.idempotencyKey),
  ],
);

export const authIdentities = sqliteTable(
  "auth_identities",
  {
    id: text("id").primaryKey(),
    provider: text("provider", {
      enum: ["supabase_email"],
    }).notNull(),
    providerSubject: text("provider_subject").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verifiedEmail: text("verified_email").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("auth_identities_provider_subject_unique").on(
      table.provider,
      table.providerSubject,
    ),
    index("auth_identities_user_idx").on(table.userId),
    index("auth_identities_email_idx").on(table.verifiedEmail),
  ],
);

export const appSessions = sqliteTable(
  "app_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenDigest: text("token_digest").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("app_sessions_user_active_idx").on(
      table.userId,
      table.revokedAt,
      table.expiresAt,
    ),
  ],
);

export const passwordCredentials = sqliteTable("password_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  algorithm: text("algorithm").notNull(),
  iterations: integer("iterations").notNull(),
  salt: text("salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenDigest: text("token_digest").notNull().unique(),
    codeHint: text("code_hint").notNull().default(""),
    initialCredits: integer("initial_credits").notNull().default(0),
    initialConcurrencyLimit: integer("initial_concurrency_limit")
      .notNull()
      .default(1),
    initialDailyCreditLimit: integer("initial_daily_credit_limit")
      .notNull()
      .default(500),
    maxUses: integer("max_uses").notNull().default(1),
    useCount: integer("use_count").notNull().default(0),
    allowEmailLink: integer("allow_email_link", { mode: "boolean" })
      .notNull()
      .default(true),
    allowManualCode: integer("allow_manual_code", { mode: "boolean" })
      .notNull()
      .default(false),
    expiresAt: text("expires_at").notNull(),
    acceptedBy: text("accepted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: text("accepted_at"),
    revokedAt: text("revoked_at"),
    deletedAt: text("deleted_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("invitations_email_active_idx").on(
      table.email,
      table.expiresAt,
      table.acceptedAt,
      table.revokedAt,
    ),
  ],
);

export const invitationRedemptions = sqliteTable(
  "invitation_redemptions",
  {
    id: text("id").primaryKey(),
    invitationId: text("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("invitation_redemptions_invitation_user_unique").on(
      table.invitationId,
      table.userId,
    ),
    index("invitation_redemptions_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const adminAuditLog = sqliteTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    requestId: text("request_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("admin_audit_created_idx").on(table.createdAt),
    index("admin_audit_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
  ],
);

export const providerKeySettings = sqliteTable("provider_key_settings", {
  provider: text("provider", { enum: ["vidu", "gemini"] }).primaryKey(),
  activeKeyId: text("active_key_id").notNull(),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const providerKeySecrets = sqliteTable(
  "provider_key_secrets",
  {
    keyId: text("key_id").primaryKey(),
    provider: text("provider", { enum: ["vidu", "gemini"] }).notNull(),
    label: text("label").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    keyHint: text("key_hint").notNull(),
    encryptionVersion: integer("encryption_version").notNull().default(1),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("provider_key_secrets_provider_idx").on(table.provider)],
);

export const rateLimitBuckets = sqliteTable(
  "rate_limit_buckets",
  {
    scope: text("scope").notNull(),
    keyDigest: text("key_digest").notNull(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: integer("expires_at").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("rate_limit_buckets_identity_unique").on(
      table.scope,
      table.keyDigest,
      table.windowStart,
    ),
    index("rate_limit_buckets_expires_idx").on(table.expiresAt),
  ],
);

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    publicToken: text("public_token").notNull().unique(),
    r2Key: text("r2_key").notNull().unique(),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentSha256: text("content_sha256"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("media_assets_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("media_assets_content_sha256_idx").on(table.contentSha256),
  ],
);

export const videoAnalyses = sqliteTable(
  "video_analyses",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type", {
      enum: ["content_sha256", "external_url"],
    }).notNull(),
    sourceKey: text("source_key").notNull(),
    analysisVersion: text("analysis_version").notNull(),
    state: text("state", {
      enum: ["analyzing", "ready", "failed"],
    }).notNull(),
    model: text("model").notNull(),
    resultJson: text("result_json"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: text("lease_expires_at"),
    retryAfter: text("retry_after"),
    attemptCount: integer("attempt_count").notNull().default(1),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("video_analyses_source_version_unique").on(
      table.sourceType,
      table.sourceKey,
      table.analysisVersion,
    ),
    index("video_analyses_state_lease_idx").on(
      table.state,
      table.leaseExpiresAt,
    ),
  ],
);

export const videoAnalysisQuotas = sqliteTable("video_analysis_quotas", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  quotaDate: text("quota_date").notNull(),
  usedCount: integer("used_count").notNull().default(0),
  activeLeaseToken: text("active_lease_token"),
  activeLeaseExpiresAt: text("active_lease_expires_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
