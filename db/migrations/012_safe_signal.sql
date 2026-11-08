-- Safe Signal (the phone side of Bluff).
-- 1. HOLD: a simulated card lock. Capital One Nessie has no card-lock endpoint, so while card_hold_at is set Bluff itself
--    declines new test purchases before they reach Nessie. NULL = no hold.
ALTER TABLE users ADD COLUMN IF NOT EXISTS card_hold_at timestamptz;

-- 2. Link memory from reported texts: a scam text's link becomes an exposure ("received_link"), so a later charge from that
--    site links back to the text. Only the link's host, the verdict and a salted hash of the sender are kept, never the text.
ALTER TABLE exposures DROP CONSTRAINT IF EXISTS exposures_user_action_check;
ALTER TABLE exposures ADD CONSTRAINT exposures_user_action_check CHECK (user_action IN ('continue','watch','received_link'));
ALTER TABLE exposures ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'page';
ALTER TABLE exposures ADD COLUMN IF NOT EXISTS sender_hash text;

-- 3. Site checks by host for the risky_site flag and dispute evidence (per user, newest first).
CREATE INDEX IF NOT EXISTS verdicts_site_subject_idx ON verdicts (user_id, subject_id, created_at DESC) WHERE subject_type = 'site';
