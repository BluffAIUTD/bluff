-- Last successful LIVE trace per scripted charge. Not tied to the demo user, so it survives "reset demo" and powers the
-- signature-moment fallback (replayed, never presented as live).
CREATE TABLE IF NOT EXISTS replay_traces (
  script_id text PRIMARY KEY,
  steps jsonb NOT NULL,
  verdict jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
