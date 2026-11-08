# Frontend B: "Signal Console"

Branch `feat/frontend-b`, port 3102, DB `bluff_b`. Frontend only (components, app/(shell), globals, tailwind, layout). No API, lib, db or data changes.

## Design brief

**Concept.** Bluff as a calm, precise real-time protection console: a security product crossed with a developer tool. Dark only, graphite surfaces (#0A0C0F to #1B222A), 1px hairline borders, soft inner glows, tabular numerals.

**Palette.** One luminous accent, cool mint (#46F3B9), used for "live / safe / armed". Coral (#FF6B5E) is danger, amber (#FFB547) is unsure. Text #E8ECEF, dim #8D98A5 (AA on every surface). Mode colours are never the only signal: every state also has a word (LIVE, DEMO, BASIC CHECK, REPLAYED, CACHED).

**Type.** Geist for UI, Geist Mono for everything machine-like: domains, descriptors, trace lines, timestamps, counts. Uppercase micro-labels (10-11px, 0.14em tracking) name every panel.

**Layout and navigation.**
- Desktop: 64px icon rail on the left (tooltips + accessible names), slim top status bar (route, demo user, mode, search with Cmd/Ctrl+K, phone), and a persistent 320px "Agent Trace" dock on the right at >= 1280px (collapsible).
- Command palette (Cmd/Ctrl+K or the visible Search button): routes, the 8 demo stores (runs the check), recent exposures and flagged charges from real data, and real actions (open phone, check a link, check a text, post next demo charge, delete everything page).
- Mobile: bottom nav with a floating Check button in the middle, a More sheet for the rest, and the trace as a bottom sheet.
- Overview is a bento grid: large status tiles (exposures, needs attention, armed state with radar), latest exposures, alert feed.

**Signature interaction.** Radar sweep + live trace. While a check runs, a sonar ring sweeps and every real agent step pings in as a mono line with its own timing delta (`+420ms`). The verdict resolves into a segmented trust meter that fills to the real score. Linked charge: exposure and charge are two nodes on a horizontal timeline, a pulse travels along the real link, match reasons sit below as chips. Reduced motion gives static states for all of it.

**How it serves the product.** Honest confidence (always shown with its reason), mode label on every result, privacy one click away (rail icon, palette, and a "what leaves your device" strip in the check panel), dispute packet as a split view (letter left, evidence timeline and next steps right), "Bluff drafts. You decide." always visible. The trace dock only shows real run steps or real recent data (latest exposures and alerts); nothing is simulated.

## Checklist status (verified in Chromium at 1280 and 390)
- F1 shell: done (icon rail, top bar, Cmd/Ctrl+K palette, phone preview opens from button/palette/More sheet, mode badge, skip link, focus ring).
- F2 overview bento: done, with empty and DB-error states.
- F3 /scan: restyled, `?start=1` autostarts. In this mock env Nessie is not configured, so the scan button is disabled and the honest "not connected" notice shows; streaming rows could not be exercised live here (code path unchanged, deep steps also feed the dock).
- F4 /check: done end to end (trace, verdict, Leave/Continue/Continue and watch, exposure, simulate charge).
- F5 /charges, /charges/[id]: done (timeline link with travelling pulse, split dispute packet).
- F6 /exposure, F7 /play, F8 /eval, F9 /privacy: restyled, behavior unchanged.
- F10: no console errors or overflow across routes (shoot.cjs, e2e), reduced motion disables sweeps/pulses.
- Checks: typecheck, lint, vitest (334 pass), build, e2e all pass. Tests updated for the new nav slots and trace timing markup.

Known tradeoffs: the dock is hidden below 1280px (sheet instead); the inline trace and dock intentionally mirror each other; phone preview keeps T-Mobile magenta branding.

## Assumptions
- Mock agent mode is the backend's own labeled offline mode; the UI keeps its labels.
- Trust score semantics are unchanged (high = safer); the segmented meter fills with the trust score.

## Blockers (backend)
None so far.

## Restart
```
cd /home/user/bluff-wt/b && nohup npx next dev -p 3102 > /tmp/claude-0/b.log 2>&1 &
```
