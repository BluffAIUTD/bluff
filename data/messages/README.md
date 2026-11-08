# Bluff synthetic message set (`bluff-synthetic-v1`)

`bluff-messages.jsonl` holds 306 short messages (SMS, iMessage, email), each labeled `scam` or `legit`. The "Call the Bluff" game uses them: the player guesses, then the red-flag phrases light up. They are also meant for a later eval.

**This is synthetic, self-made data. It is NOT T-Mobile data** and contains nothing from T-Mobile Safe Signal or any other real message corpus. We generated it with an LLM because no real dataset was available to us. Every company, bank, agency, app, domain, phone number and person in it is fictional.

## How it was made

1. **Generation.** `scripts/data/gen_messages.ts` calls NVIDIA Nemotron (`nvidia/nemotron-3.5-lightning-30b-a3b`, thinking off) through `lib/agent/llm.ts`.
   - One category per call, 8 messages per call, temperature rotating through 0.7, 0.8 and 0.9.
   - Up to 3 categories run at once. Batches within a category run in sequence, and each new batch is told the openings already used so it doesn't repeat them.
   - Each batch is told how many easy, medium and hard items to write. Each category has its own hint for what makes a hard example, and its own pool of fictional brands.
2. **Rule validation** (deterministic). An item is dropped if it:
   - is under 40 or over 320 characters;
   - names a real brand, bank, carrier, agency, app or famous person (a regex that extends `REAL_BRANDS` in `lib/gamegen.ts`);
   - has a phone number outside 555-01xx;
   - is a legit item with a domain other than `<brand>.example`, or a lookalike `.example` domain (verify, secure, login and so on);
   - is a scam item with a domain whose TLD is not on the risky list (.top .xyz .help .click .live .info .site .online .shop and similar);
   - contains placeholders like `[link]` or "redacted";
   - is a scam item with no red-flag span that appears exactly in the text.

   Spans that differ only in case are repaired from the text, and defanged `hxxp://` links are rewritten to `https://`.
3. **Model audit.** A second Nemotron call (temperature 0.1) reviews each batch. It rejects items that are off-category, carry the wrong label, use a brand that makes no sense for the content (a bakery holding a parcel), or have red flags that aren't actually suspicious.
4. **Dedupe.** Texts are normalized (case, digits, punctuation, whitespace). Exact duplicates and near-duplicates (token Jaccard ≥ 0.8) are dropped.
5. **Difficulty balancing.** Each category keeps roughly 35% hard, 35% medium and 30% easy.
6. **Human review.** We read every record.
   - We dropped 21 by hand: romance "openers" with no ask, off-category items, legit messages with mismatched sender domains, and "a friend texting you a code" filed as legit OTP. The script refilled them with `--fill`. One more scam was dropped when the cleanup left it with no red flag, and it was refilled the same way.
   - A cleanup step removes red flags that are just a brand name, and strips explanations that talk about the dataset itself ("fictional domain", "555 number", "hard pattern") rather than the message.
7. **Ordering.** Sorted by category, then generation order, with ids `bm-0001`… assigned last. Output order is deterministic for a given set of records. The model output itself is not deterministic, so a fresh run produces different messages.

Final full run: 652 raw items from 82 generation calls and 85 audit calls (about 6.5 minutes). 230 were dropped automatically:

| Reason | Dropped |
|---|---|
| model audit | 86 |
| scam domain not on a risky TLD (usually a scam that used `.example`) | 64 |
| real brand | 58 |
| legit domain not `.example` | 11 |
| length | 5 |
| placeholder | 2 |
| no valid span | 2 |
| email sender not an address | 2 |

The real-brand regex is deliberately broad, so some of those 58 are false positives (for example "southwest" or "steam" used as ordinary words).

## Record schema

```json
{"id":"bm-0305","channel":"imessage","sender":"(469) 555-0188","subject":null,
 "text":"Hey Elena, it's Femi from PocketSend. Before I drive over to meet up, I'll send a code to make sure you're not a bot, just text it back please. Thanks!",
 "label":"scam","category":"verification_code_theft","difficulty":"hard",
 "red_flags":[{"span":"make sure you're not a bot","why":"Friendly pretext to trick the victim into forwarding the code"}],
 "source":"bluff-synthetic-v1"}
```

| field | meaning |
|---|---|
| `id` | `bm-NNNN`, stable within this file version |
| `channel` | `sms` \| `imessage` \| `email` |
| `sender` | phone number (555-01xx), 5-digit short code, email address, or a saved-contact first name |
| `subject` | email subject or `null` |
| `text` | message body, 63–318 chars (median 148), may contain `\n` |
| `label` | `scam` \| `legit` |
| `category` | one of the ids below |
| `difficulty` | `easy` \| `medium` \| `hard` (the generator's intent, not measured human difficulty) |
| `red_flags` | scam: 1–3 `{span, why}`. Each `span` is an exact, case-sensitive substring of `text` (3–60 chars) and each `why` is at most 90 chars. Legit: always `[]` |
| `why_legit` | optional, legit only, at most 120 chars: the reassuring cue (129 of 136 legit items have one) |
| `source` | `bluff-synthetic-v1` |

## Counts

306 total: **170 scam (55.6%)** and **136 legit (44.4%)**.

| Difficulty | Count | Share |
|---|---|---|
| easy | 101 | 33.0% |
| medium | 103 | 33.7% |
| hard | 102 | 33.3% |

Hard items make up 57/170 (34%) of scams and 45/136 (33%) of legit messages.

| Channel | Scam | Legit |
|---|---|---|
| sms | 108 | 73 |
| imessage | 32 | 18 |
| email | 30 | 45 |

| Scam category (10 each) | Legit category (17 each) |
|---|---|
| account_suspension, bank_impersonation, delivery_fee, fake_store, family_emergency, gift_card_request, government_impersonation, investment_crypto, job_offer, prize_giveaway, refund_overpayment, rental_deposit, romance, subscription_trap, tech_support, toll_scam, verification_code_theft | legit_account_notice, legit_appointment, legit_bank_alert, legit_delivery, legit_marketing, legit_otp, legit_personal, legit_transactional |

Hard cases are included on purpose:
- Legit messages with urgency, such as "Code 482913 expires in 10 minutes…", "We paused your card… call the number on the back of your card", or "pickup by 7 PM today or it returns to stock".
- Scams that are polite, have no link (call or reply instead), or use a plausible lookalike domain (`signalwave-verify.help`).

## Fictional conventions

- **Brands.** Examples: Parcelo, ShipRight, Swiftbox, Courierly (delivery); TollTag, RoadPass, Metro Tollway Authority (tolls); Northbank, Harborline Bank, Lakeview Credit Union, Cedar Trust (banks); MeadowPay, Zippit, PocketSend, Ferro Wallet (payments); ShopLane, Brightcart, Oakmart (stores); Westland State Tax Office, Lakemont County Court, Federal Benefits Bureau (government). The model also invents similar names.
- **Domains.** Legit messages use only `<brand>.example`. Scam messages use risky TLDs or lookalikes. `.example` is reserved (RFC 2606), but the risky-TLD scam domains are not, and some may happen to be registered by someone. Don't make them clickable in the UI.
- **Phone numbers.** Only the 555-01xx range (reserved for fiction), plus 5-digit short codes. A few use 555-01xx without an area code.

## Known limitations

- **One model wrote everything.** Phrasing is more uniform than real traffic: many scams share the same tells ("Reply YES", `-verify.help`). Legit messages are cleaner than real ones (no typos, no real-world clutter). Don't read eval scores on this set as real-world accuracy.
- **Labels.** Labels come from the category requested, checked by a model audit and one read-through by a person. They have not been checked by multiple people. A few items are borderline by design; hard legit items in particular could reasonably be doubted.
- **Difficulty** is what the generator was told to aim for, not measured. Some "hard" items are not very hard, especially in `legit_personal`.
- **Red flags.** Spans are exact substrings, but some are weak: a bare amount like `$129.99`, or a phrase ending mid-sentence like `failed. Call`. Scam items have 1.6 flags on average (62 have 1, 107 have 2, 1 has 3).
- **Minor oddities remain.** Some senders don't match well (a person's name as the sender of a store text). Some emails sign off from a person at a company domain. The romance and family scams use a few names (James, Alex) outside the suggested name list.
- **Coverage.** English only, US-centric (dollars, US phone formats). No images, attachments or multi-message threads.
- **Not reproducible byte-for-byte.** Re-running the generator produces different messages, which need a new review pass.

## Regenerate

```bash
npx tsx --env-file=.env scripts/data/gen_messages.ts                         # full run, about 6-7 min, needs NVIDIA_API_KEY + NEMOTRON_MODEL
npx tsx --env-file=.env scripts/data/gen_messages.ts --only romance,legit_otp  # replace just these categories
npx tsx scripts/data/gen_messages.ts --drop bm-0012,bm-0140                   # remove hand-reviewed bad records (re-ids the file)
npx tsx --env-file=.env scripts/data/gen_messages.ts --fill                   # top up categories below target, keeps existing records
npx tsx scripts/data/gen_messages.ts --validate                               # re-check the file and print counts (exit 1 on problems)
```
