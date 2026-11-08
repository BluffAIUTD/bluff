# polish_queue.md: Bluff (HackUTD 2026)
The one queue for the whole event. hackathon-checkpoint reads and updates this file.
T = 24h (Sat 12:00pm → Sun 12:00pm CST). 33% ≈ Sat 8:00pm (last chance to re-aim). Freeze (50%) ≈ Sat midnight.
Rule: every pillar's thin slice works before any pillar gets depth. Demo-path bugs always go first.
A = backend/AI · B = frontend/demo.

## Phase A: Setup + contract (before 33% of T)
[ ] 1 (A+B): Get T-Mobile message set, taxonomy and baseline from the booth; confirm formats in hackathon.md. (by Sat 5:30pm)
[ ] 2 (A+B): NVIDIA API key + model IDs; Vultr credits; GoDaddy domain registered. (by Sat 6:00pm)
[ ] 3 (A): Verdict type + SSE event shapes + 3 fixture runs committed; mock mode streams them. (by Sat 6:30pm)
[ ] 4 (A): Tiger Data: migrations (hypertable, continuous aggregate, pg_trgm, pgvector or fallback) + seed for Maya, 8 stores, 60 txns, eval user. (by Sat 7:00pm)
[ ] 5 (A): One alert sent and one text received end to end in the phone view. (by Sat 7:00pm)
[ ] 6 (A): Claim A split file committed (seed 42) before any prompt tuning. (by Sat 7:30pm)
[ ] 7 (A): Agent returns a valid Verdict for fastkicks-shop live in < 10 s, 8/10 runs schema-valid. (Checkpoint 1, Sat 8:00pm)
[ ] 8 (B): Shell + tokens + /check RunView working on mocks (trace streams, VerdictCard). (Sat 8:00pm)

## Phase B: Thin slice of every pillar (by freeze)
[ ] 9 (A): Linker SQL + rule flags; Claim B dev split tunes the threshold. (Sat 10:00pm)
[ ] 10 (B): /charges + /charges/[id] with LinkedChargeCard + RefundBuilder (template first). (Sat 10:00pm)
[ ] 11 (A+B): Core loop live: /check → exposure → demo next-charge → link → dispute. (Sat 11:00pm)
[ ] 12 (A+B): Devpost team registered. (by Sat 11:00pm)
[ ] 13 (A): Bluff Text: exposure alert, charge alert, inbound forward-to-check, WATCH/DISPUTE. (Sat midnight)
[ ] 14 (B): /play with seeded 15-card pool: flip, flags, score, streak, share text. (Sat midnight)
[ ] 15 (A+B): Deployed on Vultr at bluff.<domain> with HTTPS + 8 store subdomains; core loop works on a phone over cellular. (Checkpoint 2, Sat midnight)

## Phase C: Proof + P1 (after freeze)
[ ] 16 (A): Claim A and Claim B results → eval/results.json; first numbers in. (Sun 1:30am)
[ ] 17 (B): /eval and /privacy pages. (Sun 2:00am)
[ ] 18 (B): Chrome extension: field detection + shadow-DOM panel on the 3 scam stores. (Sun 3:30am)
[ ] 19 (A): Cached/replayed fallbacks + pre-warm script; every failure state in product_spec §4 reachable with ?fail=. (Sun 4:00am)
[ ] 20 (B): /exposure timeline; price sparkline; FlagBadges for duplicate/subscription/card test. (Sun 5:00am)
[ ] 21 (A): Final eval numbers; failure cases written. (Checkpoint 3, Sun 6:00am)

## Phase D: Depth plan (only if A–C are done, in this order)
[ ] 22: Stretch eval (40–50 cases, zero-shot Nemotron baseline, failure table).
[ ] 23: 3–5 event tester reactions + one sourced statistic (fetched).
[ ] 24: Generated game cards + lookalike card.
[ ] 25: SAFE/STOP/HELP + rate limits; delete-everything.
[ ] 26: (removed) Voice call for the highest-risk linked charge.

## Phase E: Demo + submit
[ ] 27: Demo script rewritten with real numbers; 3 full rehearsals on the deployed site. (Sun 9:00am)
[ ] 28: Visual pass: same tokens/components on every page, mobile layout, loading/empty/error states. (Sun 9:30am)
[ ] 29: Video recorded ≤ 2:00, demo only. (Sun 10:30am)
[ ] 30: README (architecture, claims, sponsor usage, run steps) + Devpost: T-Mobile, NVIDIA, Capital One, Virality + MLH Tiger Data, Vultr, GoDaddy opt-ins. Submitted. (by Sun 11:30am)
