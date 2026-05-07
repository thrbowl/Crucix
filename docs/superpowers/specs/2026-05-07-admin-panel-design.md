# Admin Panel Design

Single page `/admin.html` with three tabbed modules: User Management, Data Source Management, Audit Logs. All APIs under `/api/admin/*` with admin-only middleware.

## Database

New migration `008_audit_logs.sql`:

```sql
CREATE TABLE audit_logs (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    BIGINT      REFERENCES users(id),
  action     TEXT        NOT NULL,
  target     TEXT,
  detail     JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_action  ON audit_logs (action);
```

Action values: `user.login`, `user.logout`, `user.password_change`, `user.role_change`, `user.reset_password`, `user.ban`, `user.unban`, `source.enable`, `source.disable`, `source.edit`, `source.trigger`.

## Backend

### Middleware

`requireAdmin` — checks `req.user.role === 'admin'` after `requireAuth`.

### API Routes

| Method | Path | Function |
|--------|------|----------|
| GET | `/api/admin/users` | List all users with role, created_at, subscription |
| PATCH | `/api/admin/users/:id/role` | Change role (user/admin/banned) |
| POST | `/api/admin/users/:id/reset-password` | Reset password, return random temp password |
| GET | `/api/admin/sources` | Full source list with health data |
| PATCH | `/api/admin/sources/:name` | Edit source (domain/type/enabled/homepage_url) |
| POST | `/api/admin/sources/:name/trigger` | Trigger manual sweep for one source |
| GET | `/api/admin/sources/:name/history` | Source health trend (last 30 sweeps) |
| GET | `/api/admin/audit-logs` | Paginated audit logs, filter by action/user |

### Audit Logging

Helper function `writeAuditLog(pool, { userId, action, target, detail, ip })` called at every management operation. Also retroactively added to login/logout/password-change endpoints.

## Frontend

`/admin.html` — standard page pattern (tailwind config, glass-panel, initShell).

Three tabs:
- **Users**: table with email, role, created date, subscription. Actions: role dropdown, reset password button.
- **Sources**: grouped by domain (reuse DOMAIN_LABELS from sources.html). Each source shows status, enable toggle, edit button, trigger button. Expandable health trend.
- **Audit Logs**: reverse-chronological table with action icon, user, target, detail, timestamp. Filter by action type and user. Paginated.
