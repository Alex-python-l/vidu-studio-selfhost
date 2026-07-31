import { getD1 } from "@/db";
import { ensureRuntimeSchema } from "@/db/runtime-schema";
import type { ProviderUsagePoint } from "@/lib/account-contracts";

type UsageRow = {
  usage_date: string;
  usage_value: number;
};

export async function getProviderUsage(
  days = 7,
): Promise<ProviderUsagePoint[]> {
  await ensureRuntimeSchema();
  const safeDays = Math.min(Math.max(Math.trunc(days), 1), 31);
  const d1 = getD1();
  const [vidu, gemini] = await Promise.all([
    d1
      .prepare(`
        SELECT date(updated_at) AS usage_date,
          COALESCE(SUM(charged_credits), 0) AS usage_value
        FROM video_tasks
        WHERE state IN ('success', 'failed')
          AND date(updated_at) >= date('now', ?)
        GROUP BY date(updated_at)
      `)
      .bind(`-${safeDays - 1} days`)
      .all<UsageRow>(),
    d1
      .prepare(`
        SELECT date(created_at) AS usage_date,
          COALESCE(SUM(attempt_count), 0) AS usage_value
        FROM video_analyses
        WHERE date(created_at) >= date('now', ?)
        GROUP BY date(created_at)
      `)
      .bind(`-${safeDays - 1} days`)
      .all<UsageRow>(),
  ]);

  const viduByDate = new Map(
    vidu.results.map((row) => [row.usage_date, Number(row.usage_value)]),
  );
  const geminiByDate = new Map(
    gemini.results.map((row) => [row.usage_date, Number(row.usage_value)]),
  );

  return recentUtcDates(safeDays).map((date) => ({
    date,
    viduCredits: viduByDate.get(date) ?? 0,
    geminiRequests: geminiByDate.get(date) ?? 0,
  }));
}

function recentUtcDates(days: number): string[] {
  const today = new Date();
  const midnight = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Array.from({ length: days }, (_, index) =>
    new Date(midnight - (days - index - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10),
  );
}
