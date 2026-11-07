-- Messages carry the exposure/charge they were about (used by WATCH / DISPUTE reply commands).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS messages_user_kind_idx ON messages (user_id, kind, created_at DESC);
