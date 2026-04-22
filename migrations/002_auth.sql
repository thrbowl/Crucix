-- migrations/002_auth.sql
-- SaaS Auth + Subscription schema

-- Users
CREATE TABLE IF NOT EXISTS users (
  id           BIGSERIAL    PRIMARY KEY,
  email        TEXT         NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  email_verified BOOLEAN    NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Refresh tokens (only hash stored, not plaintext)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT         NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ  NOT NULL,
  revoked      BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash    ON refresh_tokens (token_hash);

-- Subscription plans (seed data below)
CREATE TABLE IF NOT EXISTS plans (
  id             BIGSERIAL   PRIMARY KEY,
  name           TEXT        NOT NULL UNIQUE,
  credit_amount  INTEGER     NOT NULL,
  reset_period   TEXT        NOT NULL,
  features       JSONB       NOT NULL DEFAULT '{}'
);

-- User subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id               BIGSERIAL   PRIMARY KEY,
  user_id          BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  plan_id          BIGINT      NOT NULL REFERENCES plans(id),
  current_credits  INTEGER     NOT NULL DEFAULT 0,
  period_start     TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end       TIMESTAMPTZ NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);

-- Credit transaction log
CREATE TABLE IF NOT EXISTS credit_log (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id   BIGINT,
  operation    TEXT         NOT NULL,
  amount       INTEGER      NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_log_user_id ON credit_log (user_id, created_at DESC);

-- API Keys (only hash stored)
CREATE TABLE IF NOT EXISTS api_keys (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash     TEXT         NOT NULL UNIQUE,
  name         TEXT         NOT NULL DEFAULT 'default',
  last_used_at TIMESTAMPTZ,
  revoked      BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id  ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);

-- User watchlists
CREATE TABLE IF NOT EXISTS watchlists (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT         NOT NULL,
  value        TEXT         NOT NULL,
  label        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, type, value)
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON watchlists (user_id);

-- Intelligence alerts (early warning signals)
CREATE TABLE IF NOT EXISTS alerts (
  id           BIGSERIAL    PRIMARY KEY,
  type         TEXT         NOT NULL,
  severity     TEXT         NOT NULL,
  title        TEXT         NOT NULL,
  entity_ref   TEXT,
  signal_data  JSONB        NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_severity   ON alerts (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at DESC);

-- Async analysis jobs
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT         NOT NULL,
  input        JSONB        NOT NULL DEFAULT '{}',
  status       TEXT         NOT NULL DEFAULT 'pending',
  result       JSONB,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user_id ON analysis_jobs (user_id, created_at DESC);

-- Seed plan data (idempotent)
INSERT INTO plans (name, credit_amount, reset_period, features)
VALUES
  ('free',  100,   'daily',   '{"briefings":"latest_only","entity_fields":"basic","llm":false,"attack_chain":false,"taxii":false,"watchlist_limit":3,"api_key_limit":1}'),
  ('pro',   2000,  'monthly', '{"briefings":"full_history","entity_fields":"full","llm":true,"attack_chain":true,"taxii":false,"watchlist_limit":20,"api_key_limit":5}'),
  ('ultra', 20000, 'monthly', '{"briefings":"full_history","entity_fields":"full","llm":true,"attack_chain":true,"taxii":true,"watchlist_limit":null,"api_key_limit":null}')
ON CONFLICT (name) DO NOTHING;
