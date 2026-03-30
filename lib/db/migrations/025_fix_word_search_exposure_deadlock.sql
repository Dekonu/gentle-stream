-- Fix deadlocks in bump_word_search_exposure by processing words in deterministic order.
-- Without ordering, concurrent requests updating the same set of words (but in different
-- order) can acquire row locks in different sequences and trigger 40P01 deadlocks.

CREATE OR REPLACE FUNCTION bump_word_search_exposure(
  p_user_id TEXT,
  p_words TEXT[],
  p_category TEXT
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  w_word TEXT;
BEGIN
  FOR w_word IN
    SELECT upper(trim(w)) AS word
    FROM unnest(p_words) AS t(w)
    WHERE length(upper(trim(w))) >= 3
    ORDER BY upper(trim(w))
  LOOP
    INSERT INTO user_word_search_exposure (user_id, word, last_category, seen_count)
    VALUES (p_user_id, w_word, p_category, 1)
    ON CONFLICT (user_id, word) DO UPDATE SET
      seen_count = user_word_search_exposure.seen_count + 1,
      last_seen_at = NOW(),
      last_category = COALESCE(EXCLUDED.last_category, user_word_search_exposure.last_category);
  END LOOP;
END;
$$;

