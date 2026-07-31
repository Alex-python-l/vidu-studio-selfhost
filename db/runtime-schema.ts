import { getD1 } from "@/db";

let schemaCheck: Promise<void> | undefined;

export function ensureRuntimeSchema() {
  schemaCheck ??= verifySchema().catch((error) => {
    schemaCheck = undefined;
    throw error;
  });
  return schemaCheck;
}

async function verifySchema() {
  const row = await getD1()
    .prepare(`
      SELECT COUNT(*) AS table_count
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (
          'users', 'video_tasks', 'credit_ledger', 'media_assets',
          'app_sessions', 'invitations', 'provider_key_settings',
          'provider_key_secrets', 'video_analyses', 'video_analysis_quotas'
        )
    `)
    .first<{ table_count: number }>();
  if (Number(row?.table_count ?? 0) !== 10) {
    throw new Error(
      "MySQL schema is incomplete. Run the deploy/mysql/init migrations before starting the application.",
    );
  }
}
