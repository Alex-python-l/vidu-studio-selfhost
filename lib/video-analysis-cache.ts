import { getD1 } from "@/db";
import { ensureRuntimeSchema } from "@/db/runtime-schema";
import type { VideoAnalysisSource } from "@/lib/video-analysis-source";

export const VIDEO_ANALYSIS_VERSION =
  "replacement-video-v11-source-appearance-neutral";
export const VIDEO_ANALYSIS_DAILY_LIMIT = 30;
export const VIDEO_ANALYSIS_LEASE_SECONDS = 10 * 60;
export const VIDEO_ANALYSIS_FAILURE_COOLDOWN_SECONDS = 5 * 60;

type AnalysisRow = {
  id: string;
  source_type: VideoAnalysisSource["sourceType"];
  source_key: string;
  analysis_version: string;
  state: "analyzing" | "ready" | "failed";
  model: string;
  result_json: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
  retry_after: string | null;
  error_code: string | null;
  error_detail: string | null;
  lease_active: number;
  retry_active: number;
};

type QuotaRow = {
  quota_date: string;
  used_count: number;
  active_lease_expires_at: string | null;
  active_lease: number;
};

export type ReadyVideoAnalysis = {
  id: string;
  sourceType: VideoAnalysisSource["sourceType"];
  sourceKey: string;
  analysisVersion: string;
  model: string;
  resultJson: string;
};

export type VideoAnalysisLease = {
  analysisId: string;
  leaseToken: string;
  userId: string;
  sourceType: VideoAnalysisSource["sourceType"];
  sourceKey: string;
  analysisVersion: string;
  model: string;
};

export type AcquireVideoAnalysisResult =
  | {
      kind: "ready";
      cacheHit: true;
      analysis: ReadyVideoAnalysis;
    }
  | {
      kind: "analyzing";
      cacheHit: true;
      retryAfterMs: number;
      poll?: {
        interactionId: string;
        lease: VideoAnalysisLease;
      };
    }
  | {
      kind: "failed";
      cacheHit: true;
      errorCode: string | null;
      retryAfterMs: number;
    }
  | {
      kind: "quota";
      cacheHit: false;
      reason: "daily_limit" | "concurrent";
      retryAfterMs: number;
    }
  | {
      kind: "lease";
      cacheHit: false;
      lease: VideoAnalysisLease;
    };

function sqliteTimeToMs(value: string | null) {
  if (!value) return Date.now();
  const parsed = Date.parse(`${value.replace(" ", "T")}Z`);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function retryDelay(value: string | null, fallbackMs: number) {
  return Math.max(1_000, sqliteTimeToMs(value) - Date.now() || fallbackMs);
}

function readyAnalysis(row: AnalysisRow): ReadyVideoAnalysis | null {
  if (row.state !== "ready" || !row.result_json) return null;
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceKey: row.source_key,
    analysisVersion: row.analysis_version,
    model: row.model,
    resultJson: row.result_json,
  };
}

async function analysisRow(
  source: Pick<VideoAnalysisSource, "sourceType" | "sourceKey">,
  analysisVersion: string,
) {
  return (
    await getD1()
      .prepare(
        `
          SELECT
            id,
            source_type,
            source_key,
            analysis_version,
            state,
            model,
            result_json,
            lease_token,
            lease_expires_at,
            retry_after,
            error_code,
            error_detail,
            CASE
              WHEN lease_expires_at IS NOT NULL
                AND lease_expires_at > CURRENT_TIMESTAMP
              THEN 1 ELSE 0
            END AS lease_active,
            CASE
              WHEN retry_after IS NOT NULL
                AND retry_after > CURRENT_TIMESTAMP
              THEN 1 ELSE 0
            END AS retry_active
          FROM video_analyses
          WHERE source_type = ?
            AND source_key = ?
            AND analysis_version = ?
          LIMIT 1
        `,
      )
      .bind(source.sourceType, source.sourceKey, analysisVersion)
      .first<AnalysisRow>()
  );
}

function backgroundState(row: AnalysisRow) {
  if (row.state !== "analyzing" || !row.result_json) return null;
  try {
    const value = JSON.parse(row.result_json) as Record<string, unknown>;
    if (
      typeof value.interactionId !== "string" ||
      typeof value.userId !== "string"
    ) {
      return null;
    }
    return { interactionId: value.interactionId, userId: value.userId };
  } catch {
    return null;
  }
}

function cachedResult(row: AnalysisRow | null): AcquireVideoAnalysisResult | null {
  if (!row) return null;
  const ready = readyAnalysis(row);
  if (ready) {
    return { kind: "ready", cacheHit: true, analysis: ready };
  }
  if (row.state === "analyzing" && row.lease_active) {
    const background = backgroundState(row);
    return {
      kind: "analyzing",
      cacheHit: true,
      ...(background && row.lease_token
        ? {
            poll: {
              interactionId: background.interactionId,
              lease: {
                analysisId: row.id,
                leaseToken: row.lease_token,
                userId: background.userId,
                sourceType: row.source_type,
                sourceKey: row.source_key,
                analysisVersion: row.analysis_version,
                model: row.model,
              },
            },
          }
        : {}),
      retryAfterMs: Math.min(
        3_000,
        retryDelay(row.lease_expires_at, 3_000),
      ),
    };
  }
  if (row.state === "failed" && row.retry_active) {
    return {
      kind: "failed",
      cacheHit: true,
      errorCode: row.error_code,
      retryAfterMs: retryDelay(
        row.retry_after,
        VIDEO_ANALYSIS_FAILURE_COOLDOWN_SECONDS * 1_000,
      ),
    };
  }
  return null;
}

async function reserveUserQuota(userId: string, leaseToken: string) {
  const d1 = getD1();
  await d1
    .prepare(
      `
        INSERT OR IGNORE INTO video_analysis_quotas (
          user_id,
          quota_date,
          used_count,
          updated_at
        ) VALUES (?, date('now'), 0, CURRENT_TIMESTAMP)
      `,
    )
    .bind(userId)
    .run();

  await d1
    .prepare(
      `
        UPDATE video_analysis_quotas
        SET
          quota_date = date('now'),
          used_count = 0,
          active_lease_token = NULL,
          active_lease_expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND quota_date <> date('now')
          AND (
            active_lease_token IS NULL
            OR active_lease_expires_at <= CURRENT_TIMESTAMP
          )
      `,
    )
    .bind(userId)
    .run();

  const reservation = await d1
    .prepare(
      `
        UPDATE video_analysis_quotas
        SET
          active_lease_token = ?,
          active_lease_expires_at = datetime(
            'now',
            '+${VIDEO_ANALYSIS_LEASE_SECONDS} seconds'
          ),
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND quota_date = date('now')
          AND used_count < ?
          AND (
            active_lease_token IS NULL
            OR active_lease_expires_at <= CURRENT_TIMESTAMP
          )
      `,
    )
    .bind(leaseToken, userId, VIDEO_ANALYSIS_DAILY_LIMIT)
    .run();
  if (reservation.meta.changes) return null;

  const quota = await d1
    .prepare(
      `
        SELECT
          quota_date,
          used_count,
          active_lease_expires_at,
          CASE
            WHEN active_lease_token IS NOT NULL
              AND active_lease_expires_at > CURRENT_TIMESTAMP
            THEN 1 ELSE 0
          END AS active_lease
        FROM video_analysis_quotas
        WHERE user_id = ?
        LIMIT 1
      `,
    )
    .bind(userId)
    .first<QuotaRow>();

  if (quota?.active_lease) {
    return {
      kind: "quota",
      cacheHit: false,
      reason: "concurrent",
      retryAfterMs: Math.min(
        3_000,
        retryDelay(quota.active_lease_expires_at, 3_000),
      ),
    } satisfies AcquireVideoAnalysisResult;
  }

  const tomorrowUtc = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate() + 1,
  );
  return {
    kind: "quota",
    cacheHit: false,
    reason: "daily_limit",
    retryAfterMs: Math.max(1_000, tomorrowUtc - Date.now()),
  } satisfies AcquireVideoAnalysisResult;
}

async function releaseUserQuota(userId: string, leaseToken: string) {
  await getD1()
    .prepare(
      `
        UPDATE video_analysis_quotas
        SET
          active_lease_token = NULL,
          active_lease_expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND active_lease_token = ?
      `,
    )
    .bind(userId, leaseToken)
    .run();
}

async function acquireSourceLease(input: {
  source: VideoAnalysisSource;
  analysisVersion: string;
  model: string;
  leaseToken: string;
  force: boolean;
}) {
  const d1 = getD1();
  const id = crypto.randomUUID();
  const inserted = await d1
    .prepare(
      `
        INSERT OR IGNORE INTO video_analyses (
          id,
          source_type,
          source_key,
          analysis_version,
          state,
          model,
          lease_token,
          lease_expires_at,
          attempt_count,
          created_at,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, 'analyzing', ?, ?,
          datetime('now', '+${VIDEO_ANALYSIS_LEASE_SECONDS} seconds'),
          1,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `,
    )
    .bind(
      id,
      input.source.sourceType,
      input.source.sourceKey,
      input.analysisVersion,
      input.model,
      input.leaseToken,
    )
    .run();
  if (inserted.meta.changes) return id;

  const reclaimed = await d1
    .prepare(
      `
        UPDATE video_analyses
        SET
          state = 'analyzing',
          model = ?,
          result_json = NULL,
          lease_token = ?,
          lease_expires_at = datetime(
            'now',
            '+${VIDEO_ANALYSIS_LEASE_SECONDS} seconds'
          ),
          retry_after = NULL,
          error_code = NULL,
          error_detail = NULL,
          attempt_count = attempt_count + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE source_type = ?
          AND source_key = ?
          AND analysis_version = ?
          AND (
            (? = 1 AND state IN ('ready', 'failed'))
            OR
            (
              state = 'analyzing'
              AND (
                lease_expires_at IS NULL
                OR lease_expires_at <= CURRENT_TIMESTAMP
              )
            )
            OR
            (
              state = 'failed'
              AND (
                retry_after IS NULL
                OR retry_after <= CURRENT_TIMESTAMP
              )
            )
            OR
            (
              state = 'ready'
              AND result_json IS NULL
            )
          )
      `,
    )
    .bind(
      input.model,
      input.leaseToken,
      input.source.sourceType,
      input.source.sourceKey,
      input.analysisVersion,
      input.force ? 1 : 0,
    )
    .run();
  if (!reclaimed.meta.changes) return null;

  return (
    await analysisRow(input.source, input.analysisVersion)
  )?.id ?? null;
}

async function startQuotaUsage(userId: string, leaseToken: string) {
  const started = await getD1()
    .prepare(
      `
        UPDATE video_analysis_quotas
        SET
          used_count = used_count + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND quota_date = date('now')
          AND used_count < ?
          AND active_lease_token = ?
          AND active_lease_expires_at > CURRENT_TIMESTAMP
      `,
    )
    .bind(userId, VIDEO_ANALYSIS_DAILY_LIMIT, leaseToken)
    .run();
  return Boolean(started.meta.changes);
}

async function discardSourceLease(analysisId: string, leaseToken: string) {
  await getD1()
    .prepare(
      `
        DELETE FROM video_analyses
        WHERE id = ?
          AND state = 'analyzing'
          AND lease_token = ?
      `,
    )
    .bind(analysisId, leaseToken)
    .run();
}

export async function acquireVideoAnalysisLease(input: {
  source: VideoAnalysisSource;
  userId: string;
  model: string;
  analysisVersion?: string;
  force?: boolean;
}): Promise<AcquireVideoAnalysisResult> {
  await ensureRuntimeSchema();
  const analysisVersion = input.analysisVersion ?? VIDEO_ANALYSIS_VERSION;
  const existing = await analysisRow(input.source, analysisVersion);
  const cached = cachedResult(existing);
  if (cached && (!input.force || cached.kind === "analyzing")) return cached;

  const leaseToken = crypto.randomUUID();
  const quotaResult = await reserveUserQuota(input.userId, leaseToken);
  if (quotaResult) return quotaResult;

  const analysisId = await acquireSourceLease({
    source: input.source,
    analysisVersion,
    model: input.model,
    leaseToken,
    force: input.force === true,
  });
  if (!analysisId) {
    await releaseUserQuota(input.userId, leaseToken);
    const current = await analysisRow(input.source, analysisVersion);
    return (
      cachedResult(current) ?? {
        kind: "analyzing",
        cacheHit: true,
        retryAfterMs: 3_000,
      }
    );
  }

  if (!(await startQuotaUsage(input.userId, leaseToken))) {
    await discardSourceLease(analysisId, leaseToken);
    await releaseUserQuota(input.userId, leaseToken);
    return {
      kind: "quota",
      cacheHit: false,
      reason: "concurrent",
      retryAfterMs: 3_000,
    };
  }

  return {
    kind: "lease",
    cacheHit: false,
    lease: {
      analysisId,
      leaseToken,
      userId: input.userId,
      sourceType: input.source.sourceType,
      sourceKey: input.source.sourceKey,
      analysisVersion,
      model: input.model,
    },
  };
}

export async function getReadyVideoAnalysis(
  source: Pick<VideoAnalysisSource, "sourceType" | "sourceKey">,
  analysisVersion = VIDEO_ANALYSIS_VERSION,
) {
  await ensureRuntimeSchema();
  const row = await analysisRow(source, analysisVersion);
  return row ? readyAnalysis(row) : null;
}

export async function invalidateReadyVideoAnalysis(analysisId: string) {
  await ensureRuntimeSchema();
  const result = await getD1()
    .prepare(
      `
        UPDATE video_analyses
        SET
          state = 'failed',
          result_json = NULL,
          retry_after = CURRENT_TIMESTAMP,
          error_code = 'invalid_cached_result',
          error_detail = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND state = 'ready'
      `,
    )
    .bind(analysisId)
    .run();
  return Boolean(result.meta.changes);
}

export async function attachVideoAnalysisInteraction(input: {
  lease: VideoAnalysisLease;
  interactionId: string;
}) {
  await ensureRuntimeSchema();
  const result = await getD1()
    .prepare(
      `
        UPDATE video_analyses
        SET result_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND state = 'analyzing'
          AND lease_token = ?
          AND lease_expires_at > CURRENT_TIMESTAMP
      `,
    )
    .bind(
      JSON.stringify({
        interactionId: input.interactionId,
        userId: input.lease.userId,
      }),
      input.lease.analysisId,
      input.lease.leaseToken,
    )
    .run();
  return Boolean(result.meta.changes);
}
export async function completeVideoAnalysisLease(input: {
  lease: VideoAnalysisLease;
  resultJson: string;
}) {
  const d1 = getD1();
  const results = await d1.batch([
    d1
      .prepare(
        `
          UPDATE video_analyses
          SET
            state = 'ready',
            result_json = ?,
            lease_token = NULL,
            lease_expires_at = NULL,
            retry_after = NULL,
            error_code = NULL,
            error_detail = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND state = 'analyzing'
            AND lease_token = ?
        `,
      )
      .bind(
        input.resultJson,
        input.lease.analysisId,
        input.lease.leaseToken,
      ),
    d1
      .prepare(
        `
          UPDATE video_analysis_quotas
          SET
            active_lease_token = NULL,
            active_lease_expires_at = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
            AND active_lease_token = ?
        `,
      )
      .bind(input.lease.userId, input.lease.leaseToken),
  ]);
  return Boolean(results[0].meta.changes);
}

function safeErrorDetail(value: string | undefined) {
  if (!value) return null;
  return value
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[?&](?:key|token|signature|sig)=[^&\s]+/gi, "")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[secret]")
    .replace(/\b(?:Bearer|Token)\s+\S+/gi, "[secret]")
    .slice(0, 500);
}

function safeErrorCode(value: string) {
  return (
    value.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80) ||
    "analysis_failed"
  );
}

export async function failVideoAnalysisLease(input: {
  lease: VideoAnalysisLease;
  errorCode: string;
  errorDetail?: string;
}) {
  const d1 = getD1();
  const results = await d1.batch([
    d1
      .prepare(
        `
          UPDATE video_analyses
          SET
            state = 'failed',
            result_json = NULL,
            retry_after = datetime(
              'now',
              '+${VIDEO_ANALYSIS_FAILURE_COOLDOWN_SECONDS} seconds'
            ),
            lease_token = NULL,
            lease_expires_at = NULL,
            error_code = ?,
            error_detail = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND state = 'analyzing'
            AND lease_token = ?
        `,
      )
      .bind(
        safeErrorCode(input.errorCode),
        safeErrorDetail(input.errorDetail),
        input.lease.analysisId,
        input.lease.leaseToken,
      ),
    d1
      .prepare(
        `
          UPDATE video_analysis_quotas
          SET
            active_lease_token = NULL,
            active_lease_expires_at = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
            AND active_lease_token = ?
        `,
      )
      .bind(input.lease.userId, input.lease.leaseToken),
  ]);
  return Boolean(results[0].meta.changes);
}
