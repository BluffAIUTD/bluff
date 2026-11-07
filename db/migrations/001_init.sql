-- Bluff core schema (engineering_spec §3). Plain Postgres; Timescale/pgvector are optional (see 002).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() on older servers

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text UNIQUE,
  alerts_paused boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('page','message','txn')),
  subject_id text NOT NULL,
  payload jsonb NOT NULL,
  mode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verdicts_subject_idx ON verdicts (subject_type, subject_id);
CREATE INDEX verdicts_user_created_idx ON verdicts (user_id, created_at DESC);

CREATE TABLE exposures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url text NOT NULL,
  host text NOT NULL,
  label text NOT NULL,
  field_types text[] NOT NULL DEFAULT '{}',
  score int NOT NULL,
  verdict text NOT NULL,
  verdict_id uuid REFERENCES verdicts(id) ON DELETE SET NULL,
  watch boolean NOT NULL DEFAULT false,
  user_action text NOT NULL CHECK (user_action IN ('continue','watch')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exposures_user_created_idx ON exposures (user_id, created_at DESC);
CREATE INDEX exposures_label_trgm ON exposures USING gin (label gin_trgm_ops);

-- PK includes ts so the table can become a Timescale hypertable (002).
CREATE TABLE transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  descriptor text NOT NULL,
  descriptor_norm text NOT NULL,
  amount_cents int NOT NULL,
  mcc_category text,
  is_recurring boolean NOT NULL DEFAULT false,
  scripted boolean NOT NULL DEFAULT false,
  script_id text,
  true_exposure_id uuid, -- eval only; intentionally no FK
  PRIMARY KEY (id, ts)
);
CREATE INDEX transactions_user_ts_idx ON transactions (user_id, ts DESC);
CREATE INDEX transactions_desc_trgm ON transactions USING gin (descriptor_norm gin_trgm_ops);
CREATE INDEX transactions_id_idx ON transactions (id);

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  trigger text NOT NULL,
  subject_id text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error')),
  model text,
  mode text,
  verdict_id uuid REFERENCES verdicts(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  total_ms int,
  replay_of uuid
);
CREATE INDEX agent_runs_subject_idx ON agent_runs (trigger, subject_id, started_at DESC);

CREATE TABLE agent_steps (
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('plan','tool','final')),
  tool text,
  input_summary text NOT NULL DEFAULT '',
  output_summary text NOT NULL DEFAULT '',
  ms int NOT NULL DEFAULT 0,
  raw jsonb,
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  txn_id uuid NOT NULL,
  exposure_id uuid,
  letter text NOT NULL,
  timeline jsonb NOT NULL DEFAULT '[]',
  next_steps jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','filed')),
  generated_by text NOT NULL CHECK (generated_by IN ('ai','template')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX disputes_txn_idx ON disputes (txn_id);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  body text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('alert','reply','inbound')),
  event_key text,
  verdict_id uuid REFERENCES verdicts(id) ON DELETE SET NULL,
  provider_id text,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_phone_idx ON messages (phone, created_at DESC);
CREATE UNIQUE INDEX messages_provider_in_idx ON messages (provider_id) WHERE direction = 'in' AND provider_id IS NOT NULL;
CREATE UNIQUE INDEX messages_event_key_idx ON messages (event_key) WHERE event_key IS NOT NULL;

-- Embeddings stored as float8[] (cosine in app code): the taxonomy is tiny and pgvector is not guaranteed [verify].
CREATE TABLE taxonomy (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  examples text[] NOT NULL DEFAULT '{}',
  red_flags text[] NOT NULL DEFAULT '{}',
  is_placeholder boolean NOT NULL DEFAULT true,
  embedding float8[]
);

CREATE TABLE mock_registry (
  host text PRIMARY KEY,
  created_on date NOT NULL,
  registrar text NOT NULL,
  brand_clone_of text
);

CREATE TABLE allowlist (
  id bigserial PRIMARY KEY,
  host text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX allowlist_host_user_idx ON allowlist (host, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE game_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date,
  kind text NOT NULL CHECK (kind IN ('text','checkout','email','receipt','bank_alert')),
  content jsonb NOT NULL,
  is_scam boolean NOT NULL,
  red_flags jsonb NOT NULL DEFAULT '[]',
  category text NOT NULL,
  source text NOT NULL CHECK (source IN ('seed','generated','lookalike'))
);
CREATE INDEX game_cards_day_idx ON game_cards (day);

CREATE TABLE game_plays (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  answers jsonb NOT NULL DEFAULT '[]',
  score int NOT NULL DEFAULT 0,
  streak int NOT NULL DEFAULT 0,
  practice boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, day, practice)
);

CREATE TABLE bluff_meta (key text PRIMARY KEY, value text NOT NULL);
