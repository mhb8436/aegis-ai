-- Aegis Core - PostgreSQL Schema
-- Idempotent: uses IF NOT EXISTS

CREATE TABLE IF NOT EXISTS detection_rules (
  id          VARCHAR(64) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  category    VARCHAR(64) NOT NULL,
  severity    VARCHAR(16) NOT NULL DEFAULT 'medium',
  action      VARCHAR(16) NOT NULL DEFAULT 'block',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  priority    INTEGER NOT NULL DEFAULT 100,
  patterns    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_permissions (
  id          VARCHAR(64) PRIMARY KEY,
  agent_id    VARCHAR(255) NOT NULL,
  tool_name   VARCHAR(255) NOT NULL,
  allowed     BOOLEAN NOT NULL DEFAULT false,
  conditions  JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensitive_patterns (
  id          VARCHAR(64) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  pattern     TEXT NOT NULL,
  pii_type    VARCHAR(32) NOT NULL,
  mask_format VARCHAR(64) DEFAULT '***',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
