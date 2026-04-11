-- Enable RLS for all remaining public tables and add user-scoped policies
-- where direct authenticated access is expected.

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_seen_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_generation_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_daily_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rss_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE rss_discovery_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_provider_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_feedback ENABLE ROW LEVEL SECURITY;

ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_flavor_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_word_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_word_search_exposure ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_ingest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_ingest_category_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_seen_articles_own" ON user_seen_articles;
CREATE POLICY "user_seen_articles_own"
  ON user_seen_articles FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "user_daily_todos_own" ON user_daily_todos;
CREATE POLICY "user_daily_todos_own"
  ON user_daily_todos FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "creator_profiles_own" ON creator_profiles;
CREATE POLICY "creator_profiles_own"
  ON creator_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "article_submissions_author_own" ON article_submissions;
CREATE POLICY "article_submissions_author_own"
  ON article_submissions FOR ALL TO authenticated
  USING (author_user_id = auth.uid()::text)
  WITH CHECK (author_user_id = auth.uid()::text);

DROP POLICY IF EXISTS "site_feedback_own" ON site_feedback;
CREATE POLICY "site_feedback_own"
  ON site_feedback FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
