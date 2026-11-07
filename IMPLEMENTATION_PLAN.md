# IMPLEMENTATION_PLAN.md — Bluff

Produced with the `task-breakdown` skill (Phase 8) from: `hackathon.md`, `hackathon_state.md`, `idea_brief.md`, `full_context.md`, `product_spec.md`, `engineering_spec.md`, `demo_design.md`, `polish_queue.md`. No `AGENTS.md` exists in the repo. This file is the living tracker: each task is ticked with verification notes when done.

Legend: `[ ]` todo · `[x]` done · `[~]` partly done / needs human step · `[!]` blocked. Priority **P0** demo-blocking, **P1** depth, **P2** extras (spec §5). Order = dependency order; a task depends only on lower numbers unless stated.

## Environment constraints (what this build can and cannot do)
This session has **no** NVIDIA key, Photon account, Tiger Data service, Vultr instance, domain, T-Mobile dataset, or Chrome UI. Therefore, per `engineering_spec.md §4` ("mock-to-live switch"): everything is built **mock-first** (`AGENT_MODE`, `PHOTON_MODE`), live code paths are written against the documented OpenAI-compatible / webhook shapes and unit-tested against local fake servers, and every `[verify]` item is isolated behind one config/adapter so a human can flip it. Local Postgres 16 is used for dev/test; `timescaledb`/`vector` are feature-detected with the spec's own fallbacks. Nothing in the repo may claim live-sponsor results that were not measured.

## Conflicts and gaps found in the source docs (decisions recorded, nothing invented)
| # | Finding | Decision |
|---|---|---|
| C1 | Claim B size: "20 seeded charges" (idea_brief, demo_design §12 says 20 + 10) vs "30 seeded charges" (full_context). eng spec §7 = 30 total, 10 dev / 20 test. | Seed 30 (20 with ground truth + 10 no-exposure); tune on 10 dev, report on 20 test. `/eval` states n. |
| C2 | Continuous aggregate named `merchant_daily` (eng spec) vs `merchant_price_daily` (demo_design). | Use `merchant_daily` (eng spec is the build authority). |
| C3 | "Nothing you type leaves your device" (privacy claim) vs `/check` text paste, SMS forwarding, and server-side storefront fetch, which send text to the server by user choice. | Claim is scoped precisely on `/privacy`: *form-field values and page text are never read by the extension*; pasted/forwarded messages are sent deliberately and discarded after the verdict. |
| C4 | "No login, shared demo user Maya" vs per-user streaks / delete-everything / "unregistered number = guest". | Shared demo user by default (`DEMO_MODE=1`); `delete everything` re-seeds Maya; game streak keyed to Maya; noted on `/privacy`. |
| C5 | `unsure` mapped to scam "for recall-first, reported both ways" (eng §7) but "binary scam vs legit" (demo §12). | Report both mappings; headline = recall-first. |
| C6 | Alert caps: "1 per event and 5/hour/user" vs agent `notify` tool. | Enforce in `lib/photon` `notify()`, single choke point. |
| C7 | Polish queue numbers differ from this plan; its Phase A tasks 1–2 (booth, signups) are human-only. | This plan supersedes numbering; human-only items are `[!]`/`[~]` with owner. |
| C8 | `exposure` score < 40 alerts but product spec edge case: exposure on *legit* store then legit charge = "Expected charge" (green). | Implement as a link kind `expected` in linker output + UI. |
| G1 | T-Mobile message set / taxonomy / baseline formats unknown. | `[!]` blocked on booth data. Harness loads an adapter file; a **clearly labeled synthetic stand-in** dataset is used so the pipeline is runnable; results are labeled "stand-in, not T-Mobile data". |
| G2 | Nemotron model IDs, rate limits; Photon SDK/webhook shape/signature header; pgvector on Tiger Data; RDAP for arbitrary hosts. | Env-configurable; adapters isolated; documented in README "Go-live checklist". |
| G3 | Domain name unknown (`bluff.<domain>`). | `BASE_DOMAIN` env; Caddyfile templated. |
| G4 | FTC statistic, event-tester reactions, Devpost submission, demo video, 3 rehearsals. | Human-only; templates prepared; marked `[!]` with owner. Statistic is never written unless fetched. |

---

## Section 1 — Foundation

- [x] **1. Scaffold the app (P0)**
  - Objective/why: one Next.js (App Router, TS, Tailwind) codebase per eng spec §1/§10; everything else builds on it.
  - Depends: none.
  - Files: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `.eslintrc`, `vitest.config.ts`, `.gitignore`, `.env.example`, `app/layout.tsx`, `app/page.tsx`.
  - Steps: init Next 15 + React 19; add `zod`, `pg`, `vitest`, `tailwindcss`; scripts `dev/build/start/lint/typecheck/test/db:migrate/db:seed`; `.env.example` listing every var from eng §9 and §4 modes (no secrets); `output: 'standalone'`.
  - Edge cases: `.env*` ignored except example; Node 22.
  - Acceptance/verify: `npm run typecheck && npm run lint && npm run build && npm test` pass.

- [x] **2. Design tokens, fonts, UI primitives (P0)**
  - Objective: one design system (eng §2.4, demo §11).
  - Depends: 1.
  - Files: `app/globals.css`, `tailwind.config.ts`, `components/ui/{Badge,ModeBadge,FlagBadge,Skeleton,EmptyState,ErrorState,Toast,Button}.tsx`.
  - Steps: CSS vars (`--ink --paper --scam --unsure --safe --accent --gray-1..6`), Space Grotesk + Inter via `next/font`, radius 8/16, 4-pt spacing, motion 180 ms, dark default; `prefers-reduced-motion` respected.
  - Edge cases: contrast ≥ 4.5:1 for text on ink; focus rings in accent.
  - Verify: typecheck/build; render check in task 40.

- [x] **3. Shared contract types (P0)**
  - Objective: contract-first (eng §12): `Verdict`, SSE events, error shape, API DTOs, shared by UI and API.
  - Depends: 1.
  - Files: `lib/types.ts`, `lib/schemas.ts` (zod), `lib/errors.ts`.
  - Steps: zod `VerdictSchema` (score 0–100, enum, evidence 3–5 ≤ 90 chars, next_steps 2–4 ≤ 70, `confidence_reason` ≤ 120, mode enum); SSE event union (`step|verdict|error|done`); `ApiError {error:{code,message,fallback?}}`; helper `verdictLabel(score)`.
  - Edge cases: boundary scores 39/40/69/70.
  - Verify: unit tests for schema accept/reject and label boundaries.

- [x] **4. Config, request context, rate limiting (P0)**
  - Objective: env switches, signed `bluff_uid` cookie → Maya, demo-key gate, 30 runs/min/IP token bucket.
  - Depends: 3.
  - Files: `lib/config.ts`, `lib/session.ts`, `lib/ratelimit.ts`, `app/demo/route.ts`, `middleware` if needed.
  - Steps: typed env parsing with defaults (`AGENT_MODE=mock`, `PHOTON_MODE=mock`); HMAC-signed cookie (`SESSION_SECRET`, dev default only outside production); `requireDemoKey(req)` accepts header or cookie set via `/demo?key=`; token bucket keyed by IP.
  - Edge cases: missing/forged cookie → reissue; production with default secret → startup error; `?demo=1` only shows UI controls, server still requires key unless user is the demo user (spec P2-4).
  - Verify: unit tests for cookie sign/verify, bucket refill, demo gate.

## Section 2 — Database (Tiger Data / Postgres)

- [x] **5. Migrations + runner (P0)**
  - Objective: schema from eng §3 via plain SQL files.
  - Depends: 1.
  - Files: `db/migrations/001_init.sql`, `002_timescale_optional.sql`, `scripts/db/migrate.ts`, `lib/db/index.ts`.
  - Steps: all 14 tables; `pg_trgm`; `vector` and `timescaledb` created inside `DO` blocks that detect availability. If timescale missing: plain table + materialized view `merchant_daily` + refresh function; if vector missing: `embedding float8[]`. `schema_migrations` table; idempotent re-runs.
  - Edge cases: extension absent must not fail the migration; TLS `DATABASE_URL` (`sslmode=require`).
  - Verify: run twice on local Postgres 16; `\dt` lists all tables; trigram index exists.

- [x] **6. Seed + reset (P0)**
  - Objective: Maya, 8 storefronts' `mock_registry`, ~50 allowlist hosts, 60 txns/90 days incl. scripted (`txn_demo_link_1` FKSHP*LLC $49.99 held back until demo trigger, `txn_demo_drift`, $1 card test `TST* QWKPAY`, duplicate pair), taxonomy (placeholder categories **labeled placeholder until T-Mobile taxonomy arrives**), 15 game cards, eval user with 30 charges + 20 ground-truth exposures.
  - Depends: 5.
  - Files: `scripts/seed/{index,data,reset}.ts`, `data/*.json`.
  - Steps: deterministic (seeded PRNG); `seed`/`reset` share code; reset deletes only the demo user's rows and re-seeds; 6 "hard" Claim B cases (abbreviations, `SQ *`/`PAYPAL *` prefixes, shared words with a legit site).
  - Edge cases: idempotent; reset while a run is in flight must not crash (FKs `ON DELETE CASCADE` where sensible).
  - Verify: counts asserted by a test (60 txns, 30 eval charges, 15 cards, 8 registry rows); run twice.

- [x] **7. DB access layer + local dev DB script (P0)**
  - Objective: typed query helpers, pooled client, transaction helper; one-command local Postgres for dev/tests.
  - Depends: 5.
  - Files: `lib/db/{pool,queries}.ts`, `scripts/db/local-pg.sh`, `vitest` global setup.
  - Steps: lazy `pg.Pool`; `withTx`; test DB per run (`bluff_test`) created/dropped.
  - Edge cases: pool exhaustion → timeouts; serverless-style hot reload leaks (global singleton).
  - Verify: integration test connects, runs a query, rolls back a tx.

## Section 3 — Core logic (pure + SQL)

- [x] **8. Descriptor normalization + name scoring (P0)**
  - Objective: signature algorithm part 1 (eng §6.2 steps 1,3).
  - Depends: 3.
  - Files: `lib/linker/{normalize,score}.ts`, tests.
  - Steps: strip `SQ *`,`SP *`,`TST*`,`PAYPAL *`,`PP*`, legal suffixes, digits, punctuation; trigram similarity in TS (mirrors pg_trgm); abbreviation subsequence score (0.85; `fkshp` ⊂ `fastkicks-shop`); token Jaccard ≥ 3 chars; time score (1.0 ≤ 7 d decaying to 0.3 at 45 d).
  - Edge cases: empty descriptor; descriptor shorter than 3 chars; unicode; processor prefix with no merchant.
  - Verify: table-driven unit tests incl. the 6 hard cases; `FKSHP*LLC` → `fkshp`.

- [x] **9. Linker SQL + rule flags (P0)**
  - Objective: candidates (0–45 days after exposure, never before), link score = 0.7·name + 0.3·time + 0.1 watch, threshold 0.55; flags price_drift, duplicate, new_subscription, card_test, exposure_link.
  - Depends: 6, 7, 8.
  - Files: `lib/linker/index.ts`, `lib/rules/flags.ts`, tests.
  - Steps: SQL with `similarity()`; combine with TS scores; "1 other possible match"; **expected-charge** kind for legit-store exposures (C8); flags computed on insert and on read.
  - Edge cases: charge before exposure never linked; two exposures → best + note; no transactions → empty; ties.
  - Acceptance: `FKSHP*LLC` links to `fastkicks-shop` exposure; SQL link < 50 ms (measured, logged in test).
  - Verify: integration tests on seeded DB for each flag and each edge case.

- [x] **10. Confidence + rules-only scorer (P0)**
  - Objective: eng §6.4 and §6.6 deterministic path used as the "basic check" fallback and as a baseline.
  - Depends: 3.
  - Files: `lib/rules/{weights,confidence,basicCheck}.ts`, tests.
  - Steps: weight table per evidence key (direction, weight); `confidence = clamp(0.35+0.45·agreement+0.2·coverage, 0, .97)`; `< 0.5 → unsure`; template evidence per key; score = 100 − scaled scam weight.
  - Edge cases: no signals (coverage 0) → unsure; conflicting signals → reason names the conflict.
  - Verify: unit tests incl. 3 demo scam hosts < 40, 5 legit ≥ 70.

## Section 4 — Agent service

- [x] **11. Mock agent + fixtures + failure injection (P0)**
  - Objective: UI/back end unblocked from minute one (eng §4 mock-to-live).
  - Depends: 3, 10.
  - Files: `fixtures/runs/*.json` (8 hosts + `txn_demo_link_1` + message cases), `lib/agent/mock.ts`.
  - Steps: stream steps with 600–1,400 ms gaps (first at 400 ms, total 5–8 s; configurable `MOCK_SPEED` for tests); `?fail=timeout|malformed|ratelimit` shapes.
  - Edge cases: unknown host → synthesize from rules-only scorer, labeled `basic`.
  - Verify: unit test fixtures validate against `VerdictSchema`.

- [x] **12. Run store + SSE endpoints (P0)**
  - Objective: `POST /api/investigate/{page,message}`, `GET /api/runs/:id/stream`, `GET /api/runs/:id` (eng §4, §6.1 persistence).
  - Depends: 7, 11, 4.
  - Files: `lib/agent/runs.ts`, `app/api/investigate/page/route.ts`, `.../message/route.ts`, `app/api/runs/[runId]/{route,stream/route}.ts`.
  - Steps: in-memory emitter + DB persistence (`agent_runs`, `agent_steps`, `verdicts`), late subscribers replay stored steps, heartbeat 10 s, `done {totalMs, mode}`, input validation, rate limit, `source=eval` sync verdict.
  - Edge cases: client disconnect cleans listeners; unknown runId 404; empty input `bad_input`; run > 12 s → cached verdict for demo hosts (labeled).
  - Verify: integration test consumes SSE, asserts event order and DB rows.

- [x] **13. Agent tools (P0)**
  - Objective: the 8 tools of eng §6.1 as typed functions each returning ≤ 1 KB.
  - Depends: 9, 12.
  - Files: `lib/agent/tools/{domainIntel,pageSignals,taxonomyMatch,exposureLookup,txnSearch,draftDispute,notify,submitVerdict}.ts`, `lib/agent/tools/index.ts`.
  - Steps: `domain_intel` mock_registry → RDAP (2 s timeout, behind `RDAP_ENABLED`) → "age unknown"; `page_signals` fetches **our own** storefront HTML only (host allow-listed to `BASE_DOMAIN` stores, SSRF guard); `taxonomy_match` embeddings with keyword fallback; `submit_verdict` zod validation.
  - Edge cases: SSRF (reject private IPs / non-store hosts); timeouts; oversized outputs truncated.
  - Verify: unit tests per tool incl. SSRF rejection and timeout fallback.

- [x] **14. Live Nemotron agent loop (P0, live path unverifiable here)**
  - Objective: real multi-step tool-calling agent (NVIDIA track), ≤ 6 iterations, 15 s hard timeout, repair turn, rules-only fallback.
  - Depends: 13.
  - Files: `lib/agent/{live,prompts,llm}.ts`, `lib/agent/embeddings.ts`.
  - Steps: OpenAI-compatible chat client over `fetch` (`NVIDIA_BASE_URL`, `NVIDIA_API_KEY`, `NEMOTRON_MODEL`); mode prompts (page/message/txn); tool-call loop; one repair turn on validation failure; confidence computed by §6.4 not model self-report; step rows persisted before/after each tool.
  - Edge cases: model returns no tool call; unknown tool; non-JSON args; 429/5xx → fallback `basic`; key missing → startup warns and uses mock.
  - Verify: tests against a local fake OpenAI-compatible server covering happy path, malformed → repair → ok, repair fails → basic, timeout → basic, 429 → basic. **Live run: `[!]` needs `NVIDIA_API_KEY`.**

- [x] **15. Cached / replayed / basic modes (P0)**
  - Objective: product req 8: live/cached/replayed labeled always; <24 h verdict reuse; replay last good txn trace.
  - Depends: 12, 14.
  - Files: `lib/agent/cache.ts`.
  - Steps: reuse verdict for same host < 24 h (`checked earlier`); replay from `agent_runs` with `replay_of`; slow-threshold logic (>12 s).
  - Edge cases: no prior run → rules-only; replay never labeled live.
  - Verify: integration tests per mode.

## Section 5 — API routes

- [x] **16. Exposures API (P0)** — `POST/GET/PATCH/DELETE /api/exposures`; label = registrable name; triggers `notify(exposure_alert)` when score < 40; linked counts; same host twice → new exposure but verdict reuse. Depends 9, 12, 21 (notify stub first). Verify: integration tests incl. delete cascades and alert emission.
- [x] **17. Transactions + demo API (P0)** — `GET /api/transactions[/:id]` (flags, candidates, priceHistory, dispute), `POST /api/transactions/:id/investigate`, `POST /api/demo/next-charge` (inserts scripted charge, refreshes aggregate, starts run, returns `{transaction, runId}`), `POST /api/demo/reset`; demo-key gated; "simulate a charge from *this* store" posts the linked charge for the exposure's store. Edge: no scripted charge left → cycles/clear message. Depends 9, 12. Verify: integration tests.
- [x] **18. Disputes API + Refund Builder logic (P0)** — template letter filled from data (name, last-4 placeholder, date, amount, merchant, category, narrative), evidence timeline (exposure → alert → charge with UTC timestamps), next steps; AI narrative via model with fallback to template; `PATCH status filed` (status only, never sends). Edge: unlinked charge → 409 `bad_input`; >8 s → template. Depends 13, 14, 17. Verify: tests for template and fallback.
- [x] **19. Game API (P0)** — `/api/game/{today,answer,finish}`; 5 cards deterministic by date with 2–3 scam split; answers hidden until answered; streak (1 per day, replays = practice), weakest category, share text `Call the Bluff #n 🟥🟩… 4/5 bluff.<domain>/play` without revealing answers; set fixed when opened (across midnight). Depends 6, 7. Verify: tests for determinism, streak rules, share text.
- [x] **20. Eval + data lifecycle APIs (P0)** — `GET /api/eval` (reads `eval/results.json`, 404-safe empty state), `POST /api/eval/link` (eval key), `DELETE /api/me` (deletes exposures, verdicts, messages, game data, re-seeds Maya). Depends 9, 6. Verify: tests.
- [x] **21. Photon messaging lib + webhook (P0)** — `lib/photon` with `PHOTON_MODE=mock|live`; outbound queue → send → status with retries 1/4/10 s; `notify()` enforces 1 alert/event, 5/hour/user, `alerts_paused`; inbound webhook verifies HMAC signing secret, replies 200 immediately, async processing: commands WATCH/DISPUTE/SAFE/STOP/HELP (case-insensitive), else message-mode verdict reply with templates (P3-2), empty/image-only/>2,000-char replies, 10 s holding message, rules-only fallback, unknown phone = guest, inbound body stored as `[discarded]`. Mock mode writes to `messages` for the Phone Preview drawer. Edge: duplicate webhook delivery (idempotent by provider id). Depends 12, 16, 17. Verify: tests with signed fake payloads. **Live: `[!]` needs Photon project, number, and confirmed payload/signature header (G2).**

## Section 6 — Frontend

- [x] **22. Shell + navigation (P0)** — `app/(shell)/layout.tsx`: left rail ≥ 1024 px / bottom tab bar, 7 items in order, top bar with "Maya", Bluff Text number + copy, LIVE/DEMO badge, `PhonePreview` drawer. Verify: Playwright screenshots at 390 px and 1280 px (task 40).
- [x] **23. Shared verdict components (P0)** — `ScoreDial` (half-circle, 600 ms count), `ConfidencePill` (with reason), `EvidenceList`, `NextSteps`, `VerdictCard`, `AgentTrace`, `ModeBadge`. Edge: score boundaries colors; unsure state shows "What to check yourself", no red/green; reduced motion. Verify: component tests (vitest + testing-library) and screenshots.
- [x] **24. `useRunStream` + RunView (P0)** — EventSource hook returning `{steps, verdict, error, done, mode}`; reconnect/late-subscriber; error and slow states ("Taking longer than usual" > 12 s). Verify: tests with fake EventSource.
- [x] **25. `/check` (P0)** — 8 store chips, free URL (limited-check note), paste-text field, RunView → ExposureActions (Leave / Continue / Continue and watch), CTA "Simulate a charge from this store" → `/charges/[id]`; deep link `?store=`; empty input error. Verify: Playwright core-loop test on mocks.
- [x] **26. `/charges` + `/charges/[id]` (P0)** — TransactionTable with FlagBadges + All/Flagged filter, gated DemoControls, ChargeHeader, `LinkedChargeCard` (animated connector, match reasons, "Expected charge", amber "Possible match", "No linked exposure"), `PriceSparkline` from `merchant_daily`, RunView. Edge: empty → EmptyState "simulate one". Verify: Playwright.
- [x] **27. Refund Builder UI (P0)** — LetterPreview, EvidenceTimeline, NextSteps, Copy letter, Download .txt, Mark as filed, banner "Bluff drafts. You decide. Not legal or financial advice."; skeleton at > 8 s, template fallback visible. Verify: Playwright.
- [x] **28. `/exposure` timeline (P1)** — grouped by day, watch toggle, linked count, delete with confirm. Verify: Playwright.
- [x] **29. `/` Overview (P0)** — RiskSummary, AlertFeed, LatestExposures (3), "Try Bluff on a store →". Verify: Playwright.
- [x] **30. `/play` (P0)** — GameDeck flip (400 ms), Legit/Bluff! AnswerBar, red-flag span highlight with why, ResultSheet (score, streak, weakest, Share → clipboard with fallback), practice mode. Verify: Playwright + unit tests for span highlighter.
- [x] **31. `/eval` (P0)** — two ClaimTables (method, n, P/R/F1 for Bluff and baseline), split description, ≥ 3 FailureCases, timestamp, **stand-in/mode label**, empty state when no results. Verify: Playwright with fixture JSON.
- [x] **32. `/privacy` (P0)** — static SVG device/server diagram, sent-vs-never table (C3 wording), Delete-everything with confirm → `DELETE /api/me`. Verify: Playwright.

## Section 7 — Storefronts and extension

- [x] **33. Eight demo storefronts (P0)** — static HTML in `stores/<name>/` (3 scam: `fastkicks-shop` 70 % off + gift-card/crypto only + countdown + brand-clone cues, `deliveryfix-help`, `tollpay-tx`; 5 legit), card form fields (never submitted), footer "Demo store, not real". Edge: forms `preventDefault`. Verify: HTML lint + a test that each page's signals extract as expected.
- [x] **34. Chrome MV3 extension (P1)** — `extension/` content script (MutationObserver, field detection by type/name/id/autocomplete/label, local signals, **never reads `.value`**), background SSE relay, shadow-DOM 360 px panel (same tokens), Leave/Continue/Watch buttons, allowlist/SAFE skip, iframe payment detection; `host_permissions` app domain only; esbuild build script. Verify: unit tests for detector on storefront HTML with jsdom; a test asserting no `.value` access (static grep + runtime spy); Playwright with extension loaded if headless Chromium permits.

## Section 8 — Eval harness (Python)

- [x] **35. Claim B harness (P0)** — `scripts/eval/run_linker.py` + naive baseline, 10 dev / 20 test, P/R/F1, writes `eval/results.json` section; real numbers from the seeded eval user. Verify: script runs end-to-end, numbers reproducible.
- [x] **36. Claim A harness (P0, data `[!]`)** — `prepare_split.py` (seed 42, stratified 80/20, ids only, commit before tuning), `run_baseline.py` (adapter for T-Mobile baseline), `run_bluff.py`, `score.py` (P/R/F1, both `unsure` mappings, category accuracy, ≥ 3 failures). Ships a **synthetic stand-in** set (`eval/standin/`) so the pipeline runs; results labeled `dataset: "synthetic stand-in, not T-Mobile data"`. Verify: pipeline test on stand-in; swap-in instructions in README.
- [x] **37. Stretch eval scaffolding (P1)** — `eval/stretch.jsonl` format, zero-shot no-tools baseline script (needs key `[!]`), failure table renderer. Verify: runs on stand-in with mock.

## Section 9 — Hardening and depth

- [x] **38. Failure-state coverage (P0/P1)** — every product_spec §4 row reachable with `?fail=` and covered by a test; ErrorState/EmptyState everywhere; `prewarm` script (8 hosts + `txn_demo_link_1`). Verify: test matrix.
- [x] **39. SAFE/STOP/HELP + rate limits + delete hardening (P1)** — allowlist per user, alerts paused, HELP text, 429 shapes. (Core of this lands in tasks 4/21; this task closes gaps and tests.) Verify: tests.
- [x] **40. Game generation job + lookalike card (P1)** — `/api/game/generate` (demo key) via small Nemotron model; validation (red flag appears verbatim, no real brands, ≤ 300 chars), seeded fallback, lookalike from most common flagged category of the last 7 days. Verify: tests with fake model, malformed → drop → pool.
- [x] **41. Voice call for highest-risk charge (P2)** — adapter + mock for linked charge ≥ $40 and score < 30, text fallback. `[!]` live Photon calling unverified. Verify: unit tests with mock.
- [ ] **42. Leaderboard / image forwarding / real RDAP / PDF (P2)** — **deferred by the spec's own cut order**; RDAP lookup already present behind flag in task 13; others recorded as not built.

## Section 10 — QA, polish, docs, deployment

- [ ] **43. End-to-end + mobile visual QA (P0)** — Playwright: full core loop on mocks at 390×844; screenshots of all routes; fix layout, contrast, loading/empty/error states; JS budget check (< 250 KB gz per route, report). Verify: tests green; screenshots reviewed.
- [ ] **44. Containerization + deploy config (P0)** — `Dockerfile` (standalone), `docker-compose.yml` (web + caddy), `Caddyfile` with explicit store subdomains via `BASE_DOMAIN`, `/api/health`, `.dockerignore`, `DEPLOY.md` runbook (Vultr, GoDaddy A records, Tiger Data migrate/seed, Photon webhook URL, smoke test, pre-warm). Verify: `docker build` if daemon available, else `next build` standalone + `docker compose config`. **Actual deploy `[!]` human: Vultr, domain, keys.**
- [ ] **45. README + Devpost kit (P0)** — README (architecture, claims with honest status, how to run, sponsor usage, go-live checklist), `DEVPOST.md` copy (tracks, MLH opt-ins), demo script with number placeholders to fill from `eval/results.json`, video shot list. Video, event-tester quotes, FTC figure, Devpost submit = `[!]` human.
- [ ] **46. Final verification pass (P0)** — all checks, update this plan with results, tick statuses, record remaining human blockers.

## Human-only / blocked register
| Item | Owner | Blocks |
|---|---|---|
| T-Mobile data, taxonomy, baseline (booth) | team | real Claim A numbers (36) |
| NVIDIA key + model IDs | team | live agent verification (14), game gen live, zero-shot baseline |
| Photon project, number, SDK/webhook shape | team | live messaging (21), voice (41) |
| Tiger Data service (timescale/pgvector) | team | managed DB deploy (44) |
| Vultr instance, GoDaddy domain, HTTPS | team | live deployment (44) |
| Devpost registration/submission, video, rehearsals, tester quotes, FTC stat | team | submission (45) |

## Progress log
(Updated after every task: date, commit, verification output.)
- Task 1 — done — typecheck, lint, next build (standalone), vitest all pass.
- Task 2 — done — typecheck/lint/build pass; 4 component tests pass (mode/flag badges, empty/error states). Visual check deferred to task 43.
- Task 3 — done — typecheck/lint pass; 15 tests pass (schema accept/reject, label boundaries 39/40/69/70, error shape).
- Task 4 — done — typecheck/lint pass; 22 tests pass (cookie sign/forge, demo gate header/cookie not query, prod secret guard, token bucket refill).
- Task 5 — done — typecheck/lint pass; migrate test (fresh DB: all 13 tables + merchant_daily matview fallback + trgm indexes, idempotent re-run) passes; CLI run twice OK. NOTE: timescale hypertable/continuous-aggregate branch (002/003) is written but UNVERIFIED locally (no timescaledb) — verify on Tiger Data. Vector replaced by float8[] per spec fallback.
- Task 8 — done — done before task 6 (seed needs descriptor_norm). typecheck/lint pass; 18 tests pass: normalization table (incl. SQ*/TST*/PAYPAL*/PP* prefixes, empty), abbreviation matcher (fkshp⊂fastkicks-shop; rejects missing token/wrong initial), time-score window/decay, FKSHP*LLC links with 'charged 3 days after exposure', pre-exposure never links, watch +0.1. Finding: a descriptor sharing a word AND similar trigrams (e.g. 'FAST FOOD*SHOP') can still clear 0.55 — that is the case the agent must confirm/reject (spec §6.2 step 6).
- Task 6 — done — typecheck/lint pass; 7 seed tests pass (60 deterministic txns in 90d, 30 eval charges/20 positive, 8 registry rows, 15 cards, ≥50 allowlist, re-runnable, reset leaves eval user intact, card spans verbatim, authored Claim B data sanity: every positive links to its true exposure and no negative clears 0.55); CLI seed/reset verified on local DB. Decision: scripted charges (txn_demo_*) are NOT seeded; posted by the demo trigger (task 17). Taxonomy rows flagged is_placeholder until T-Mobile taxonomy arrives.
- Task 7 — done — typecheck/lint pass; db helper tests pass (query helpers, tx commit + rollback); tests/testdb.ts creates isolated migrated/seeded DBs; scripts/db/local-pg.sh starts dev Postgres.
- Task 9 — done — typecheck/lint pass; 12 integration tests pass on seeded Postgres: FKSHP*LLC→fastkicks-shop with '3 days after exposure' (link query <100ms asserted), pre-exposure and >45d never link, 1 other possible match, watch +priority, expected-charge kind, no-candidate null, seeded duplicate/card_test flags, price_drift (needs ≥2 prior), new_subscription, empty/unknown ids. Name score mirrored in TS (documented) with SQL doing the time-window narrowing.
- Task 10 — done — typecheck/lint clean; 12 tests pass: confidence formula (clamp .97, 0.35 floor, conflict reason ≤120), basicCheck validates against VerdictSchema (scam storefront <40, legit ≥70, no-signal → unsure 40–69, low-confidence forced unsure, monotone), message heuristics flag all 9 scam cards and ≥80% of 15 seeded cards correct (sanity only, NOT a claim).
- Task 11 — done — typecheck/lint clean; 9 tests pass: 9 fixtures validate against VerdictSchema (3 scam <40, 5 legit ≥70 + signature txn), path-traversal keys rejected, ordered step→verdict→done stream, fixtures labeled 'cached' (never 'live'), unknown host → 'basic', ?fail=timeout|malformed|ratelimit each emit error + basic fallback, pacing 400ms/600–1400ms. Note: mock mode is labeled cached/basic by design since no model ran.
- Task 12 — done — typecheck/lint/next build pass; 7 route integration tests pass (page run streams step→verdict→done with DB rows, late subscriber replay, ?fail=malformed → error+basic fallback, bad_input shapes incl. >2000 chars, 404s, eval source needs key, session cookie). Hard 15s timeout + crash fallback implemented; done event carries verdictId.
- Task 13 — done — typecheck/lint clean; full suite 108 tests pass. Tools: domain_intel (registry→RDAP 2s timeout behind flag→unknown, allowlist), page_signals (reads only whitelisted storefront slugs from disk: no SSRF), taxonomy_match (embeddings with 2s timeout, keyword fallback), exposure_lookup, txn_search (+merchant_daily series), submit_verdict (server-side confidence, forced unsure <0.5, validation errors), registry caps output at 1KB & converts errors. Bug found+fixed via test: link candidates now require name evidence (time alone scored 0.3 for every recent exposure). draft_dispute/notify tools are registered in tasks 18/21.
- Task 14 — done — typecheck/lint clean; 10 tests against a local fake OpenAI-compatible server pass (happy path with tools fed back, repair turn ok, repair fails→basic, bad args/unknown tool reported to model, no-tool nudge→fallback, 6-iteration cap, 429/500/garbage→typed errors, 300ms deadline→timeout, txn link reconciliation never trusts invented exposure ids). BLOCKER (human): LIVE run against real build.nvidia.com needs NVIDIA_API_KEY + NEMOTRON_MODEL; 8/10 schema-valid and p50<8s are unmeasured.
- Task 15 — done — typecheck/lint clean; full suite passes incl. 9 new mode tests: live page verdicts <24h reused as 'cached' (mock/fixture/old never reused, fresh=1 bypass), real-data charge verdicts (FKSHP*LLC evidence '$49.99 … lines up with fastkicks-shop', '3 days earlier', 'scored 18'; expected-charge; no invented link; card test), failure ladder for charges: replay last live run, else committed fixture, labeled 'replayed'; else rules-only 'basic'. Mock txn runs are labeled 'basic' (no model ran).
- Task 16 — done — typecheck/lint clean; full suite passes incl. 9 new tests: scam exposure → 201 + queued alert with exact spec wording ('…a site registered 4 days ago. Reply WATCH…'), legit store no alert, same host twice → 2 rows, bad verdict/action → 400, PATCH watch/DELETE/404, list linkedCount, notify choke point (1 per event, 5/hour cap, paused skipped, failed delivery marked failed, retry delays 1s/4s/10s), templates. Pulled the outbound notify()/retry core forward from task 21 (live Photon sender + inbound webhook remain there). Migration 004 adds messages.meta.
- Task 17 — done — typecheck/lint clean; full suite passes incl. 10 new API tests. Core loop proven end-to-end on mocks: check fastkicks-shop → exposure → 'simulate charge' posts FKSHP*LLC $49.99 dated 3 days after the exposure (simulated time, returned as simulatedDelayDays so UI can label it) → flags exposure_link → trace tools [plan,txn_search,exposure_lookup,domain_intel,submit_verdict] → verdict links the real exposure with 'charged 3 days after exposure' → charge iMessage '$49.99 from FKSHP*LLC matches fastkicks-shop…Reply DISPUTE'. Idempotent per script+exposure; unlinked when no exposure; expected-charge for legit store with no alert; price drift script; reset locked in prod w/o key. Decision: next-charge is open while DEMO_MODE=1 (judge path), reset needs the demo key. Detail endpoint returns candidates/verdict/priceHistory/dispute.
- Task 18 — done — typecheck/lint clean; full suite passes incl. 8 dispute tests: letter has name/last-4 placeholder/date/amount/merchant/reason/narrative + 'Edit before sending' prompts, evidence timeline exposure→alert→charge in time order, 5 next steps, nothing sent automatically (message count unchanged), idempotent + regenerate, 409 for unlinked/expected charges, filed is status-only, AI narrative used when valid else template fallback, draft_dispute tool registered. Never asserts facts we don't hold (user edits whether goods were received).
- Task 19 — done — typecheck/lint clean; 9 game tests pass: 5 cards/2–3 scam deterministic by date, set persisted on first open (stable across pool changes/midnight), answers/flags not leaked in /today, answer reveals correctness+spans+category, server-side scoring, replay = practice keeping streak, streak +1 consecutive / reset after gap, weakest category, Chicago day key, share text hides answers ('Call the Bluff #n 🟥🟩… s/5 host/play').
- Task 20 — done — typecheck/lint clean; 6 tests pass: /api/eval returns {results:null} when absent/malformed (zod-validated), /api/eval/link needs eval key, predicts true exposure for hard positive p01 and null for pre-exposure negative n05, only sees eval-user charges, never exposes ground truth; DELETE /api/me clears all user tables and re-seeds Maya (60 txns). Claim B 'Bluff' = SQL linker (method labeled sql_linker; agent confirmation not applied in eval).
- Task 21 — done — typecheck/lint clean; full suite 187 tests pass (18 new Photon tests): forward-to-check reply format 'Likely scam (n/100, p% sure). Why: …. Do: ….', inbound body stored as [discarded], duplicate provider ids ignored, empty/image-only/>2000/low-confidence replies, guests get verdicts only, per-number SMS rate limit, holding message when slow, WATCH/SAFE/STOP/HELP/DISPUTE (case-insens., exact words; DISPUTE drafts only and replies with link), HMAC webhook (403 on bad sig, 200 fast, async processing), tolerant payload parser, live sender posts bearer-auth to configured base, Phone Preview endpoint /api/demo/inbound, notify tool limited to canned charge alert. BLOCKER (human): live Photon needs project secret, number, and confirmation of the real send path/payload/signature header ([verify] items isolated in lib/photon/live.ts and lib/photon/webhook.ts; header name via PHOTON_SIGNATURE_HEADER).
- Task 22 — done — typecheck/lint/build pass (stale .next types cleared by build); 3 nav tests (7 items in spec order, active matching, rail+tab bar with aria-current). Shell: left rail ≥1024px / bottom tab bar, top bar (demo user Maya, copyable Bluff Text number, LIVE/DEMO badge), Phone Preview drawer (polls /api/messages, 'Text not delivered' state, text-Bluff input → /api/demo/inbound). Visual check at 390px/1280px happens in task 43.
- Task 23 — done — typecheck/lint clean; full suite 200 tests pass (10 new component tests): ScoreDial (aria score, clamping, 600ms count with reduced-motion bypass, tone boundaries), VerdictCard (scam/ok/unsure; low confidence forced to Unsure with 'What to check yourself' and no red/green; mode badges; 'checked earlier'), ConfidencePill always shows reason, AgentTrace (tool/input/result/ms, 'Verdict ready · total', starting/thinking/slow states). Added explicit RTL cleanup in vitest.setup.ts. Visual QA in task 43.
- Task 24 — done — typecheck/lint clean; full suite passes (8 new tests): reducer dedupes replayed steps; hook streams step→verdict→done and closes; null runId opens nothing, runId change resets+closes; slow flag at 12s, client gives up with timeout at 40s; transport blips ignored until CLOSED; RunView shows basic-check banners per error code, ErrorState+retry when no fallback, actions only after done, 'checked earlier' from cache step.
- Task 25 — done — typecheck/lint clean; full suite passes (3 new tests: 8 chips, empty link/text messages w/o API call, API failure surfaced). REAL BROWSER smoke (headless Chromium 390px, dev server + local Postgres): tap fastkicks-shop → trace streams 5 steps → 'Likely scam' ScoreDial/evidence/next steps/CACHED badge → 'Continue and watch my charges' → exposure logged → 'Simulate a charge from this store' CTA visible; 0 console errors. Screenshot reviewed. (Found+fixed: dev DB needed migration 004.)
- Task 26 — done — typecheck/lint clean; full suite passes (7 new component tests: table links/amount/flags/empty state, LinkedChargeCard flagged/expected/possible/none incl. domain+date+score+fields+reasons and no invented link, linkInfoFor downgrade to amber, sparkline needs ≥2 pts). REAL BROWSER (390px): /check?store=fastkicks-shop → watch → Simulate → /charges/<id>?run=… streams 5-step trace (txn_search → exposure_lookup 0.99 → domain_intel) → LinkedChargeCard ('FKSHP*LLC' ↔ fastkicks-shop, score 18, card+CVV, '3 days later', reasons), BASIC CHECK verdict, 'Simulated: posted 3 days after exposure' badge; /charges?demo=1 shows demo controls; 0 console errors. Known: price sparkline shows 'not enough history' for FKSHP (correct: no prior charges).
- Task 27 — done — typecheck/lint clean; full suite 223 pass (5 new RefundBuilder tests: disabled+explanation when unlinked, banner 'Bluff drafts. You decide. Not legal or financial advice.', build → editable letter/timeline/next steps/template badge, copy sends the EDITED text, mark-as-filed PATCH and badge, skeleton then 'Still drafting…' at 8s, error+retry, filed state). REAL BROWSER: charge page → Build dispute → letter with Maya/$49.99/FKSHP*LLC/reason. Caveat recorded: simulated charge is dated 3 days after the exposure (future vs wall clock); letter date is clamped to the charge date and the UI labels it 'Simulated'.
- Task 28 — done — typecheck/lint clean; full suite passes (4 new tests: empty state, day grouping with Chicago labels + score badge + linked-charge count, optimistic watch with rollback+error, delete with confirmation). /exposure renders 200 on dev server.
- Task 29 — done — typecheck/lint clean; full suite passes (2 new data tests: seeded state needs-attention + 14-day window, weekly exposure count, latest 3 exposures, 5 alerts). REAL BROWSER: / renders headline '{n} exposures this week, {m} charges need attention.' + 'Try Bluff on a store →' CTA, 0 console errors.
- Task 30 — done — typecheck/lint clean; full suite passes (5 new tests: highlightSpans verbatim/overlap/missing, full play-through with reveal+flags+category, finish payload, share copy, already-played note, load error+retry). REAL BROWSER (390px): 5-card play, card flips and red-flag spans light up with whys, share text '… 🟩🟥🟩🟩🟥 3/5 localhost:3000/play', 0 console errors. Fixed a design bug found in the screenshot: Tailwind /alpha on var() colors didn't work (badge/flag fills fell back to default) → colors now use rgb channel vars.
- Task 31 — done — typecheck/lint clean; full suite 242 pass. /eval: ClaimTable (method, n, P/R/F1 for Bluff incl. unsure-as-scam/legit mappings and baseline), compareF1 reports win/tie/LOSS honestly, FailureCases, timestamp, stand-in dataset warning banner, empty state, 'Not available' baseline; tests cover each. Renders 200 in browser (empty state until tasks 35/36 commit results).
- Task 32 — done — typecheck/lint clean; /privacy renders 200 with 0 console errors; 3 tests: Delete everything cancel/confirm/DELETE /api/me/error, diagram accessible name. Static SVG data-flow diagram, sent-vs-never table (scoped per conflict C3: typed values/page text never read; pasted/forwarded messages sent by user then discarded), shared-demo-user caveat (C4), no-auto-send promise.
- Task 33 — done — 8 storefronts generated by scripts/stores/build.mjs (3 scam: gift-card/crypto only + countdown + scarcity + no contact/refund; 5 legit: contact + refund policy). 4 tests pass: all readable via the agent's page_signals path, every page labeled 'Demo store, not real', card field present, form has no action/no external resources, extracted signals match personality, and 8/8 classified correctly by the rules-only scorer from extracted signals + registry facts (scam <40, legit ≥70). Screenshot reviewed at 390px (fixed input overflow found there). Full suite passes.
- Task 34 — done — typecheck/lint clean; full suite passes (22 extension tests: field detection by type/autocomplete/name/label, email≠address, hidden ignored, payment iframes, PRIVACY: detection+signals work while every input .value getter throws (never called), typed text absent from visible text, static check that no source touches .value, signals are booleans/numbers only; PARITY: extension live-DOM signals == server HTML signals for all 8 storefronts (shared lib/signals/pure.ts); allowlist/SAFE/app-host idle rules; SSE parser; shadow-DOM panel states, handlers, XSS-safe textContent rendering, Unsure state). REAL CHROMIUM (unpacked extension, --headless=new): on the FastKicks page the panel slid in with score 11/'Likely scam', evidence from live-DOM signals, tapping 'Continue and watch my charges' logged the exposure via the background worker; 0 page errors. Build: npm run ext:build (BLUFF_APP_URL=…) → extension/dist. Note: unpacked load only; Chrome Web Store packaging out of scope.
- Task 35 — done — Python unit tests pass (npm run eval:test: PRF edge cases, link TP/FP/FN semantics, naive baseline, merge preserves claims); TS suite 269 pass. RAN against dev server+Postgres: Claim B test split n=20 → Bluff linker P/R/F1 = 1.00/1.00/1.00 vs naive substring 1.00/0.92/0.96 (baseline misses the abbreviated 'SQ *SNGLSSOTLT'); dev split 10: linker 1.0 vs naive 0.75; dev threshold sweep best=0.55 (no tuning change). HONESTY: results.json carries a caveat (shown on /eval) — data authored by the linker's authors and verified solvable, so ~1.0 is optimistic by construction. /api/eval/link now also returns candidateExposureId+score for threshold sweeps (no ground truth leaked). eval/claimB_cases.json + eval/results.json committed.
- Task 36 — done — Pipeline: make_standin → prepare_split (seed 42, stratified, committed BEFORE scoring in its own commit fb1da5f) → run_baseline → run_bluff (concurrency 3, 1 retry, errors counted wrong) → score (both unsure mappings, category accuracy, most-confident failures). 8 Python tests pass; TS suite 269 pass. MEASURED on the 104-message synthetic STAND-IN (test n=21), mock agent (rules-only 'basic'; Nemotron NOT used): Bluff P/R/F1 0.846/1.00/0.917 vs stand-in URL-presence baseline 1.00/0.636/0.778; category accuracy 0.0 (rules-only path labels every scam 'fake_store'); only 2 failures (legit 2FA-code texts flagged as scam). /eval renders it with a stand-in warning + caveat banner. BLOCKER (human): real T-Mobile message set, taxonomy and baseline (booth) — adapter points are scripts/eval/load_dataset.py and baseline.py; a live Nemotron run needs NVIDIA_API_KEY.
- Task 37 — done — Python tests pass (11 total: zero-shot parser, zero-shot client against a fake server asserting one prompt and NO tools, summarize counts errors as wrong + builds the failure table). Ran run_stretch.py on the 15 hand-written cards: Bluff (rules-only mock) F1 1.0, 0 failures — meaningless as evidence because the heuristics were written alongside these cards; results.json 'stretch' note says so. PARTIAL [~]: still needs (a) 40–50 hand-labeled cases (human), (b) NVIDIA_API_KEY+NEMOTRON_MODEL to run the zero-shot baseline (script skips it with a note). /eval does not render the stretch section yet (results.json only).
- Task 38 — done — typecheck/lint clean; full suite 271 pass. Added replay_traces (migration 005): last successful LIVE trace per scripted charge, independent of the demo user so it survives 'reset demo'; failed charge runs now replay: same-charge live run → saved live trace → committed fixture → rules-only. Only live verdicts are stored (fixtures/cached never masquerade as live). npm run prewarm runs 8 hosts + signature charge then resets (verified in mock mode; live trace saving is unverified until NVIDIA key). Failure matrix documented in tests/failure_matrix.test.ts with per-row coverage pointers.
- Task 39 — done — typecheck/lint clean; full suite 273 pass. New: 429 responses carry Retry-After + shared error shape (31st run/min/IP limited, other IPs unaffected); SAFE-by-text makes the host allowlisted in later domain_intel for that user only; STOP/HELP/WATCH/DISPUTE were already covered in tests/photon.test.ts (task 21), delete-everything in tests/eval_me.test.ts (task 20).
- Task 40 — done — typecheck/lint clean; full suite 281 pass (8 new tests with a fake model server): validateCard (verbatim spans only, scam ≥1 flag, legit none, rejects real brands/>300 chars/bad kind), JSON extraction from fenced/prose output, valid cards inserted & invalid dropped & included in that day's set, silent fallback to the seeded pool on 500/garbage/all-invalid, idempotent per day, no-op without a model, lookalike seeded from the week's most-flagged category (ignores >7d), /api/game/generate needs demo key in prod. /api/game/today kicks off tomorrow's generation in the background (live only). Live generation against Nemotron unverified (needs key).
- Task 41 — done — typecheck/lint clean; full suite 286 pass (5 new tests): threshold ≥$40 & score<30, spoken summary ≤25 words with the descriptor spelled out, one call per charge (dedupe), STOP respected, failed call logged while the text alert remains the fallback, end-to-end: $49.99 FKSHP charge → text + call, $19.99 charge → text only; call rows shown in Phone Preview. Migration 006 allows kind='call'. BLOCKER (human, P2): Photon's real calling setup/REST shape is unverified (may need a SIP partner) — isolated in lib/photon/voice.ts liveCaller.
