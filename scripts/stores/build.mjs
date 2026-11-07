// Generates stores/<slug>/index.html for the 8 demo storefronts. Run: node scripts/stores/build.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "stores");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const SCAM = {
  "fastkicks-shop": { name: "FastKicks", palette: ["#111", "#ff3b3b"], hero: "Retro Runner", sub: "85% OFF", old: "$220", price: "$32.99", scarce: "Only 3 left in your size!", countdown: "09:59",
    pay: "We accept gift card or crypto only.", badge: "Official outlet sale", extra: ["Free shipping worldwide", "Limited stock"], title: "Retro Runner Sale – FastKicks" },
  "deliveryfix-help": { name: "DeliveryFix", palette: ["#0b3d91", "#ffcc00"], hero: "Your parcel is on hold", sub: "Pay a $1.99 redelivery fee", old: "", price: "$1.99", scarce: "Action needed: parcel returns to sender soon", countdown: "11:59",
    pay: "Pay the fee by card to reschedule delivery.", badge: "Postal service notice", extra: ["Tracking ID: 9400 1118 9922", "Reschedule within 12 hours"], title: "Reschedule delivery – DeliveryFix" },
  "tollpay-tx": { name: "TollPay TX", palette: ["#14532d", "#fde047"], hero: "Final notice: unpaid toll", sub: "Avoid a $50 fine", old: "", price: "$8.40", scarce: "Final notice: pay today to avoid a $50 fine", countdown: "14:59",
    pay: "Pay your balance now with a debit or credit card.", badge: "State toll authority", extra: ["Account balance: $8.40", "Late fees apply after midnight"], title: "Pay toll balance – TollPay TX" },
};
const LEGIT = {
  "bayou-bakery": { name: "Bayou Bakery", palette: ["#3b2a1a", "#e6a15c"], hero: "Fresh pastries, ready in 20 minutes", price: "$12.50", product: "Pastry box (6)", title: "Bayou Bakery – order ahead" },
  "northloop-books": { name: "Northloop Books", palette: ["#1f2a44", "#9ec1ff"], hero: "Independent bookshop since 2009", price: "$23.50", product: "Staff pick: the month's novel", title: "Northloop Books – shop" },
  "campus-tech": { name: "Campus Tech", palette: ["#0f172a", "#38bdf8"], hero: "Cables, chargers and student discounts", price: "$12.99", product: "USB-C cable, 6 ft", title: "Campus Tech – accessories" },
  "lonestar-tickets": { name: "Lonestar Tickets", palette: ["#4a1d1d", "#f59e0b"], hero: "Concerts and games near you", price: "$98.00", product: "2 tickets, Saturday night", title: "Lonestar Tickets – checkout" },
  "greenleaf-grocer": { name: "Greenleaf Grocer", palette: ["#14532d", "#86efac"], hero: "Local groceries delivered", price: "$42.10", product: "Weekly produce box", title: "Greenleaf Grocer – delivery" },
};

const form = (btn) => `
  <form id="pay" autocomplete="on" novalidate>
    <label>Name on card <input name="cardholder" autocomplete="cc-name" required></label>
    <label>Card number <input name="card_number" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" required></label>
    <div class="row"><label>Expiry <input name="exp" autocomplete="cc-exp" placeholder="MM/YY"></label>
    <label>CVV <input name="cvv" inputmode="numeric" autocomplete="cc-csc" placeholder="123"></label></div>
    <button type="submit">${btn}</button>
    <p id="note" role="status" hidden>Demo store: nothing was submitted or charged.</p>
  </form>`;

const page = ({ title, palette, body, footerNav }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:${palette[0]};--fg:${palette[1]}}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#fafafa;color:#111}
header{background:var(--bg);color:var(--fg);padding:16px 20px;font-weight:700;font-size:20px}
main{max-width:560px;margin:0 auto;padding:20px}
.hero{background:var(--bg);color:#fff;border-radius:14px;padding:24px;margin-bottom:16px}
.hero h1{margin:0 0 6px;font-size:28px}.hero .sub{font-size:22px;color:var(--fg);font-weight:800}
.banner{background:#fff3cd;border:1px solid #ffe08a;border-radius:10px;padding:10px 14px;margin:12px 0;font-weight:600}
.timer{font-variant-numeric:tabular-nums;font-size:22px;font-weight:800;color:#c00}
form{display:grid;gap:12px;background:#fff;border:1px solid #ddd;border-radius:14px;padding:16px}
label{display:grid;gap:4px;font-size:14px;font-weight:600;min-width:0}input{font:inherit;width:100%;min-width:0;padding:12px;border:1px solid #bbb;border-radius:8px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
button{font:inherit;font-weight:700;padding:14px;border:0;border-radius:10px;background:var(--bg);color:#fff;cursor:pointer}
footer{max-width:560px;margin:24px auto;padding:0 20px 32px;font-size:13px;color:#555}
footer nav{display:flex;gap:14px;margin-bottom:8px}footer a{color:#333}
.demo{border-top:1px solid #ddd;padding-top:10px;font-weight:600}
</style></head><body>
${body}
<footer>${footerNav}<p class="demo">Demo store, not real. Synthetic data for the Bluff demo. Do not enter real payment details.</p></footer>
<script>
document.getElementById('pay').addEventListener('submit',function(e){e.preventDefault();document.getElementById('note').hidden=false;});
</script></body></html>
`;

for (const [slug, s] of Object.entries(SCAM)) {
  const body = `<header>${esc(s.name)}</header><main>
  <section class="hero"><p>${esc(s.badge)}</p><h1>${esc(s.hero)}</h1><p class="sub">${esc(s.sub)}${s.old ? ` <s style="opacity:.6">${s.old}</s> ${s.price}` : ""}</p></section>
  <p class="banner">${esc(s.scarce)}</p>
  <p class="timer" data-countdown="${s.countdown}">Offer ends in ${s.countdown}</p>
  <ul>${s.extra.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
  <p><strong>${esc(s.pay)}</strong></p>${form(`Pay ${s.price}`)}</main>`;
  fs.mkdirSync(path.join(root, slug), { recursive: true });
  fs.writeFileSync(path.join(root, slug, "index.html"), page({ title: s.title, palette: s.palette, body, footerNav: "" }));
}
for (const [slug, s] of Object.entries(LEGIT)) {
  const body = `<header>${esc(s.name)}</header><main>
  <section class="hero"><h1>${esc(s.hero)}</h1><p class="sub">${esc(s.product)} · ${s.price}</p></section>
  <p>Pay with card or PayPal. Returns accepted within 30 days; see our refund policy below.</p>${form(`Pay ${s.price}`)}</main>`;
  const footerNav = `<nav><a href="#contact">Contact us</a><a href="#about">About</a><a href="#refunds">Refund policy</a></nav><p id="refunds">Refund policy: free returns within 30 days with your receipt.</p><p id="contact">Questions? help@${slug}.example</p>`;
  fs.mkdirSync(path.join(root, slug), { recursive: true });
  fs.writeFileSync(path.join(root, slug, "index.html"), page({ title: s.title, palette: s.palette, body, footerNav }));
}
console.log("built", Object.keys({ ...SCAM, ...LEGIT }).length, "storefronts");
