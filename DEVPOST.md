# DEVPOST.md: submission kit (copy/paste, then fix the [bracketed] items)

## Project name
Bluff

## Tagline
Call their bluff: Bluff connects the site where you typed your card to the charge that follows, then helps you get your money back.

## Elevator pitch (≤ 200 chars)
Scams hit your statement days after the click. Bluff remembers where you entered your card, links the later charge to that site, drafts the dispute, and texts you on iMessage.

## Description
**The problem.** Scams don't happen when you click. They show up three days later on your statement. Site raters see the page, banks see the charge, text filters see the message, and the victim has to connect them alone, late, with no evidence.

**What it does.** One Nemotron agent, one Exposure Log, four surfaces:
- **Checkout Guard** (Chrome extension and `/check`): when a page asks for your card, Bluff scores it with reasons and safer options, and logs the exposure.
- **Charge Watch + Refund Builder:** a new charge is linked back to the exposure (abbreviated descriptors like `FKSHP*LLC` ↔ `fastkicks-shop`), flagged for price drift, duplicates and card tests, and one tap drafts a dispute letter, evidence timeline and next steps. Bluff drafts; you decide.
- **Bluff Text (Photon iMessage):** alerts when something risky happens, and forward any suspicious text for an explained verdict. Reply WATCH, DISPUTE, SAFE, STOP or HELP.
- **Call the Bluff:** a 60-second daily game that trains the same red flags the detector uses.

**How it's built.** Next.js on Vultr, Tiger Data (hypertable + continuous aggregate + pg_trgm), Nemotron tool-calling agent with a streamed trace, Photon for messaging, a Chrome MV3 extension. Verdicts are always labeled live / cached / replayed / basic, with graceful fallbacks.

**Privacy by design.** The extension never reads what you type or the page text; only the domain, the kinds of fields and yes/no signals leave the page. Forwarded texts are discarded after the verdict. Everything is synthetic data.

**Measured, honestly.** [Fill from `npm run demo:script` after the real runs. At time of writing the only measured numbers are on a synthetic stand-in set with the rules-only path; do not present them as results on T-Mobile's data or on the Nemotron agent.]

## Tracks
- Sponsor (max 3): **T-Mobile Safe Signal**, **NVIDIA: Use Nemotron Beyond a Chatbot**, **Photon: Best Use of Photon API** (and the Voice Call prize only if the call works live)
- HackUTD (max 1): **Virality**
- MLH (opt in on Devpost): **Tiger Data**, **Vultr**, **GoDaddy Registry**
- Auto-entered: General

## Built with
Next.js · TypeScript · Tailwind · PostgreSQL / Tiger Data (TimescaleDB, pg_trgm) · NVIDIA Nemotron (build.nvidia.com) · Photon · Chrome MV3 · Vultr · Caddy · Python (eval) · Playwright

## Links to fill in
- Live URL: [https://bluff.<domain>]
- Repo: https://github.com/Sithranjan-Suresh/bluff (make public before submitting)
- Video (≤ 2:00, demo only): [link]

## Demo video shot list (≤ 2:00, demo only; script from `npm run demo:script`)
1. 0:00 black screen, the hook line. 2. 0:08 `fastkicks-shop` with the extension panel sliding in on the card field (record with the extension loaded). 3. 0:24 *Continue and watch my charges*, phone buzzes with the alert (screen-record the phone). 4. 0:34 *Simulate a charge*, the trace streams, the linked-charge card. 5. 0:52 *Build dispute*. 6. 1:00 `/eval` with the real numbers and the failure cases. 7. 1:12 forward a scam text, reply arrives; flip a game card and show the share grid. 8. 1:24 `/privacy`, close with "Bluff: call their bluff."

## Before you submit (human-only items)
- [ ] Register the team on Devpost by **Sat 11:00pm CST**; final submission locks **Sun 12:00pm CST**.
- [ ] Run the live checks in README "Going live"; replace stand-in numbers; re-run `npm run demo:script` and follow its warnings.
- [ ] 3 full rehearsals on the deployed site, one on a phone over cellular.
- [ ] Record the video; make the repo public; opt in to the MLH tracks.
- [ ] Optional depth: 3–5 event-tester reactions (quotes with permission, first names only); one statistic **only if fetched from a source** (e.g., FTC Consumer Sentinel). No statistic is claimed in this repo.
