CREATE TABLE `credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text,
	`amount` integer NOT NULL,
	`event` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `credit_ledger_user_created_idx` ON `credit_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_token` text NOT NULL,
	`r2_key` text NOT NULL,
	`kind` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_public_token_unique` ON `media_assets` (`public_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_r2_key_unique` ON `media_assets` (`r2_key`);--> statement-breakpoint
CREATE INDEX `media_assets_user_created_idx` ON `media_assets` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`credit_balance` integer DEFAULT 1000 NOT NULL,
	`concurrency_limit` integer DEFAULT 3 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `video_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`vidu_task_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'submitting' NOT NULL,
	`duration` integer DEFAULT 5 NOT NULL,
	`resolution` text DEFAULT '720p' NOT NULL,
	`aspect_ratio` text DEFAULT '16:9' NOT NULL,
	`input_summary` text DEFAULT '{}' NOT NULL,
	`reserved_credits` integer DEFAULT 0 NOT NULL,
	`charged_credits` integer DEFAULT 0 NOT NULL,
	`output_url` text,
	`cover_url` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `video_tasks_user_created_idx` ON `video_tasks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `video_tasks_vidu_task_idx` ON `video_tasks` (`vidu_task_id`);