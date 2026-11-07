# DEPLOY.md: Bluff on Vultr (runbook)

What is automated: everything in this repo. What needs a person (credentials, accounts, DNS): the steps marked **[you]**.
Nothing here was run against Vultr, Tiger Data, Photon or NVIDIA from the build environment; the container image was not built
either (no Docker daemon there). What *was* verified: `docker compose config`, the generated Caddyfile, and the exact runtime
layout the Dockerfile produces (standalone server + fixtures + stores + migrations) booted in production mode against Postgres.

## 0. Accounts and keys **[you]**
| Need | Where | Goes in `.env` |
|---|---|---|
| Domain | GoDaddy Registry (MLH track) | `BASE_DOMAIN=<domain>` (app = `bluff.<domain>`, stores = `<store>.<domain>`) |
| VM | Vultr, Ubuntu, 2 vCPU / 4 GB | n/a |
| Database | Tiger Data service (TLS) | `DATABASE_URL=postgres://…?sslmode=require` |
| Nemotron | build.nvidia.com (NIM, OpenAI-compatible) | `NVIDIA_API_KEY`, `NEMOTRON_MODEL`, `NEMOTRON_SMALL_MODEL`, `EMBED_MODEL` **[verify IDs/limits]** |
| Photon | app.photon.codes, promo `HACKWITHPHOTON` | `PHOTON_PROJECT_SECRET`, `PHOTON_WEBHOOK_SECRET`, `PHOTON_NUMBER`, `PHOTON_API_BASE`, `DEMO_USER_PHONE` **[verify send/webhook shape]** |
| Secrets | generate | `SESSION_SECRET`, `DEMO_KEY`, `EVAL_KEY` (long random strings) |

## 1. DNS **[you]**
A records to the Vultr IP for: `bluff`, `fastkicks-shop`, `deliveryfix-help`, `tollpay-tx`, `bayou-bakery`, `northloop-books`, `campus-tech`, `lonestar-tickets`, `greenleaf-grocer` (explicit names, so Caddy uses normal HTTP-01 certs; no wildcard certificate needed).

## 2. Server
```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/Sithranjan-Suresh/bluff && cd bluff
cp .env.example .env && $EDITOR .env      # set AGENT_MODE=live, PHOTON_MODE=live, DEMO_MODE=1 and the values above
node scripts/deploy/gen-caddyfile.mjs     # only if the store list changed (a test fails when it is stale)
docker compose --profile tools run --rm tools npm run db:migrate
docker compose --profile tools run --rm tools npm run db:seed
docker compose up -d --build
```
**Tiger Data notes:** migration `002/003` use `timescaledb` (hypertable + continuous aggregate) when the extension is available and
fall back to a materialized view otherwise; `bluff_meta.agg_mode` records which. The Timescale branch is **untested** (no
timescaledb locally): after migrating, run `select value from bluff_meta where key='agg_mode'` (expect `timescale`) and
`select count(*) from merchant_daily`. pgvector is not required: taxonomy embeddings are stored as `float8[]`.

## 3. Wire up Photon **[you]**
Register `https://bluff.<domain>/api/webhooks/photon` as the inbound webhook, copy the signing secret to `PHOTON_WEBHOOK_SECRET`.
If Photon's signature header is not `x-photon-signature`, set `PHOTON_SIGNATURE_HEADER`. If its payload or send shape differs from
what `lib/photon/webhook.ts` and `lib/photon/live.ts` assume, those two files are the only places to change.

## 4. Smoke test (do it on a phone over cellular)
1. `https://bluff.<domain>/api/health` → `{"ok":true,"db":true,"agentMode":"live","photonMode":"live"}`
2. `/check` → tap `fastkicks-shop` → verdict streams → *Continue and watch my charges* → your phone gets the iMessage alert.
3. *Simulate a charge from this store* → linked-charge card → *Build dispute*.
4. Text the Bluff number a scam message → verdict reply in < 15 s. Reply `WATCH`, `HELP`.
5. `/play` (5 cards, share), `/eval` loads, `/privacy` → *Delete everything* works.
6. Presenter: open `https://bluff.<domain>/demo?key=<DEMO_KEY>` once on the demo laptop (unlocks demo controls and the reset button).
7. Install the extension (below) and open `https://fastkicks-shop.<domain>`: the panel should slide in.

## 5. Pre-warm (before judging)
```bash
docker compose --profile tools run --rm tools npm run prewarm
```
Runs the 8 demo hosts and the signature charge once (caches verdicts, saves the replay trace), then resets the demo user.
Every minute during judging, a cheap `GET /api/health` keeps the app warm; the first model call wakes the NIM endpoint.

## 6. Chrome extension (unpacked, demo laptop)
```bash
BLUFF_APP_URL=https://bluff.<domain> npm run ext:build   # → extension/dist
```
`chrome://extensions` → Developer mode → *Load unpacked* → `extension/dist`. The content script runs everywhere but stays idle until a card/CVV/password/SSN/phone/DOB/address field appears; it never reads input values.

## Operations
- Reset between demos: `docker compose --profile tools run --rm tools npm run db:reset` (or the *Reset demo* button with `?demo=1`).
- Logs: `docker compose logs -f web`. Messages that failed to send show *Text not delivered* in the phone preview.
- Fallbacks if a sponsor is down: the agent falls back to rules-only ("basic check") and charge runs replay the last good trace (labeled *replayed*). `AGENT_MODE=mock` / `PHOTON_MODE=mock` run everything offline.
