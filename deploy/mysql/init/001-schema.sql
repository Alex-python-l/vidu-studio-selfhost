SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(254) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  credit_balance INT NOT NULL DEFAULT 1000,
  concurrency_limit INT NOT NULL DEFAULT 3,
  role ENUM('user', 'support', 'admin') NOT NULL DEFAULT 'user',
  status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  active_task_count INT NOT NULL DEFAULT 0,
  daily_credit_limit INT NOT NULL DEFAULT 500,
  daily_credit_spent INT NOT NULL DEFAULT 0,
  daily_credit_date DATE NULL,
  deleted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX users_status_idx (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS video_tasks (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(254) NOT NULL,
  vidu_task_id VARCHAR(255) NULL,
  kind ENUM('reference', 'replacement', 'motion') NOT NULL,
  title VARCHAR(255) NOT NULL,
  prompt TEXT NOT NULL,
  model VARCHAR(128) NOT NULL DEFAULT '',
  state VARCHAR(32) NOT NULL DEFAULT 'submitting',
  duration INT NOT NULL DEFAULT 5,
  resolution VARCHAR(32) NOT NULL DEFAULT '720p',
  aspect_ratio VARCHAR(32) NOT NULL DEFAULT '16:9',
  input_summary LONGTEXT NOT NULL,
  reserved_credits INT NOT NULL DEFAULT 0,
  charged_credits INT NOT NULL DEFAULT 0,
  output_url TEXT NULL,
  cover_url TEXT NULL,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT video_tasks_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX video_tasks_user_created_idx (user_id, created_at),
  INDEX video_tasks_vidu_task_idx (vidu_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS credit_ledger (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(254) NOT NULL,
  task_id CHAR(36) NULL,
  amount INT NOT NULL,
  event VARCHAR(64) NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  actor_user_id VARCHAR(254) NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'system',
  idempotency_key VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT credit_ledger_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT credit_ledger_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY credit_ledger_idempotency_unique (idempotency_key),
  INDEX credit_ledger_user_created_idx (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS auth_identities (
  id CHAR(36) PRIMARY KEY,
  provider VARCHAR(64) NOT NULL,
  provider_subject VARCHAR(256) NOT NULL,
  user_id VARCHAR(254) NOT NULL,
  verified_email VARCHAR(254) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT auth_identities_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY auth_identities_provider_subject_unique (provider, provider_subject),
  INDEX auth_identities_user_idx (user_id),
  INDEX auth_identities_email_idx (verified_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS app_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(254) NOT NULL,
  token_digest CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT app_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX app_sessions_user_active_idx (user_id, revoked_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS password_credentials (
  user_id VARCHAR(254) PRIMARY KEY,
  algorithm VARCHAR(64) NOT NULL,
  iterations INT NOT NULL,
  salt VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT password_credentials_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS invitations (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  token_digest CHAR(64) NOT NULL UNIQUE,
  code_hint VARCHAR(32) NOT NULL DEFAULT '',
  initial_credits INT NOT NULL DEFAULT 0,
  initial_concurrency_limit INT NOT NULL DEFAULT 1,
  initial_daily_credit_limit INT NOT NULL DEFAULT 500,
  max_uses INT NOT NULL DEFAULT 1,
  use_count INT NOT NULL DEFAULT 0,
  allow_email_link TINYINT(1) NOT NULL DEFAULT 1,
  allow_manual_code TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  accepted_by VARCHAR(254) NULL,
  accepted_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  created_by VARCHAR(254) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT invitations_accepted_fk FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT invitations_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX invitations_email_active_idx (email, expires_at, accepted_at, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS invitation_redemptions (
  id CHAR(36) PRIMARY KEY,
  invitation_id CHAR(36) NOT NULL,
  user_id VARCHAR(254) NOT NULL,
  email VARCHAR(254) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT invitation_redemptions_invitation_fk FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE,
  CONSTRAINT invitation_redemptions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY invitation_redemptions_invitation_user_unique (invitation_id, user_id),
  INDEX invitation_redemptions_user_created_idx (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id CHAR(36) PRIMARY KEY,
  actor_user_id VARCHAR(254) NOT NULL,
  action VARCHAR(128) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(254) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  request_id VARCHAR(128) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT admin_audit_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX admin_audit_created_idx (created_at),
  INDEX admin_audit_actor_created_idx (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS provider_key_settings (
  provider ENUM('vidu', 'gemini') PRIMARY KEY,
  active_key_id VARCHAR(128) NOT NULL,
  updated_by VARCHAR(254) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT provider_key_settings_user_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS provider_key_secrets (
  key_id CHAR(36) PRIMARY KEY,
  provider ENUM('vidu', 'gemini') NOT NULL,
  label VARCHAR(80) NOT NULL,
  ciphertext LONGTEXT NOT NULL,
  iv VARCHAR(255) NOT NULL,
  key_hint VARCHAR(32) NOT NULL,
  encryption_version INT NOT NULL DEFAULT 1,
  created_by VARCHAR(254) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT provider_key_secrets_user_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX provider_key_secrets_provider_idx (provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  scope VARCHAR(80) NOT NULL,
  key_digest CHAR(64) NOT NULL,
  window_start BIGINT NOT NULL,
  count INT NOT NULL DEFAULT 0,
  expires_at BIGINT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (scope, key_digest, window_start),
  INDEX rate_limit_buckets_expires_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS media_assets (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(254) NOT NULL,
  public_token CHAR(73) NOT NULL UNIQUE,
  r2_key VARCHAR(512) NOT NULL UNIQUE,
  kind ENUM('image', 'video') NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  content_type VARCHAR(128) NOT NULL,
  size_bytes BIGINT NOT NULL,
  content_sha256 CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT media_assets_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX media_assets_user_created_idx (user_id, created_at),
  INDEX media_assets_content_sha256_idx (content_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS video_analyses (
  id CHAR(36) PRIMARY KEY,
  source_type ENUM('content_sha256', 'external_url') NOT NULL,
  source_key VARCHAR(512) NOT NULL,
  analysis_version VARCHAR(64) NOT NULL,
  state ENUM('analyzing', 'ready', 'failed') NOT NULL,
  model VARCHAR(128) NOT NULL,
  result_json LONGTEXT NULL,
  lease_token VARCHAR(255) NULL,
  lease_expires_at DATETIME(3) NULL,
  retry_after DATETIME(3) NULL,
  attempt_count INT NOT NULL DEFAULT 1,
  error_code VARCHAR(128) NULL,
  error_detail VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY video_analyses_source_version_unique (source_type, source_key, analysis_version),
  INDEX video_analyses_state_lease_idx (state, lease_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS video_analysis_quotas (
  user_id VARCHAR(254) PRIMARY KEY,
  quota_date DATE NOT NULL,
  used_count INT NOT NULL DEFAULT 0,
  active_lease_token VARCHAR(255) NULL,
  active_lease_expires_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT video_analysis_quotas_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TRIGGER IF EXISTS video_tasks_release_active_slot;
DELIMITER $$
CREATE TRIGGER video_tasks_release_active_slot
AFTER UPDATE ON video_tasks
FOR EACH ROW
BEGIN
  IF OLD.state IN ('submitting', 'created', 'queueing', 'processing')
     AND NEW.state IN ('success', 'failed') THEN
    UPDATE users
    SET active_task_count = GREATEST(active_task_count - 1, 0),
        updated_at = CURRENT_TIMESTAMP(3)
    WHERE id = NEW.user_id;
  END IF;
END$$
DELIMITER ;
