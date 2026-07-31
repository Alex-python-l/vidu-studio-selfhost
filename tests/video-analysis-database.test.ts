import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id text PRIMARY KEY NOT NULL,
      email text NOT NULL UNIQUE,
      display_name text NOT NULL
    );
    CREATE TABLE media_assets (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_token text NOT NULL UNIQUE,
      r2_key text NOT NULL UNIQUE,
      kind text NOT NULL,
      file_name text NOT NULL,
      content_type text NOT NULL,
      size_bytes integer NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    INSERT INTO users (id, email, display_name)
    VALUES ('user-1', 'user@example.test', 'Existing user');
    INSERT INTO media_assets (
      id, user_id, public_token, r2_key, kind, file_name, content_type,
      size_bytes
    ) VALUES (
      'asset-1', 'user-1', 'token-1', 'r2-1', 'video', 'source.mp4',
      'video/mp4', 42
    );
  `);
  const migration = readFileSync(
    new URL("../drizzle/0001_amazing_bloodscream.sql", import.meta.url),
    "utf8",
  ).replaceAll("--> statement-breakpoint", "");
  database.exec(migration);
  return database;
}

test("forward migration preserves historical media and adds analysis state", () => {
  const database = migratedDatabase();
  const media = database
    .prepare(
      "SELECT id, content_sha256 FROM media_assets WHERE id = 'asset-1'",
    )
    .get() as { id: string; content_sha256: string | null };

  assert.equal(media.id, "asset-1");
  assert.equal(media.content_sha256, null);
  assert.equal(
    (
      database
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('video_analyses', 'video_analysis_quotas')",
        )
        .get() as { count: number }
    ).count,
    2,
  );
  database.close();
});

test("unique cache identity produces one claimant and lease CAS fences writes", () => {
  const database = migratedDatabase();
  const insert = database.prepare(`
    INSERT OR IGNORE INTO video_analyses (
      id, source_type, source_key, analysis_version, state, model,
      lease_token, lease_expires_at
    ) VALUES (?, 'content_sha256', 'same-bytes', 'replacement-video-v1',
      'analyzing', 'gemini-3.6-flash', ?, datetime('now', '+90 seconds'))
  `);
  let claimants = 0;
  for (let index = 0; index < 20; index += 1) {
    claimants += Number(
      insert.run(`analysis-${index}`, `lease-${index}`).changes,
    );
  }
  assert.equal(claimants, 1);

  const staleWrite = database
    .prepare(
      "UPDATE video_analyses SET state = 'ready' WHERE source_key = 'same-bytes' AND lease_token = 'stale-lease'",
    )
    .run();
  assert.equal(staleWrite.changes, 0);

  const currentWrite = database
    .prepare(
      "UPDATE video_analyses SET state = 'ready' WHERE source_key = 'same-bytes' AND lease_token = 'lease-0'",
    )
    .run();
  assert.equal(currentWrite.changes, 1);
  database.close();
});

test("daily quota allows one active lease and stops at thirty uses", () => {
  const database = migratedDatabase();
  database.exec(`
    INSERT INTO video_analysis_quotas (
      user_id, quota_date, used_count, active_lease_token,
      active_lease_expires_at
    ) VALUES ('user-1', date('now'), 29, NULL, NULL);
  `);
  const reserve = database.prepare(`
    UPDATE video_analysis_quotas
    SET active_lease_token = ?, active_lease_expires_at = datetime('now', '+90 seconds')
    WHERE user_id = 'user-1'
      AND used_count < 30
      AND (active_lease_token IS NULL OR active_lease_expires_at <= CURRENT_TIMESTAMP)
  `);
  assert.equal(reserve.run("lease-a").changes, 1);
  assert.equal(reserve.run("lease-b").changes, 0);

  assert.equal(
    database
      .prepare(
        "UPDATE video_analysis_quotas SET used_count = used_count + 1 WHERE user_id = 'user-1' AND used_count < 30 AND active_lease_token = 'lease-a'",
      )
      .run().changes,
    1,
  );
  database.exec(
    "UPDATE video_analysis_quotas SET active_lease_token = NULL, active_lease_expires_at = NULL WHERE user_id = 'user-1'",
  );
  assert.equal(reserve.run("lease-c").changes, 0);
  database.close();
});
