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


| Item | Status |
|---|---|
| F1 Shell: tray nav (8 routes), active state, dealer-button LIVE/DEMO, demo user, phone preview (alerts, forward, commands), keyboard + focus ring, skip link | done, verified in Chromium 1280 and 390 |
| F2 Overview: counts, needs attention, latest exposures with chip scores, alerts, CTA, empty + DB-error states | done |
| F3 /scan: restyled (felt panels, chips). In mock mode with no Nessie key it shows the honest "not connected" empty state; streaming and merchant detail restyled via tokens, not exercised live here | done, live path not verifiable offline |
| F4 /check: 10 store chips, URL, paste text, streamed trace, verdict card flip + chip stack, Leave / Continue / Continue and watch chips with slide-to-place, Simulate a charge | done |
| F5 /charges, /charges/[id]: linked cards with gold line + reason chips, trace, sparkline, Refund Builder as "your hand" (cream letter, dealt timeline cards) | done |
| F6 /exposure, F7 /play (card flip, chips for result), F8 /eval, F9 /privacy | done (eval and privacy restyle through tokens) |
| F10 Quality | reduced motion collapses all animation; no overflow at 390; no console or failed requests in the shoot and journey scripts |

## Verification
typecheck, lint clean; `npm test`: 333/334, the one failure (tests/transactions.test.ts "legit store ... no alert") depends on DB state left by manual e2e runs on the same DB; passes after `npm run db:reset`. `npm run build` passes. `E2E_BASE=http://localhost:3103 npm run e2e`: all checks passed.

## Notes and assumptions
- Score semantics unchanged: higher = safer ("Trust score"). One chip per 10 points; chip color = band (under 40 red, 40 to 69 amber, 70+ green), top chip in the verdict color.
- ScoreDial keeps its name and aria-label (now draws the chip stack). VerdictCard gained an optional `flip` prop (stored verdicts render face up).
- Fonts: Fraunces + Manrope via next/font/google. No new dependencies.
- Store chip colors are decoration and never hint at scam/legit.
- Screenshots in /home/user/bluff-wt/shots/poker (full-page captures show a dark band under the fold because the felt is `position: fixed`; viewport shots are accurate). Animation: anim-chipstack-cardflip-chipplace.webm.
- No backend blockers found.

## Restart
`cd /home/user/bluff-wt/poker && npx next dev -p 3103`

## Remaining
Scan streaming and ScanDetail get the global felt/brass look but no bespoke poker elements; light theme removed (dark only).
