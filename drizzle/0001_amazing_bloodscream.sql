CREATE TABLE `video_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_key` text NOT NULL,
	`analysis_version` text NOT NULL,
	`state` text NOT NULL,
	`model` text NOT NULL,
	`result_json` text,
	`lease_token` text,
	`lease_expires_at` text,
	`retry_after` text,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`error_code` text,
	`error_detail` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_analyses_source_version_unique` ON `video_analyses` (`source_type`,`source_key`,`analysis_version`);--> statement-breakpoint
CREATE INDEX `video_analyses_state_lease_idx` ON `video_analyses` (`state`,`lease_expires_at`);--> statement-breakpoint
CREATE TABLE `video_analysis_quotas` (
	`user_id` text PRIMARY KEY NOT NULL,
	`quota_date` text NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`active_lease_token` text,
	`active_lease_expires_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `content_sha256` text;--> statement-breakpoint
CREATE INDEX `media_assets_content_sha256_idx` ON `media_assets` (`content_sha256`);