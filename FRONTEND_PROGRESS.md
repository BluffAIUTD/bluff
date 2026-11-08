# The Table, ported onto main (branch feat/poker-on-main, port 3104, DB bluff_pokermain)

Base: origin/main 1845f5f (5-item nav, card-first home, per-visitor accounts, Safe Signal phone, daily game with locked answers,
card watch, /extension). Direction C "The Table" from feat/frontend-poker is re-applied on top of main's components. Nothing
was merged: files main left alone were copied from feat/frontend-poker, files main changed were re-themed from main's version.

## Design system (unchanged from feat/frontend-poker)
Felt background painted on the body (grain, weave, light pools), walnut rail (nav, top bar), ivory card stock, brushed brass.
Fraunces (display) + Manrope (UI). Poker is a visual/interaction theme only: every label stays plain. No betting, no payments,
no random outcomes. All motion is transform/opacity and collapses under `prefers-reduced-motion`.

## Ported surface by surface
| Area | What changed (behavior, routes, labels and hooks kept) |
|---|---|
| Shell | Walnut tray nav with 5 chip buttons (Home, Card watch, Check a site, Daily game, Privacy), bottom tray on phones, dealer-button LIVE/DEMO, "Maya's card" account line, skip link |
| Phone preview | Rail-mounted phone button (label "T-Mobile alerts", aria-label unchanged), brass bezel, notification peek, hold bar, Bluff/Messages tabs, reply chips, Report to Bluff. Escape closes and returns focus; opening focuses the input |
| Home | Hero with fanned cards, chip tiles, dealt "How Bluff works" cards, attention list, texts, Open my phone |
| Card watch (/scan) | Merchants are ivory cards with a suit, Rules/AI tier scores and a mini chip stack; detail is an ivory card with chip-stack tiers; Live push panel, watcher pill, NEW markers, partial scans, re-crawl all kept |
| Check a site | Chip store rack, felt inputs, flipping verdict card with chip-stack trust score, Leave / Continue / Continue and watch chips with slide-to-place, reused-result banner with Re-scan, exposure log below |
| Charge detail | Gold-line linked card (entered vs scam-text wording), site check card, verdict card, cream dispute letter with dealt evidence cards incl. cited pages and basis note |
| Daily game | Ivory flip card, tap-the-giveaway words, chip Legit/Bluff! buttons, chip progress and result chips, stats histogram, countdown, bonus card, archive, locked answers and resume untouched |
| Privacy, Eval, Extension | Restyled with the same tokens; data-flow diagram, claims tables, install guide |
| 404, error, loading, favicon, titles | Table-style not-found, error and "Dealing..." loading; chip favicon; title template |

## Verification actually run
- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 534/534 passed on 3 of 5 full runs (main's 527 plus the chip/flip/chip-press tests carried over from feat/frontend-poker). The other 2 runs each had exactly one backend DB test fail (`tests/gamegen.test.ts` "inserts valid cards for the day..." both times); each passes alone (2 of 2) and in the next full run, so it looks intermittent, not frontend related (no lib/ or test file was edited). Not run on pristine main to prove it is pre-existing.
- `npm run build`: passes.
- `E2E_BASE=http://localhost:3104 npm run e2e`: 128/128 checks passed.
- Screenshots (`tools/shoot.cjs` now includes /extension) and journey shots in /home/user/bluff-wt/shots/poker-main; animation webm there too.
- Keyboard and reduced-motion re-check: see the final report.

## Not done / caveats
- Live Nessie/Nemotron paths were not exercised (mock mode); the scan screenshots with data use Playwright route fixtures for review only (`*-fixture.png`), nothing shipped.
- Dark only. Next's dev indicator overlaps the nav corner in dev only.


# Aesthetic polish pass (branch feat/poker-polish, port 3105, DB bluff_polish)
Purely visual, on top of afcee45. No behavior, label, test id, aria or API change; main's 534 tests pass unchanged. To compare: before/after
screenshots in /home/user/bluff-wt/shots/polish/{before,after} (+ SUMMARY.md). To revert: do not merge this branch (every change is in
`app/globals.css`, `tailwind.config.ts` and a handful of class strings).

## Changelog of visual changes
1. Surface hierarchy: `--surface` is now a lighter raised felt (#174d3c) with a top highlight, soft drop shadow and brass hairline, instead of a
   translucent dark inset. The felt behind it is the darker stage.
2. Felt tonal range: a brighter central pool of light, a second pool at the top, and a left/right edge vignette (painted on the body, still not fixed).
3. Agent trace: one raised panel; steps separated by hairlines (no dark rows on dark felt); tool names are letterspaced small caps in gold or
   mint; input in small mono, softer grey; result line larger and in ivory; roomier rows. DOM text unchanged.
4. Type: section headings (privacy, exposure log, bonus card, eval, extension, scan detail, data flow, site check) moved from serif to sans bold.
   Serif stays for page titles, verdicts, scores and card faces. Page titles are larger (34px, 48px from sm) against 15px supporting text.
5. Brass restraint: filled brass stays on the one primary action per screen. Segmented tabs (AI/Rules, All/Flagged, stats bar) now use an
   ivory "on" state; "Dispute this charge" on the ivory card is a dark ink button; "Today's puzzle", "Simulate a charge", "Investigate this charge",
   "Post next charge" and "Charge the card" are secondary rail buttons.
6. Space and radii: card radius 18 to 22, control radius 10 to 12, page gaps 24-32 to 40-48, more top padding, scan merchant list gap 12, game column gap 28.
7. Motion: link cards rise 3px on hover with a deeper shadow and settle on press; panels that are links or have the sheen lift 2px; rail and ink
   buttons get a shadow shift on hover and press (140 to 160 ms); chip drop 440 ms (was 640); chip landing 480 ms with a small overshoot and settle.
   All of it is covered by the existing `prefers-reduced-motion` rule.
8. Nav footer: now a bordered note on two lines at 12px in a lighter ivory-green (6.5:1 on the walnut rail); desktop only (the rail is hidden on phones).
9. Contrast: status text colors lightened for the raised panel (scam #ffa097, unsure #f4bf5e, safe #7fe0ae, brass text #e8c681, dim #cfdccc).
   Measured on #174d3c: dim 6.8, brass 5.9, scam 4.96, unsure 5.8, safe 6.1, ivory 9.0 (all at least 4.5).
10. Fixes: site-facts values no longer overflow their panel; the Try-it (live push) title is sans.

## Verification
typecheck and lint clean; `npm test` 534/534; `E2E_BASE=http://localhost:3105 npm run e2e` 128/128; keyboard and reduced-motion scripts re-run
(focus rings on every stop, Enter/Space on chips, phone Escape returns focus, card ends flipped and chips static under reduced motion, CLS 0).
