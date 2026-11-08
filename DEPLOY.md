# DEPLOY.md: Bluff on Vultr (runbook)

Everything runs on **one Vultr VPS** with Docker: `db` (self-hosted **TimescaleDB**, Tiger Data's open-source Postgres),
`web` (Next.js), `caddy` (HTTPS for the app and the demo storefront websites) and an optional nightly `backup`.
What needs a person (DNS, secrets, SSH): the steps marked **[you]**.

Verified so far: all migrations (hypertable, continuous aggregate + refresh policy, pg_trgm) applied cleanly on real TimescaleDB 2.31
(a Tiger Cloud trial instance, used only as a test target), and `merchant_daily` materialized. Live: Nemotron, Capital One Nessie,
RDAP/Internet Archive lookups, crawling of real sites. **Not yet run on the VPS:** the container image has not been built here
(no Docker on the dev machine), so `bash scripts/deploy/up.sh` on the server is the first real build.

## 0. Accounts and keys **[you]**
| Need | Where | Goes in `.env` |
|---|---|---|
| Domain | GoDaddy Registry (MLH track) | `BASE_DOMAIN=<domain>` (app = `bluff.<domain>`, stores = `<store>.<domain>`) |
| VM | Vultr VPS, Ubuntu 22.04/24.04, 2 vCPU / 4 GB, SSH access | n/a |
| Database | self-hosted TimescaleDB in docker-compose (no account needed) | `POSTGRES_PASSWORD` (long random); compose builds `DATABASE_URL` |
| Nemotron | build.nvidia.com | `NVIDIA_API_KEY`, `NEMOTRON_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b`, `NEMOTRON_THINKING=off`, `AGENT_MODE=live`, `RDAP_ENABLED=1` |
| Capital One | Nessie API key | `NESSIE_API_KEY` (the demo customer/account/purchases already exist in the sandbox) |
| Secrets | generate | `SESSION_SECRET`, `DEMO_KEY`, `EVAL_KEY` (long random strings) |

## 1. DNS **[you]**
A records to the VPS IP for: `bluff`, `fastkicks-shop`, `deliveryfix-help`, `tollpay-tx`, `voltdeals-outlet`, `cinevault-trial`, `bayou-bakery`, `northloop-books`, `campus-tech`, `lonestar-tickets`, `greenleaf-grocer` (explicit names, so Caddy uses normal HTTP-01 certs; no wildcard certificate needed).
The bank scan crawls the scam storefronts at `https://<store>.<domain>` over the public internet, exactly like any other merchant site.

## 2. Server (over SSH)
```bash
# firewall: only SSH and web
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw --force enable
curl -fsSL https://get.docker.com | sh
git clone https://github.com/Sithranjan-Suresh/bluff && cd bluff
cp .env.example .env && $EDITOR .env      # BASE_DOMAIN, POSTGRES_PASSWORD, SESSION_SECRET, DEMO_KEY, EVAL_KEY, ACME_EMAIL, keys above
bash scripts/deploy/up.sh                 # build → TimescaleDB up → migrate → seed → web + caddy → nightly backups → checks
```
`up.sh` is safe to re-run (it is also the update command after `git pull`). It ends by printing `agg_mode=timescale`,
`hypertables=1`, `continuous_aggregates=1` and the health JSON.

**TimescaleDB notes:** the database container is `timescale/timescaledb:2.21.3-pg17` with a named volume (`pgdata`) and no
published port: only `web`/`tools` reach it on the private compose network. `transactions` is a hypertable (7-day chunks) and
`merchant_daily` a continuous aggregate refreshed every 5 minutes (and on demand after each Nessie sync). Backups:
`./backups/bluff-YYYY-MM-DD.dump` (7 kept); restore with
`docker compose exec -T db pg_restore -U bluff -d bluff --clean < backups/<file>.dump`.
For a psql shell: `docker compose exec db psql -U bluff -d bluff`.

## 3. Smoke test (do it on a phone over cellular)
1. `https://bluff.<domain>/api/health` → `{"ok":true,"db":true,"agentMode":"live"}`
2. `/check` → tap `fastkicks-shop` → verdict streams → *Continue and watch my charges* → the alert appears in the T-Mobile phone preview (top bar).
3. *Simulate a charge from this store* → linked-charge card → *Build dispute*.
4. In the phone preview, forward a scam message to Bluff → verdict reply in < 15 s. Reply `WATCH`, `HELP`.
5. `/play` (5 cards, share), `/eval` loads, `/privacy` → *Delete everything* works.
6. Presenter: open `https://bluff.<domain>/demo?key=<DEMO_KEY>` once on the demo laptop (unlocks demo controls and the reset button).
7. Install the extension (below) and open `https://fastkicks-shop.<domain>`: the panel should slide in.

## 4. Pre-warm (before judging)
```bash
docker compose --profile tools run --rm tools npm run prewarm
```
Runs the demo hosts and the signature charge once (caches verdicts, saves the replay trace), then resets the demo user.
Every minute during judging, a cheap `GET /api/health` keeps the app warm; the first model call wakes the NIM endpoint.

## 5. Chrome extension (unpacked, demo laptop)
```bash
BLUFF_APP_URL=https://bluff.<domain> npm run ext:build   # → extension/dist
```
`chrome://extensions` → Developer mode → *Load unpacked* → `extension/dist`. The content script runs everywhere but stays idle until a card/CVV/password/SSN/phone/DOB/address field appears; it never reads input values.

## Bank scan before judging
Open `https://bluff.<domain>/scan` → *Scan my transactions*. The first scan crawls every merchant site and runs the Nemotron deep
reviews (about 2–3 minutes for 14 merchants at the default pacing; the basic check for every site appears within seconds).
Later scans reuse crawls younger than 6 hours and deep verdicts younger than 24 hours; *Re-crawl everything* forces fresh ones.
`NVIDIA_MIN_GAP_MS` (default 1600) paces Nemotron calls to stay under the trial key's rate limit.

## Operations
- Reset between demos: `docker compose --profile tools run --rm tools npm run db:reset` (or the *Reset demo* button with `?demo=1`).
- Logs: `docker compose logs -f web`. Alerts and replies are stored in-app and shown in the phone preview.
- Fallbacks if a sponsor is down: the agent falls back to rules-only ("basic check") and charge runs replay the last good trace (labeled *replayed*). `AGENT_MODE=mock` runs everything offline.
