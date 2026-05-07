-- Audit log for admin operations and auth events.
-- Records who did what to which target, with optional detail payload.

CREATE TABLE audit_logs (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT        NOT NULL,
  target     TEXT,
  detail     JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_action  ON audit_logs (action);
CREATE INDEX idx_audit_logs_user    ON audit_logs (user_id);
