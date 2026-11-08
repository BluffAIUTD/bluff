# Bluff

**Bluff watches your card.** It pulls every charge from your bank (Capital One's Nessie API), crawls the website behind
each one, has an NVIDIA Nemotron agent read those pages like an investigator, and when a charge looks like a scam it
texts your T-Mobile phone and drafts the dispute. *Call their bluff.*

Live: **https://bluffai.us** · HackUTD 2026: T-Mobile Safe Signal · NVIDIA Nemotron · Capital One Nessie · MLH (Tiger Data, Vultr, GoDaddy Registry)

Scams don't happen when you click. They show up days later on your statement. A site rater sees the page, a bank sees
the charge, a text filter sees the message, and the victim has to connect them alone. Bluff connects them.

## What it does

1. **Card watch** (`/scan`, the core). Bluff imports the card's transactions from **Capital One Nessie**, groups them by
   merchant website and, for each one, crawls up to 10 pages (refunds, terms, contact, about, checkout…), runs an instant
   rules check, then a **Nemotron tool-calling agent** reads the pages and writes a cited verdict. While `/scan` is open it
   **checks the card every 20 s**: a purchase posted to Nessie from anywhere (the built-in *Make a test purchase* panel,
   Postman, another device) is picked up, scanned on its own and texted to the phone within about 30 s.
2. **Safe Signal on your T-Mobile phone** (the phone in the top bar). Risky charges arrive as texts with reply chips:
   **DISPUTE** drafts a dispute packet from the site evidence, **HOLD** puts a Safe Signal hold on the card (simulated: Bluff
   declines new test purchases before they reach Nessie, which has no card-lock endpoint), **SAFE** trusts the merchant.
   The *Messages* tab holds synthetic incoming texts; **Report to Bluff** checks one, discards the body, and if it was a scam
   with a link Bluff remembers the site, so a later charge from it is tied back to the text.
3. **Check a site before you pay** (`/check` and the **Checkout Guard** Chrome extension, installable from
   [`/extension`](https://bluffai.us/extension)). Same crawler and Nemotron review, before the charge exists. If you continue
   anyway, Bluff remembers the site and links the later charge to it.
4. **Dispute builder** (`/charges/:id`). A letter, an evidence timeline (the charge, the site check with page links, the
   alert, any linked exposure or reported text) and next steps. *Bluff drafts; it never files or sends anything.*
5. **Call the Bluff** (`/play`), a daily game: the same five messages for everyone each day (easy → hard), call *Legit* or
   *Bluff!*, then tap the word that gave it away. Answers lock, progress resumes, streaks, stats, a countdown and a
   spoiler-free share grid. After the daily five, a bonus card comes from **your own** bank scan.

Everything runs on **synthetic data**: the bank customer is a Nessie sandbox account, scam-pattern stores are Bluff's own
labeled demo websites, and the messages are Bluff's own synthetic set (**not T-Mobile data**; none was provided).

## The core loop, live

```
Nessie: customer → card → purchases ──► mirror into transactions (per visitor; test purchases are tagged to the visitor who made them)
  │  every 20 s while /scan is open: new purchases → partial scan of just that merchant
  ▼
per merchant website (4 at a time)
  tier 1  crawl (≤ 10 pages / 20 s; robots.txt read for its sitemap; pages it hides are read anyway because the user asked,
          and noted; JavaScript-only pages rendered in a sandboxed headless Chromium) ‖ RDAP · TLS · DNS · Internet Archive
          → basic check (rules, every finding names its page)
  tier 2  Nemotron agent: website_data in the first request → read_page / fetch_page (same site only) → txn_search → submit_verdict
  ▼
Safe Signal: one summary text per full scan, one text per risky new charge → DISPUTE / HOLD / SAFE → dispute packet
```

## Honest status

| Area | State |
|---|---|
| Deployment | **Live at https://bluffai.us** on a Vultr VPS (Docker: Next.js, Caddy, headless Chromium renderer), database on **Tiger Cloud (TimescaleDB)**. `bluff.bluffai.us` redirects to the apex. |
| Capital One Nessie | **Live.** Reads customer, card and purchases; writes test purchases from the *Make a test purchase* panel. Nessie stores whole dollars and has no purchase delete, so test purchases stay in the sandbox (hidden from other visitors). |
| Nemotron | **Live** (`nvidia/nemotron-3.5-lightning-30b-a3b`, tool calling; `nvidia/nemotron-3.5-embed-1b` for taxonomy matching). On a full live scan of the 14 demo merchants, all 14 got a Nemotron verdict; under rate limits a review falls back to the basic check and is labeled BASIC CHECK. |
| T-Mobile phone | **In-app only.** Texts are delivered to the phone preview; no SMS gateway is connected. The Safe Signal hold is **simulated**. |
| Message detection (Claim A) | Measured on a held-out 30% split (n = 91, seed 42, committed before tuning) of Bluff's own 306-message **synthetic** set, generated with Nemotron. **Not T-Mobile data, not a result on real traffic.** See below. |
| Charge linking (Claim B) | n = 20 synthetic charges authored by the team; **optimistic by construction**. |
| Chrome extension | Builds and installs from `/extension` (zip built for the live site in the Docker image). Tested in jsdom and with the real build output; **untested** in a real Chrome profile beyond loading. |
| Tests | `npm test`: 514 unit/integration tests. `npm run e2e`: 128 real-Chromium checks (core loop, every route at 390 px and 1280 px, the daily game). |
| Not built | real SMS delivery, a real card lock, leaderboards, PDF export. Real T-Mobile assets (message set, taxonomy, baseline) were **not deployed** here because we never received them; the importers (`npm run tmobile:import`) are ready. |

### Measured numbers (`eval/results.json`, also on `/eval`)

Held-out test split, n = 91 (51 scam / 40 legit), positive class = scam:

| Method | Precision | Recall | F1 | Accuracy |
|---|---|---|---|---|
| Stand-in baseline: "contains a link → scam" (*not T-Mobile's baseline*) | 0.95 | 0.41 | 0.58 | 0.66 |
| Bluff rules only, before this round of work | 0.72 | 0.67 | 0.69 | 0.67 |
| Bluff rules only, now | 0.94 | 0.86 | 0.90 | 0.89 |
| **Bluff live (Nemotron agent, rules fallback)** | 0.88 | 0.98 | **0.93** | 0.91 |

- Live run: 88/91 verdicts from Nemotron, 3 fell back to rules; latency p50 4.1 s, p95 7.2 s (calls paced for the trial key).
- Confidence is computed server-side from signal agreement, never the model's self-report; expected calibration error 0.066 (rules) / 0.079 (live) on the test split. One weak signal reads under 70 %.
- The tuned rules score F1 1.00 on the train split; only the test numbers mean anything. n per category is small (3 scam or 5 legit).
- This is a synthetic stand-in for T-Mobile's set: treat it as "the pipeline works and is honest about it", nothing more.

## Architecture

```
Chrome extension ─┐                                          ┌─ NVIDIA Nemotron (build.nvidia.com: chat + tool calling, embeddings)
Phone / laptop ───┴─► Next.js 15 (App Router, Node) ─────────┼─ Capital One Nessie (customers, accounts, merchants, purchases)
                      /api/*  SSE   lib/{scan,agent,linker,  ├─ Merchant websites: guarded crawler + headless Chromium (browserless)
                      nessie,messaging,rules,safesignal}     ├─ RDAP / TLS / DNS / Internet Archive
                                                             └─ Tiger Cloud TimescaleDB: hypertable, continuous aggregate, pg_trgm
```

- **One agent, one verdict schema, one database.** Every result shows its mode: live, cached, replayed or basic check.
- **Linker** (`lib/linker`): normalize descriptor (strip `SQ *`, `PAYPAL *`, `TST*`…) → candidates 0–45 days after an
  exposure or a reported scam text → trigram / abbreviation / token score + time → threshold 0.55. The agent confirms; it can never invent a link.
- **Crawler safety:** public addresses only (checked at connect time on every redirect hop), no forms submitted, ≤ 10 pages
  / 20 s per site. The headless renderer runs in its own container and subnet; the host firewall drops any new connection
  from it to private, loopback, CGNAT or link-local (cloud metadata) ranges (`scripts/deploy/render-firewall.sh`).
- **Privacy:** reported or forwarded texts are sent to Nemotron for the verdict and then discarded; agent traces keep only
  tool names, hosts, categories and counts. A scam link keeps only its host. The extension sends only the site's origin,
  the kinds of fields on the page and yes/no signals, never what you type. Each browser gets its own private demo account
  (signed cookie); *Delete everything* on `/privacy` wipes it.

```
app/ (UI + API)  components/  lib/{scan,agent,linker,rules,nessie,messaging,db}  extension/ (MV3)  stores/ (10 demo sites)
data/{messages,taxonomy.ts,scamTexts.ts,nessieSeed.ts}  db/migrations/  scripts/{seed,nessie,eval,deploy}  eval/  e2e/
```

## Demo (2 minutes)

1. **/scan → Scan my transactions.** Basic checks land in seconds; Nemotron verdicts stream in. Five fake stores hiding in
   Maya's statement are flagged. The phone (top bar) gets one summary text.
2. **Make a test purchase → VoltDeals → Charge the card.** A real Nessie purchase; Bluff spots it, a fresh Nemotron review
   streams, and a text arrives: *"New charge: $189 at VOLTDEALS OUTLET … looks like a scam (15/100) … Reply DISPUTE, HOLD or SAFE."*
3. Tap **HOLD**, try another purchase: *Declined (simulated)*. Tap **DISPUTE**: the dispute packet with page-linked evidence.
4. Phone → **Messages** → *Report to Bluff* on the toll text; then charge TollPay: the alert says it matches the text you reported.
5. **/check** a store, **/extension**, **/play** (tap the giveaway, share grid), **/eval** (the table above), **/privacy**.

## Run it locally

Needs Node 22 and Postgres 16 (`scripts/db/local-pg.sh start` starts a throwaway one).

```bash
npm install
cp .env.example .env              # AGENT_MODE=mock needs no keys; add NVIDIA_API_KEY + NESSIE_API_KEY for the live scan
npm run db:migrate && npm run db:seed
npm run nessie:seed               # once per Nessie key: demo customer, card, merchants, purchases
npm run dev                       # http://localhost:3000/scan
```

Demo storefronts are served at `http://<store>.localhost:3000`. Headless rendering needs `RENDER_URL` (docker-compose runs it).

```bash
npm test               # unit + integration (needs local Postgres)
npm run e2e            # real Chromium: core loop + every route at 390px and 1280px (app must be running; E2E_BASE=…)
npm run eval:test      # Python metric tests
npx tsx scripts/eval/claim_a.ts --reuse-live   # re-score Claim A from the committed live answers
BLUFF_APP_URL=http://localhost:3000 npm run ext:zip   # Checkout Guard zip
```

Deploying: [DEPLOY.md](DEPLOY.md) (`bash scripts/deploy/up.sh` on the VPS).

## Sponsor usage

- **T-Mobile Safe Signal:** detection is one piece. Around it: real-time protection (the card watcher), safeguards (HOLD,
  DISPUTE, SAFE from a text), prevention (check a site / Checkout Guard before paying), memory (a reported scam text links
  to the later charge), education (the daily game), honest confidence (server-computed, calibrated, labeled by mode) and
  privacy by design (bodies discarded, origin-only extension, per-visitor accounts). Synthetic data only.
- **NVIDIA Nemotron:** a multi-step tool-calling agent per merchant across a whole statement (reads the crawl, fetches more
  pages when needed, checks payment history, validates and repairs its verdict, streams its trace), embeddings for taxonomy
  matching, and the generator of the synthetic message set and daily lookalike game cards.
- **Capital One Nessie:** the bank feed (customers, accounts, merchants, purchases), live test purchases written back to
  Nessie, and per-visitor scoping of a shared sandbox account.
- **Tiger Data:** TimescaleDB on Tiger Cloud: `transactions` hypertable, `merchant_daily` continuous aggregate (price history), `pg_trgm` descriptor matching.
- **Vultr / GoDaddy Registry:** hosting and the `bluffai.us` domain.

## Known limitations

- A full scan of 14 merchants takes about 1–2 minutes because Nemotron calls are paced for the trial key; basic checks appear within seconds.
- Scan jobs, the watcher's throttle and rate limits are in memory: one web process.
- The `/check` "Simulate a charge" button posts a scripted local charge (labeled *Simulated*); the *Make a test purchase* panel on `/scan` is the real Nessie path.
- Site checks are shared between visitors for 6 h (crawls) and 24 h (verdicts), labeled "reused a recent Bluff check"; *Re-crawl everything* forces fresh ones.
