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
