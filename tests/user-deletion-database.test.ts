import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function migration(name: string) {
  return readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8")
    .replaceAll("--> statement-breakpoint", "");
}

function upgradedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const name of [
    "0000_icy_gorgon.sql",
    "0001_amazing_bloodscream.sql",
    "0002_wet_nocturne.sql",
    "0003_graceful_nomad.sql",
    "0004_married_ma_gnuci.sql",
    "0005_slippery_dreadnoughts.sql",
    "0006_loose_black_widow.sql",
    "0007_regular_jackpot.sql",
    "0008_chubby_mattie_franklin.sql",
    "0009_absent_logan.sql",
  ]) {
    database.exec(migration(name));
  }
  return database;
}

test("soft-deleting a user protects the last admin and preserves history", () => {
  const database = upgradedDatabase();
  database.exec(`
    INSERT INTO users (id, email, display_name, role, status)
    VALUES ('target-admin', 'target@example.test', 'Target', 'admin', 'active');
    INSERT INTO video_tasks (id, user_id, kind, title, state, reserved_credits)
    VALUES ('historical-task', 'target-admin', 'reference', 'History', 'success', 0);
    INSERT INTO credit_ledger (
      id, user_id, amount, event, source, idempotency_key
    ) VALUES (
      'historical-ledger', 'target-admin', 5, 'admin_adjustment', 'admin',
      'delete-history-check'
    );
    INSERT INTO app_sessions (id, user_id, token_digest, expires_at)
    VALUES (
      'target-session', 'target-admin', '${"d".repeat(64)}',
      datetime('now', '+1 day')
    );
  `);

  const softDelete = database.prepare(`
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
          FROM users AS other
          WHERE other.id <> users.id
            AND other.role = 'admin'
            AND other.status = 'active'
            AND other.deleted_at IS NULL
        )
      )
  `);

  assert.equal(softDelete.run("target-admin").changes, 0);
  database.exec(`
    INSERT INTO users (id, email, display_name, role, status)
    VALUES ('other-admin', 'other@example.test', 'Other', 'admin', 'active');
  `);
  assert.equal(softDelete.run("target-admin").changes, 1);
  assert.equal(
    database
      .prepare(`
        UPDATE app_sessions
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND revoked_at IS NULL
          AND EXISTS (
            SELECT 1 FROM users
            WHERE id = ? AND deleted_at IS NOT NULL
          )
      `)
      .run("target-admin", "target-admin").changes,
    1,
  );

  const user = database
    .prepare("SELECT status, deleted_at FROM users WHERE id = 'target-admin'")
    .get() as { status: string; deleted_at: string | null };
  assert.equal(user.status, "suspended");
  assert.ok(user.deleted_at);
  assert.equal(
    (
      database
        .prepare("SELECT count(*) AS count FROM users WHERE deleted_at IS NULL")
        .get() as { count: number }
    ).count,
    1,
  );
  for (const table of ["video_tasks", "credit_ledger"] as const) {
    assert.equal(
      (
        database
          .prepare(`SELECT count(*) AS count FROM ${table} WHERE user_id = ?`)
          .get("target-admin") as { count: number }
      ).count,
      1,
    );
  }
  assert.ok(
    (
      database
        .prepare("SELECT revoked_at FROM app_sessions WHERE id = 'target-session'")
        .get() as { revoked_at: string | null }
    ).revoked_at,
  );
  database.close();
});
