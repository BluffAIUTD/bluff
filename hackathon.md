# hackathon.md: HackUTD 2026: ZeroDay

Labels: **[V]** Verified from the Devpost page / track sheet the team pasted · **[A]** Assumed · **[U]** Unknown, ask organizers or sponsors.

## Logistics
- [V] 24-hour in-person hackathon at UT Dallas (ECSW). Teams of up to 4. Students only.
- [V] Team must be registered on Devpost by **Sat Nov 7, 11:00pm CST** (first submission, editable afterward).
- [V] Final submission locks **Sun Nov 8, 12:00pm CST**. No edits after.
- [A] Hacking started Sat ~12:00pm, so T = 24h. 33% of T ≈ Sat 8:00pm; freeze (50%) ≈ Sat midnight.
- [V] Required in the submission: title + description, code repo or zip, tracks, **demo video (demo only, max 2 minutes)**.
- [V] Up to **3 sponsor tracks + 1 HackUTD track** (Hardware / Design / Virality). Any number of [MLH] tracks. Everything is auto-entered in General.

## General judging rubric [V]
Innovation and Creativity · Technical Complexity · Completeness · Design · Impact · Presentation

## Our tracks
### T-Mobile: Safe Signal [V]
- Prompt: "Protect customers from scams and fraud in ways we haven't thought of yet."
- Any approach: prevention, real-time protection, education, new security features.
- Scam detection is the core piece but not the whole product. Go beyond classification to safeguards and customer-facing experiences.
- Clear next steps, honest confidence, privacy by design.
- Synthetic data only: scam messages and scenarios, no real customer data.
- Provided: **synthetic message set, scam taxonomy, baseline classifier.**
- Judged on: **Creativity, Impact, Usability, Security and privacy, Detection accuracy.**
- Prizes: Mac Mini / Jetson Orin Nano Super / Plaud NotePin S.
- [U] Format of the message set (CSV/JSON? fields? label names?), the taxonomy, and the baseline (a notebook? a model file? a reported score?). **Get these at the T-Mobile booth first thing.**

### NVIDIA: Use Nemotron Beyond a Chatbot [V]
- Must use Nemotron. Must also show: not just responding to prompts; multi-step agents that plan and execute; tool integration with external APIs; real-world applicability.
- Prizes: 2× RTX 5080 + $200 Brev credits / 1× RTX 5080 + $200 Brev.
- [A] Access through build.nvidia.com hosted NIM endpoints (OpenAI-compatible, tool calling). [U] Exact model IDs and rate limits. Check at the NVIDIA booth.

### Photon: Best Use of Photon API [V]
- Sign up at app.photon.codes with promo code **HACKWITHPHOTON**. Docs and examples are in the resources link.
- Prizes: 1st $400 + $300 credits + interview fast-track; 2nd $200 + $100; **Voice Call Winner** $300 + $100.
- [V, from photon.codes] Photon is an agent messaging API for iMessage (plus WhatsApp, Telegram, Slack, etc.) with SMS/RCS fallback and calling. Its TypeScript SDK is spectrum-ts / chat adapters; inbound messages arrive by webhook with a signing secret.
- [U] Exact SDK calls for send, receive and call. Read the resources link before building.

### HackUTD: Virality [V]
Prize: portable monitors. [U] Criteria unstated. Assume shareability and evidence of spread.

### MLH tracks [V]
- **Tiger Data**: PostgreSQL extended for real-time and time-series data; hypertables, continuous aggregates, compression. Judged on "most innovative, impactful, performance-driven use."
- **Vultr**: cloud compute (and GPUs); free credits on signup.
- **GoDaddy Registry**: register a domain through GoDaddy Registry.
- Opt in to each on Devpost.

## Past-year patterns
[U] Not researched (rubric uncalibrated). Placement estimates are low-confidence.

## Rules to respect
- No real customer data (T-Mobile). All transactions and storefronts are synthetic and clearly labeled as demos.
- Demo video ≤ 2:00, demo only.
- The agent drafts disputes and never files or sends them on its own.
