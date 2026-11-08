# idea_brief.md: Bluff

> HackUTD 2026: ZeroDay · Team of 2 · Locked Sat Nov 7, ~4:00pm CST
> Status: idea locked (Sharpen decision from hackathon-feedback). Formerly "Tripwire".

## One-liner
**Bluff watches the moment you hand a site your personal info, remembers it, catches the scam when the money moves, and helps you get your money back.**

Tagline: *Call their bluff.*

## Thesis
Scams don't happen when you click. They show up days later on your statement. Bluff is the only tool that connects **the site where you typed your card** to **the charge that follows**, then turns that link into action.

## Problem brief
- Protection today comes in disconnected pieces:
  - Browser and site-rating tools (Safe Browsing, ScamAdviser-style raters) judge a page at visit time, then forget it.
  - Banks flag charges without knowing where you shopped or what you were shown.
  - Scam-text filters work on messages, not on your money.
- The victim has to connect "that weird store from Tuesday" to "this $49.99 charge" alone, usually late and with no evidence trail.
- Evidence level: **Assumed / anecdotal.** Collect 3–5 reactions at the event (depth plan) and one sourced statistic (e.g., FTC Consumer Sentinel online-shopping fraud figures). Cite it only if fetched from the source.

## Target user
Everyday online shoppers and phone users (T-Mobile customers), especially people who shop from social ads and get frequent text messages. Secondary users: older relatives who'll never install five tools, but will read an text.

## Closest existing projects (novelty comparison)
| # | Closest thing | What it does | What Bluff does that it can't |
|---|---|---|---|
| 1 | URL / site trust raters (browser extensions, ScamAdviser-type) | Score a site at visit time | Fires only at the personal-info moment, **remembers the exposure**, links later charges |
| 2 | Bank fraud alerts | Flag unusual charges | Knows *where you were exposed* and builds the dispute evidence |
| 3 | Carrier scam-text filters (e.g., Scam Shield) | Label or block scam texts | Two-way: forward anything, get an explained verdict and next steps |
| 4 | Typical hackathon "scam classifier + chatbot" | Classify text, chat about it | Multi-step agent with tools, shared memory across surfaces, measured against a baseline |
| 5 | Phishing-awareness games | Generic quizzes | Daily cards generated from the same taxonomy the detector uses, plus a lookalike of something flagged that week |

## Technical claim
**Claim A (detection):** Bluff's Nemotron agent beats T-Mobile's provided baseline classifier on F1 for scam vs. legit, measured on a fixed held-out split of T-Mobile's synthetic message set.

**Claim B (linking, the signature):** Bluff's exposure-to-charge linker (normalized descriptor + trigram similarity + time window, confirmed by the agent) finds the true exposure for flagged charges with higher precision and recall than naive string matching, on 20 seeded charges with ground-truth links.

What would reject each claim: Claim A is rejected if held-out F1 ≤ the baseline's (then the pitch leads with linking and explanations, and says so honestly). Claim B is rejected if linker F1 ≤ the naive baseline's.

**Stretch claim (depth budget, not a commitment):** 40–50 hand-labeled checkout pages and texts, a second baseline (an off-the-shelf zero-shot LLM prompt with no tools), and a failure-case table.

## Pillars (4) + core loop
**Core loop:** you give a site personal info → Bluff rates and remembers it → a charge posts → Bluff links it to the exposure → one-tap dispute packet → text alert.

| Pillar | Job (serves the thesis by…) | Surface |
|---|---|---|
| 1. **Checkout Guard** | …catching the exposure moment and writing it to memory | Chrome extension + `/check` page |
| 2. **Charge Watch** (+ Refund Builder) | …linking money to exposure and turning it into a dispute | Dashboard `/charges` |
| 3. **Bluff Text** | …reaching the user where scams land (text), both directions | in-app text thread on the user's T-Mobile phone |
| 4. **Call the Bluff** | …training users daily on the same red flags the detector uses | `/play` daily game |

Shared backbone: **one Nemotron agent, one Exposure Log, one Tiger Data database, one design system.**

## Signature moment
On the dashboard, a new charge posts and the agent trace streams in step by step. Then a card appears: *"$49.99 from FKSHP\*LLC lines up with fastkicks-shop, where you entered your card on Nov 4. That site was 4 days old and scored 18."* One tap later, the dispute packet is ready. At the same moment the judge's phone buzzes.

## Cut order (if behind)
1. Voice call → 2. Leaderboard → 3. Screenshot forwarding (keep text) → 4. Real RDAP lookups (keep mock registry) → 5. Generated game cards (use 15 hand-written) → 6. Chrome extension (fall back to `/check` page with URL input).
**Never cut:** the core loop, exposure-to-charge link, Refund Builder, text alert, Claim A eval.

## Tracks
- Sponsor (max 3): **T-Mobile Safe Signal**, **NVIDIA Nemotron**, **Capital One Nessie**
- HackUTD (max 1): **Virality**
- MLH (unlimited, opt in): **Tiger Data**, **Vultr**, **GoDaddy Registry**
- Auto-considered: General
