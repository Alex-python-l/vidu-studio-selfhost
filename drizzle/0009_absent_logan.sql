ALTER TABLE `invitations` ADD `initial_concurrency_limit` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `initial_daily_credit_limit` integer DEFAULT 500 NOT NULL;