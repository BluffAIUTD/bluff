# engineering_spec.md: Bluff

Design only, no code. An engineer should be able to build from this without making major design decisions. Where something depends on a sponsor resource we haven't seen yet, it's marked **[verify]**.

---

## 1. Architecture

```
                       ┌──────────────────────── Vultr instance (Docker Compose) ────────────────────────┐
 Chrome extension ───► │  Caddy (HTTPS, per-host certs)                                                   │
 (content script +     │    ├─ bluff.<domain>          → web (Next.js, Node runtime)                       │
  shadow-DOM panel)    │    └─ <store>.<domain> ×8     → static demo storefronts (/srv/stores/<store>)     │
                       │                                                                                   │
 Phone / laptop ─────► │  web: Next.js App Router                                                          │
 (dashboard, /check,   │    ├─ UI routes  / /check /charges /charges/[id] /exposure /play /eval /privacy  │
  /play, /eval)        │    ├─ API routes /api/*  (JSON + SSE)                                             │
                       │    ├─ Agent service (lib/agent)  ──► Nemotron @ build.nvidia.com (tool calling)   │
                       │    │                              ──► NVIDIA embeddings (taxonomy)                │
                       │    ├─ Linker (lib/linker, SQL)                                                    │
                       │    ├─ Messaging (lib/messaging) ──► in-app inbox (T-Mobile phone view)           │
                       │    └─ Jobs (in-process): game card generation, alert retry                        │
                       └───────────────────────────────┬───────────────────────────────────────────────────┘
                                                       │ TLS
                                              Tiger Data (managed Postgres)
                                              hypertable · continuous aggregate · pg_trgm · pgvector

 Offline: scripts/eval (Python) ──► calls /api/eval/* on the deployed app ──► writes eval/results.json (committed)
```

**Why one Next.js app:** one deploy, one language (TypeScript), and shared types between the UI and the API. Python is only used for the offline eval and T-Mobile's baseline.

---

## 2. Shared backbone

### 2.1 One data model
Every pillar reads and writes the same tables (§3). The **`Verdict`** object is the single output of every agent run:

| Field | Type | Notes |
|---|---|---|
| `score` | int 0–100 | Higher = safer |
| `verdict` | enum `likely_scam` \| `unsure` \| `looks_ok` | < 40 / 40–69 / ≥ 70 |
| `confidence` | float 0–1 | Computed from signal agreement (§6.4), not model self-report |
| `confidence_reason` | string ≤ 120 chars | Always shown |
| `category` | string | T-Mobile taxonomy id **[verify names]** |
| `evidence` | string[3..5] | Each ≤ 90 chars and tied to a signal key |
| `evidence_keys` | string[] | e.g., `domain_age_lt_30`, `gift_card_only` |
| `next_steps` | string[2..4] | Imperative, ≤ 70 chars |
| `linked` | `{exposure_id?, txn_id?, match_reasons?[]}` | For charges |
| `mode` | enum `live` \| `cached` \| `replayed` \| `basic` | UI badge |

### 2.2 Cross-pillar data flows
1. `POST /api/exposures` (P1) → row in `exposures` → if score < 40, `notify(exposure_alert)` (P3).
2. `POST /api/demo/next-charge` or seeded insert → `transactions` → `linker.findCandidates(txn)` (SQL) → agent run (`trigger=txn`) → `verdicts` row with `linked` → if linked and flagged, `notify(charge_alert)` (P3).
3. Inbound `WATCH` (texted from the phone view) → `exposures.watch = true` on the user's last alerted exposure (P3 → P1). Watched exposures get +0.1 on the link score.
4. Game job reads the last 7 days of `verdicts` where `verdict = likely_scam`, picks the most common `category`, and generates one lookalike card (P1/P2 → P4).

### 2.3 Navigation shell and routing
- `app/(shell)/layout.tsx`: left rail at ≥ 1024 px, bottom tab bar below. Items in order: Overview `/`, Check `/check`, Charges `/charges`, Exposure `/exposure`, Play `/play`, Eval `/eval`, Privacy `/privacy`.
- A top bar shows the demo user ("Maya"), the Bluff Text number with a copy button, and a LIVE / DEMO badge.
- Deep links: `/check?store=fastkicks-shop`, `/charges/[id]`, `/play?d=YYYY-MM-DD`.

### 2.4 Design tokens
| Token | Value |
|---|---|
| `--ink` | `#0E1014` |
| `--paper` | `#F6F4EF` |
| `--scam` | `#E5484D` |
| `--unsure` | `#F5A524` |
| `--safe` | `#2F9E6E` |
| `--accent` | `#5B5BD6` |
| `--gray-1..6` | `#F2F2F3 #E3E3E6 #C8C8CE #8E8E98 #55555F #2A2A31` |
| Fonts | Space Grotesk 500/700 (headings, numbers); Inter 400/500/600 (UI) |
| Radius | 8 (controls), 16 (cards) |
| Spacing | 4-pt scale: 4, 8, 12, 16, 24, 32, 48 |
| Motion | 180 ms ease-out (UI); 600 ms ScoreDial count; card flip 400 ms |
| Theme | Dark default (ink surfaces); light theme optional |

---

## 3. Database schema (Tiger Data / Postgres)

Extensions: `timescaledb` (preinstalled), `pg_trgm`, `vector` **[verify that pgvector is available on the Tiger Data plan; fallback: store embeddings as float arrays and compare in app code; the taxonomy is small]**.

| Table | Columns (type) | Keys / indexes | Notes |
|---|---|---|---|
| `users` | id uuid, name text, phone text null, alerts_paused bool, created_at timestamptz | PK id; unique phone | Seed "Maya" (demo) |
| `exposures` | id uuid, user_id uuid, url text, host text, label text (registrable name, e.g., `fastkicks-shop`), field_types text[], score int, verdict text, verdict_id uuid, watch bool, user_action text (`continue`\|`watch`), created_at timestamptz | PK id; idx (user_id, created_at desc); GIN trgm on label | Written by P1 |
| `transactions` | id uuid, ts timestamptz, user_id uuid, descriptor text, descriptor_norm text, amount_cents int, mcc_category text, is_recurring bool, scripted bool, true_exposure_id uuid null (eval only) | **Hypertable on ts** (7-day chunks); idx (user_id, ts desc); GIN trgm on descriptor_norm | ~60 seeded over 90 days |
| `merchant_daily` | **continuous aggregate**: time_bucket('1 day', ts) day, user_id, descriptor_norm, count, sum_cents, avg_cents, max_cents | Refresh policy every 5 min; also refresh manually after demo inserts | Feeds price drift + sparkline |
| `verdicts` | id uuid, user_id uuid, subject_type text (`page`\|`message`\|`txn`), subject_id text, payload jsonb (the Verdict), mode text, created_at | PK id; idx (subject_type, subject_id) | |
| `agent_runs` | id uuid, trigger text, subject_id text, status text (`running`\|`ok`\|`error`), model text, started_at, ended_at, total_ms int, replay_of uuid null | PK id | For trace replay |
| `agent_steps` | run_id uuid, seq int, kind text (`plan`\|`tool`\|`final`), tool text, input_summary text, output_summary text, ms int, raw jsonb | PK (run_id, seq) | What AgentTrace streams |
| `disputes` | id uuid, txn_id uuid, exposure_id uuid null, letter text, timeline jsonb, next_steps jsonb, status text (`draft`\|`filed`), generated_by text (`ai`\|`template`), created_at | PK id | |
| `messages` | id uuid, user_id uuid null, phone text, direction text, body text, kind text (`alert`\|`reply`\|`inbound`), verdict_id uuid null, provider_id text, status text, created_at | idx (phone, created_at) | Inbound bodies are discarded after the verdict: body is stored as `"[discarded]"` |
| `taxonomy` | id text, name text, description text, examples text[], red_flags text[], embedding vector(N) | PK id | From the T-Mobile taxonomy **[verify]** |
| `mock_registry` | host text, created_on date, registrar text, brand_clone_of text null | PK host | Demo storefront facts |
| `allowlist` | host text, user_id uuid null | | Seed ~50 major retailers and banks |
| `game_cards` | id uuid, day date null (null = pool), kind text, content jsonb, is_scam bool, red_flags jsonb ([{span, why}]), category text, source text (`seed`\|`generated`\|`lookalike`) | idx day | 15 seeded |
| `game_plays` | user_id uuid, day date, answers jsonb, score int, streak int, practice bool | PK (user_id, day, practice) | |

**Seed data (scripts/seed):**
- 8 storefronts:
  - **Scam:** `fastkicks-shop` (sneakers, gift-card or crypto only, 4 days old, Nike-style clone), `deliveryfix-help` (fake USPS redelivery fee), `tollpay-tx` (fake toll balance)
  - **Legit:** `bayou-bakery`, `northloop-books`, `campus-tech`, `lonestar-tickets`, `greenleaf-grocer`
- 60 transactions over 90 days for Maya: groceries, streaming, rideshare, plus scripted ones:
  - `txn_demo_link_1`: `FKSHP*LLC`, $49.99, inserted on demo trigger
  - `txn_demo_drift`: streaming service at 2× its usual price
  - a $1.00 card test from `TST* QWKPAY`
  - a duplicate pair
- Claim B set: 20 flagged charges with `true_exposure_id`, plus 10 with no exposure, on a separate eval user.

---

## 4. API design

All JSON. Auth: a signed `bluff_uid` cookie set on first visit (by the middleware, so the first page render already has it). Each session is its own private account (user id = session id), created on first use with a copy of the demo persona "Maya"'s seeded history. Demo controls need a `x-demo-key` header or `?demo=1`, with the key held in the cookie after the presenter visits `/demo?key=…`. Rate limit: 30 agent runs/min per IP (in-memory token bucket).

| Method + path | Request | Response | Notes |
|---|---|---|---|
| `POST /api/investigate/page` | `{url, host, fieldTypes[], signals{}, source:'extension'\|'check'}` | `{runId}` | Starts an agent run; client then opens the stream |
| `POST /api/investigate/message` | `{text, source:'check'\|'sms'\|'eval'}` | `{runId}` (or `{verdict}` when `source=eval`, sync) | |
| `GET /api/runs/:runId/stream` | n/a | **SSE** events: `step` `{seq, kind, tool, inputSummary, outputSummary, ms}`, `verdict` `{Verdict}`, `error` `{code, message, fallbackVerdict?}`, `done` `{totalMs, mode}` | Heartbeat every 10 s |
| `GET /api/runs/:runId` | n/a | `{run, steps[], verdict}` | For replay |
| `POST /api/exposures` | `{verdictId, url, host, fieldTypes[], action:'continue'\|'watch'}` | `{exposure}` | Triggers alert if score < 40 |
| `GET /api/exposures` | n/a | `{exposures[]}` with linked counts | |
| `PATCH /api/exposures/:id` | `{watch?}` | `{exposure}` | |
| `DELETE /api/exposures/:id` | n/a | `204` | |
| `GET /api/transactions` | `?limit=50` | `{transactions[] with flags[]}` | Rule flags computed in SQL |
| `GET /api/transactions/:id` | n/a | `{transaction, flags, candidates[], verdict?, priceHistory[], dispute?}` | |
| `POST /api/transactions/:id/investigate` | n/a | `{runId}` | Agent run on a charge |
| `POST /api/demo/next-charge` | `{scriptId?}` (default: next scripted) | `{transaction, runId}` | Inserts, refreshes the aggregate, starts the run |
| `POST /api/demo/reset` | n/a | `204` | Re-seeds the caller's own account |
| `POST /api/disputes` | `{txnId}` | `{dispute}` | AI letter, falls back to template |
| `PATCH /api/disputes/:id` | `{status:'filed'}` | `{dispute}` | |
| `GET /api/game/today` | n/a | `{day, cards[] (no answers)}` | |
| `POST /api/game/answer` | `{cardId, guess:'legit'\|'scam'}` | `{correct, isScam, redFlags[], category}` | |
| `POST /api/game/finish` | `{day, answers[]}` | `{score, streak, weakest, shareText}` | |
| `POST /api/game/generate` | demo key | `{cards[]}` | P1 job |
| `GET /api/eval` | n/a | contents of `eval/results.json` | |
| `POST /api/eval/link` | `{txnId}` (eval key) | `{predictedExposureId, score}` | Claim B harness |
| `POST /api/demo/inbound` | `{text}` from the phone view | verdict or command reply | Demo session |
| `DELETE /api/me` | n/a | `204` | Delete everything |

**Error shape (all routes):** `{error:{code:'timeout'|'malformed'|'rate_limited'|'upstream_down'|'bad_input', message, fallback?}}`.

**Mock-to-live switch:**
- `AGENT_MODE=mock|live`. Mock reads fixtures from `fixtures/runs/<host or txn>.json` and streams the steps with realistic gaps (600–1,400 ms, first step at 400 ms, total 5–8 s).
- `?fail=timeout|malformed|ratelimit` forces each failure shape so the UI states can be built and tested.
- Messages are delivered in-app: outbound alerts and replies are written to `messages` and shown in the T-Mobile phone view in the top bar.
- The UI person builds against mock from minute one. The backend flips to live per feature.

---

## 5. Frontend architecture

**Routes (App Router):**
- `/` Overview: RiskSummary (counts), AlertFeed (latest messages + flags), LatestExposures (3), TryCTA.
- `/check`: StorePicker (8 chips) · UrlInput · TextInput → RunView (AgentTrace + VerdictCard) → ExposureActions.
- `/charges`: DemoControls (gated) · TransactionTable (row: date, descriptor, amount, FlagBadges) · Filters (All / Flagged).
- `/charges/[id]`: ChargeHeader · LinkedChargeCard (exposure ↔ charge connector line, match reasons) · PriceSparkline · RunView · RefundBuilder (LetterPreview, EvidenceTimeline, NextSteps, actions).
- `/exposure`: ExposureTimeline (grouped by day) · ExposureRow (host, fields, ScoreBadge, watch toggle, linked count, delete).
- `/play`: GameDeck (Card × 5, flip) · AnswerBar · ResultSheet (score, streak, weakest, ShareButton).
- `/eval`: ClaimTable × 2 · FailureCases · MethodNote · ResultsTimestamp.
- `/privacy`: DataFlowDiagram (static SVG) · SentVsNeverTable · DeleteEverything.

**Shared components:** `VerdictCard`, `ScoreDial`, `ConfidencePill`, `EvidenceList`, `NextSteps`, `AgentTrace`, `ModeBadge` (live/cached/replayed/basic/demo), `FlagBadge`, `EmptyState`, `ErrorState`, `Skeleton`, `PhonePreview` (mock messages drawer), `Toast`.

**State:**
- Server components fetch page data. Client components hold UI state only.
- Agent runs use a `useRunStream(runId)` hook (EventSource) that returns `{steps, verdict, error, done, mode}`.
- No global store; React Query for client-side refetch after mutations.
- Game progress lives in local component state until finish. Streak is server-side.

**Extension (Chrome MV3, `extension/`):**
- `content.ts`:
  - A MutationObserver detects sensitive fields by input `type`, `name`, `id`, `autocomplete` (`cc-number`, `cc-csc`, `bday`, `street-address`, `tel`, `current-password`) and label text.
  - It computes signals locally: `has_card_field`, `gift_card_or_crypto_only` (payment option text), `countdown_timer`, `scarcity_banner`, `no_contact_page` (no link text matching contact/about), `no_refund_policy`, `brand_words_in_title` (vs. host), `https`.
  - It **never reads input values or sends page text.**
- `background.ts`: posts to `/api/investigate/page`, opens the SSE stream, relays to the content script.
- Panel: injected **shadow-DOM** side panel (slides in from the right, 360 px) rendering the same VerdictCard design (tokens shared through a small CSS file). Buttons call `/api/exposures`.
- Load unpacked for the demo. `host_permissions`: the app domain only. The content script runs on `<all_urls>` but stays idle until a sensitive field appears.

---

## 6. Backend architecture

### 6.1 Agent service (`lib/agent`)
- **Model:** a Nemotron model with tool calling on build.nvidia.com through an OpenAI-compatible client. **[verify exact model IDs and rate limits at the NVIDIA booth]**. Default: the largest Nemotron that keeps p50 under 8 s; a smaller Nemotron for game card generation.
- **Loop:** a system prompt (role, rules, the Verdict schema, "use tools before concluding; never invent links; cite evidence keys") + a subject message, then up to **6 iterations** of tool calls. It must end by calling `submit_verdict` (a tool whose arguments are the Verdict). Hard timeout 15 s, after which it falls back to rules-only.
- **Tools:**

| Tool | Args | Does | Returns (≤ 1 KB) |
|---|---|---|---|
| `domain_intel` | `host` | Looks up `mock_registry`; else RDAP with a 2 s timeout (P2 feature) | `{age_days, registrar, tld_risk, brand_clone_of}` |
| `page_signals` | `host, signals?` | Normalizes extension signals. For `/check` on a demo host, fetches **our own** storefront HTML server-side and extracts the same signals | `{signals{}, field_types[]}` |
| `taxonomy_match` | `text` | Embeds text and returns top 3 categories by cosine; 2 s timeout falls back to keywords | `[{category, score, red_flags[]}]` |
| `exposure_lookup` | `descriptor or host` | Runs the linker (§6.2) | `[{exposure_id, host, date, score, match_score, reasons[]}]` |
| `txn_search` | `descriptor_norm, days=90` | Prior charges + daily aggregate for that merchant | `{count, avg_cents, max_cents, last_seen, series[]}` |
| `draft_dispute` | `txn_id, exposure_id?` | Builds the template, then asks the model for a short narrative | `{dispute_id}` |
| `notify` | `kind, payload` | Sends the canned alert to the phone view (respects rate limits and paused alerts) | `{delivered:true}` |
| `submit_verdict` | Verdict fields | Validates and ends the run | n/a |

- **Run modes:** `page`, `message`, `txn`. Each has a short mode prompt listing which tools are expected (e.g., `txn`: txn_search → exposure_lookup → domain_intel → submit_verdict).
- **Persistence:** each tool call writes an `agent_steps` row before and after (output summary). SSE reads from an in-memory event emitter keyed by `runId`, plus the DB for late subscribers.
- **Validation:** `submit_verdict` arguments are checked against a zod schema. On failure, one repair turn ("Your verdict failed validation: {errors}. Call submit_verdict again."), then the rules-only fallback.

### 6.2 Linker (the signature algorithm, `lib/linker`)
1. **Normalize the descriptor:** uppercase → strip processor prefixes (`SQ *`, `SP *`, `TST*`, `PAYPAL *`, `PP*`), legal suffixes (`LLC`, `INC`, `CO`), digits, `*`, punctuation → lowercase.
2. **Candidate set (SQL):** the user's exposures with `created_at <= txn.ts` and `txn.ts - created_at <= 45 days`.
3. **Name score**, the max of:
   - trigram `similarity(descriptor_norm, exposure.label)` (pg_trgm);
   - **abbreviation score:** 0.85 if the descriptor's letters form an ordered subsequence of the label's letters starting with the same first letter and covering ≥ 3 label tokens' initials or consonant runs (e.g., `fkshp` ⊂ `fastkicks-shop`); else 0;
   - token overlap: Jaccard on tokens ≥ 3 characters.
4. **Time score:** 1.0 for 0–7 days, decaying linearly to 0.3 at 45 days.
5. **Link score** = 0.7 × name + 0.3 × time, + 0.1 if `watch`. Candidate if ≥ **0.55**. Tune the threshold on the Claim B dev split only.
6. The agent receives the top 3 candidates with reasons and confirms or rejects. The UI shows the agent's decision. If the agent rejects a candidate ≥ 0.75, show it as "Possible match" in amber.

**Rule flags (SQL, instant):**
- **price_drift:** amount > 1.5 × `avg_cents` over the prior 90 days, with ≥ 2 prior charges.
- **duplicate:** same descriptor_norm and amount within 10 minutes.
- **new_subscription:** first charge from a merchant within 3 days of a $0–$1 charge, or `is_recurring` with no prior history.
- **card_test:** amount ≤ $2 from a descriptor never seen before.
- **exposure_link:** link score ≥ 0.55.

### 6.3 Messaging (`lib/messaging`)
- In-app delivery only: no SMS/text gateway. The user's T-Mobile phone view reads `messages` and posts replies to `/api/demo/inbound`.
- **Outbound:** a `messages` row (queued) → send → update status. Retry ×3 with backoff of 1 s, 4 s and 10 s.
- **Inbound webhook:** verify the signature → respond 200 immediately → process async:
  - parse the command (WATCH / DISPUTE / SAFE / STOP / HELP);
  - otherwise run the agent in `message` mode and reply using the template in product_spec P3-2;
  - discard the inbound body after the verdict.
- Typing indicator if the SDK supports it.
- Map the phone to a user. For the demo, Maya's phone = the presenter's phone, stored in an env var.
- **Voice:** removed (it depended on the dropped messaging provider).

### 6.4 Confidence computation
- Each evidence key has a direction (scam / legit) and a weight from a small fixed table, e.g., `domain_age_lt_30` +0.25 scam, `gift_card_only` +0.3 scam, `allowlisted` +0.5 legit.
- `agreement = |Σ scam weights − Σ legit weights| / Σ |weights|`, and `coverage = min(1, signals_present / 4)`.
- `confidence = clamp(0.35 + 0.45 × agreement + 0.2 × coverage, 0, 0.97)`.
- `confidence_reason` names the strongest conflicting or missing signal ("site is new but shows no brand clone").
- If confidence < 0.5, the verdict is forced to `unsure`.

### 6.5 Game generation job
- Trigger: `POST /api/game/generate` (demo key) or on the first `/api/game/today` call of a day with no cards for it.
- Prompt: the small Nemotron model gets 4 taxonomy categories (2 scam, 2 legit-style contexts) + 1 lookalike category from recent verdicts, and returns cards in JSON. Validate: scam cards need ≥ 1 red flag span that appears verbatim in the content; no real brand names (replace with fictional ones); length ≤ 300 characters.
- Fill any gaps from the seeded pool. Daily set = 5 cards with a 2–3 scam split.

### 6.6 Rules-only fallback ("basic check")
A deterministic scorer over the same signals and weights from §6.4: score = 100 − scaled scam weight. Evidence is pulled from a template per key. Used when the model is down, times out or returns malformed output twice.

---

## 7. Eval harness (`scripts/eval/`, Python)

**Claim A: detection**
1. `prepare_split.py`: loads the T-Mobile message set **[verify format]**, maps labels to scam/legit, splits 80/20 stratified with seed 42, writes `eval/split.json` (ids only). **Commit before any prompt tuning.**
2. `run_baseline.py`: runs T-Mobile's baseline on the test ids **[verify how it's delivered]** → `eval/baseline_a.json`.
3. `run_bluff.py`: for each test message, calls `POST /api/investigate/message {source:'eval'}` (sync, no alerts) → maps verdict (`likely_scam` → scam; `unsure` → scam for recall-first, reported both ways) → `eval/bluff_a.json`. Concurrency 3. Retry once on errors; count persistent errors as wrong.
4. `score.py`: precision, recall, F1, confusion matrix, category accuracy. Picks the 3+ worst failures with their text and the agent's evidence → `eval/results.json`.

**Claim B: linking**
- Uses the eval user's 30 charges with ground truth.
- The baseline is a naive substring match (any domain token ≥ 4 characters contained in the uppercase descriptor).
- Bluff calls `POST /api/eval/link` for each charge.
- Same metrics: a link counts as a true positive only if it matches `true_exposure_id`.
- Split the 30 into 10 dev (threshold tuning) and 20 test. Report on test.

**Stretch:** 40–50 hand-labeled storefront snippets and texts in `eval/stretch.jsonl`. Second baseline: Nemotron zero-shot with no tools (same model, one prompt). Failure table.

`eval/results.json` shape: `{generated_at, claimA:{n, split, bluff:{p,r,f1}, baseline:{p,r,f1}, failures:[…]}, claimB:{…}, stretch?:{…}}`. `/eval` renders it as is.

---

## 8. Performance budget and fallbacks

| Pillar / path | Budget | Fallback |
|---|---|---|
| Page load (any route, phone 4G) | FCP < 1.5 s, route JS < 250 KB gz | Server-render shell; lazy-load AgentTrace |
| Agent run (page/message) | First step < 1.5 s; verdict p50 < 8 s, p95 < 12 s | Cached verdict for the 8 demo hosts (`mode=cached`); rules-only beyond 15 s |
| Charge run (signature) | SQL link < 50 ms; verdict < 10 s | Show the SQL link instantly; replay the last successful trace (`mode=replayed`) |
| Refund Builder | < 8 s | Template letter (`generated_by=template`) |
| Bluff Text reply | < 15 s round trip | Holding message at 10 s; rules-only reply |
| Game | `/api/game/today` < 300 ms | Seeded pool |
| Eval page | static JSON < 100 ms | n/a |

**Pre-warm before judging:** run all 8 demo hosts and `txn_demo_link_1` once so cache and replay rows exist. Hit the Nemotron endpoint once a minute during judging (a cheap keepalive call) if cold starts show up.

---

## 9. External integrations

| Service | Use | Config | Notes |
|---|---|---|---|
| NVIDIA build.nvidia.com | Nemotron (agent, game), embeddings | `NVIDIA_API_KEY`, `NEMOTRON_MODEL`, `NEMOTRON_SMALL_MODEL`, `EMBED_MODEL` | **[verify IDs, limits]** |
| Tiger Data | Primary DB | `DATABASE_URL` (TLS) | Run migrations with plain SQL files in `db/migrations` |
| Vultr | Hosting | n/a | 2 vCPU / 4 GB, Ubuntu, Docker Compose |
| GoDaddy Registry | Domain | DNS A records: `bluff`, and one per store subdomain (or apex + `*`) | Use explicit subdomains so Caddy gets normal HTTP-01 certs (no wildcard cert needed) |
| RDAP (public) | Domain age (P2) | n/a | 2 s timeout |

---

## 10. Repo structure

```
bluff/
  app/            Next.js routes (shell + API)
  components/     shared UI
  lib/            agent/, linker/, messaging/, scan/, db/, rules/, game/
  extension/      MV3 extension
  stores/         8 static storefronts
  db/migrations/  SQL
  scripts/seed/   seed + reset
  scripts/eval/   Python eval
  eval/           split.json, results.json
  fixtures/runs/  mock agent runs
  docker-compose.yml, Caddyfile, .env.example
  README.md
```

---

## 11. Deployment ("submitted and running")
1. Register the domain through GoDaddy Registry (MLH). Point A records at the Vultr IP.
2. Vultr instance: Docker + Compose. Services: `web` (Next.js standalone build), `caddy` (TLS for the app host and the 8 store hosts).
3. Tiger Data service created; run migrations; seed.
4. Set env vars; `AGENT_MODE=live`.
5. Smoke test: the full core loop on a phone over cellular; forward a text; play the game; `/eval` loads.
6. Pre-warm (§8). Print the QR code to `https://bluff.<domain>`.
7. Repo public, README with architecture, claims, how to run, sponsor usage; demo video ≤ 2:00; Devpost tracks + MLH opt-ins.

**Definition of running:** the URL loads on a judge's phone, the core loop completes live, the Bluff number replies, and the extension is installed on the demo laptop.

---

## 12. Team split (2 people) and contract-first order
- **A (backend/AI):** schema + seed → agent service + tools → linker + rule flags → messaging → eval harness → deploy.
- **B (frontend/demo):** shell + tokens → `/check` RunView on mocks → `/charges` + detail + RefundBuilder → `/play` → `/eval`, `/privacy` → extension panel → storefronts → video.
- **Contract first (by Sat 6:30pm):** the `Verdict` type, the SSE event shapes, and 3 fixture runs committed. B never waits on A.
