# full_context.md: Bluff

Read this first. It explains the whole project to someone with zero prior context. Detail lives in `product_spec.md` (what to build) and `engineering_spec.md` (how to build it). The demo is in `demo_design.md`.

## Vision
**One sentence:** Bluff connects the site where you typed your card to the charge that follows, then helps you get your money back.

**Paragraph:** Online scams play out over days. You enter your card on a too-good store, nothing seems wrong, and a charge shows up later that you can't place. Every protection tool today sees one slice: a site rater sees the page, a bank sees the charge, a text filter sees the message. Bluff is a scam co-pilot with memory. One Nemotron agent watches the moment you hand over personal info, remembers it in an Exposure Log, links later charges back to it, builds the dispute evidence, and reaches you on text. A 60-second daily game trains you on the same red flags. Everything runs on synthetic data, and nothing you type ever leaves your device.

**Thesis:** Scams don't happen when you click. They show up on your statement. Bluff links the two.

## Problem
- Online-shopping fraud and scam texts are among the most-reported fraud types. *(Evidence level: Assumed. Fetch one figure from the FTC Consumer Sentinel data book during the depth plan, and cite only if fetched.)*
- Victims rarely connect a charge to its source in time, and arrive at their bank with no evidence trail.
- Existing tools don't share memory: a site rating disappears the moment you leave the page.

## Target Users
| Who | What they do today | Why that's painful |
|---|---|---|
| Social-ad shoppers (18–35) | Buy from unfamiliar stores on impulse | No warning at the card field; no idea which store a weird charge came from |
| Busy phone users | Get several scam texts a week, ignore or guess | No easy way to ask "is this real?" |
| Older relatives | Trust texts and stores; won't install many tools | They need protection where they already are: Messages |

## User Journey (end to end)
1. **Exposure:** Maya is on a checkout page. Checkout Guard (extension, or `/check` on a phone) gives her Trust Score 18 with reasons and safer options. She continues anyway, and the exposure is logged.
2. **Alert:** Bluff Text sends an text: "You just entered your card on a 4-day-old site. Reply WATCH and I'll check for charges from it."
3. **Charge:** days later, a charge posts. Charge Watch runs the agent, which links it to the exposure.
4. **Action:** Refund Builder produces a dispute letter, an evidence timeline and next steps. A text says: "Reply DISPUTE."
5. **Everyday use:** she forwards sketchy texts to Bluff for verdicts, and plays Call the Bluff daily.

## Feature Map
**Core loop:** Exposure → Verdict → Memory → Charge → Link → Dispute → Alert.

| Pillar | Job | Mini moment | Thin slice |
|---|---|---|---|
| P1 Checkout Guard | Catch the exposure moment | Panel slides in on the card field: score 18, reasons | `/check` page: URL → verdict → log exposure |
| P2 Charge Watch + Refund Builder | Link money to exposure, then act | Trace streams → linked-charge card → packet | Seeded charges, demo trigger, link + price-drift flags, letter + timeline |
| P3 Bluff Text | Reach users where scams land | Judge's phone buzzes; forward → verdict | Outbound alerts + inbound forward-to-check in the T-Mobile phone view |
| P4 Call the Bluff | Train the same red flags daily | Flags light up on the card; share grid | 5 cards/day from a pool of 15, streak, share text |

Cross-links: exposures feed the linker (P1→P2); linked charges trigger texts (P2→P3); WATCH replies flag exposures (P3→P1); flagged patterns seed a game card (P1/P2→P4).

## Core Features (what exists at submission)
- Chrome extension Checkout Guard + `/check` web fallback
- Exposure Log timeline (`/exposure`)
- Charge Watch (`/charges`) with flags: exposure link, price drift, duplicate, surprise subscription, card testing
- Refund Builder (`/charges/[id]`): dispute letter, evidence timeline, next steps (drafted, never sent)
- Bluff Text in the T-Mobile phone view: outbound alerts, inbound forward-to-check, reply commands WATCH / DISPUTE / SAFE / STOP
- Call the Bluff (`/play`): daily 5 cards, streak, share grid
- Live AgentTrace on every agent run
- `/eval` (Claims A and B, failure cases) and `/privacy` (data-flow diagram, delete-everything)
- 8 demo storefronts on subdomains, footers labeled as demos

## Key Differentiators (vs. the 5 closest)
1. **Memory across time:** the Exposure Log links a page to a later charge. Raters, banks and text filters can't.
2. **Action, not just a label:** the dispute packet comes with evidence.
3. **A real agent:** Nemotron plans, calls 7 tools and shows its work, measured against T-Mobile's baseline.
4. **Meets people where they are:** text both ways, plus a daily habit loop.
5. **Private by design:** typed values never read; only domains and yes/no flags leave the device.

## Technical Overview
- **Frontend:** Next.js (App Router) + Tailwind, one app for dashboard, `/check`, game, eval, privacy. Chrome MV3 extension in TypeScript.
- **Backend:** Next.js route handlers (Node runtime) for the API and server-sent events for the agent trace. One TypeScript codebase.
- **AI:** Nemotron on build.nvidia.com (OpenAI-compatible) for the agent; an NVIDIA embedding model for taxonomy similarity.
- **Data:** Tiger Data (managed Postgres): transactions hypertable, continuous aggregate for daily merchant price history, pg_trgm for descriptor matching, pgvector for taxonomy embeddings.
- **Messaging:** in-app, shown in the user's T-Mobile phone view.
- **Infra:** Vultr cloud instance (Docker Compose: app + Caddy for HTTPS), domain through GoDaddy Registry; storefronts on subdomains.
- **Eval:** Python script (offline) for Claims A and B, writing results JSON that `/eval` renders.

**Key technical bets:**
1. Nemotron tool calling is reliable enough for a 4–6 step loop. Fallback: a fixed tool pipeline plus a single Nemotron call to judge and explain.
2. The SQL linker narrows candidates, and the agent confirms. That keeps the signature fast and explainable.
3. Streaming the trace makes 6–10 s of latency feel like work, not lag.

**Technical claims:** Claim A, agent F1 > T-Mobile baseline F1 on held-out messages; Claim B, linker F1 > naive string match on 30 seeded charges.

## Demo Flow
See `demo_design.md` §3 and §8: hook → Checkout Guard → text buzz → the link → dispute → eval numbers → forward-a-text → game → privacy → close.

## Success Metrics
- **Technical:** every pillar's thin slice works live on a phone; Claims A and B measured and displayed honestly; agent p50 < 8 s; zero unhandled errors on the demo path.
- **Product:** a judge can do the full loop from the QR code in under 2 minutes with no help; 3+ event testers say they'd keep it.
- **Placement goal:** T-Mobile top 3; NVIDIA 1st or 2nd; Capital One Nessie; plus MLH Tiger Data.

## Future Expansion
1. **Carrier-native:** T-Mobile could run Bluff Text inside Scam Shield and connect it to real (consented) transaction data from bank partners.
2. **Network effect:** anonymized, aggregated exposure domains become an early-warning list. One user's flagged store protects everyone.
3. **Pre-charge protection:** one-tap virtual cards with a spending limit, issued at the Checkout Guard moment.
