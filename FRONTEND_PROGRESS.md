# Frontend A: "The Case File" (light, editorial)

## Design brief
- Concept: Bluff keeps a case file. Every page reads like a typeset investigative dossier on warm paper, with exhibit labels, folios and hairline rules.
- Palette: paper `#F3EEE3`, card paper `#FBF8F1`, ink `#1B1A17`, hairline `#D6CDB8`. Signals: vermilion `#C7341C` (danger), forest `#1F6B52` (safe), amber `#8F5A00` (unsure). Accent for links and focus is a deep navy ink `#22314A`. All text pairs checked for AA on paper.
- Type (next/font/google): Fraunces (display serif, headlines and big numerals), Hanken Grotesk (UI), JetBrains Mono (descriptors, domains, amounts, timestamps, exhibit labels).
- Layout: no sidebar. Masthead (wordmark, user, mode badge, phone toggle) over a sticky section nav with folio numbers (01 Overview ... 08 Privacy). Mobile: bottom tab bar with folios. Asymmetric grid: wide main column plus a narrow marginalia column (alerts, notes). Evidence is set as lettered exhibits. Verdict reason is a pull-quote.
- Signature "The Thread": on the linked charge view and on Overview needs-attention rows a taut vermilion string is drawn (SVG stroke animation) from the exposure pin (site, date, fields typed) to the charge pin (amount, descriptor). Match reasons hang off it as tags. The string only exists when a real link exists; "no link" shows a dashed severed string. A verdict "stamp" (LIKELY SCAM / UNSURE / LOOKS OK) presses in once when a live verdict arrives. Scores are large serif numerals over a thin ruled gauge.
- Product fit: what happened / where / what next hierarchy, honest confidence always with its reason, mode labels (LIVE, DEMO, CACHED, REPLAYED, BASIC CHECK, Simulated) always visible, privacy copy in the footer and on Check, and the dispute packet is styled as a printable memo ending with "Bluff drafts. You decide."
- Motion: stroke draw, stamp press, count-up. `prefers-reduced-motion` gives instant final states.

## Status (round 2: expanded and polished)
Done and verified in real Chromium at 1280 and 390 (screenshots in shots/a):
- All pages: shell (masthead, folio nav, mobile tab bar, skip link), Overview (Thread rows on real links, marginalia), Scan, Check, Charges and detail (Thread, verdict stamp, dispute memo), Exposure, Play, Eval, Privacy, custom 404 (app/not-found.tsx) and error boundary (app/error.tsx), favicon, title template ("Page | Bluff").
- Scan: component tests in components/scan/scan.test.tsx cover loading skeleton, empty/not-connected state, load error, merchant list ranking, merchant detail with basic and deep tiers, re-crawl (POST ?fresh=1), streamed progress via a fake EventSource, scan-start error. Fixtures are test-only. Screenshots named `scan-fixture-*` were taken with a Playwright harness that intercepts `/api/scan*` responses with fixtures (harness not committed, no fake data shipped in the app). The live app in this environment still shows the honest empty state (`desktop-scan.png`, `j6-*`).
- Accessibility (Playwright run): skip link is first Tab stop; Tab reaches all 8 nav links; 2px focus outline present; Check flow completed by keyboard; phone preview opens as a dialog, focus moves to its input, Tab and Shift+Tab stay inside, Escape closes and returns focus to the toggle; with `reducedMotion: reduce` the thread, tags and stamp render in their final state with no animation.
- Contrast (computed): dim text 6.1 to 6.7:1 on paper/card; vermilion, forest, amber text 4.9 to 6.0:1 on tinted badge backgrounds; navy accent 11:1. Inactive folio and eyebrow gray raised to the dim colour. Not run: an automated axe audit, screen-reader testing.
- Print: print stylesheet hides masthead, nav, footer and everything but the dispute packet, prints the full letter (the textarea is replaced by a print-only block so nothing is clipped), timeline and next steps, white background. Checked via PDF (shots/a/print-dispute-memo.pdf).
- Copy: em dashes removed from titles and tooltips.
- Checks: typecheck, lint (clean), vitest 339 tests, e2e, build all pass.

## Not verified / limits
- Live Nessie scan and live Nemotron deep results were not available (mock mode); the Scan UI was verified with fixtures only.
- Real-browser printing on paper, Safari and Firefox, and screen readers were not tested. Only Chromium.
- Full-page screenshots show the fixed mobile tab bar mid-page; that is a capture artifact.

## Round 1 notes
- Removed components/shell/Icon.tsx and the nav icon field. VerdictCard has optional `animate` and `exhibitFrom` props. Added components/thread/{Pin,MiniThread}.tsx. No package.json changes.
- Light theme only. Stamp plays when a live verdict card mounts; stored verdicts render statically.
- Scripted demo charges are dated a few days after the exposure, so dates can be later than the clock (backend demo data).

## Restart
`cd /home/user/bluff-wt/a && nohup npx next dev -p 3101 > /tmp/claude-0/a.log 2>&1 &`
