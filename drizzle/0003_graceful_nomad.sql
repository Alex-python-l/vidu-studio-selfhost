CREATE TABLE `invitation_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_redemptions_invitation_user_unique` ON `invitation_redemptions` (`invitation_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `invitation_redemptions_user_created_idx` ON `invitation_redemptions` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `invitations` ADD `code_hint` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `max_uses` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `use_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `allow_email_link` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `allow_manual_code` integer DEFAULT false NOT NULL;