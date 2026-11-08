# Bluff

**Bluff connects the site where you typed your card to the charge that follows, then helps you get your money back.** *Call their bluff.*

HackUTD 2026: ZeroDay · T-Mobile Safe Signal · NVIDIA Nemotron · Capital One Nessie · Photon · Virality · MLH (Tiger Data, Vultr, GoDaddy Registry)

Scams don't happen when you click. They show up days later on your statement. Existing tools each see one slice: a site rater sees
the page, a bank sees the charge, a text filter sees the message. Bluff is a scam co-pilot **with memory**:

1. **Checkout Guard** (Chrome extension + `/check`): the moment a page asks for your card or personal info, a Nemotron agent rates it and logs the exposure.
2. **Charge Watch + Refund Builder** (`/charges`): when a charge posts, the linker ties it back to the exposure and the agent drafts a dispute letter, evidence timeline and next steps. *Drafts only; Bluff never files or sends anything.*
3. **Bluff Text** (Photon iMessage): alerts when something risky happens, forward-a-text-for-a-verdict, replies `WATCH` / `DISPUTE` / `SAFE` / `STOP` / `HELP`.
4. **Call the Bluff** (`/play`): a 60-second daily game on the same red flags the detector uses. It mixes in messages from the
   our own 306-message synthetic scam/legit set (`data/messages`) and one card built from *your own* bank scan.
5. **Bank Scan** (`/scan`): pulls your recent card transactions from **Capital One's Nessie API**, **crawls the website behind every
   charge** (up to 10 pages: refunds, terms, contact, about, checkout…), runs a rules-only **basic check**, then a **Nemotron** agent
   does a **deep analysis** of the pages and writes a cited report. Both tiers stream live, per merchant.

Everything runs on **synthetic data**; demo stores are labeled *Demo store, not real*.

## Honest status

| Area | State |
|---|---|
| Core loop, all 4 pillars, dashboard, extension, storefronts, API, DB | Built and tested (`npm test`: 290+ tests; `npm run e2e` in real Chromium) |
| Runs offline with **mock** agent/messaging | Yes (`AGENT_MODE=mock`, `PHOTON_MODE=mock`, the defaults) |
| **Live Nemotron** agent | **Runs live** on build.nvidia.com (`nvidia/nemotron-3.5-lightning-30b-a3b`, tool calling). Bank-scan deep reviews: 14/14 live in the last two full scans; under rate limiting a review falls back to the basic check (labeled). Calls are paced (`NVIDIA_MIN_GAP_MS`) and 429s retried. Page/message/charge modes use the same loop but were not re-timed against the 8/10-valid target. |
| **Capital One Nessie** | **Live.** `npm run nessie:seed` wrote a demo customer, credit card account, 14 merchants and 20 purchases to the sandbox; each scan mirrors them into `transactions`. Nessie stores whole-dollar amounts (it truncates cents). |
| **Website crawling** | **Live.** Multi-page crawler in TypeScript (robots.txt obeyed, sitemap read, policy/contact/checkout pages prioritized, ≤ 10 pages / 20 s per site), SSRF-guarded on every hop. Registry facts from live RDAP, TLS, DNS (MX) and the Internet Archive. Legit demo merchants are **real public demo shops** (books.toscrape.com, scrapeme.live, automationexercise.com, webscraper.io); scam-pattern merchants are **Bluff's own multi-page websites** served at `<store>.<domain>` and crawled over HTTP like any site. |
| **Message dataset** | Our own **synthetic** set: 306 messages (170 scam / 136 legit, 25 categories, ⅓ hard cases), generated with Nemotron, model-audited, hand-reviewed; red flags verified verbatim. **Not T-Mobile data** (none was provided). It feeds the game; `npm run tmobile:import` can load an external set if one arrives. Not yet used for Eval Claim A. |
| **Live Photon** messaging/calls | Adapters + signed-webhook tests done; **not run against Photon** (needs project, number, confirmed API shapes) |
| **Tiger Data (TimescaleDB)** | Self-hosted TimescaleDB 2.21/pg17 in docker-compose on the VPS. All migrations (hypertable, continuous aggregate + policy) verified on real TimescaleDB 2.31; the compose stack itself is untested until the first VPS build. |
| Deployment (Vultr + domain) | One-command deploy (`bash scripts/deploy/up.sh`) and runbook ready ([DEPLOY.md](DEPLOY.md)); **not deployed** yet (needs the VPS address, DNS and a domain). |
| Eval Claim A (detection) | Pipeline done; measured only on a **synthetic stand-in** with the rules-only path. **Not a result on T-Mobile's data, and not the Nemotron agent.** |
| Eval Claim B (linking) | Measured on 30 synthetic charges; **optimistic by construction** (see caveat below) |

### Claims and measured numbers (from `eval/results.json`, also shown on `/eval`)
- **Claim A, detection.** Bluff beats a baseline on F1 for scam vs. legit on a held-out split. *Measured so far: stand-in dataset, n=21, rules-only verdicts, stand-in baseline.* F1 0.92 vs 0.78 shows the pipeline works and nothing more. Rejected if F1 ≤ baseline on the real T-Mobile set.
- **Claim B, linking.** Bluff's linker (normalized descriptor + trigram/abbreviation/token score + time window) finds the true exposure better than naive substring matching. *Measured: n=20 test charges, F1 1.00 vs 0.96.* The charges were authored by the linker's authors and every positive was checked to be solvable, so treat this as "handles abbreviations and processor prefixes", not as real-world accuracy.

Re-run: `npm run eval:export && python3 scripts/eval/run_linker.py` and `./scripts/eval/run_claim_a.sh` (app running). The Claim A split (`eval/split.json`, seed 42) was committed before any scoring.

## Bank Scan (Capital One Nessie → live scrape → Nemotron)

```
POST /api/scan → Nessie: customers → accounts → purchases (+ merchants) → mirror into transactions (source='nessie')
              → group by merchant website; per merchant (4 at once):
   tier 1  crawl site (≤ 10 pages, robots.txt, sitemap) ‖ RDAP · TLS · MX · Internet Archive → basic check (rules) → site_scans
   tier 2  Nemotron deep review (≤ 3 at once): site_overview → read_page ×N → [fetch_page] → txn_search → submit_verdict
           fallback: the basic check (labeled BASIC CHECK). One SSE stream (/api/scan/:id/stream) carries both tiers.
```

- The website comes from the statement line (`NETFLIX.COM · netflix.com`, `SCRAPEME LIVE · scrapeme.live/shop`); without one, a DNS-checked guess from the merchant name. Bluff's own stores are written `<store>.demo` in Nessie and mapped to `<store>.<BASE_DOMAIN>`.
- The deep review can only read pages of **this transaction's** site (`fetch_page` is same-site, ≤ 3 per review), and page text is treated as untrusted data.
- Run it: `npm run nessie:seed` (once; `-- --reset` replaces the account), then open **/scan** → *Scan my transactions*. *Re-crawl everything* ignores cached crawls (6 h) and deep verdicts (24 h).
- Two tiers: the **basic check** (`lib/scan/basic.ts`) turns crawl + registry facts into findings (each tied to the page it came from) and a score, with no model. The **deep analysis** (Nemotron, `site_overview` → `read_page` → optional `fetch_page` → `txn_search` → `submit_verdict`) reads the pages and reports what rules miss: e.g. on VoltDeals it caught a "Suite 0" address, a 2016 founding claim on a 20-day-old domain, and an implausible $189 console price.

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
1. Done for the bank scan: `NVIDIA_API_KEY`, `NEMOTRON_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b`, `NEMOTRON_THINKING=off`, `AGENT_MODE=live`, `RDAP_ENABLED=1`, `NESSIE_API_KEY`. Still to do: run 10 loops each of page/message/charge mode and time them (target 8/10 valid, p50 < 8 s). `EMBED_MODEL` is unset (taxonomy matching uses the keyword path).
1b. T-Mobile data: `npm run tmobile:import -- <booth file>` (add `--dry-run` first to check the detected columns). For the eval, also point `scripts/eval/load_dataset.py` at it (step 3).
2. Photon project + number + webhook; confirm payload/signature in `lib/photon/webhook.ts` and `lib/photon/live.ts`; `PHOTON_MODE=live`.
3. Real T-Mobile data: edit `scripts/eval/load_dataset.py` and `baseline.py`, regenerate the split, re-run Claim A against the live agent, replace the stand-in numbers.
4. Tiger Data: migrate and confirm `bluff_meta.agg_mode = timescale`.
5. Deploy per [DEPLOY.md](DEPLOY.md); run `npm run prewarm`.

## Sponsor usage
- **NVIDIA Nemotron:** multi-step tool-calling agent (plans, calls up to 10 tools including a live web scraper and RDAP, validates, repairs, streams its trace), run once per merchant across a whole bank statement; also annotates red flags in the T-Mobile message set.
- **Capital One Nessie:** the bank feed. Customers, accounts, merchants and purchases come from Nessie; every scanned charge links to its dispute builder.
- **T-Mobile Safe Signal:** prevention (checkout guard), real-time protection (charge linking, bank scan, alerts), education (daily game built from the T-Mobile message set and the user's own scan), detection measured against a baseline, privacy by design, synthetic data only.
- **Photon:** iMessage alerts and two-way forward-to-check with reply commands; voice call for the highest-risk charge (stretch).
- **Tiger Data:** `transactions` hypertable + `merchant_daily` continuous aggregate (price drift, sparkline) + `pg_trgm` descriptor matching.
- **Vultr / GoDaddy Registry:** hosting and domain (see DEPLOY.md).

## Known limitations
- The demo charge is dated a few days after the exposure to show the link; the UI labels it *Simulated*.
- One shared demo user ("Maya"): *Delete everything* resets the demo for everyone.
- Real-RDAP domain age is behind `RDAP_ENABLED=1` and untested against live RDAP; demo stores use a mock registry.
- Not built (cut order): leaderboard, screenshot forwarding, PDF export.
