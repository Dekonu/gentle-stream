CREATE TABLE IF NOT EXISTS rss_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_url TEXT NOT NULL,
  publisher TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  category_hint TEXT NOT NULL DEFAULT '',
  locale_hint TEXT NOT NULL DEFAULT 'global',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  tone_risk_score SMALLINT NOT NULL DEFAULT 2
    CHECK (tone_risk_score >= 0 AND tone_risk_score <= 10),
  last_fetched_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INT NOT NULL DEFAULT 0
    CHECK (consecutive_failures >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rss_feeds_feed_url_lower_unique
  ON rss_feeds (LOWER(feed_url));

CREATE INDEX IF NOT EXISTS idx_rss_feeds_enabled_locale_category
  ON rss_feeds (is_enabled, locale_hint, category_hint)
  WHERE is_enabled = TRUE;

DROP TRIGGER IF EXISTS set_updated_at_on_rss_feeds ON rss_feeds;
CREATE TRIGGER set_updated_at_on_rss_feeds
  BEFORE UPDATE ON rss_feeds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO rss_feeds (feed_url, publisher, label, category_hint, locale_hint, is_enabled, tone_risk_score)
VALUES
  ('https://www.reutersagency.com/feed/?best-topics=human-interest', 'Reuters', 'Human Interest', 'Human Kindness', 'global', TRUE, 2),
  ('https://feeds.npr.org/1007/rss.xml', 'NPR', 'Science', 'Science & Discovery', 'US', TRUE, 2),
  ('https://feeds.npr.org/1024/rss.xml', 'NPR', 'Health', 'Health & Wellness', 'US', TRUE, 2),
  ('https://www.pbs.org/newshour/feeds/rss/science', 'PBS NewsHour', 'Science', 'Science & Discovery', 'US', TRUE, 2),
  ('https://www.smithsonianmag.com/rss/smart-news/', 'Smithsonian Magazine', 'Smart News', 'Science & Discovery', 'US', TRUE, 2),
  ('https://www.scientificamerican.com/feed/', 'Scientific American', 'Latest', 'Science & Discovery', 'US', TRUE, 2),
  ('https://www.nasa.gov/rss/dyn/breaking_news.rss', 'NASA', 'Breaking News', 'Science & Discovery', 'US', TRUE, 1),
  ('https://www.noaa.gov/news/rss.xml', 'NOAA', 'News', 'Environment & Nature', 'US', TRUE, 2),
  ('https://news.un.org/feed/subscribe/en/news/all/rss.xml', 'UN News', 'All News', 'Community Heroes', 'global', TRUE, 3),
  ('https://www.who.int/feeds/entity/mediacentre/news/en/rss.xml', 'WHO', 'Media Centre News', 'Health & Wellness', 'global', TRUE, 2),
  ('https://news.mit.edu/rss/topic/education', 'MIT News', 'Education', 'Education', 'US', TRUE, 2),
  ('https://news.mit.edu/rss/topic/science-and-technology', 'MIT News', 'Science and Technology', 'Innovation & Tech', 'US', TRUE, 2),
  ('https://news.stanford.edu/feed/', 'Stanford News', 'Latest', 'Education', 'US', TRUE, 2),
  ('https://news.yale.edu/rss.xml', 'Yale News', 'Latest', 'Education', 'US', TRUE, 2),
  ('https://www.edsurge.com/news.rss', 'EdSurge', 'Latest News', 'Education', 'US', TRUE, 2),
  ('https://www.edweek.org/rss.xml', 'Education Week', 'Latest', 'Education', 'US', TRUE, 3),
  ('https://timesofsandiego.com/feed/', 'Times of San Diego', 'Latest', 'Community Heroes', 'US', TRUE, 3),
  ('https://www.phillyvoice.com/feed/', 'PhillyVoice', 'Latest', 'Community Heroes', 'US', TRUE, 3),
  ('https://www.kqed.org/news/feed', 'KQED', 'News', 'Arts & Culture', 'US', TRUE, 3),
  ('https://wtop.com/feed/', 'WTOP', 'News', 'Community Heroes', 'US', TRUE, 4)
ON CONFLICT DO NOTHING;

