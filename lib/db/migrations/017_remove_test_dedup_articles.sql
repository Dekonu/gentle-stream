-- Remove integration-test articles left in production from scripts/test-dedup.ts
-- and scripts/test-url-dedup.ts (headlines contain TEST_DEDUP or TEST_URL_DEDUP).
-- Related rows (saves, likes, engagement) cascade via FK.

DELETE FROM articles
WHERE headline ILIKE '%TEST_DEDUP%'
   OR headline ILIKE '%TEST_URL_DEDUP%';
