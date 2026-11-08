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
(see bottom, updated at the end)
