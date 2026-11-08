# Frontend redesign C: "The Table" (branch feat/frontend-poker, port 3103, DB bluff_poker)

## Design brief
- **Idea**: the whole app is a card table. Poker is a visual and interaction theme only; every label stays plain
  ("Check a store", "Scan my transactions", "Build dispute"). No betting, no payments, no random outcomes.
- **Palette**: deep felt green (layered radial gradients + SVG noise + fine weave), charcoal/walnut rail (nav, top bar),
  ivory card stock, brushed brass (gradients and hairlines) as the only accent. Verdict colors are muted card-suit tones:
  red (scam), amber (unsure), mint (safe).
- **Type**: Fraunces (display serif: headings, card faces), Manrope (UI), tabular numerals for money and scores.
- **Navigation**: left "tray" on desktop with round chip-shaped nav buttons; bottom tray on phones. The top rail holds the
  demo user, a dealer-button mode badge (LIVE or DEMO) and the T-Mobile phone, which rests on the rail.
- **Signature interactions** (all tied to real state):
  1. Trust score is a chip stack (10 points per chip, chip color = verdict band) that builds with staggered drops when a verdict arrives.
  2. Verdicts and /play cards are ivory playing cards with corner indices and drawn suit glyphs (scam, unsure, safe); they flip in 3D on reveal.
  3. Leave / Continue / Continue and watch my charges are chip buttons; the chosen chip slides to a "placed" spot once the exposure is logged.
  4. Linked charge: exposure card and charge card on the felt joined by a gold line; match reasons are small chips.
  5. Dispute packet: "your hand". Letter on cream stock, evidence timeline dealt as small cards.
- **Motion**: transform/opacity only, `prefers-reduced-motion` collapses everything to the final state.
- **Mobile (390px)**: table stays usable, nav becomes the bottom tray, cards stack vertically.

## Checklist status
(see bottom; updated at the end)
