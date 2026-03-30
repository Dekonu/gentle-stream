-- Game "flavor" replaces tying pool rows to article feed categories.
-- Flavor is chosen from this table (static for now). See `notes` — replace with
-- engagement-driven selection when user signals are available.

CREATE TABLE IF NOT EXISTS game_flavor_defaults (
  game_type    TEXT PRIMARY KEY,
  flavor       TEXT NOT NULL,
  prompt_theme TEXT,
  notes        TEXT
);

-- Static defaults; `prompt_theme` biases LLM/word banks during ingest only — not a feed category.
INSERT INTO game_flavor_defaults (game_type, flavor, prompt_theme, notes)
VALUES
  (
    'connections',
    'general',
    'Science & Discovery',
    'TODO: replace flavor + prompt_theme with engagement-driven config (user prefs / history).'
  ),
  (
    'crossword',
    'general',
    'Arts & Culture',
    'TODO: replace with engagement-driven flavor when ready.'
  ),
  (
    'word_search',
    'general',
    NULL,
    'Algorithmic game; flavor themes word banks. TODO: engagement-driven.'
  )
ON CONFLICT (game_type) DO NOTHING;

ALTER TABLE games ADD COLUMN IF NOT EXISTS flavor TEXT;

UPDATE games
SET flavor = COALESCE(NULLIF(TRIM(category), ''), 'general')
WHERE flavor IS NULL;

UPDATE games SET flavor = 'general' WHERE flavor IS NULL;

ALTER TABLE games ALTER COLUMN flavor SET DEFAULT 'general';
ALTER TABLE games ALTER COLUMN flavor SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_games_type_flavor ON games (type, flavor);

COMMENT ON TABLE game_flavor_defaults IS 'Static default flavor per game type; replace with engagement logic later.';
COMMENT ON COLUMN games.flavor IS 'Pool bucket for serving puzzles — not an article category.';
COMMENT ON COLUMN games.category IS 'Deprecated: legacy column; use flavor. May be removed in a later migration.';
