CREATE TABLE `provider_key_secrets` (
	`key_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`key_hint` text NOT NULL,
	`encryption_version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `provider_key_secrets_provider_idx` ON `provider_key_secrets` (`provider`);