-- Managed provider key IDs use the `managed_` prefix followed by a
-- 32-character UUID, so the full identifier is 40 characters long.
-- This migration is safe to run repeatedly on existing MySQL deployments.
ALTER TABLE provider_key_secrets
  MODIFY COLUMN key_id VARCHAR(64) NOT NULL;
