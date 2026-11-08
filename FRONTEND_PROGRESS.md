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
| F1 Shell: tray nav (8 routes), active state, dealer-button LIVE/DEMO, demo user, phone preview (alerts, forward, commands), keyboard, focus ring, skip link | done, verified in Chromium at 1280 and 390 |
| F2 Overview: hero, at-a-glance chip tiles, how-it-works cards, needs attention, latest exposures with chip scores, alerts, CTA, empty + DB-error states | done |
| F3 /scan: merchants as ivory cards with mini chip stacks and Rules/AI tier scores, merchant detail as a card with tier panels (chip stacks), AI/Rules tabs, site facts, crawl pages, re-crawl, loading, error, empty, not-connected and deep-off notices | done. Covered by 9 component tests with test-only fixtures. Live Nessie scan not run (no key in this environment); the real /scan in mock mode shows the honest "not connected" empty state. The fixture screenshots (`*scan-results-fixture.png`) use Playwright route interception, nothing is shipped in the UI |
| F4 /check: 10 store chips, URL, paste text, streamed trace, verdict card flip + chip stack, Leave / Continue / Continue and watch chips with slide-to-place, Simulate a charge | done |
| F5 /charges, /charges/[id]: linked cards with gold line + reason chips, trace, sparkline, Refund Builder as "your hand" (cream letter, dealt timeline cards) | done |
| F6 /exposure, F7 /play (card flip, chip results), F8 /eval, F9 /privacy (data flow restyled) | done |
| F10 Quality: skeletons, empty, error, success, disabled; custom not-found, error and loading (dealing cards) screens; favicon (chip), title template | done |

## Verification (what was actually run)
- `npm run typecheck`, `npm run lint`: clean. `npm run build`: passes.
- `npm test` (after `npm run db:reset`): 350/350 passed on a second full run. The first full run failed once on
  `tests/transactions.test.ts` "legit store: charge is an 'expected charge', no alert for it". That test builds its own
  database (`bluff_txn_api_test`, see tests/testdb.ts), so my manual runs against `bluff_poker` cannot cause it. It passes alone
  (3 of 3 runs) and in most full runs, and it fails intermittently under load (it asserts an empty `messages` table after a
  fixed 100 ms sleep, which races an async alert insert). I did not change lib/ or tests to hide it, and did not run it on base
  to prove it is pre-existing (no frontend file is involved).
- `E2E_BASE=http://localhost:3103 npm run e2e`: all checks passed.
- Component tests: 60 before this round, now covering scan (9), chip stack bands/count, flip state, dealer button, chip-press
  actions (Leave logs nothing, failure keeps chips, success places the chip).
- Accessibility script (Playwright, real Chromium):
  - Tab order through skip link, brand, 8 nav items, phone button, store chips: every stop shows a 2px focus ring.
  - Enter on a store chip starts a check; Space on "Continue and watch my charges" logs the exposure.
  - Phone preview: focus moves to the message input on open; Escape closes it and returns focus to the Phone button.
  - Contrast measured (WCAG ratios): ivory on felt 10.6, dim text on felt 6.7, brass on felt 6.2, ink on ivory 13.9, muted card text 5.4 to 8.0, scam text raised to #f47b70 (4.6 on felt). Suit ink on ivory: scam 5.2, safe 4.7, unsure darkened to #8a5204. Focus ring switches to ink with a gold halo on ivory, and to a pale ring on brass buttons.
  - `prefers-reduced-motion: reduce` emulated: flip transition 1 microsecond, card ends flipped, chips render in final position, no animation classes.
  - Performance: animations touch only transform and opacity (flip, chip drop, chip place, deal, shimmer). Layout shift during run + reveal: CLS 0.0000. One 236 ms long task was recorded during the run in dev mode (first hydration and compile), not attributed to animation.

## Notes and assumptions
- Score semantics unchanged: higher = safer ("Trust score"). One chip per 10 points; chip color = band (under 40 red, 40 to 69 amber, 70+ green), top chip in the verdict color.
- ScoreDial keeps its name and aria-label (draws the chip stack, `scale` prop for small tiers). VerdictCard has an optional `flip` prop (stored verdicts render face up).
- The felt is painted on `body` (not fixed), so full-page captures show felt end to end. The fixed nav still ends at the viewport height in full-page captures (expected for fixed elements).
- Fonts: Fraunces + Manrope via next/font/google. No new dependencies.
- Store chip colors are decoration only and never hint at scam or legit.
- Screenshots: /home/user/bluff-wt/shots/poker. Animation: anim-chipstack-cardflip-chipplace.webm.
- No backend blockers found.

## Restart
`cd /home/user/bluff-wt/poker && npx next dev -p 3103` (Postgres must be up: `pg_ctl -D /var/tmp/bluff-pgdata -o "-p 5432 -k /tmp" start` as the postgres user if it was stopped).

## Not done
- Live (non-mock) scan streaming against Nessie and Nemotron was not exercised; only component-level fixtures and the honest mock state.
- No dark/light toggle (dark only).
- Next dev's "N" indicator overlaps the bottom-left of the nav in dev only.
