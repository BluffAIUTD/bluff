# product_spec.md: Bluff

## 1. Product requirements (true at submission)
1. A judge can open `bluff.<domain>` on a phone, with no login, and complete the core loop: check a store → log exposure → simulate a charge → see the link → build a dispute.
2. Every agent run streams a visible trace and returns a `Verdict` (score, verdict, confidence, confidence reason, category, evidence, next steps, links).
3. Every pillar works in its thin-slice form on seeded or real synthetic data. A pillar that doesn't work is removed from navigation, never shown half-built.
4. The Bluff Text number receives forwarded texts and replies with a verdict. It sends alerts for high-risk exposures and linked charges.
5. `/eval` shows Claims A and B with the baselines and at least 3 failure cases, from real runs.
6. No typed values or page text leave the client. All data is synthetic. Demo stores say so in their footer.
7. The agent never files, sends or pays anything on its own. All actions are drafts or the user's choice.
8. Live, cached and replayed results are always labeled.

## 2. User stories + acceptance criteria

### Core loop
**CL-1.** As a user, I want one continuous flow from checking a store to getting a dispute packet so I understand the whole value in a minute.
- AC: From `/check`, after a verdict, the "I entered info here" button creates an exposure and shows a CTA **"Simulate a charge from this store"**.
- AC: That CTA posts the linked seeded charge for that store and routes to `/charges/[id]` with the trace streaming.
- AC: The linked-charge card names the exposure's domain, date, score and field types.
- AC: "Build dispute" renders the packet in < 8 s, or shows the failure state.
- AC: An alert is sent to the user's T-Mobile phone view at exposure (score < 40) and at link.

### P1 Checkout Guard
**P1-1.** As a shopper, I want a verdict when a page asks for sensitive info, not on every page.
- AC (extension): activates only when the page has inputs whose type, name, autocomplete or label matches card number, CVV, SSN, password, phone, date of birth or street address.
- AC: never reads `.value` of any input; sends `{url, host, fieldTypes[], signals{}}` only.
- AC: skips hosts on the allowlist (top retailers and banks seed list) and hosts the user marked SAFE.

**P1-2.** As a shopper, I want a score with reasons and safer options.
- AC: The panel shows ScoreDial (0–100), verdict label (Likely scam < 40 / Unsure 40–69 / Looks OK ≥ 70), ConfidencePill with reason, 3 evidence bullets, 2–4 next steps.
- AC: Buttons: **Leave**, **Continue**, **Continue and watch my charges**. The last two create an exposure; "watch" sets `watch=true`.

**P1-3.** As a judge without the extension, I want to try it from my phone.
- AC: `/check` has 8 storefront chips plus a free URL field and a "paste a text message" field.
- AC: Free URLs outside the demo set run with real signals that need no page fetch (domain, TLD, RDAP if enabled), and say "limited check: page not analyzed."

**P1-4.** As a user, I want to see where my info went.
- AC: `/exposure` lists exposures newest first: host, date, field types, score badge, watch toggle, linked charges count, delete.

### P2 Charge Watch + Refund Builder
**P2-1.** As a user, I want charges flagged with reasons.
- AC: `/charges` lists the demo user's transactions newest first with flag badges: Exposure link, Price drift, Duplicate, New subscription, Card test.
- AC: Flags compute on insert. Rule flags are instant; the agent adds an explanation and confidence.

**P2-2.** As a user, I want the charge linked to where I was exposed.
- AC: For a charge with a linker candidate (similarity ≥ threshold, within 0–45 days after the exposure), the detail page shows LinkedChargeCard with the connecting line, the exposure info and the match reasons (e.g., "descriptor 'FKSHP' ≈ 'fastkicks'", "charged 3 days after exposure").
- AC: Charges with no candidate show "No linked exposure", and the agent does not invent one.

**P2-3.** As a user, I want a dispute packet in one tap.
- AC: The packet has a letter (to the card issuer; fields: name, last-4 placeholder, date, amount, merchant, reason category, short narrative), an evidence timeline (exposure → alert → charge, with timestamps), and next steps (call the number on your card, ask for a dispute, lock or replace the card, watch for repeat charges, change reused passwords).
- AC: Actions: Copy letter, Download (.txt or PDF if time), Mark as filed (status only). Nothing is sent automatically.
- AC: A banner says "Bluff drafts. You decide. Not legal or financial advice."

**P2-4.** As a presenter, I want to trigger the charge on cue.
- AC: A demo control (visible only with `?demo=1`, or always on the demo user) posts the next scripted charge.

### P3 Bluff Text
**P3-1.** As a user, I want an text when something risky happens.
- AC: Alert on exposure with score < 40: "You just entered your {fieldTypes} on {host}, a site registered {age} days ago. Reply WATCH and I'll check for charges from it."
- AC: Alert on a linked charge: "${amount} from {descriptor} matches {host}, where you entered your card on {date}. Reply DISPUTE and I'll draft it."
- AC: At most 1 alert per event and 5 per hour per user.

**P3-2.** As a user, I want to forward a suspicious text and get a verdict.
- AC: An inbound message that isn't a command runs the agent in message mode and replies within 15 s: "{Verdict label} ({score}/100, {confidence}% sure). Why: {top 2 evidence}. Do: {top next step}."
- AC: If the message contains a URL, include link signals.
- AC: Show a typing indicator while working, if the SDK supports it.

**P3-3.** As a user, I want simple reply commands.
- AC: WATCH (sets watch on the last alerted exposure), DISPUTE (replies with a link to the packet), SAFE (allowlists the host), STOP (pauses alerts), HELP. Commands are case-insensitive.

**P3-4 (stretch).** As a user facing the highest-risk event, I want a phone call.
- AC: For a linked charge ≥ $40 with score < 30, place a call with a short spoken summary; fall back to a text.

### P4 Call the Bluff
**P4-1.** As a player, I want 5 cards a day.
- AC: `/play` shows today's 5 cards (deterministic by date from the pool). Each is a text, checkout snippet, email, receipt or bank alert rendered as a card.
- AC: Buttons **Legit** / **Bluff!** Then the card flips, red-flag spans highlight with a one-line why each, and the category is shown.

**P4-2.** As a player, I want a score, streak and share.
- AC: End screen: score/5, streak (days in a row, stored per user), weakest category, and **Share** copies "Call the Bluff #{n} 🟥🟩🟩🟥🟩 4/5 bluff.<domain>/play" with no answers revealed.
- AC: One play per day per user counts toward the streak; replays are practice.

**P4-3 (P1).** As a player, I want fresh cards.
- AC: A nightly or on-demand job generates 5 cards via Nemotron from taxonomy categories plus one lookalike of a recently flagged pattern. Each card is validated against the schema and needs ≥ 1 marked red flag for scam cards. Falls back to the seeded pool.

### Shared
**S-1.** As a judge, I want to see the agent think.
- AC: AgentTrace streams each step: tool name, a one-line input summary, a one-line result, ms. It ends with "Verdict ready" and a total time.

**S-2.** As a judge, I want proof.
- AC: `/eval` shows two tables (Claim A, Claim B): method, n, precision, recall, F1 for Bluff and the baseline, the split description, and 3+ failure cases with notes. Data comes from committed result JSON with a timestamp.

**S-3.** As a privacy-minded user, I want control.
- AC: `/privacy` shows the device/server diagram, the table of what is and isn't sent, and **Delete everything** (clears the user's exposures, verdicts, messages and game data; re-seeds the demo user).

## 3. Edge cases
- The same host is checked twice: reuse the verdict if it's < 24 h old (shows "checked earlier"), but always create a new exposure on submit.
- Exposure on a legit store, then a legit charge from it: link shown as **"Expected charge"** (green), not flagged.
- Payment-processor descriptors (`SQ *`, `PAYPAL *`, `SP *`, `TST*`): strip the prefix before matching.
- Two exposures match one charge: show the best match and mention "1 other possible match".
- A charge before the exposure date: never linked.
- A forwarded message is empty, only an image, or over 2,000 characters: specific replies (see failure states).
- A user texts from a number that isn't registered: treat as a guest; verdicts only, no account data.
- Extension on a page with a card field inside an iframe (Stripe Elements etc.): detect through the iframe host and the "Payment" label; treat the payment iframe as normal.
- Clock and timezones: store UTC, display America/Chicago.
- Game played across midnight: the card set is fixed by the date when it was opened.

## 4. Failure states (every AI or external-API feature)
| Feature | Empty input | Slow (> threshold) | Malformed output | Refusal / low confidence | Rate limit / down |
|---|---|---|---|---|---|
| Agent verdict (`/check`, extension) | "Paste a link or pick a store" | > 3 s: keep streaming; > 12 s: "Taking longer than usual" + show cached verdict for demo hosts, labeled **cached** | Retry once with a repair prompt; then rules-only verdict labeled **"basic check"** | Confidence < 0.5: show **Unsure** with "What to check yourself" list, no red/green | Rules-only verdict, labeled; banner "AI check unavailable" |
| Charge linker + explanation | No transactions: EmptyState "No charges yet: simulate one" | > 12 s: show the SQL link (instant) with "explanation loading…", replay the last trace if needed, labeled **replayed** | Keep the SQL link; hide the AI explanation; show match reasons | Agent disagrees with SQL candidate: show "Possible match, low confidence" in amber | SQL link only + rules flags |
| Refund Builder | No linked charge: button disabled with tooltip | > 8 s: skeleton letter + "Still drafting" | Fall back to the template letter filled from data (no AI prose) | n/a | Template letter |
| Bluff Text inbound | "Send me a text or link to check, or HELP" | > 10 s: send "Checking… this one's taking a moment" then the verdict | Reply with rules-only verdict, labeled "(basic check)" | "I'm not sure about this one. Don't click links in it; contact the company through its official app." | Queue and reply "I'm overloaded, try again in a minute" |
| Bluff Text outbound | n/a | Retry with backoff ×3 | n/a | n/a | Log failure; show "Text not delivered" in the dashboard alert feed |
| Game generation | n/a | Use the seeded pool | Drop the card; fill from the pool | Drop the card | Seeded pool |
| Domain intel (RDAP) | n/a | 2 s timeout → "age unknown" | "age unknown" | n/a | Mock registry for demo hosts; "age unknown" otherwise |
| Embeddings / taxonomy match | n/a | 2 s timeout → keyword match | Keyword match | n/a | Keyword match |

## 5. Feature priority
**P0 (demo-blocking: core loop + thin slice of every pillar)**
- Agent service with tool calling, `Verdict` schema, SSE trace
- `/check` with 8 storefronts + text mode; exposure creation
- `/charges`, linker SQL, exposure-link + price-drift flags, demo trigger, `/charges/[id]` with Refund Builder (template + AI letter)
- Phone-view outbound alert + inbound forward-to-check + WATCH/DISPUTE
- `/play` with seeded pool, flip, score, streak, share text
- `/eval` with Claims A and B, `/privacy` (static diagram + table)
- Navigation shell, design tokens, seeded demo user, deployment on Vultr + domain + HTTPS

**P1 (depth + cross-links)**
- Chrome extension (P1 auto-detection)
- `/exposure` timeline page
- Duplicate, new-subscription and card-test flags; price-history sparkline
- SAFE/STOP/HELP commands; rate limiting
- Generated game cards + lookalike card; weakest-category stat
- Delete-everything; cached/replayed fallbacks hardened
- Stretch eval (40–50 cases, second baseline)

**P2 (extras)**
- Voice call (removed)
- Leaderboard
- Screenshot/image forwarding
- Real RDAP for arbitrary hosts
- PDF export of the packet

**Cut order:** voice call → leaderboard → image forwarding → real RDAP → generated cards → extension (keep `/check`). Never cut the core loop.
