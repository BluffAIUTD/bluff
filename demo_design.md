# demo_design.md: Bluff (Phase 4)

## 1. Feature Map

**Thesis:** Bluff connects the site where you typed your card to the charge that follows, and turns that link into action.

**Core loop:** *Exposure → Verdict → Memory → Charge → Link → Dispute → Alert.* The user enters personal info on a site. Bluff rates and logs it. When a charge posts, Bluff links it to the exposure, builds the dispute packet, and texts the user.

### Pillars

#### P1. Checkout Guard: "catch the exposure moment"
- **User story:** As a shopper about to enter my card on an unfamiliar site, I want an instant, explained risk verdict so I can decide before I'm exposed.
- **Mini moment:** The side panel slides in on the card field with **Trust Score 18**, three evidence bullets and "Do this instead."
- **Thin slice:** The `/check` page takes a URL from the 8 demo storefronts, runs the agent and returns a score, confidence, evidence and next steps. It writes an Exposure Log entry when the user clicks "I entered info here."
- **Depth:** MV3 extension that auto-detects sensitive fields; brand-clone check; real RDAP domain age; Exposure Log timeline page.
- **Reads:** mock_registry, taxonomy. **Writes:** exposures, verdicts, agent_runs.

#### P2. Charge Watch + Refund Builder: "link money to exposure, then act"
- **User story:** As someone who got charged by a sketchy store, I want Bluff to show me which site caused it and hand me a ready dispute so I can get my money back fast.
- **Mini moment:** The agent trace streams, the linked-charge card appears, one tap produces the dispute packet.
- **Thin slice:** `/charges` lists seeded transactions from Tiger Data. A "post next charge" demo trigger runs the agent. It flags exposure links and price drift, and generates a dispute letter plus evidence timeline.
- **Depth:** surprise-subscription, duplicate and card-testing flags; price-history sparkline from the continuous aggregate; PDF export of the packet.
- **Reads:** transactions, merchant_price_daily, exposures. **Writes:** verdicts, disputes, agent_runs.

#### P3. Bluff Text: "reach users where scams land"
- **User story:** As a user who doesn't live in dashboards, I want alerts by text and to forward suspicious texts for a verdict so protection works on my phone.
- **Mini moment:** The judge's phone buzzes. Then forward a scam text and the verdict comes back in about 6 seconds.
- **Thin slice:** Outbound alert on a high-risk exposure and on a linked charge. Inbound forwarded text → agent → reply with score, why and what to do. Reply commands WATCH / DISPUTE / SAFE / STOP.
- **Depth:** daily game nudge; image/screenshot forwarding.
- **Reads:** users, verdicts. **Writes:** messages, verdicts, exposures (on WATCH).

#### P4. Call the Bluff: "train the same red flags daily"
- **User story:** As a casual user, I want a 60-second daily puzzle that teaches me to spot scams so I get better without reading guides.
- **Mini moment:** Tap "Bluff!" on a card and the red flags light up directly on it. Then a spoiler-free share grid.
- **Thin slice:** 5 cards a day from a seeded pool of 15, real/scam guess, flag highlights, score, streak, share text.
- **Depth:** Nemotron-generated daily cards from the taxonomy; one lookalike of something flagged that week; "weak spot by category"; judges' room leaderboard.
- **Reads:** game_cards, taxonomy. **Writes:** game_plays.

### Cross-links (≥2)
1. **P1 → P2:** Exposure Log entries are what the charge linker searches. This is the signature link.
2. **P2 → P3:** A linked charge triggers the text alert; replying DISPUTE opens the packet.
3. **P3 → P1:** Replying WATCH to a checkout alert sets `watch=true` on that exposure, which raises its link priority.
4. **P1/P2 → P4:** The week's flagged patterns seed one "lookalike" card in the daily game.

### Shared backbone
- **Data:** one Tiger Data Postgres database (users, exposures, transactions hypertable, verdicts, agent_runs/steps, disputes, messages, taxonomy with pgvector, game tables).
- **Agent:** one Nemotron agent service with one output schema (`Verdict`).
- **Shell:** one Next.js app with a persistent left rail (desktop) or bottom tab bar (mobile): Overview · Check · Charges · Exposure · Play · Eval · Privacy.
- **Design system:** one set of tokens and components (VerdictCard, ScoreDial, EvidenceList, AgentTrace, Badge).

### Cut order
Voice call → leaderboard → screenshot forwarding → real RDAP → generated cards → extension (keep `/check`). Never cut the core loop.

### Coherence test
Each pillar serves the thesis in one phrase: P1 *catches the exposure*, P2 *links and acts on the money*, P3 *delivers it where people are*, P4 *teaches the same flags*. All pass.

---

## 2. Demo Hook (first 15 seconds)
Black screen, one line: **"Scams don't happen when you click. They show up three days later on your statement."** Then cut straight to a too-good sneaker store at 70% off with the cursor on the card field. Bluff's panel slides in, red, before a single digit is typed.

## 3. Demo Flow
1. Hook line (0:00–0:08)
2. **Core loop:** fake store → Checkout Guard verdict → "Continue and watch my charges" → Exposure logged (0:08–0:30)
3. Phone buzzes with the Bluff Text checkout alert (0:30–0:38)
4. **Signature:** "post next charge" → agent trace streams → linked-charge card (0:38–0:58)
5. Refund Builder → dispute packet (0:58–1:08)
6. **Proof:** Eval page, Claim A and Claim B numbers vs. baselines (1:08–1:18)
7. **Pillar tour:** forward a scam text → reply verdict (1:18–1:30); Call the Bluff card flip + share grid (1:30–1:40); Privacy page line (1:40–1:46)
8. Close (1:46–1:55)

## 4. Wow Moments
1. **Panel before typing** (core loop): Bluff reacts to the *field*, not the URL.
2. **The link** (core loop, signature): a charge three days later is tied to the exact site, with dates and score.
3. **Judge's phone buzzes** (P3): their own device, live.
4. **Forward-and-reply** (P3): a forwarded scam text gets an explained verdict in seconds.
5. **Red flags light up on the card** (P4).

## 5. Required Screens
| Route | Purpose | In demo? |
|---|---|---|
| `/` Overview | Risk summary, latest flags, latest exposures, "Try it" CTA | Opening frame of the dashboard |
| `/check` | Paste a URL or text → verdict (judge path, no extension) | Judge path; backup for the extension |
| `/charges` | Transactions with flags; demo trigger | Yes (signature) |
| `/charges/[id]` | Linked-charge detail + Refund Builder packet | Yes |
| `/exposure` | Timeline of where your info went | Briefly |
| `/play` | Call the Bluff daily game | Yes |
| `/eval` | Claim A/B tables + failure cases | Yes (proof) |
| `/privacy` | Data-flow diagram, delete-everything | One line |
| Extension side panel | Checkout Guard on live pages | Yes (core loop) |
| Demo storefronts (8) | Seeded targets, footer labeled "Demo store, not real" | Yes |

## 6. User Journey (the judge's experience)
1. The judge scans a QR code on the table → `bluff.<domain>` opens on their phone. **No login**: a seeded demo user "Maya".
2. Overview shows "2 exposures this week, 1 charge needs attention." A big button says **Try Bluff on a store →**
3. `/check` shows 8 storefront chips. Tap "fastkicks-shop" → the agent trace streams → Trust Score 18 with evidence. Tap "I entered my card here" → logged.
4. Tap **Charges** → "Simulate a charge from this store" → the trace streams → linked-charge card → **Build dispute** → packet.
5. Text the Bluff number (shown on screen) with any message → verdict comes back.
6. **Play** → today's 5 cards → share grid.
7. **Eval** shows the numbers; **Privacy** shows what never leaves the device.
Every step works on a phone with no extension and no account.

## 7. Judge Takeaways
1. **Bluff links the site where you typed your card to the charge that follows, then builds your dispute.** (Thesis)
2. **It's a real Nemotron agent with tools and a visible trace, measured against T-Mobile's baseline.**
3. **Private by design, and it shows up where people are: text and a 60-second daily game.**

## 8. Ideal 90-Second Demo Script (live pitch; the video version stretches to ≤2:00)
> **[0:00]** "Scams don't happen when you click. They show up three days later on your statement. This is Bluff."
>
> **[0:08]** "Maya finds sneakers at 70% off. The moment her cursor hits the card field, Bluff's Nemotron agent checks the site. It's four days old, only takes gift cards, and copies a real brand's logo. Trust Score 18, with the three reasons and what to do instead."
>
> **[0:24]** "She goes ahead anyway, like most people do. Bluff remembers where her card went, and texts her." *(Hand the phone to the judge as it buzzes.)*
>
> **[0:34]** "Three days later, a charge posts. Watch the agent work: it pulls this merchant's price history from Tiger Data, searches Maya's exposures, checks the domain, and links the charge to the exact store from Tuesday. No bank and no browser extension can make that connection."
>
> **[0:52]** "One tap: a dispute letter, an evidence timeline, and next steps. Bluff drafts it. Maya decides."
>
> **[1:00]** "Does it work? On T-Mobile's held-out messages, Bluff scores **[F1_A]** against the baseline's **[F1_base]**, and it links charges to their source at **[F1_B]** versus **[F1_naive]** for string matching. Here are the cases it still gets wrong." *(Replace with real numbers at Checkpoint 3, or reframe honestly.)*
>
> **[1:12]** "Got a sketchy text? Forward it to Bluff. Verdict in seconds, in text. And every day, Call the Bluff: 60 seconds of training on the same red flags the agent uses."
>
> **[1:24]** "And nothing Maya types ever leaves her device. Only the domain and yes/no flags do. Bluff: call their bluff."

## 9. Signature Moment spec
- **Where:** script 0:34–0:58, inside the first minute.
- **What the judge sees:** AgentTrace panel streaming 4–5 steps (tool name, short input, result, ms), then the LinkedChargeCard with a highlighted exposure match (domain, date, score, field types) and a "Build dispute" button.
- **Real data:** the seeded transaction `txn_demo_link_1` (FKSHP\*LLC, $49.99) and the exposure the judge or presenter just created through `/check` or the extension. The linker runs live against Tiger Data.
- **Cached fallback:** if the Nemotron run fails or takes more than 12 s, replay the last successful trace for that transaction from `agent_runs` with a visible "replayed" badge. Never present a replay as live.
- **Load-time cost:** linker SQL < 50 ms; agent run target 6–10 s with streaming (first step visible < 1.5 s).
- **Gate:** if it doesn't work on real data at Checkpoint 2 (Sat midnight), cut it and the demo stands on Checkout Guard + Bluff Text + game. (Unlikely, since it's mostly SQL plus one agent call.)

## 10. Depth Plan (after every thin slice works, in order)
1. **Stretch eval:** 40–50 hand-labeled storefront pages and texts; second baseline (Nemotron zero-shot prompt with no tools); failure-case table with honest numbers on `/eval`.
2. **Real evidence:** 3–5 reactions from people at the event (quotes with permission, first names only); one sourced statistic, fetched from the FTC or a similar source.
3. **Pillar depth in reverse cut order:** generated game cards → real RDAP → screenshot forwarding → leaderboard → voice call.
4. **Hardening:** signature-moment fallback, every failure state in product_spec.md, mobile layout pass.
5. **Polish and rehearsal:** 3 full run-throughs, the video, Devpost copy.
None of these adds a pillar or a page.

## 11. Design Direction
- **Personality:** calm and sharp, like a poker player who sees the tell. Not alarmist.
- **Palette:**
  - Ink `#0E1014` (dark surfaces), Paper `#F6F4EF` (light surfaces)
  - Bluff Red `#E5484D` (scam), Amber `#F5A524` (unsure), Felt Green `#2F9E6E` (safe)
  - Accent Electric Indigo `#5B5BD6` (actions, links, focus)
  - Neutral grays on a 6-step scale
- **Type pair:** **Space Grotesk** (headings, scores, numbers) + **Inter** (body, UI).
- **Motif:** the ScoreDial is a half-circle like a chip; game cards are literal cards that flip.
- **Hero moments:** (1) side panel slide-in with ScoreDial counting down to 18; (2) LinkedChargeCard with an animated line connecting the exposure to the charge.
- **Navigation:** left rail on desktop, bottom tab bar on mobile, same 7 items in the same order. Each pillar is one tap from anywhere.
- **Component system (shared everywhere):** VerdictCard, ScoreDial, ConfidencePill (with reason), EvidenceList, NextSteps, AgentTrace, Badge (live / replayed / cached / demo), EmptyState, ErrorState, Skeleton.
- **Mobile budget:** first contentful paint < 1.5 s on 4G; JS < 250 KB gzipped per route; first agent step visible < 1.5 s; full verdict < 10 s.

## 12. Technical Claims, Baselines and Eval Plan
**Claim A (detection):** Bluff agent vs. T-Mobile baseline classifier on scam/legit.
- Data: T-Mobile synthetic message set, 80/20 split with seed 42, split file committed before tuning.
- Baseline: T-Mobile's provided classifier run on the same 20%. If they only provide a score, use it as reported and say so.
- Metric: precision, recall, F1 (scam = positive), plus category accuracy against the taxonomy.
- Minimum labeled set if the split is tiny: at least 20 held-out cases.
- First result at Checkpoint 2 (Sat midnight); final at Checkpoint 3 (Sun ~6am).

**Claim B (linking):** linker vs. naive string match.
- Data: 20 seeded flagged charges with ground-truth `true_exposure_id` (including 6 hard ones: abbreviated descriptors, payment-processor prefixes like `SQ *` / `PAYPAL *`, shared words with a legit site) + 10 charges with no exposure (should not link).
- Baseline: lowercase substring match of any domain token in the descriptor.
- Metric: link precision, recall, F1.
- Same checkpoints.

**Stretch (depth budget):** 40–50 labeled pages and texts, second baseline (Nemotron zero-shot, no tools), failure table.

**Per-pillar proof:**
- P1: 8/8 demo storefronts classified correctly, shown as a small grid.
- P2: Claim B.
- P3: round-trip latency from forward to reply, measured over 10 tries (median).
- P4: before/after score from 3 event testers on two rounds (depth plan).

## 13. Riskiest Assumptions
| Assumption | Test | When |
|---|---|---|
| T-Mobile data and baseline are usable in our pipeline | Get files at the booth; load and count labels | Now → Sat 6pm |
| Nemotron tool calling is reliable enough for a multi-step loop | Run 10 agent loops on demo storefronts; count schema-valid outputs | Checkpoint 1 (Sat 8pm) |
| Nemotron latency fits the demo (< 10 s) | Time 10 runs; switch to a smaller model or fewer steps if slow | Checkpoint 1 |
| Tiger Data setup (hypertable, continuous aggregate, pgvector) is quick | Run the schema migration and seed | Sat 7pm |
| Extension can be loaded and detect fields on demo stores | Load unpacked; detect card field on all 3 scam stores | Checkpoint 2 |
| Judges will actually try it on their phone | Hallway test with 3 people using the QR path | Sun morning |
