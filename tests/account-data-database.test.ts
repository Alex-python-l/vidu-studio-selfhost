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
  database.exec(migration("0000_icy_gorgon.sql"));
  database.exec(migration("0001_amazing_bloodscream.sql"));
  database.exec(`
    INSERT INTO users (
      id, email, display_name, credit_balance, concurrency_limit
    ) VALUES ('existing', 'existing@example.test', 'Existing', 777, 4);
    INSERT INTO video_tasks (
      id, user_id, kind, title, state, reserved_credits
    ) VALUES (
      'historical-active', 'existing', 'reference', 'Historical',
      'processing', 20
    );
  `);
  database.exec(migration("0002_wet_nocturne.sql"));
  database.exec(migration("0003_graceful_nomad.sql"));
  database.exec(migration("0004_married_ma_gnuci.sql"));
  database.exec(migration("0005_slippery_dreadnoughts.sql"));
  database.exec(migration("0006_loose_black_widow.sql"));
  database.exec(migration("0007_regular_jackpot.sql"));
  database.exec(migration("0008_chubby_mattie_franklin.sql"));
  database.exec(migration("0009_absent_logan.sql"));
  return database;
}

test("forward migration preserves historical users and backfills active slots", () => {
  const database = upgradedDatabase();
  const user = database
    .prepare(`
      SELECT credit_balance, concurrency_limit, role, status,
        active_task_count, daily_credit_limit
      FROM users WHERE id = 'existing'
    `)
    .get() as {
    credit_balance: number;
    concurrency_limit: number;
    role: string;
    status: string;
    active_task_count: number;
    daily_credit_limit: number;
  };

  assert.deepEqual({ ...user }, {
    credit_balance: 777,
    concurrency_limit: 4,
    role: "user",
    status: "active",
    active_task_count: 1,
    daily_credit_limit: 500,
  });
  assert.equal(
    (
      database
        .prepare(`
          SELECT count(*) AS count
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN (
              'auth_identities', 'app_sessions', 'invitations',
              'invitation_redemptions', 'admin_audit_log', 'rate_limit_buckets',
              'password_credentials', 'provider_key_settings', 'provider_key_secrets'
            )
        `)
        .get() as { count: number }
    ).count,
    9,
  );
  const providerColumns = database
    .prepare("PRAGMA table_info(provider_key_settings)")
    .all()
    .map((column) => (column as { name: string }).name);
  assert.deepEqual(providerColumns, [
    "provider",
    "active_key_id",
    "updated_by",
    "updated_at",
  ]);
  const providerSecretColumns = database
    .prepare("PRAGMA table_info(provider_key_secrets)")
    .all()
    .map((column) => (column as { name: string }).name);
  assert.deepEqual(providerSecretColumns, [
    "key_id",
    "provider",
    "label",
    "ciphertext",
    "iv",
    "key_hint",
    "encryption_version",
    "created_by",
    "created_at",
    "updated_at",
  ]);
  const userColumns = database
    .prepare("PRAGMA table_info(users)")
    .all()
    .map((column) => (column as { name: string }).name);
  assert.ok(userColumns.includes("deleted_at"));
  const invitationColumns = database
    .prepare("PRAGMA table_info(invitations)")
    .all()
    .map((column) => (column as { name: string }).name);
  assert.ok(invitationColumns.includes("initial_concurrency_limit"));
  assert.ok(invitationColumns.includes("initial_daily_credit_limit"));
  database.close();
});

test("one invitation can be claimed once and grants credits once", () => {
  const database = upgradedDatabase();
  database.exec(`
    INSERT INTO invitations (
      id, email, token_digest, initial_credits, initial_concurrency_limit,
      initial_daily_credit_limit, expires_at, created_by
    ) VALUES (
      'invite-1', 'new@example.test', '${"a".repeat(64)}', 25, 4, 900,
      datetime('now', '+7 days'), 'existing'
    );
  `);
  const claim = database.prepare(`
    UPDATE invitations
    SET accepted_by = ?, accepted_at = CURRENT_TIMESTAMP
    WHERE id = 'invite-1' AND accepted_at IS NULL AND revoked_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
  `);
  database.exec(`
    INSERT INTO users (
      id, email, display_name, credit_balance, concurrency_limit,
      daily_credit_limit
    )
    SELECT 'new-user', 'new@example.test', 'New', initial_credits,
      initial_concurrency_limit, initial_daily_credit_limit
    FROM invitations
    WHERE id = 'invite-1';
  `);
  assert.deepEqual(
    {
      ...(database
        .prepare(`
          SELECT credit_balance, concurrency_limit, daily_credit_limit
          FROM users WHERE id = 'new-user'
        `)
        .get() as {
        credit_balance: number;
        concurrency_limit: number;
        daily_credit_limit: number;
      }),
    },
    {
      credit_balance: 25,
      concurrency_limit: 4,
      daily_credit_limit: 900,
    },
  );
  assert.equal(claim.run("new-user").changes, 1);
  database.exec(`
    INSERT INTO credit_ledger (
      id, user_id, amount, event, source, idempotency_key
    ) VALUES (
      'grant-1', 'new-user', 25, 'invite_grant', 'invitation',
      'invite:invite-1'
    );
    INSERT OR IGNORE INTO credit_ledger (
      id, user_id, amount, event, source, idempotency_key
    ) VALUES (
      'grant-2', 'new-user', 25, 'invite_grant', 'invitation',
      'invite:invite-1'
    );
  `);
  database.exec(`
    INSERT INTO users (
      id, email, display_name, credit_balance, concurrency_limit
    ) VALUES ('other-user', 'other@example.test', 'Other', 0, 1);
  `);
  assert.equal(claim.run("other-user").changes, 0);
  assert.equal(
    (
      database
        .prepare(`
          SELECT count(*) AS count
          FROM credit_ledger WHERE idempotency_key = 'invite:invite-1'
        `)
        .get() as { count: number }
    ).count,
    1,
  );
  database.close();
});

test("registration code usage is capped and redemption rows stay unique", () => {
  const database = upgradedDatabase();
  database.exec(`
    INSERT INTO invitations (
      id, email, token_digest, code_hint, initial_credits, max_uses,
      allow_email_link, allow_manual_code, expires_at, created_by
    ) VALUES (
      'code-1', '', '${"b".repeat(64)}', 'VI••10', 10, 2,
      0, 1, datetime('now', '+7 days'), 'existing'
    );
  `);
  const claimUse = database.prepare(`
    UPDATE invitations
    SET use_count = use_count + 1
    WHERE id = 'code-1' AND use_count < max_uses
  `);
  assert.equal(claimUse.run().changes, 1);
  assert.equal(claimUse.run().changes, 1);
  assert.equal(claimUse.run().changes, 0);

  database.exec(`
    INSERT INTO invitation_redemptions (
      id, invitation_id, user_id, email
    ) VALUES (
      'redemption-1', 'code-1', 'existing', 'existing@example.test'
    );
  `);
  assert.throws(() =>
    database.exec(`
      INSERT INTO invitation_redemptions (
        id, invitation_id, user_id, email
      ) VALUES (
        'redemption-2', 'code-1', 'existing', 'existing@example.test'
      );
    `),
  );
  database.close();
});

test("soft-deleting a registration code preserves its grant and redemption history", () => {
  const database = upgradedDatabase();
  database.exec(`
    INSERT INTO invitations (
      id, email, token_digest, code_hint, initial_credits, max_uses,
      use_count, allow_email_link, allow_manual_code, expires_at, created_by
    ) VALUES (
      'code-soft-delete', 'existing@example.test', '${"c".repeat(64)}',
      'VI••••TE', 25, 2, 1, 1, 1, datetime('now', '+7 days'), 'existing'
    );
    INSERT INTO invitation_redemptions (
      id, invitation_id, user_id, email
    ) VALUES (
      'redemption-soft-delete', 'code-soft-delete', 'existing',
      'existing@example.test'
    );
    INSERT INTO credit_ledger (
      id, user_id, amount, event, source, idempotency_key
    ) VALUES (
      'grant-soft-delete', 'existing', 25, 'invite_grant', 'invitation',
      'invite:code-soft-delete'
    );
    UPDATE invitations
    SET revoked_at = CURRENT_TIMESTAMP, deleted_at = CURRENT_TIMESTAMP
    WHERE id = 'code-soft-delete';
  `);

  assert.equal(
    (
      database
        .prepare(`
          SELECT count(*) AS count
          FROM invitations
          WHERE id = 'code-soft-delete'
        `)
        .get() as { count: number }
    ).count,
    1,
  );
  assert.equal(
    (
      database
        .prepare(`
          SELECT count(*) AS count
          FROM invitations
          WHERE id = 'code-soft-delete' AND deleted_at IS NULL
        `)
        .get() as { count: number }
    ).count,
    0,
  );
  assert.equal(
    (
      database
        .prepare(`
          SELECT count(*) AS count
          FROM invitation_redemptions
          WHERE invitation_id = 'code-soft-delete'
        `)
        .get() as { count: number }
    ).count,
    1,
  );
  assert.equal(
    (
      database
        .prepare(`
          SELECT count(*) AS count
          FROM credit_ledger
          WHERE idempotency_key = 'invite:code-soft-delete'
        `)
        .get() as { count: number }
    ).count,
    1,
  );
  assert.throws(() =>
    database.exec(`
      INSERT INTO invitations (
        id, email, token_digest, code_hint, initial_credits, max_uses,
        allow_email_link, allow_manual_code, expires_at, created_by
      ) VALUES (
        'code-reused', '', '${"c".repeat(64)}', 'VI••••TE', 10, 1,
        0, 1, datetime('now', '+7 days'), 'existing'
      );
    `),
  );
  database.close();
});

test("twenty concurrent-style reservations admit only the configured slot", () => {
  const database = upgradedDatabase();
  database.exec(`
    UPDATE users
    SET credit_balance = 1000, concurrency_limit = 1, active_task_count = 0,
      daily_credit_limit = 500, daily_credit_spent = 0,
      daily_credit_date = date('now')
    WHERE id = 'existing';
    UPDATE video_tasks SET state = 'success' WHERE id = 'historical-active';
  `);
  const reserve = database.prepare(`
    UPDATE users
    SET credit_balance = credit_balance - 10,
        active_task_count = active_task_count + 1,
        daily_credit_spent = daily_credit_spent + 10
    WHERE id = 'existing'
      AND status = 'active'
      AND credit_balance >= 10
      AND active_task_count < concurrency_limit
      AND daily_credit_spent + 10 <= daily_credit_limit
  `);
  let admitted = 0;
  for (let index = 0; index < 20; index += 1) {
    admitted += Number(reserve.run().changes);
  }
  assert.equal(admitted, 1);
  assert.deepEqual(
    {
      ...(database
      .prepare(`
        SELECT credit_balance, active_task_count, daily_credit_spent
        FROM users WHERE id = 'existing'
      `)
      .get() as Record<string, unknown>),
    },
    {
      credit_balance: 990,
      active_task_count: 1,
      daily_credit_spent: 10,
    },
  );
  database.close();
});

test("terminal transition releases one slot exactly once and never below zero", () => {
  const database = upgradedDatabase();
  database.exec(
    "UPDATE users SET active_task_count = 1 WHERE id = 'existing'",
  );
  assert.equal(
    database
      .prepare(
        "UPDATE video_tasks SET state = 'success' WHERE id = 'historical-active'",
      )
      .run().changes,
    1,
  );
  database.exec(
    "UPDATE video_tasks SET state = 'failed' WHERE id = 'historical-active'",
  );
  assert.equal(
    (
      database
        .prepare(
          "SELECT active_task_count FROM users WHERE id = 'existing'",
        )
        .get() as { active_task_count: number }
    ).active_task_count,
    0,
  );
  database.close();
});

test("credit adjustment is idempotent and refuses a negative balance", () => {
  const database = upgradedDatabase();
  database.exec(
    "UPDATE users SET credit_balance = 30 WHERE id = 'existing'",
  );
  const insertAdjustment = database.prepare(`
    INSERT OR IGNORE INTO credit_ledger (
      id, user_id, amount, event, note, actor_user_id, source,
      idempotency_key
    )
    SELECT ?, id, ?, 'admin_adjustment', 'test', 'existing', 'admin', ?
    FROM users
    WHERE id = 'existing' AND credit_balance + ? >= 0
  `);
  const applyAdjustment = database.prepare(`
    UPDATE users
    SET credit_balance = credit_balance + ?
    WHERE id = 'existing' AND changes() = 1
  `);

  database.exec("BEGIN");
  assert.equal(
    insertAdjustment.run("ledger-1", -20, "admin:once", -20).changes,
    1,
  );
  assert.equal(applyAdjustment.run(-20).changes, 1);
  database.exec("COMMIT");

  database.exec("BEGIN");
  assert.equal(
    insertAdjustment.run("ledger-2", -20, "admin:once", -20).changes,
    0,
  );
  assert.equal(applyAdjustment.run(-20).changes, 0);
  database.exec("COMMIT");

  database.exec("BEGIN");
  assert.equal(
    insertAdjustment.run("ledger-3", -50, "admin:too-much", -50).changes,
    0,
  );
  assert.equal(applyAdjustment.run(-50).changes, 0);
  database.exec("COMMIT");

  assert.equal(
    (
      database
        .prepare(
          "SELECT credit_balance FROM users WHERE id = 'existing'",
        )
        .get() as { credit_balance: number }
    ).credit_balance,
    10,
  );
  database.close();
});

test("terminal task settlement replaces the reserve with actual usage once", () => {
  const database = upgradedDatabase();
  database.exec(`
    UPDATE users
    SET credit_balance = 80,
        active_task_count = 1,
        daily_credit_spent = 20,
        daily_credit_date = date('now')
    WHERE id = 'existing';
    UPDATE video_tasks
    SET reserved_credits = 20, charged_credits = 12, state = 'processing'
    WHERE id = 'historical-active';
  `);

  const settle = () => {
    database.exec("BEGIN");
    database
      .prepare(`
        UPDATE video_tasks
        SET state = 'success', charged_credits = 15,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'historical-active'
          AND state IN ('created', 'queueing', 'processing')
      `)
      .run();
    database
      .prepare(`
        INSERT OR IGNORE INTO credit_ledger (
          id, user_id, task_id, amount, event, note, source, idempotency_key
        )
        SELECT 'terminal-ledger', id, 'historical-active', 5,
          'charge_adjustment', 'actual usage', 'task',
          'task:settle:historical-active'
        FROM users
        WHERE id = 'existing' AND changes() = 1
      `)
      .run();
    database
      .prepare(`
        UPDATE users
        SET credit_balance = credit_balance + 5,
            daily_credit_spent = daily_credit_spent - 5
        WHERE id = 'existing' AND changes() = 1
      `)
      .run();
    database.exec("COMMIT");
  };

  settle();
  settle();

  const user = database
    .prepare(`
      SELECT credit_balance, daily_credit_spent, active_task_count
      FROM users WHERE id = 'existing'
    `)
    .get() as {
    credit_balance: number;
    daily_credit_spent: number;
    active_task_count: number;
  };
  const task = database
    .prepare(`
      SELECT state, charged_credits
      FROM video_tasks WHERE id = 'historical-active'
    `)
    .get() as { state: string; charged_credits: number };
  const ledger = database
    .prepare(`
      SELECT COUNT(*) AS count, SUM(amount) AS amount
      FROM credit_ledger
      WHERE idempotency_key = 'task:settle:historical-active'
    `)
    .get() as { count: number; amount: number };

  assert.deepEqual({ ...user }, {
    credit_balance: 85,
    daily_credit_spent: 15,
    active_task_count: 0,
  });
  assert.deepEqual({ ...task }, { state: "success", charged_credits: 15 });
  assert.deepEqual({ ...ledger }, { count: 1, amount: 5 });
  database.close();
});
