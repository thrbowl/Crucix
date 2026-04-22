-- migrations/001_init.sql
-- STIX 2.1 entity storage schema

-- Core STIX objects table (SDOs + SCOs)
CREATE TABLE IF NOT EXISTS stix_objects (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT        NOT NULL,
  stix_id     TEXT        NOT NULL UNIQUE,
  data        JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stix_objects_type
  ON stix_objects (type);

CREATE INDEX IF NOT EXISTS idx_stix_objects_priority_score
  ON stix_objects (((data->>'x_crucix_priority_score')::numeric) DESC NULLS LAST)
  WHERE type = 'vulnerability';

CREATE INDEX IF NOT EXISTS idx_stix_objects_confidence
  ON stix_objects (((data->>'x_crucix_confidence_score')::numeric) DESC NULLS LAST)
  WHERE type = 'indicator';

CREATE INDEX IF NOT EXISTS idx_stix_objects_data_gin
  ON stix_objects USING GIN (data);

-- STIX Relationship Objects (SROs)
CREATE TABLE IF NOT EXISTS stix_relations (
  id                  BIGSERIAL PRIMARY KEY,
  source_ref          TEXT        NOT NULL,
  target_ref          TEXT        NOT NULL,
  relationship_type   TEXT        NOT NULL,
  confidence          REAL        NOT NULL DEFAULT 1.0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_ref, target_ref, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_stix_relations_source
  ON stix_relations (source_ref);

CREATE INDEX IF NOT EXISTS idx_stix_relations_target
  ON stix_relations (target_ref);

-- NLP extraction pending review queue
CREATE TABLE IF NOT EXISTS nlp_pending (
  id                BIGSERIAL PRIMARY KEY,
  source_text       TEXT,
  candidate_object  JSONB       NOT NULL,
  confidence        REAL        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nlp_pending_status
  ON nlp_pending (status, confidence DESC);

-- Migration version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
