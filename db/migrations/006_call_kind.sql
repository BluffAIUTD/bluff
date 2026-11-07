-- Allow outbound voice calls to be logged alongside texts.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('alert','reply','inbound','call'));
