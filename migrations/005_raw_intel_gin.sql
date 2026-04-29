-- 005_raw_intel_gin.sql
-- Full-text search indexes on raw_intel_items

-- GIN index on title (simple tokenizer — handles mixed CJK/ASCII)
CREATE INDEX IF NOT EXISTS idx_raw_intel_title_gin
  ON raw_intel_items USING GIN (to_tsvector('simple', coalesce(title, '')));

-- GIN index on content JSON text
CREATE INDEX IF NOT EXISTS idx_raw_intel_content_gin
  ON raw_intel_items USING GIN (to_tsvector('simple', coalesce(content, '')));

-- Composite btree for common filter: source_type + first_seen_at (paginated feeds)
CREATE INDEX IF NOT EXISTS idx_raw_intel_type_first_seen
  ON raw_intel_items (source_type, first_seen_at DESC);
