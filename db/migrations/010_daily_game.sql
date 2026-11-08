-- Call the Bluff as a Wordle-style daily: a difficulty ladder, a "why legit" line for legit cards, per-user bonus
-- cards from the user's own bank scan, and plays that are stored while in progress (answers lock on first submit).

ALTER TABLE game_cards ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'medium';
ALTER TABLE game_cards DROP CONSTRAINT IF EXISTS game_cards_difficulty_check;
ALTER TABLE game_cards ADD CONSTRAINT game_cards_difficulty_check CHECK (difficulty IN ('easy','medium','hard'));
ALTER TABLE game_cards ADD COLUMN IF NOT EXISTS why_legit text;
-- Only bank-scan bonus cards belong to a user; everything else (user_id NULL) is shared.
ALTER TABLE game_cards ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS game_cards_user_day_idx ON game_cards (user_id, day) WHERE user_id IS NOT NULL;

-- NULL = today's game is in progress. Existing rows are finished plays.
ALTER TABLE game_plays ADD COLUMN IF NOT EXISTS finished_at timestamptz DEFAULT now();
ALTER TABLE game_plays ADD COLUMN IF NOT EXISTS giveaways int NOT NULL DEFAULT 0;

-- Bank cards used to be inserted without an owner and leaked into everyone's daily set.
DELETE FROM game_cards WHERE source = 'bank' AND user_id IS NULL;
-- Rebuild every frozen daily set with the new picker (ladder, distinct categories, no bank cards).
DELETE FROM bluff_meta WHERE key LIKE 'game_set:%';
