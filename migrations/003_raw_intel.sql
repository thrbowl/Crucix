-- migrations/003_raw_intel.sql
-- Raw intelligence items: one row per unique piece of content

CREATE TABLE IF NOT EXISTS raw_intel_items (
  id            BIGSERIAL    PRIMARY KEY,
  source_name   TEXT         NOT NULL,
  source_type   TEXT         NOT NULL,
  title         TEXT,
  url           TEXT,
  published_at  TIMESTAMPTZ,
  modified_at   TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  content_hash  TEXT         NOT NULL,
  dedup_key     TEXT         NOT NULL,
  content       TEXT         NOT NULL,
  UNIQUE (dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_raw_intel_source
  ON raw_intel_items (source_name);

CREATE INDEX IF NOT EXISTS idx_raw_intel_type
  ON raw_intel_items (source_type);

CREATE INDEX IF NOT EXISTS idx_raw_intel_url
  ON raw_intel_items (url)
  WHERE url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raw_intel_published
  ON raw_intel_items (published_at DESC NULLS LAST)
  WHERE published_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raw_intel_first_seen
  ON raw_intel_items (first_seen_at DESC);
