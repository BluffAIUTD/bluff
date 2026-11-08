-- Bank scan: transactions imported from Capital One Nessie carry their source, merchant and website.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'seed';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant_name text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS website text;
CREATE INDEX IF NOT EXISTS transactions_external_idx ON transactions (user_id, external_id);

-- Site verdicts: the agent's verdict on a merchant website reached from a bank transaction.
ALTER TABLE verdicts DROP CONSTRAINT IF EXISTS verdicts_subject_type_check;
ALTER TABLE verdicts ADD CONSTRAINT verdicts_subject_type_check CHECK (subject_type IN ('page','message','txn','site'));

-- Game cards imported from the T-Mobile Safe Signal message set, and cards built from the user's own bank scan.
ALTER TABLE game_cards DROP CONSTRAINT IF EXISTS game_cards_source_check;
ALTER TABLE game_cards ADD CONSTRAINT game_cards_source_check CHECK (source IN ('seed','generated','lookalike','tmobile','bank'));
ALTER TABLE game_cards ADD COLUMN IF NOT EXISTS origin text;
