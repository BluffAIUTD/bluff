# Bluff

**Bluff checks the website behind every charge on your card, connects it to the site where you typed your card, and helps you get your money back.** *Call their bluff.*

HackUTD 2026: ZeroDay · T-Mobile Safe Signal · NVIDIA Nemotron · Capital One Nessie · Virality · MLH (Tiger Data, Vultr, GoDaddy Registry)

Scams don't happen when you click. They show up days later on your statement. Existing tools each see one slice: a site rater sees
the page, a bank sees the charge, a text filter sees the message. Bluff is a scam co-pilot **with memory**:

1. **Bank Scan** (`/scan`): pulls your recent card transactions from **Capital One's Nessie API**, **crawls the website behind every
   charge** (up to 10 pages: refunds, terms, contact, about, checkout…), runs a rules-only **basic check**, then a **Nemotron** agent
   does a **deep analysis** of the pages and writes a cited report. Both tiers stream live, per merchant.
2. **Checkout Guard** (Chrome extension + `/check`): the moment a page asks for your card or personal info, Bluff crawls the site's public pages and a Nemotron agent reviews the scraped pages (plus registry facts and a rules check), rates the site and logs the exposure.
3. **Charge Watch + Refund Builder** (`/charges`): when a charge posts, the linker ties it back to the exposure and the agent drafts a dispute letter, evidence timeline and next steps. *Drafts only; Bluff never files or sends anything.*
4. **Call the Bluff** (`/play`): a 60-second daily game on the same red flags the detector uses. It mixes messages from our own
   306-message synthetic scam/legit set (`data/messages`) with one card built from *your own* bank scan.

Alerts for risky sites and linked charges arrive as texts on the user's **T-Mobile phone** (the phone view in the top bar), where they can also forward a suspicious message to Bluff or reply `WATCH` / `DISPUTE` / `SAFE` / `STOP` / `HELP`. Delivery is in-app; no SMS gateway is connected.

Everything runs on **synthetic data**: the bank customer is a Nessie sandbox account, and Bluff's own demo stores are labeled *Demo store, not real*.

## Honest status

| Area | State |
|---|---|
| Bank scan, checkout guard, charge linking, refund builder, game, dashboard, extension, storefronts, API, DB | Built and tested (`npm test`: 330+ tests; `npm run e2e` in real Chromium) |
| Runs offline with a **mock** agent | Yes (`AGENT_MODE=mock`: committed fixtures and the rules-only path) |
| **Live Nemotron** agent | **Runs live** on build.nvidia.com (`nvidia/nemotron-3.5-lightning-30b-a3b`, tool calling). Bank-scan deep reviews: 14/14 live in the last two full scans; under rate limiting a review falls back to the basic check (labeled). Calls are paced (`NVIDIA_MIN_GAP_MS`) and 429s retried. Every website evaluation now sends the scraped site to Nemotron in its first request (`website_data`: registry facts, the basic check and each crawled page's text, ≈14k chars); page checks (`/check` links, the extension) crawl the site first (≤ 8 pages, 10 s, reused for 6 h). This request shape is covered by tests against a stub model but **not yet re-timed live**; the 14/14 figure is from the earlier tool-call-only flow. Page/message/charge modes were not re-timed against the 8/10-valid target. |
| **Capital One Nessie** | **Live.** `npm run nessie:seed` wrote a demo customer, credit card account, 14 merchants and 20 purchases to the sandbox; each scan mirrors them into `transactions`. Nessie stores whole-dollar amounts (it truncates cents). |
| **Website crawling** | **Live.** Multi-page crawler in TypeScript (robots.txt obeyed, sitemap read, policy/contact/checkout pages prioritized, ≤ 10 pages / 20 s per site), SSRF-guarded on every hop. Registry facts from live RDAP, TLS, DNS (MX) and the Internet Archive. Legit demo merchants are **real public demo shops** (books.toscrape.com, scrapeme.live, automationexercise.com, webscraper.io); scam-pattern merchants are **Bluff's own multi-page websites** served at `<store>.<domain>` and crawled over HTTP like any site. |
| **Message dataset** | Our own **synthetic** set: 306 messages (170 scam / 136 legit, 25 categories, ⅓ hard cases), generated with Nemotron, model-audited, hand-reviewed; red flags verified verbatim. **Not T-Mobile data** (none was provided). It feeds the game; `npm run tmobile:import` can load an external set if one arrives. Not yet used for Eval Claim A. |
| **Tiger Data (TimescaleDB)** | Self-hosted TimescaleDB 2.21/pg17 in docker-compose on the VPS. All migrations (hypertable, continuous aggregate + policy) verified on real TimescaleDB 2.31; the compose stack itself is untested until the first VPS build. Local dev uses plain Postgres (same schema, materialized-view fallback). |
| Deployment (Vultr + domain) | One-command deploy (`bash scripts/deploy/up.sh`) and runbook ready ([DEPLOY.md](DEPLOY.md)); **not deployed** yet (needs the VPS address, DNS and a domain). |
| Eval Claim A (detection) | Pipeline done; measured only on a **synthetic stand-in** with the rules-only path. **Not a result on T-Mobile's data, and not the Nemotron agent.** |
| Eval Claim B (linking) | Measured on 30 synthetic charges; **optimistic by construction** (see caveat below) |

### Claims and measured numbers (from `eval/results.json`, also shown on `/eval`)
- **Claim A, detection.** Bluff beats a baseline on F1 for scam vs. legit on a held-out split. *Measured so far: stand-in dataset, n=21, rules-only verdicts, stand-in baseline.* F1 0.92 vs 0.78 shows the pipeline works and nothing more.
- **Claim B, linking.** Bluff's linker (normalized descriptor + trigram/abbreviation/token score + time window) finds the true exposure better than naive substring matching. *Measured: n=20 test charges, F1 1.00 vs 0.96.* The charges were authored by the linker's authors and every positive was checked to be solvable, so treat this as "handles abbreviations and processor prefixes", not as real-world accuracy.

Re-run: `npm run eval:export && python3 scripts/eval/run_linker.py` and `./scripts/eval/run_claim_a.sh` (app running). The Claim A split (`eval/split.json`, seed 42) was committed before any scoring.

## Bank Scan (Capital One Nessie → crawl → Nemotron)

```
POST /api/scan → Nessie: customers → accounts → purchases (+ merchants) → mirror into transactions (source='nessie')
              → group by merchant website; per merchant (4 at once):
   tier 1  crawl site (≤ 10 pages, robots.txt, sitemap) ‖ RDAP · TLS · MX · Internet Archive → basic check (rules) → site_scans
   tier 2  Nemotron deep review (≤ 3 at once): website_data (registry + basic check + every page's text) in the first request
           → [read_page for full text] → [fetch_page] → txn_search → submit_verdict
           fallback: the basic check (labeled BASIC CHECK). One SSE stream (/api/scan/:id/stream) carries both tiers.
```

- The website comes from the statement line (`NETFLIX.COM · netflix.com`, `SCRAPEME LIVE · scrapeme.live/shop`); without one, a DNS-checked guess from the merchant name. Bluff's own stores are written `<store>.demo` in Nessie and mapped to `<store>.<BASE_DOMAIN>`.
- The deep review can only read pages of **this transaction's** site (`fetch_page` is same-site, ≤ 3 per review), and page text is treated as untrusted data.
- Two tiers: the **basic check** (`lib/scan/basic.ts`) turns crawl + registry facts into findings (each tied to the page it came from) and a score, with no model. The **deep analysis** (Nemotron; the crawl's `website_data` goes in the first request, then optional `read_page` / `fetch_page` → `txn_search` → `submit_verdict`) reads the pages and reports what rules miss: e.g. on VoltDeals it caught a "Suite 0" address, a 2016 founding claim on a 20-day-old domain, and an implausible $189 console price.
- Run it: `npm run nessie:seed` (once; `-- --reset` replaces the account), then open **/scan** → *Scan my transactions*. *Re-crawl everything* ignores cached crawls (6 h) and deep verdicts (24 h).

## Architecture

```
Chrome extension ─┐                                         ┌─ Nemotron (build.nvidia.com, tool calling)
Phone / laptop ───┴─► Next.js 15 (App Router, Node) ────────┼─ Capital One Nessie (accounts, merchants, purchases)
                       /api/*  SSE                          ├─ Merchant websites (guarded crawler) + RDAP / TLS / DNS / Internet Archive
                       lib/scan · lib/agent · lib/linker    └─ TimescaleDB: hypertable, continuous aggregate, pg_trgm
```

- **One agent, one Exposure Log, one database, one design system.** The agent returns a single `Verdict` schema everywhere; confidence is computed from signal agreement, not self-reported.
- **Linker** (`lib/linker`): normalize descriptor (strip `SQ *`, `PAYPAL *`, `TST*`…) → candidates 0–45 days *after* an exposure → name score (trigram, abbreviation `fkshp ⊂ fastkicks-shop`, token overlap) → ×0.7 + time ×0.3 (+0.1 if watched) → threshold 0.55. The agent confirms; it can never invent a link.
- **Never-blank fallbacks:** live → cached → replayed (last successful trace, labeled) → rules-only "basic check". Every result shows its mode.
- **Privacy:** the extension never reads input values or page text (enforced by tests); only the domain, field *types* and yes/no signals leave the page. With the live agent on, Bluff's server crawls the site's *public* pages itself (homepage first, never the user's URL path or query; never submits forms) and sends that text to Nemotron (`PAGE_CRAWL=0` turns this off for page checks). Texts forwarded from the phone are discarded after the verdict.

```
app/ (UI + API)   components/   lib/{scan,agent,linker,rules,nessie,db,client}   extension/ (MV3)
stores/ (demo storefronts: 5 multi-page scam sites + 5 legit)   data/{messages,nessieSeed.ts}   db/migrations/
scripts/{seed,nessie,stores,eval,deploy}   eval/   fixtures/runs/   e2e/
```

## Run it locally

Needs Node 22 and Postgres 16 (`scripts/db/local-pg.sh start` starts a throwaway one).

```bash
npm install
cp .env.example .env              # AGENT_MODE=mock needs no keys; add NVIDIA_API_KEY + NESSIE_API_KEY for the live scan
npm run db:migrate && npm run db:seed
npm run nessie:seed               # once per Nessie key: demo customer, account, merchants, purchases
npm run dev                       # http://localhost:3000/scan   (add ?demo=1 on /charges for presenter controls)
```

Demo storefronts are served at `http://<store>.localhost:3000` (e.g. `http://voltdeals-outlet.localhost:3000`).

Try it: **/scan** → *Scan my transactions* → pick VoltDeals → compare the basic check with the deep analysis. Then **/check** → tap `fastkicks-shop` → *Continue and watch my charges* → *Simulate a charge from this store* → *Build dispute*.

```bash
npm test               # unit + integration (needs local Postgres)
npm run e2e            # real-Chromium core loop + all routes at 390px and 1280px (app must be running; E2E_BASE=…)
npm run eval:test      # Python metric tests
npm run stores:build   # regenerate the demo storefront websites
BLUFF_APP_URL=http://localhost:3000 npm run ext:build   # extension → extension/dist (Load unpacked)
npm run demo:script    # pitch script with the real numbers and warnings
```

## Going live (checklist)
1. Done: `NVIDIA_API_KEY`, `NEMOTRON_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b`, `NEMOTRON_THINKING=off`, `AGENT_MODE=live`, `RDAP_ENABLED=1`, `NESSIE_API_KEY`. Still to do: run 10 loops each of page/message/charge mode and time them (target 8/10 valid, p50 < 8 s).
2. Deploy per [DEPLOY.md](DEPLOY.md): DNS for `bluff` and each store host, then `bash scripts/deploy/up.sh` on the VPS (expects `agg_mode=timescale` in its output).
3. Run one full bank scan on the deployed site before judging; it caches crawls and deep verdicts.
4. Optional: point Eval Claim A at `data/messages/bluff-messages.jsonl` and re-run it against the live agent.

## Sponsor usage
- **NVIDIA Nemotron:** multi-step tool-calling agent (plans, reads crawled pages, fetches more when needed, checks payment history, validates and repairs its verdict, streams its trace), run once per merchant across a whole bank statement; also generated and audited the message dataset.
- **Capital One Nessie:** the bank feed. Customers, accounts, merchants and purchases come from Nessie; every scanned charge links to its dispute builder.
- **T-Mobile Safe Signal:** prevention (checkout guard), real-time protection (bank scan, charge linking), education (daily game built from our synthetic message set and the user's own scan), detection measured against a baseline, privacy by design, synthetic data only.
- **Tiger Data:** self-hosted TimescaleDB: `transactions` hypertable + `merchant_daily` continuous aggregate (price drift, sparkline) + `pg_trgm` descriptor matching.
- **Vultr / GoDaddy Registry:** hosting and domain (see DEPLOY.md).

## Known limitations
- The crawler reads server-rendered HTML; sites that build their pages in JavaScript show little text, and the check leans on registry facts (labeled).
- A full scan of 14 merchants takes about 2–3 minutes because Nemotron calls are paced for the trial key's rate limit; basic checks appear within seconds.
- The demo charge on `/check` is dated a few days after the exposure to show the link; the UI labels it *Simulated*.
- One shared demo user ("Maya"): *Delete everything* resets the demo for everyone.
- Not built (cut order): leaderboard, screenshot forwarding, PDF export.
