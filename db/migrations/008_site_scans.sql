-- Bank scan, tier 1: one row per crawl of a merchant website (pages + registry facts + rules-only report).
-- Tier 2 (Nemotron deep analysis) is stored as a verdict (subject_type 'site', subject_id host) that references this row.
CREATE TABLE IF NOT EXISTS site_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host text NOT NULL,
  merchant text,
  crawl jsonb NOT NULL,
  intel jsonb NOT NULL,
  basic jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_scans_host_idx ON site_scans (user_id, host, created_at DESC);

-- Our own synthetic scam/legit message set feeds the game as source 'dataset'.
ALTER TABLE game_cards DROP CONSTRAINT IF EXISTS game_cards_source_check;
ALTER TABLE game_cards ADD CONSTRAINT game_cards_source_check CHECK (source IN ('seed','generated','lookalike','tmobile','bank','dataset'));
