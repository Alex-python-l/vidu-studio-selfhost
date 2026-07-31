import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { ensureRuntimeSchema } from "@/db/runtime-schema";
import { users, videoTasks } from "@/db/schema";
import type { AppUserProfile } from "@/lib/account-contracts";
import { AppError } from "@/lib/errors";
import type {
  StudioDashboard,
  StudioTask,
  TaskKind,
  TaskState,
} from "@/lib/types";

const TASK_KIND_NAMES: Record<TaskKind, string> = {
  reference: "Reference to Video",
  replacement: "Video Replacement",
  motion: "Motion Sync",
};

export function userIdFromEmail(email: string) {
  return email.trim().toLowerCase();
}

type LegacyUserProfile = {
  displayName: string;
  email: string;
  fullName?: string | null;
};

export async function ensureStudioUser(
  profile: AppUserProfile | LegacyUserProfile,
) {
  await ensureRuntimeSchema();
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(
      "id" in profile
        ? eq(users.id, profile.id)
        : eq(users.email, userIdFromEmail(profile.email)),
    )
    .limit(1);
  if (!user) {
    throw new AppError("账号不存在，请使用有效邀请完成登录。", 403);
  }
  return user;
}

function toStudioTask(task: typeof videoTasks.$inferSelect): StudioTask {
  const inputMedia = taskInputMedia(task.inputSummary, task.kind);

  return {
    id: task.id,
    kind: task.kind,
    title: task.title,
    prompt: task.prompt,
    model: task.model,
    state: task.state as TaskState,
    duration: task.duration,
    resolution: task.resolution,
    aspectRatio: task.aspectRatio,
    chargedCredits: task.chargedCredits,
    inputImages: inputMedia.images,
    inputVideos: inputMedia.videos,
    outputUrl: task.outputUrl,
    coverUrl: task.coverUrl,
    errorMessage: task.errorMessage,
    createdAt: task.createdAt,
  };
}

function httpUrlList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is string =>
      typeof item === "string" && /^https?:\/\//i.test(item),
  );
}

function taskInputMedia(inputSummary: string, kind: TaskKind) {
  try {
    const summary = JSON.parse(inputSummary) as Record<string, unknown>;

    if (kind === "reference") {
      return {
        images: httpUrlList(summary.imageUrls),
        videos: httpUrlList(summary.videoUrls),
      };
    }

    return {
      images: httpUrlList(
        Array.isArray(summary.imageUrls)
          ? summary.imageUrls
          : [summary.imageUrl],
      ),
      videos: httpUrlList([summary.videoUrl]),
    };
  } catch {
    return { images: [], videos: [] };
  }
}

export async function getDashboardData(
  profile: AppUserProfile | LegacyUserProfile,
): Promise<StudioDashboard> {
  const db = getDb();
  const user = await ensureStudioUser(profile);
  const [tasks, taskStats, passwordCredential] = await Promise.all([
    db
      .select()
      .from(videoTasks)
      .where(eq(videoTasks.userId, user.id))
      .orderBy(desc(videoTasks.createdAt))
      .limit(30),
    db
      .select({
        active: sql<number>`coalesce(sum(case when ${videoTasks.state} = 'processing' then 1 else 0 end), 0)`,
        queued: sql<number>`coalesce(sum(case when ${videoTasks.state} in ('submitting', 'created', 'queueing') then 1 else 0 end), 0)`,
        completed: sql<number>`coalesce(sum(case when ${videoTasks.state} = 'success' then 1 else 0 end), 0)`,
        history: sql<number>`coalesce(sum(case when ${videoTasks.state} in ('success', 'failed') then 1 else 0 end), 0)`,
      })
      .from(videoTasks)
      .where(eq(videoTasks.userId, user.id)),
    getD1()
      .prepare("SELECT 1 AS found FROM password_credentials WHERE user_id = ? LIMIT 1")
      .bind(user.id)
      .first<{ found: number }>(),
  ]);
  const counts = taskStats[0];

  return {
    user: {
      displayName: user.displayName,
      email: user.email,
      creditBalance: user.creditBalance,
      concurrencyLimit: user.concurrencyLimit,
      passwordEnabled: Boolean(passwordCredential),
    },
    stats: {
      active: Number(counts?.active ?? 0),
      queued: Number(counts?.queued ?? 0),
      completed: Number(counts?.completed ?? 0),
      history: Number(counts?.history ?? 0),
    },
    tasks: tasks.map(toStudioTask),
  };
}

export async function getActiveTasks(userId: string) {
  return getDb()
    .select()
    .from(videoTasks)
    .where(
      sql`${videoTasks.userId} = ${userId} AND ${videoTasks.state} IN ('created', 'queueing', 'processing')`,
    )
    .orderBy(asc(videoTasks.createdAt))
    .limit(8);
}

export async function beginTask(input: {
  profile: AppUserProfile | LegacyUserProfile;
  kind: TaskKind;
  title: string;
  prompt?: string;
  model?: string;
  duration: number;
  resolution?: string;
  aspectRatio?: string;
  inputSummary: Record<string, unknown>;
  reserveCredits: number;
}) {
  if (!Number.isInteger(input.reserveCredits) || input.reserveCredits < 0) {
    throw new AppError("任务预留额度无效。", 400);
  }
  await ensureRuntimeSchema();
  const d1 = getD1();
  const user = await ensureStudioUser(input.profile);

  const taskId = crypto.randomUUID();
  const results = await d1.batch([
    d1
      .prepare(`
        UPDATE users
        SET credit_balance = credit_balance - ?,
            active_task_count = active_task_count + 1,
            daily_credit_spent = CASE
              WHEN daily_credit_date = date('now')
                THEN daily_credit_spent + ?
              ELSE ?
            END,
            daily_credit_date = date('now'),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND status = 'active'
          AND credit_balance >= ?
          AND active_task_count < concurrency_limit
          AND (
            CASE
              WHEN daily_credit_date = date('now')
                THEN daily_credit_spent + ?
              ELSE ?
            END
          ) <= daily_credit_limit
      `)
      .bind(
        input.reserveCredits,
        input.reserveCredits,
        input.reserveCredits,
        user.id,
        input.reserveCredits,
        input.reserveCredits,
        input.reserveCredits,
      ),
    d1
      .prepare(`
        INSERT INTO video_tasks (
          id, user_id, kind, title, prompt, model, state, duration,
          resolution, aspect_ratio, input_summary, reserved_credits
        )
        SELECT ?, ?, ?, ?, ?, ?, 'submitting', ?, ?, ?, ?, ?
        WHERE changes() = 1
      `)
      .bind(
        taskId,
        user.id,
        input.kind,
        input.title,
        input.prompt ?? "",
        input.model ?? "",
        input.duration,
        input.resolution ?? "source",
        input.aspectRatio ?? "source",
        JSON.stringify(input.inputSummary),
        input.reserveCredits,
      ),
    d1
      .prepare(`
        INSERT INTO credit_ledger (
          id, user_id, task_id, amount, event, note, source, idempotency_key
        )
        SELECT ?, ?, ?, ?, 'reserve', ?, 'task', ?
        WHERE changes() = 1
      `)
      .bind(
        crypto.randomUUID(),
        user.id,
        taskId,
        -input.reserveCredits,
        `预留 ${TASK_KIND_NAMES[input.kind]} 任务额度`,
        `task:reserve:${taskId}`,
      ),
  ]);

  if (!results[0]?.meta.changes) {
    const current = await d1
      .prepare(`
        SELECT status, credit_balance, concurrency_limit, active_task_count,
          daily_credit_limit, daily_credit_spent, daily_credit_date
        FROM users WHERE id = ? LIMIT 1
      `)
      .bind(user.id)
      .first<{
        status: string;
        credit_balance: number;
        concurrency_limit: number;
        active_task_count: number;
        daily_credit_limit: number;
        daily_credit_spent: number;
        daily_credit_date: string | null;
      }>();
    if (!current || current.status !== "active") {
      throw new AppError("账号已暂停，无法提交任务。", 403);
    }
    if (current.credit_balance < input.reserveCredits) {
      throw new AppError(
        `额度不足，本次任务需要预留 ${input.reserveCredits} 点。`,
        402,
      );
    }
    if (current.active_task_count >= current.concurrency_limit) {
      throw new AppError("当前并发任务已达上限，请等待已有任务完成。", 429);
    }
    throw new AppError("已达到今日额度使用上限。", 429);
  }

  return { taskId, userId: user.id, reservedCredits: input.reserveCredits };
}

export async function completeTaskSubmission(input: {
  taskId: string;
  userId: string;
  reservedCredits: number;
  viduTaskId: string;
  state: string;
  chargedCredits: number;
  model?: string;
}) {
  await ensureRuntimeSchema();
  if (isTerminalTaskState(input.state)) {
    await updateTaskFromVidu({
      taskId: input.taskId,
      userId: input.userId,
      viduTaskId: input.viduTaskId,
      model: input.model,
      state: input.state,
      chargedCredits: input.chargedCredits,
    });
    return;
  }

  const d1 = getD1();
  await d1
    .prepare(`
      UPDATE video_tasks
      SET vidu_task_id = ?, state = ?, charged_credits = ?,
          model = CASE WHEN ? = '' THEN model ELSE ? END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND state = 'submitting'
        AND vidu_task_id IS NULL
    `)
    .bind(
      input.viduTaskId,
      input.state,
      input.chargedCredits,
      input.model ?? "",
      input.model ?? "",
      input.taskId,
      input.userId,
    )
    .run();
}

export async function failTaskSubmission(input: {
  taskId: string;
  userId: string;
  reservedCredits: number;
  errorMessage: string;
}) {
  await ensureRuntimeSchema();
  const d1 = getD1();
  await d1.batch([
    d1
      .prepare(`
        UPDATE video_tasks
        SET state = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND state = 'submitting'
      `)
      .bind(input.errorMessage, input.taskId, input.userId),
    d1
      .prepare(`
        INSERT OR IGNORE INTO credit_ledger (
          id, user_id, task_id, amount, event, note, source, idempotency_key
        )
        SELECT ?, user_id, id, reserved_credits, 'refund',
          '提交失败，退回预留额度', 'task', ?
        FROM video_tasks
        WHERE id = ? AND user_id = ? AND changes() = 1
      `)
      .bind(
        crypto.randomUUID(),
        `task:submission-refund:${input.taskId}`,
        input.taskId,
        input.userId,
      ),
    d1
      .prepare(`
        UPDATE users
        SET credit_balance = credit_balance + (
              SELECT reserved_credits FROM video_tasks WHERE id = ?
            ),
            daily_credit_spent = CASE
              WHEN daily_credit_date = date('now')
                THEN MAX(
                  daily_credit_spent - (
                    SELECT reserved_credits FROM video_tasks WHERE id = ?
                  ),
                  0
                )
              ELSE daily_credit_spent
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND changes() = 1
      `)
      .bind(input.taskId, input.taskId, input.userId),
  ]);
}

export async function updateTaskFromVidu(input: {
  taskId: string;
  userId?: string;
  viduTaskId?: string;
  model?: string;
  state: string;
  chargedCredits?: number;
  outputUrl?: string | null;
  coverUrl?: string | null;
  errorMessage?: string | null;
}) {
  await ensureRuntimeSchema();
  const d1 = getD1();

  if (!isTerminalTaskState(input.state)) {
    await d1
      .prepare(`
        UPDATE video_tasks
        SET state = ?, output_url = ?, cover_url = ?, error_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND state IN ('submitting', 'created', 'queueing', 'processing')
      `)
      .bind(
        input.state,
        input.outputUrl ?? null,
        input.coverUrl ?? null,
        input.errorMessage ?? null,
        input.taskId,
      )
      .run();
    return;
  }

  const current = await d1
    .prepare(`
      SELECT user_id, reserved_credits, charged_credits, state
      FROM video_tasks
      WHERE id = ?
      LIMIT 1
    `)
    .bind(input.taskId)
    .first<{
      user_id: string;
      reserved_credits: number;
      charged_credits: number;
      state: string;
    }>();
  if (
    !current ||
    !["submitting", "created", "queueing", "processing"].includes(current.state)
  ) {
    return;
  }
  if (input.userId && input.userId !== current.user_id) return;

  const actualCredits = normalizedCredits(
    input.chargedCredits,
    current.charged_credits,
  );
  const adjustment = current.reserved_credits - actualCredits;
  const submissionConstraint = input.userId
    ? "AND user_id = ? AND state = 'submitting'"
    : "AND state IN ('created', 'queueing', 'processing')";
  const updateBindings: unknown[] = [
    input.viduTaskId ?? null,
    input.model ?? "",
    input.model ?? "",
    input.state,
    actualCredits,
    input.outputUrl ?? null,
    input.coverUrl ?? null,
    input.errorMessage ?? null,
    input.taskId,
  ];
  if (input.userId) updateBindings.push(input.userId);

  await d1.batch([
    d1
      .prepare(`
        UPDATE video_tasks
        SET vidu_task_id = COALESCE(?, vidu_task_id),
            model = CASE WHEN ? = '' THEN model ELSE ? END,
            state = ?, charged_credits = ?, output_url = ?, cover_url = ?,
            error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? ${submissionConstraint}
      `)
      .bind(...updateBindings),
    d1
      .prepare(`
        INSERT OR IGNORE INTO credit_ledger (
          id, user_id, task_id, amount, event, note, source, idempotency_key
        )
        SELECT ?, id, ?, CASE
            WHEN ? < 0 THEN -MIN(credit_balance, ?)
            ELSE ?
          END,
          'charge_adjustment', ?, 'task', ?
        FROM users
        WHERE id = ? AND changes() = 1
      `)
      .bind(
        crypto.randomUUID(),
        input.taskId,
        adjustment,
        -adjustment,
        adjustment,
        `按 Vidu 终态实际消耗结算 ${actualCredits} 点`,
        `task:settle:${input.taskId}`,
        current.user_id,
      ),
    d1
      .prepare(`
        UPDATE users
        SET credit_balance = MAX(credit_balance + ?, 0),
            daily_credit_spent = CASE
              WHEN daily_credit_date = date('now')
                THEN MAX(daily_credit_spent - ?, 0)
              ELSE daily_credit_spent
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND changes() = 1
      `)
      .bind(adjustment, adjustment, current.user_id),
  ]);
}

function isTerminalTaskState(state: string) {
  return state === "success" || state === "failed";
}

function normalizedCredits(
  providerCredits: number | undefined,
  provisionalCredits: number,
) {
  return typeof providerCredits === "number" &&
    Number.isFinite(providerCredits) &&
    providerCredits >= 0
    ? Math.trunc(providerCredits)
    : Math.max(Math.trunc(provisionalCredits), 0);
}

export async function getOwnedTask(taskId: string, userId: string) {
  const [task] = await getDb()
    .select()
    .from(videoTasks)
    .where(
      sql`${videoTasks.id} = ${taskId} AND ${videoTasks.userId} = ${userId}`,
    )
    .limit(1);
  return task ?? null;
}

export async function getTasksByIds(ids: string[]) {
  if (!ids.length) return [];
  return getDb().select().from(videoTasks).where(inArray(videoTasks.id, ids));
}

export async function clearTaskHistory(userId: string) {
  const deleted = await getD1()
    .prepare(`
      DELETE FROM video_tasks
      WHERE user_id = ? AND state IN ('success', 'failed')
    `)
    .bind(userId)
    .run();
  return Number(deleted.meta.changes ?? 0);
}
