-- Migration 003: Games table
-- Run in Supabase SQL Editor after migrations 001 and 002.
--
-- Stores pre-generated puzzle payloads for LLM-generated games
-- (crosswords, connections, etc.). Algorithmic games (sudoku, word search)
-- are generated at request time and do not need this table.

CREATE TABLE IF NOT EXISTS games (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Game identity
  type         TEXT NOT NULL,          -- 'crossword' | 'connections' | 'cryptic' | 'lateral'
  difficulty   TEXT NOT NULL DEFAULT 'medium', -- 'easy' | 'medium' | 'hard'
  category     TEXT,                   -- article category this game pairs with (nullable)

  -- The full puzzle — schema varies by type, stored as JSONB
  payload      JSONB NOT NULL,

  -- Feed mechanics (mirrors articles table)
  used_count   INT  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ             -- null = never expires (most puzzles are timeless)
);

CREATE INDEX IF NOT EXISTS idx_games_type ON games (type);
CREATE INDEX IF NOT EXISTS idx_games_category ON games (category);
CREATE INDEX IF NOT EXISTS idx_games_type_difficulty ON games (type, difficulty);
