#!/usr/bin/env python3
"""Generate the synthetic STAND-IN message set (eval/standin/messages.jsonl).

This is NOT the T-Mobile dataset (still to be collected at the booth). It is template-generated from a seeded RNG so the Claim A
pipeline can run end to end. Because the templates were written by the same team as the detector, scores on it are optimistic and
only show that the pipeline works. Replace with the real set via load_dataset.py.
"""
import json
import os
import random

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
R = random.Random(2026)

NAMES = ["Maya", "Alex", "Sam", "Jordan", "Priya", "Chris", "Dana", "Luis"]
CARRIERS = ["Parcelo", "ShipRight", "SwiftPost", "QuickParcel"]
BANKS = ["Northbank", "Lakeside Bank", "Prairie Credit Union", "Summit Bank"]
SHOPS = ["Bayou Bakery", "Campus Tech", "Northloop Books", "Greenleaf Grocer", "Lonestar Tickets"]
BAD = ["{c}-redeliver.help", "{c}-pay.top", "secure-{c}.xyz", "{c}-verify.click", "{c}-update.live"]


def dom(name):
    return R.choice(BAD).format(c=name.lower().replace(" ", ""))


def scam():
    cat = R.choice(["delivery_fee", "toll_scam", "bank_impersonation", "prize_giveaway", "gift_card_request", "account_suspension", "tech_support", "investment"])
    c, b = R.choice(CARRIERS), R.choice(BANKS)
    amt = R.choice(["1.99", "2.49", "3.95", "4.95"])
    if cat == "delivery_fee":
        t = R.choice([f"{c}: Your package is held. Pay ${amt} redelivery fee within {R.choice([6, 12, 24])} hrs: {dom(c)}/pay",
                      f"{c} notice: delivery failed. Reschedule and pay a ${amt} fee now at {dom(c)}/r/{R.randint(100, 999)}"])
    elif cat == "toll_scam":
        t = R.choice([f"TollTag final notice: unpaid toll ${R.randint(4, 19)}.{R.randint(10, 99)}. Avoid ${R.choice([25, 50, 75])} fine, pay now: {dom('tolltag')}/tx",
                      f"Your toll balance is overdue. Pay today to avoid a late fine: {dom('tollpay')}"])
    elif cat == "bank_impersonation":
        t = R.choice([f"{b} ALERT: suspicious login. Verify your card number and PIN at {dom(b)} to keep your account open.",
                      f"{b}: your debit card is locked. Confirm your password and SSN here within 24 hours: {dom(b)}/unlock"])
    elif cat == "prize_giveaway":
        t = R.choice([f"You won a ${R.choice([250, 500, 1000])} gift card! Claim within 24 hours. Just confirm your SSN and a ${amt} shipping fee: {dom('prize')}",
                      f"Congratulations {R.choice(NAMES)}! You are our winner. Pay a ${amt} handling fee to release your prize: {dom('winner')}"])
    elif cat == "gift_card_request":
        n = R.choice(NAMES)
        t = R.choice([f"Hi it's {n}, new number! Can you buy {R.randint(2, 6)} gift cards for my boss? I'll pay you back, don't tell anyone.",
                      f"{n} here. I need you to purchase gift cards right now and send me the codes. Keep this between us."])
    elif cat == "account_suspension":
        t = R.choice([f"Your MeadowPay account will be suspended in 24 hours unless you re-enter your password: {dom('meadowpay')}",
                      f"Final notice: your account is locked. Verify your password immediately or it will be closed: {dom('account')}"])
    elif cat == "tech_support":
        t = R.choice([f"Receipt: Antivirus Pro renewal ${R.randint(199, 499)}.99. Not you? Call 1-800-555-0{R.randint(100, 199)} to cancel now.",
                      f"Your device has a virus. Call 1-888-555-0{R.randint(100, 199)} immediately to avoid data loss."])
    else:
        t = R.choice([f"Hot tip: my mentor turned $200 into $4,000 in a week with CoinBloom. DM me to join, spots close tonight.",
                      f"Guaranteed returns: double your money in 7 days, risk-free. Limited spots, join tonight: {dom('profit')}"])
    return t, cat


def legit():
    n, s, b, c = R.choice(NAMES), R.choice(SHOPS), R.choice(BANKS), R.choice(CARRIERS)
    kind = R.choice(["appt", "pickup", "ship", "code", "bank", "promo", "friend", "bill"])
    if kind == "appt":
        return f"Reminder: dentist appointment tomorrow {R.randint(1, 4)}:30 PM at Elm Street Dental. Reply C to confirm."
    if kind == "pickup":
        return f"{s}: your order #{R.randint(1000, 9999)} is ready for pickup until 6 PM today."
    if kind == "ship":
        return f"{c}: your package #{R.randint(100000, 999999)} is out for delivery today. Track it in the {c} app."
    if kind == "code":
        return f"Your verification code is {R.randint(100000, 999999)}. Don't share it with anyone."
    if kind == "bank":
        return f"{b}: a ${R.randint(5, 90)}.{R.randint(10, 99)} purchase at {s} was approved on your card ending {R.randint(1000, 9999)}. If this wasn't you, call the number on the back of your card."
    if kind == "promo":
        return f"{s}: weekend sale, 20% off everything. Show this text in store. Reply STOP to opt out."
    if kind == "friend":
        return R.choice([f"hey {n}, are we still on for lunch at noon?", f"Running 10 min late, save me a seat!", f"Can you send me the notes from class when you get a chance?"])
    return f"Your electric bill of ${R.randint(40, 160)}.00 is due on the 15th. Pay in the utility app or by autopay."


rows = []
for i in range(60):
    t, cat = scam()
    rows.append({"label": "scam", "category": cat, "text": t})
for i in range(60):
    rows.append({"label": "legit", "category": "legit_transactional", "text": legit()})
seen, out = set(), []
for r in rows:  # exact duplicates would leak across the split
    if r["text"] in seen:
        continue
    seen.add(r["text"])
    out.append(r)
for i, r in enumerate(out):
    r["id"] = f"s{i:03d}"
    r["source"] = "synthetic_standin"
path = os.path.join(ROOT, "eval", "standin", "messages.jsonl")
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w") as f:
    for r in out:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")
print(f"wrote {path}: {len(out)} messages, {sum(1 for r in out if r['label'] == 'scam')} scam")
