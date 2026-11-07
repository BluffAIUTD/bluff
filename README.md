# Bluff

**Bluff connects the site where you typed your card to the charge that follows, then helps you get your money back.** *Call their bluff.*

HackUTD 2026: ZeroDay · T-Mobile Safe Signal · NVIDIA Nemotron · Photon · Virality · MLH (Tiger Data, Vultr, GoDaddy Registry)

Scams don't happen when you click. They show up days later on your statement. Existing tools each see one slice: a site rater sees
the page, a bank sees the charge, a text filter sees the message. Bluff is a scam co-pilot **with memory**:

1. **Checkout Guard** (Chrome extension + `/check`): the moment a page asks for your card or personal info, a Nemotron agent rates it and logs the exposure.
2. **Charge Watch + Refund Builder** (`/charges`): when a charge posts, the linker ties it back to the exposure and the agent drafts a dispute letter, evidence timeline and next steps. *Drafts only; Bluff never files or sends anything.*
3. **Bluff Text** (Photon iMessage): alerts when something risky happens, forward-a-text-for-a-verdict, replies `WATCH` / `DISPUTE` / `SAFE` / `STOP` / `HELP`.
4. **Call the Bluff** (`/play`): a 60-second daily game on the same red flags the detector uses.

Everything runs on **synthetic data**; demo stores are labeled *Demo store, not real*.

## Honest status

| Area | State |
|---|---|
| Core loop, all 4 pillars, dashboard, extension, storefronts, API, DB | Built and tested (`npm test`: 290+ tests; `npm run e2e` in real Chromium) |
| Runs offline with **mock** agent/messaging | Yes (`AGENT_MODE=mock`, `PHOTON_MODE=mock`, the defaults) |
| **Live Nemotron** agent | **Run against build.nvidia.com** with `nvidia/nemotron-3-ultra-550b-a55b`: 10/10 schema-valid verdicts, 10/10 correct on the demo stores, median 7.8 s, p95 10.2 s (first run; latency varies). The signature charge ran live and saved a replay trace. The hosted endpoint returns 429 on overlapping calls, so calls are throttled (2 at a time) and retried |
| **Live Photon** messaging/calls | Adapters + signed-webhook tests done; **not run against Photon** (needs project, number, confirmed API shapes) |
| **Tiger Data** | Plain-Postgres path tested; the Timescale hypertable/continuous-aggregate branch is **untested** locally |
| Deployment (Vultr + domain) | Config and runbook ready ([DEPLOY.md](DEPLOY.md)); **not deployed** (needs accounts); image build not run (no Docker daemon in the build env) |
| Eval Claim A (detection) | Measured only on a **synthetic stand-in** set (n=21). Latest run: 18 of 21 verdicts came from the live Nemotron agent, 3 hit the 15 s deadline and fell back to rules-only. **Not a result on T-Mobile's data.** |
| Eval Claim B (linking) | Measured on 30 synthetic charges; **optimistic by construction** (see caveat below) |

### Claims and measured numbers (from `eval/results.json`, also shown on `/eval`)
- **Claim A, detection.** Bluff beats a baseline on F1 for scam vs. legit on a held-out split. *Measured so far: stand-in dataset, n=21, stand-in baseline; mixed live/fallback verdicts (see `eval/results.json`).* F1 ~0.88–0.92 vs 0.78 shows the pipeline works and nothing more. Rejected if F1 ≤ baseline on the real T-Mobile set.
- **Claim B, linking.** Bluff's linker (normalized descriptor + trigram/abbreviation/token score + time window) finds the true exposure better than naive substring matching. *Measured: n=20 test charges, F1 1.00 vs 0.96.* The charges were authored by the linker's authors and every positive was checked to be solvable, so treat this as "handles abbreviations and processor prefixes", not as real-world accuracy.

Re-run: `npm run eval:export && python3 scripts/eval/run_linker.py` and `./scripts/eval/run_claim_a.sh` (app running). The Claim A split (`eval/split.json`, seed 42) was committed before any scoring.

## Architecture

```
Chrome extension ─┐                       ┌─ Nemotron (build.nvidia.com, tool calling) + embeddings
Phone / laptop ───┼─► Next.js 15 (App Router, Node) ──┤   agent loop: ≤6 steps, 8 tools, SSE trace, repair turn, rules fallback
iMessage (Photon)─┘   /api/*  SSE  webhooks            ├─ Tiger Data / Postgres: hypertable, continuous aggregate, pg_trgm
                       lib/linker · lib/agent · lib/photon └─ Photon: iMessage/SMS out + in (+ voice stretch)
```

- **One agent, one Exposure Log, one database, one design system.** The agent returns a single `Verdict` schema everywhere; confidence is computed from signal agreement, not self-reported.
- **Linker** (`lib/linker`): normalize descriptor (strip `SQ *`, `PAYPAL *`, `TST*`…) → candidates 0–45 days *after* an exposure → name score (trigram, abbreviation `fkshp ⊂ fastkicks-shop`, token overlap) → ×0.7 + time ×0.3 (+0.1 if watched) → threshold 0.55. The agent confirms; it can never invent a link.
- **Never-blank fallbacks:** live → cached → replayed (last successful trace, labeled) → rules-only "basic check". Every result shows its mode.
- **Privacy:** the extension never reads input values or page text (enforced by tests); only the domain, field *types* and yes/no signals leave the page. Forwarded texts are discarded after the verdict.

```
app/ (UI + API)   components/   lib/{agent,linker,rules,photon,db,client}   extension/ (MV3)
stores/ (8 demo storefronts)   db/migrations/   scripts/{seed,eval,deploy}   eval/   fixtures/runs/   e2e/
```

## Run it locally

Needs Node 22 and Postgres 16 (`scripts/db/local-pg.sh start` starts a throwaway one).

```bash
npm install
cp .env.example .env              # defaults: mock agent + mock Photon, no keys needed
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/bluff
npm run db:migrate && npm run db:seed
npm run dev                       # http://localhost:3000   (add ?demo=1 on /charges for presenter controls)
```

Try the loop: **/check** → tap `fastkicks-shop` → *Continue and watch my charges* → *Simulate a charge from this store* → *Build dispute*. The **Phone preview** (top bar) shows the iMessage alerts and lets you text Bluff.

```bash
npm test               # unit + integration (needs local Postgres)
npm run e2e            # real-Chromium core loop + all routes at 390px and 1280px (app must be running; E2E_BASE=…)
npm run eval:test      # Python metric tests
BLUFF_APP_URL=http://localhost:3000 npm run ext:build   # extension → extension/dist (Load unpacked)
npm run demo:script    # pitch script with the real numbers and warnings
```

## Going live (checklist)
1. `NVIDIA_API_KEY`, `NEMOTRON_MODEL`, `NEMOTRON_SMALL_MODEL`, `EMBED_MODEL` (verified IDs in `.env.example`); `AGENT_MODE=live`; `npm run embed-taxonomy`; then `npm run livecheck` (10 runs: schema-valid count and timings) and `npm run prewarm`. Done once here; repeat on the deployed box.
2. Photon project + number + webhook; confirm payload/signature in `lib/photon/webhook.ts` and `lib/photon/live.ts`; `PHOTON_MODE=live`.
3. Real T-Mobile data: edit `scripts/eval/load_dataset.py` and `baseline.py`, regenerate the split, re-run Claim A against the live agent, replace the stand-in numbers.
4. Tiger Data: migrate and confirm `bluff_meta.agg_mode = timescale`.
5. Deploy per [DEPLOY.md](DEPLOY.md); run `npm run prewarm`.

## Sponsor usage
- **NVIDIA Nemotron:** multi-step tool-calling agent (plans, calls 8 tools, validates, repairs, streams its trace), not a chatbot.
- **T-Mobile Safe Signal:** prevention (checkout guard), real-time protection (charge linking, alerts), education (daily game), detection measured against a baseline, privacy by design, synthetic data only.
- **Photon:** iMessage alerts and two-way forward-to-check with reply commands; voice call for the highest-risk charge (stretch).
- **Tiger Data:** `transactions` hypertable + `merchant_daily` continuous aggregate (price drift, sparkline) + `pg_trgm` descriptor matching.
- **Vultr / GoDaddy Registry:** hosting and domain (see DEPLOY.md).

## Known limitations
- The demo charge is dated a few days after the exposure to show the link; the UI labels it *Simulated*.
- One shared demo user ("Maya"): *Delete everything* resets the demo for everyone.
- Real-RDAP domain age is behind `RDAP_ENABLED=1` and untested against live RDAP; demo stores use a mock registry.
- Not built (cut order): leaderboard, screenshot forwarding, PDF export.
