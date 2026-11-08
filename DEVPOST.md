# DEVPOST.md: submission kit (copy/paste, then fix the [bracketed] items)

## Project name
Bluff

## Tagline
Bluff watches your card: it checks the website behind every charge, texts your phone when one looks like a scam, and drafts the dispute.

## Elevator pitch (≤ 200 chars)
Scams hit your statement days after the click. Bluff watches your card, has Nemotron read the site behind every charge, texts you on your T-Mobile phone, and drafts the dispute.

## Description
**The problem.** Scams don't happen when you click. They show up days later on your statement. Site raters see the page, banks see the charge, text filters see the message, and the victim has to connect them alone, late, with no evidence.

**What it does.** Bluff watches your card.
- **Card watch (Capital One Nessie):** Bluff imports your card's transactions, crawls the website behind every merchant (refunds, terms, contact, checkout), gives an instant rules check, then an NVIDIA Nemotron tool-calling agent reads the pages and writes a cited verdict. While it's open it checks the card every 20 seconds: make a real test purchase on the Nessie sandbox card and Bluff catches it, reviews the store and texts you about 30 seconds later.
- **Safe Signal on your T-Mobile phone:** risky charges arrive as texts with reply chips. DISPUTE drafts a dispute packet from the site evidence, HOLD puts a (simulated) hold on the card so new purchases are declined, SAFE trusts the merchant. Report a scam text to Bluff and it remembers the link, so a later charge from that site is tied back to the text.
- **Check a site before you pay:** /check and the Checkout Guard Chrome extension (installable from the site) run the same crawl and Nemotron review before the charge exists.
- **Dispute builder:** letter, evidence timeline with page links, next steps. Bluff drafts; you decide; it never sends anything.
- **Call the Bluff:** a daily game, the same five messages for everyone, where you call Legit or Bluff! and then tap the word that gave it away. Streaks, stats, a share grid without spoilers, and a bonus card from your own bank scan.

**How it's built.** Next.js on a Vultr VPS, Tiger Cloud TimescaleDB (hypertable, continuous aggregate, pg_trgm), Capital One Nessie for the bank feed and live test purchases, an SSRF-guarded crawler with a sandboxed headless Chromium for JavaScript-only stores, RDAP/TLS/DNS/Internet Archive lookups, a Nemotron tool-calling agent with a streamed trace plus Nemotron embeddings for the scam taxonomy, and a Chrome MV3 extension. Every verdict is labeled live, cached, replayed or basic check.

**Privacy by design.** Reported texts are checked, then discarded; agent traces keep no message text. A scam link keeps only its host. The extension sends only the site's origin and the kinds of fields on the page, never what you type. Each visitor gets a private demo account they can delete. All data is synthetic.

**Measured, honestly.** On a held-out split (n=91) of our own 306-message synthetic set (generated with Nemotron, not T-Mobile data), the live Nemotron agent scores F1 0.93 and the rules alone 0.90, against 0.58 for a "contains a link" baseline and 0.69 for our rules before this weekend. Confidence is computed from signal agreement, not the model's self-report, and is calibrated (ECE about 0.07). Small n; details and failure cases on /eval.

## Tracks
- Sponsor (max 3): **T-Mobile Safe Signal**, **NVIDIA: Use Nemotron Beyond a Chatbot**, **Capital One: Best Use of Nessie**
- HackUTD (max 1): **Virality**
- MLH (opt in on Devpost): **Tiger Data**, **Vultr**, **GoDaddy Registry**
- Auto-entered: General

## Built with
Next.js · TypeScript · Tailwind · PostgreSQL / Tiger Data (TimescaleDB, pg_trgm) · NVIDIA Nemotron (build.nvidia.com) · Capital One Nessie API · RDAP · Internet Archive · Chrome MV3 · Vultr · Caddy · Python (eval) · Playwright

## Links to fill in
- Live URL: https://bluffai.us
- Repo: https://github.com/Sithranjan-Suresh/bluff (make public before submitting)
- Video (≤ 2:00, demo only): [link]

## Demo video shot list (≤ 2:00, demo only; script from `npm run demo:script`)
1. 0:00 the hook line over /scan: "Scams don't happen when you click. They show up on your statement."
2. 0:08 *Scan my transactions*: basic checks land, Nemotron verdicts stream; five fake stores flagged in Maya's Capital One statement. The phone buzzes with one summary text.
3. 0:30 *Make a test purchase* → VoltDeals → *Charge the card*: the real Nessie purchase appears as NEW, the Nemotron trace streams, the text arrives on the T-Mobile phone.
4. 0:55 Tap HOLD, try another purchase: declined (simulated). Tap DISPUTE: the dispute packet with page-linked evidence.
5. 1:15 Phone → Messages → Report to Bluff on the toll text; Bluff remembers the link.
6. 1:28 Checkout Guard on fastkicks-shop (extension panel slides in on the card field).
7. 1:40 /play: tap the giveaway, the share grid. 1:48 /eval table. 1:55 "Bluff: call their bluff."

## Before you submit (human-only items)
- [ ] Register the team on Devpost by **Sat 11:00pm CST**; final submission locks **Sun 12:00pm CST**.
- [ ] Run the live checks in README "Going live"; replace stand-in numbers; re-run `npm run demo:script` and follow its warnings.
- [ ] 3 full rehearsals on the deployed site, one on a phone over cellular.
- [ ] Record the video; make the repo public; opt in to the MLH tracks.
- [ ] Optional depth: 3–5 event-tester reactions (quotes with permission, first names only); one statistic **only if fetched from a source** (e.g., FTC Consumer Sentinel). No statistic is claimed in this repo.
