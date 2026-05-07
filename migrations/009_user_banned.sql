-- Add banned flag to users, separate from role.
-- Role stays as 'user' or 'admin'; banned is a boolean.

ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT false;
