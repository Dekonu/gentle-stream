-- Align game_type CHECK with app/api/user/game-completion (crossword + connections).
-- Without this, POST /api/user/game-completion returns 500 for those game types.

ALTER TABLE game_completions DROP CONSTRAINT IF EXISTS game_completions_game_type_check;
ALTER TABLE game_completions
  ADD CONSTRAINT game_completions_game_type_check
  CHECK (game_type IN (
    'sudoku',
    'word_search',
    'killer_sudoku',
    'nonogram',
    'crossword',
    'connections'
  ));

ALTER TABLE game_saves DROP CONSTRAINT IF EXISTS game_saves_game_type_check;
ALTER TABLE game_saves
  ADD CONSTRAINT game_saves_game_type_check
  CHECK (game_type IN (
    'sudoku',
    'word_search',
    'killer_sudoku',
    'nonogram',
    'crossword',
    'connections'
  ));
