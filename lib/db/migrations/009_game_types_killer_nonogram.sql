-- Allow killer_sudoku and nonogram in metrics + saves (run in Supabase SQL Editor).

ALTER TABLE game_completions DROP CONSTRAINT IF EXISTS game_completions_game_type_check;
ALTER TABLE game_completions
  ADD CONSTRAINT game_completions_game_type_check
  CHECK (game_type IN ('sudoku', 'word_search', 'killer_sudoku', 'nonogram'));

ALTER TABLE game_saves DROP CONSTRAINT IF EXISTS game_saves_game_type_check;
ALTER TABLE game_saves
  ADD CONSTRAINT game_saves_game_type_check
  CHECK (game_type IN ('sudoku', 'word_search', 'killer_sudoku', 'nonogram'));
