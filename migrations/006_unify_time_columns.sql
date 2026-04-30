-- migrations/006_unify_time_columns.sql
-- Unify time columns across raw_intel_items and stix_objects
--
-- Naming convention:
--   first_seen_at / last_seen_at  → data's own time (source observation/publish time)
--   created_at / updated_at       → database record metadata (row insert/update time)
--
-- All filtering and sorting uses last_seen_at (most recent activity signal).

-- ═══════════════════════════════════════════════════════════════
-- raw_intel_items: rename columns
-- ═══════════════════════════════════════════════════════════════

-- 1. Rename old ingestion column to created_at
ALTER TABLE raw_intel_items RENAME COLUMN first_seen_at TO created_at;

-- 2. Add updated_at for row-level update tracking
ALTER TABLE raw_intel_items ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3. Rename data-time columns
ALTER TABLE raw_intel_items RENAME COLUMN published_at TO first_seen_at;
ALTER TABLE raw_intel_items RENAME COLUMN modified_at  TO last_seen_at;

-- 4. Backfill: last_seen_at defaults to first_seen_at when NULL
UPDATE raw_intel_items SET last_seen_at = first_seen_at WHERE last_seen_at IS NULL;

-- 5. Rebuild indexes
DROP INDEX IF EXISTS idx_raw_intel_published;
DROP INDEX IF EXISTS idx_raw_intel_first_seen;

CREATE INDEX IF NOT EXISTS idx_raw_intel_first_seen
  ON raw_intel_items (first_seen_at DESC NULLS LAST)
  WHERE first_seen_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raw_intel_last_seen
  ON raw_intel_items (last_seen_at DESC NULLS LAST)
  WHERE last_seen_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raw_intel_created
  ON raw_intel_items (created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- stix_objects: add extracted time columns
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE stix_objects ADD COLUMN first_seen_at TIMESTAMPTZ;
ALTER TABLE stix_objects ADD COLUMN last_seen_at  TIMESTAMPTZ;

-- Backfill from JSONB, fallback to created_at then now() when STIX 'created' is missing
UPDATE stix_objects SET
  first_seen_at = COALESCE(
    (data->>'created')::timestamptz,
    created_at,
    now()
  ),
  last_seen_at  = COALESCE(
    (data->>'modified')::timestamptz,
    (data->>'created')::timestamptz,
    created_at,
    now()
  );

-- Make NOT NULL after backfill (all STIX objects have 'created')
ALTER TABLE stix_objects ALTER COLUMN first_seen_at SET NOT NULL;
ALTER TABLE stix_objects ALTER COLUMN last_seen_at  SET NOT NULL;

-- Indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_stix_objects_first_seen
  ON stix_objects (first_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_stix_objects_last_seen
  ON stix_objects (last_seen_at DESC);
