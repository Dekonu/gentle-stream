-- Saved articles + likes (fixes: Could not find table 'public.article_saves' in schema cache).
-- Requires public.articles to exist. Run in Supabase SQL Editor.
-- Idempotent — safe to re-run.

-- ─── Article likes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS article_likes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL,
  article_id     UUID NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  article_title  TEXT NOT NULL,
  liked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_article_likes_user
  ON article_likes (user_id, liked_at DESC);

-- ─── Article saves (library) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS article_saves (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL,
  article_id     UUID NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  article_title  TEXT NOT NULL,
  article_url    TEXT,
  summary        TEXT,
  saved_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read        BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_article_saves_user
  ON article_saves (user_id, saved_at DESC);

-- ─── Row Level Security (these tables only) ───────────────────────────────────
ALTER TABLE article_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "article_likes_own" ON article_likes;
CREATE POLICY "article_likes_own"
  ON article_likes FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "article_saves_own" ON article_saves;
CREATE POLICY "article_saves_own"
  ON article_saves FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- If PostgREST still errors: wait a few seconds or Project Settings → API → reload schema.
