-- Broaden cleanup: same as 017 plus rows that match the test-dedup.ts fixture
-- even if the headline were edited (byline/location/subheadline are distinctive).

DELETE FROM articles
WHERE headline ILIKE '%TEST_DEDUP%'
   OR headline ILIKE '%TEST_URL_DEDUP%'
   OR (
     byline ILIKE '%Test Runner%'
     AND location ILIKE '%Testland%'
     AND subheadline ILIKE '%test subheadline%'
   );
