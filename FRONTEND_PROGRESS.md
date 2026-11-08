# Frontend A: "The Case File" (light, editorial)

## Design brief
- Concept: Bluff keeps a case file. Every page reads like a typeset investigative dossier on warm paper, with exhibit labels, folios and hairline rules.
- Palette: paper `#F3EEE3`, card paper `#FBF8F1`, ink `#1B1A17`, hairline `#D6CDB8`. Signals: vermilion `#C7341C` (danger), forest `#1F6B52` (safe), amber `#8F5A00` (unsure). Accent for links and focus is a deep navy ink `#22314A`. All text pairs checked for AA on paper.
- Type (next/font/google): Fraunces (display serif, headlines and big numerals), Hanken Grotesk (UI), JetBrains Mono (descriptors, domains, amounts, timestamps, exhibit labels).
- Layout: no sidebar. Masthead (wordmark, user, mode badge, phone toggle) over a sticky section nav with folio numbers (01 Overview ... 08 Privacy). Mobile: bottom tab bar with folios. Asymmetric grid: wide main column plus a narrow marginalia column (alerts, notes). Evidence is set as lettered exhibits. Verdict reason is a pull-quote.
- Signature "The Thread": on the linked charge view and on Overview needs-attention rows a taut vermilion string is drawn (SVG stroke animation) from the exposure pin (site, date, fields typed) to the charge pin (amount, descriptor). Match reasons hang off it as tags. The string only exists when a real link exists; "no link" shows a dashed severed string. A verdict "stamp" (LIKELY SCAM / UNSURE / LOOKS OK) presses in once when a live verdict arrives. Scores are large serif numerals over a thin ruled gauge.
- Product fit: what happened / where / what next hierarchy, honest confidence always with its reason, mode labels (LIVE, DEMO, CACHED, REPLAYED, BASIC CHECK, Simulated) always visible, privacy copy in the footer and on Check, and the dispute packet is styled as a printable memo ending with "Bluff drafts. You decide."
- Motion: stroke draw, stamp press, count-up. `prefers-reduced-motion` gives instant final states.

## Checklist status

## Checklist status (verified in real Chromium, desktop 1280 and mobile 390)
- F1 Shell: done. Masthead + sticky folio nav (desktop), bottom tab bar (mobile, Eval desktop-only as before), LIVE/DEMO badge, demo user, phone preview (unchanged logic, keyboard and focus work).
- F2 Overview: done. Needs-attention rows draw a mini Thread when the linker has a real link (fetched via getTransactionDetail on the server); empty and DB-error states kept.
- F3 Scan: restyled, all states kept. In this mock environment Capital One is not connected and there are no imported transactions, so the page shows its honest empty state (button disabled, notices visible). The merchant list, tiers and detail layout were restyled but could not be exercised with live data here.
- F4 Check, F5 Charges and dispute packet (printable memo, Print button added), F6 Exposure, F7 Play, F8 Eval, F9 Privacy: done.
- F10: skeletons, empty, error, disabled states kept; reduced motion gives instant final states; no horizontal overflow; no console or network errors in shoot.cjs and journey runs.

## Verification
typecheck, lint, vitest (334 tests), `E2E_BASE=http://localhost:3101 npm run e2e` (all pass), `npm run build` pass. Component tests needed no changes.

## Changes beyond restyle
- Removed components/shell/Icon.tsx and the nav icon field (nav now uses folio numbers). VerdictCard gained optional `animate` and `exhibitFrom` props. Added components/thread/{Pin,MiniThread}.tsx. Fonts: Fraunces, Hanken Grotesk, JetBrains Mono via next/font/google. No package.json changes.

## Assumptions and tradeoffs
- Light theme only (dark removed). Paper grain is an inline SVG noise in CSS.
- Stamp plays on mount of a verdict card (live runs); stored verdicts on a charge page render without animation.
- The pull-quote is Nemotron's site summary when present; otherwise the confidence reason is set as the quote.

## Blockers
None in the backend. Note: scripted demo charges are dated a few days after the exposure, so dates can appear in the future relative to the clock.

## Restart
`cd /home/user/bluff-wt/a && nohup npx next dev -p 3101 > /tmp/claude-0/a.log 2>&1 &`
