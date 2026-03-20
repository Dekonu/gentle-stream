-- Migration 001: Add headline fingerprint for deduplication
-- Run once in the Supabase SQL Editor before the next ingest run.
--
-- The fingerprint is a lowercase, whitespace-collapsed version of
-- (headline + category). This catches re-runs that produce the same
-- story and near-identical headlines from slightly different phrasings.

-- 1. Add the column (nullable first so existing rows don't error)
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS fingerprint TEXT;

-- 2. Back-fill fingerprints for any rows that already exist
UPDATE articles
SET fingerprint = lower(regexp_replace(headline || '|' || category, '\s+', ' ', 'g'))
WHERE fingerprint IS NULL;

-- 3. Now make it NOT NULL
ALTER TABLE articles
  ALTER COLUMN fingerprint SET NOT NULL;

-- 4. Unique constraint — silently blocks duplicate ingests
ALTER TABLE articles
  DROP CONSTRAINT IF EXISTS articles_fingerprint_key;

ALTER TABLE articles
  ADD CONSTRAINT articles_fingerprint_key UNIQUE (fingerprint);

-- 5. Index for the pre-flight EXISTS check in the ingest agent
CREATE INDEX IF NOT EXISTS idx_articles_fingerprint
  ON articles (fingerprint);
