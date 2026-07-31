ALTER TABLE `users` ADD `role` text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `status` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `active_task_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `daily_credit_limit` integer DEFAULT 500 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `daily_credit_spent` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `daily_credit_date` text;
--> statement-breakpoint
ALTER TABLE `credit_ledger` ADD `actor_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `credit_ledger` ADD `source` text DEFAULT 'system' NOT NULL;
--> statement-breakpoint
ALTER TABLE `credit_ledger` ADD `idempotency_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_ledger_idempotency_unique`
  ON `credit_ledger` (`idempotency_key`);
--> statement-breakpoint
CREATE TABLE `auth_identities` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `provider_subject` text NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `verified_email` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_identities_provider_subject_unique`
  ON `auth_identities` (`provider`, `provider_subject`);
--> statement-breakpoint
CREATE INDEX `auth_identities_user_idx` ON `auth_identities` (`user_id`);
--> statement-breakpoint
CREATE INDEX `auth_identities_email_idx`
  ON `auth_identities` (`verified_email`);
--> statement-breakpoint
CREATE TABLE `app_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `token_digest` text NOT NULL UNIQUE,
  `expires_at` text NOT NULL,
  `revoked_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `app_sessions_user_active_idx`
  ON `app_sessions` (`user_id`, `revoked_at`, `expires_at`);
--> statement-breakpoint
CREATE TABLE `invitations` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `token_digest` text NOT NULL UNIQUE,
  `initial_credits` integer DEFAULT 0 NOT NULL,
  `expires_at` text NOT NULL,
  `accepted_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `accepted_at` text,
  `revoked_at` text,
  `created_by` text NOT NULL REFERENCES `users`(`id`) ON DELETE RESTRICT,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `invitations_email_active_idx`
  ON `invitations` (`email`, `expires_at`, `accepted_at`, `revoked_at`);
--> statement-breakpoint
CREATE TABLE `admin_audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE RESTRICT,
  `action` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `reason` text NOT NULL,
  `request_id` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_audit_created_idx`
  ON `admin_audit_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `admin_audit_actor_created_idx`
  ON `admin_audit_log` (`actor_user_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
  `scope` text NOT NULL,
  `key_digest` text NOT NULL,
  `window_start` integer NOT NULL,
  `count` integer DEFAULT 0 NOT NULL,
  `expires_at` integer NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_buckets_identity_unique`
  ON `rate_limit_buckets` (`scope`, `key_digest`, `window_start`);
--> statement-breakpoint
CREATE INDEX `rate_limit_buckets_expires_idx`
  ON `rate_limit_buckets` (`expires_at`);
--> statement-breakpoint
UPDATE `users`
SET `active_task_count` = (
  SELECT COUNT(*)
  FROM `video_tasks`
  WHERE `video_tasks`.`user_id` = `users`.`id`
    AND `video_tasks`.`state`
      IN ('submitting', 'created', 'queueing', 'processing')
);
--> statement-breakpoint
CREATE TRIGGER `video_tasks_release_active_slot`
AFTER UPDATE OF `state` ON `video_tasks`
WHEN OLD.`state` IN ('submitting', 'created', 'queueing', 'processing')
  AND NEW.`state` IN ('success', 'failed')
BEGIN
  UPDATE `users`
  SET `active_task_count` = MAX(`active_task_count` - 1, 0),
      `updated_at` = CURRENT_TIMESTAMP
  WHERE `id` = NEW.`user_id`;
END;
