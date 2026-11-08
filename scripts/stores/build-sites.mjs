// Generates the multi-page scam storefront websites in stores/<slug>/ (home, products, about, contact, policies, checkout).
// They are served as real websites at <slug>.<BASE_DOMAIN> (Caddy in production, middleware.ts in dev) and crawled over HTTP.
// Every page carries a visible "Demo store, not real" label (marked data-demo-label so the crawler can ignore our own label),
// a noindex meta tag, no external URLs, and forms that never submit.
// Run: node scripts/stores/build-sites.mjs   (after scripts/stores/build.mjs)
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "stores");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const css = (p) => `:root{--brand:${p.brand};--accent:${p.accent};--ink:#14161a;--muted:#5b6170;--line:#e4e6eb;--bg:#f7f8fa}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
a{color:inherit}.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
.top{background:var(--brand);color:#fff}.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px;flex-wrap:wrap}
.logo{font-weight:800;font-size:22px;letter-spacing:-.02em;text-decoration:none}.logo span{color:var(--accent)}
.top nav{display:flex;gap:18px;flex-wrap:wrap;font-size:15px}.top nav a{text-decoration:none;opacity:.9}
.strip{background:var(--accent);color:var(--brand);font-weight:700;text-align:center;padding:8px 12px;font-size:14px}
.hero{padding:40px 0 24px}.hero h1{font-size:clamp(28px,5vw,44px);line-height:1.1;margin:0 0 10px;letter-spacing:-.02em}.hero p{color:var(--muted);font-size:18px;margin:0 0 18px;max-width:640px}
.btn{display:inline-block;background:var(--brand);color:#fff;border:0;border-radius:10px;padding:13px 20px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin:16px 0 32px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:6px}
.thumb{aspect-ratio:4/3;border-radius:10px;background:linear-gradient(135deg,var(--brand),var(--accent));opacity:.85}
.price{font-weight:800;font-size:20px}.was{color:var(--muted);text-decoration:line-through;font-weight:500;font-size:15px;margin-left:6px}
.tag{display:inline-block;background:#ffe9e9;color:#b00020;border-radius:999px;padding:2px 10px;font-size:13px;font-weight:700}
.banner{background:#fff4d6;border:1px solid #f2d27a;border-radius:12px;padding:12px 16px;margin:12px 0;font-weight:600}
.timer{font-variant-numeric:tabular-nums;font-size:22px;font-weight:800;color:#c00020}
.doc{background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;margin:24px 0}.doc h1{margin-top:0}.doc h2{font-size:18px;margin-top:22px}
form{display:grid;gap:12px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;max-width:520px}
label{display:grid;gap:4px;font-size:14px;font-weight:600;min-width:0}input,select,textarea{font:inherit;width:100%;min-width:0;padding:11px;border:1px solid #c5c9d2;border-radius:8px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.small{font-size:13px;color:var(--muted)}
.foot{border-top:1px solid var(--line);margin-top:40px;background:#fff}.foot .wrap{padding:24px 20px;display:grid;gap:10px}
.foot nav{display:flex;gap:16px;flex-wrap:wrap;font-size:14px}.demo{margin:0;padding:10px 12px;border-radius:8px;background:#eef0f4;font-size:13px;font-weight:600}
`;

const cardForm = (btn, extra = "") => `
<form class="pay" autocomplete="on" novalidate>
  <label>Name on card <input name="cardholder" autocomplete="cc-name"></label>
  <label>Card number <input name="card_number" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456"></label>
  <div class="row"><label>Expiry <input name="exp" autocomplete="cc-exp" placeholder="MM/YY"></label><label>CVV <input name="cvv" inputmode="numeric" autocomplete="cc-csc" placeholder="123"></label></div>
  ${extra}
  <button class="btn" type="submit">${esc(btn)}</button>
  <p class="small" role="status" data-demo-label hidden>Demo store: nothing was submitted or charged.</p>
</form>`;

function layout(s, { title, body, description }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title>${description ? `\n<meta name="description" content="${esc(description)}">` : ""}
<link rel="stylesheet" href="/style.css">
</head><body>
<header class="top"><div class="wrap"><a class="logo" href="/">${s.logo}</a><nav>${s.nav.map(([h, t]) => `<a href="${h}">${esc(t)}</a>`).join("")}</nav></div></header>
${s.strip ? `<div class="strip">${esc(s.strip)}</div>` : ""}
<main class="wrap">${body}</main>
<footer class="foot"><div class="wrap">
<nav>${s.footer.map(([h, t]) => `<a href="${h}">${esc(t)}</a>`).join("")}</nav>
<p class="small">${s.legal}</p>
<p class="demo" data-demo-label>Demo store, not real. Synthetic website for the Bluff hackathon demo. Do not enter real payment details.</p>
</div></footer>
<script>document.querySelectorAll('form').forEach(function(f){f.addEventListener('submit',function(e){e.preventDefault();var n=f.querySelector('[role=status]');if(n)n.hidden=false;});});</script>
</body></html>
`;
}

const doc = (h1, sections) => `<article class="doc"><h1>${esc(h1)}</h1>${sections.map(([h, p]) => `${h ? `<h2>${esc(h)}</h2>` : ""}<p>${p}</p>`).join("")}</article>`;
const product = (p) => `<div class="card"><div class="thumb" aria-hidden="true"></div><strong>${esc(p.name)}</strong>${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ""}<div><span class="price">${p.price}</span>${p.was ? `<span class="was">${p.was}</span>` : ""}</div><a href="${p.href ?? "/checkout.html"}">View</a></div>`;

const SITES = {
  // 1. Obvious fake outlet: every classic signal on the homepage, plus template leftovers on the policy pages.
  "fastkicks-shop": {
    palette: { brand: "#111111", accent: "#ff3b3b" }, logo: "Fast<span>Kicks</span>", strip: "OFFICIAL OUTLET SALE · 85% OFF EVERYTHING · TODAY ONLY",
    nav: [["/", "Shop"], ["/products/retro-runner.html", "Retro Runner"], ["/about.html", "About"], ["/contact.html", "Contact"]],
    footer: [["/shipping.html", "Shipping"], ["/refund-policy.html", "Refund policy"], ["/privacy.html", "Privacy"], ["/terms.html", "Terms"]],
    legal: "© 2026 FastKicks Official Outlet. All rights reserved.",
    pages: {
      "index.html": { title: "Retro Runner Sale – FastKicks", description: "Official outlet. Retro Runner 85% off.", body: `
<section class="hero"><p class="tag">Official outlet sale</p><h1>Retro Runner 85% OFF</h1><p>Authentic sneakers from the world's top brands at outlet prices. <s>$220</s> now $32.99.</p>
<p class="banner">Only 3 left in your size!</p><p class="timer" data-countdown="09:59">Offer ends in 09:59</p></section>
<div class="grid">${[{ name: "Retro Runner", price: "$32.99", was: "$220.00", tag: "85% OFF", href: "/products/retro-runner.html" }, { name: "Air Glide Pro", price: "$29.99", was: "$180.00", tag: "83% OFF" }, { name: "Court Classic", price: "$27.99", was: "$160.00", tag: "82% OFF" }].map(product).join("")}</div>
<p><strong>We accept gift card or crypto only.</strong></p>${cardForm("Pay $32.99")}` },
      "products/retro-runner.html": { title: "Retro Runner – FastKicks", body: `
<section class="hero"><h1>Retro Runner</h1><p>Was $220.00 · <strong>Now $32.99</strong> · 85% OFF</p><p class="banner">Only 3 left in your size! 14 people are viewing this item.</p><p class="timer" data-countdown="09:59">Offer ends in 09:59</p></section>
<p>Sizes 6–13. Ships from our international warehouse. Payment by gift card or cryptocurrency only.</p><a class="btn" href="/checkout.html">Buy now</a>` },
      "about.html": { title: "About – FastKicks", body: doc("About FastKicks", [["", "FastKicks is the official clearance outlet of the world's top sneaker brands, proudly serving customers since 1998. We buy overstock directly from the factory and pass the savings to you."], ["", "Our team of 500+ employees works around the clock to bring you the best deals."]]) },
      "contact.html": { title: "Contact – FastKicks", body: doc("Contact us", [["", "We do not offer phone support. For order questions, message us on WhatsApp at +44 7700 900123 or email orders@fk-outlet-help.top. Replies within 7–10 business days."]]) },
      "shipping.html": { title: "Shipping – FastKicks", body: doc("Shipping", [["", "Orders ship in 15–30 business days from our international warehouse. Tracking numbers may not update until delivery."]]) },
      "refund-policy.html": { title: "Refund policy – FastKicks", body: doc("Refund policy", [["", "All sales are final. No returns or refunds on discounted items. Chargebacks will be reported to collection agencies."]]) },
      "privacy.html": { title: "Privacy – FastKicks", body: doc("Privacy policy", [["", "[COMPANY NAME] respects your privacy. We may share your information with our partners."]]) },
      "terms.html": { title: "Terms – FastKicks", body: doc("Terms of service", [["", "These terms apply to your use of [STORE NAME]. Lorem ipsum dolor sit amet, consectetur adipiscing elit."]]) },
      "checkout.html": { title: "Checkout – FastKicks", body: `<article class="doc"><h1>Checkout</h1><p><strong>We accept gift card or crypto only.</strong> Card payments are not accepted for sale items.</p>
<form novalidate><label>Gift card code <input name="giftcard"></label><label>Or send USDT/BTC to wallet <input value="bc1q-demo-wallet-not-real" readonly></label><button class="btn" type="submit">Confirm payment</button><p class="small" role="status" data-demo-label hidden>Demo store: nothing was submitted or charged.</p></form></article>` },
    },
  },
  // 2. "Redelivery fee" that quietly enrolls you in a $19.99/month membership (matches the $2 then $20 charges).
  "deliveryfix-help": {
    palette: { brand: "#0b3d91", accent: "#ffcc00" }, logo: "Delivery<span>Fix</span>", strip: "Postal service notice: your parcel is on hold",
    nav: [["/", "Reschedule"], ["/track.html", "Track"], ["/faq.html", "FAQ"], ["/contact.html", "Contact"]],
    footer: [["/about.html", "About"], ["/terms.html", "Terms"], ["/privacy.html", "Privacy"]],
    legal: "© 2026 DeliveryFix. Not affiliated with any government postal agency.",
    pages: {
      "index.html": { title: "Reschedule delivery – DeliveryFix", description: "Pay a small redelivery fee to reschedule your parcel.", body: `
<section class="hero"><p class="tag">Postal service notice</p><h1>Your parcel is on hold</h1><p>We attempted delivery but the address was incomplete. Pay a $1.99 redelivery fee to reschedule.</p>
<p class="banner">Action needed: parcel returns to sender soon</p><p class="timer" data-countdown="11:59">Reschedule within 11:59</p></section>
<ul><li>Tracking ID: 9400 1118 9922</li><li>Reschedule within 12 hours</li></ul>
<p><strong>Pay the fee by card to reschedule delivery.</strong></p>${cardForm("Pay $1.99")}
<p class="small">By paying you agree to our <a href="/terms.html">Terms</a>.</p>` },
      "track.html": { title: "Track – DeliveryFix", body: doc("Track your parcel", [["", "Status: ON HOLD – unpaid redelivery fee. Your parcel will be returned to sender if the fee is not paid within 12 hours."]]) },
      "faq.html": { title: "FAQ – DeliveryFix", body: doc("FAQ", [["Why was I charged $19.99?", "Your DeliveryFix Priority membership is billed monthly after your first redelivery. See section 4 of our Terms."], ["Can I get a refund?", "Fees are non-refundable once your parcel has been rescheduled."]]) },
      "terms.html": { title: "Terms – DeliveryFix", body: doc("Terms and conditions", [["1. Service", "DeliveryFix provides parcel rescheduling services."], ["4. Membership", "By paying the redelivery fee you join DeliveryFix Priority at $19.99 per month, billed 7 days after your first payment and every month thereafter until cancelled. Cancellation requests must be sent in writing by postal mail."]]) },
      "contact.html": { title: "Contact – DeliveryFix", body: doc("Contact", [["", "We do not provide phone support. Email help@deliveryfix-support.click and allow 10 business days for a reply."]]) },
      "about.html": { title: "About – DeliveryFix", body: doc("About us", [["", "We work with all major postal carriers to make redelivery simple."]]) },
      "privacy.html": { title: "Privacy – DeliveryFix", body: doc("Privacy", [["", "We may share your information with marketing partners."]]) },
    },
  },
  // 3. Government impersonation that harvests identity data (SSN, date of birth, license).
  "tollpay-tx": {
    palette: { brand: "#14532d", accent: "#fde047" }, logo: "TollPay <span>TX</span>", strip: "FINAL NOTICE: unpaid toll balance",
    nav: [["/", "Pay balance"], ["/pay.html", "Verify & pay"], ["/about.html", "About"]],
    footer: [["/privacy.html", "Privacy"]],
    legal: "© 2026 TollPay TX. Official toll payment portal.",
    pages: {
      "index.html": { title: "Pay toll balance – TollPay TX", description: "Settle your unpaid toll balance and avoid a $50 fine.", body: `
<section class="hero"><p class="tag">State toll authority</p><h1>Final notice: unpaid toll</h1><p>Your account has an unpaid balance of $12.40. Avoid a $50 fine and license suspension.</p>
<p class="banner">Final notice: pay today to avoid a $50 fine</p><p class="timer" data-countdown="14:59">Late fees apply in 14:59</p></section>
<ul><li>Account balance: $12.40</li><li>Late fees apply after midnight</li></ul>
<p><strong>Pay your balance now with a debit or credit card.</strong></p>${cardForm("Pay $12.40")}` },
      "pay.html": { title: "Verify identity – TollPay TX", body: `<article class="doc"><h1>Verify your identity</h1><p>To release your account we must verify your identity.</p>${cardForm("Verify and pay", '<label>Social Security number <input name="ssn" autocomplete="off" placeholder="XXX-XX-XXXX"></label><label>Date of birth <input name="dob" autocomplete="bday" placeholder="MM/DD/YYYY"></label><label>Driver license number <input name="license"></label>')}</article>` },
      "about.html": { title: "About – TollPay TX", body: doc("About TollPay TX", [["", "TollPay TX is the official payment portal of the state toll authority. Unpaid balances are referred to collections and may result in license suspension."]]) },
      "privacy.html": { title: "Privacy – TollPay TX", body: doc("Privacy", [["", "Information you provide may be shared with third parties for verification purposes."]]) },
    },
  },
  // 4. The hidden scam: a polished homepage with normal prices; the traps are on the inner pages.
  "voltdeals-outlet": {
    palette: { brand: "#0f172a", accent: "#38bdf8" }, logo: "Volt<span>Deals</span>", strip: "Free shipping on orders over $50 · Student discounts available",
    nav: [["/", "Shop"], ["/products/gamestation-5.html", "Consoles"], ["/about.html", "About"], ["/faq.html", "Help"], ["/contact.html", "Contact"]],
    footer: [["/shipping.html", "Shipping"], ["/refund-policy.html", "Returns & refunds"], ["/privacy.html", "Privacy"], ["/terms.html", "Terms"], ["/checkout.html", "Checkout"]],
    legal: "© 2016–2026 VoltDeals LLC · Dallas, Texas · Secure checkout",
    pages: {
      "index.html": { title: "VoltDeals Outlet – Electronics, headphones and consoles", description: "Trusted electronics outlet since 2016. Consoles, audio, laptops and accessories.", body: `
<section class="hero"><h1>Electronics you'll love, at outlet prices</h1><p>Trusted by shoppers since 2016. Consoles, audio, laptops and accessories with fast, tracked shipping.</p><a class="btn" href="/checkout.html">Shop the clearance</a></section>
<div class="grid">${[
        { name: "GameStation 5 console (clearance)", price: "$189.00", was: "$499.00", tag: "Clearance", href: "/products/gamestation-5.html" },
        { name: "QuietWave noise-cancelling headphones", price: "$39.00", was: "$349.00", tag: "Clearance" },
        { name: "USB-C charging cable, 6 ft", price: "$11.99", was: "$13.99" },
        { name: "AeroBook 14 laptop", price: "$899.00", was: "$999.00" },
        { name: "Wireless mouse", price: "$22.50", was: "$24.99" },
        { name: "55-inch 4K TV", price: "$429.00", was: "$479.00" },
      ].map(product).join("")}</div>
<h2>Express checkout</h2>${cardForm("Pay securely")}` },
      "products/gamestation-5.html": { title: "GameStation 5 console – VoltDeals", body: `
<section class="hero"><h1>GameStation 5 console (clearance)</h1><p><span class="price">$189.00</span><span class="was">$499.00</span> · new in box · 1TB</p></section>
<p>Limited clearance stock from a warehouse liquidation. Ships within 2–4 weeks. See <a href="/refund-policy.html">returns & refunds</a>.</p><a class="btn" href="/checkout.html">Add to cart</a>` },
      "about.html": { title: "About us – VoltDeals", body: doc("About VoltDeals Outlet", [["", "VoltDeals Outlet is operated by Brightway Trading Co., Ltd., a global electronics distributor with warehouses across Asia. We source overstock and liquidation inventory from authorized partners."], ["Our promise", "Genuine products, fair prices and friendly support."]]) },
      "contact.html": { title: "Contact – VoltDeals", body: doc("Contact us", [["Email", "support@voltdeals-help.top"], ["Mailing address", "1600 Commerce Blvd, Suite 0, Dallas, TX 75201"], ["Phone", "Phone support is not available at this time. Please use email."]]) },
      "shipping.html": { title: "Shipping – VoltDeals", body: doc("Shipping", [["", "Orders ship within 2–4 weeks from our partner warehouse. Clearance items ship separately. Tracking may take 10 days to activate."]]) },
      "refund-policy.html": { title: "Returns & refunds – VoltDeals", body: doc("Returns & refunds", [["Eligibility", "Return requests must be made within 3 days of delivery. Items must be unopened and shipped at the customer's expense to our returns center in Shenzhen, China."], ["Refunds", "Refunds are issued as store credit only. A 35% restocking fee applies to all returns. Refunds are processed within 90 business days of receiving the item."], ["Clearance", "Clearance items are final sale."]]) },
      "faq.html": { title: "Help – VoltDeals", body: doc("Frequently asked questions", [["Why is the GameStation 5 so cheap?", "It is clearance stock from a warehouse liquidation."], ["Can I pay by card?", "Card payments are temporarily unavailable. Please use bank transfer, Zelle or Bitcoin at checkout and receive an extra 10% off."]]) },
      "privacy.html": { title: "Privacy – VoltDeals", body: doc("Privacy policy", [["", "VoltDeals LLC collects the information you provide to process orders."]]) },
      "terms.html": { title: "Terms – VoltDeals", body: doc("Terms of service", [["1. Agreement", "By using this site you agree to these terms between you and [Company Name]."], ["2. Payments", "Payments made by bank transfer, Zelle or cryptocurrency are final."]]) },
      "checkout.html": { title: "Checkout – VoltDeals", body: `<article class="doc"><h1>Checkout</h1><p class="banner">Card payments are temporarily unavailable. Pay by bank transfer, Zelle or Bitcoin and get an extra 10% off.</p>
<form novalidate><label>Payment method <select name="method"><option>Bank transfer</option><option>Zelle</option><option>Bitcoin</option></select></label><label>Email <input name="email" autocomplete="email"></label><button class="btn" type="submit">Get payment instructions</button><p class="small" role="status" data-demo-label hidden>Demo store: nothing was submitted or charged.</p></form></article>` },
    },
  },
  // 5. Subscription trap: "$1 trial" that renews at $59.99/month, cancel only by postal mail.
  "cinevault-trial": {
    palette: { brand: "#2b0a3d", accent: "#f472b6" }, logo: "Cine<span>Vault</span>", strip: "Try 7 days for $1",
    nav: [["/", "Home"], ["/plans.html", "Plans"], ["/faq.html", "FAQ"], ["/contact.html", "Contact"]],
    footer: [["/terms.html", "Terms of membership"], ["/refund-policy.html", "Refunds"], ["/privacy.html", "Privacy"], ["/about.html", "About"]],
    legal: "© 2026 CineVault Media Group. Membership terms apply.",
    pages: {
      "index.html": { title: "CineVault – Unlimited movies, try 7 days for $1", description: "Stream thousands of movies. Try 7 days for $1.", body: `
<section class="hero"><h1>Unlimited movies. Try 7 days for $1.</h1><p>Thousands of films in HD on every device. Start your trial in seconds.</p></section>
${cardForm("Start my $1 trial")}<p class="small">Trial converts to a membership. See <a href="/terms.html">terms</a>.</p>` },
      "plans.html": { title: "Plans – CineVault", body: doc("Plans", [["Trial", "7 days for $1, then billed monthly."], ["Premium", "All movies, 4 screens."]]) },
      "terms.html": { title: "Terms of membership – CineVault", body: doc("Terms of membership", [["Trial and renewal", "After the 7-day trial, your membership renews automatically at $59.99 per month until cancelled."], ["Cancellation", "To cancel, send a signed letter by postal mail to our billing office at least 14 days before your renewal date. Online and phone cancellations are not accepted."], ["Fees", "All fees are non-refundable."]]) },
      "refund-policy.html": { title: "Refunds – CineVault", body: doc("Refunds", [["", "All charges are non-refundable, including unused membership periods."]]) },
      "faq.html": { title: "FAQ – CineVault", body: doc("FAQ", [["How do I cancel?", "See our Terms of membership."], ["Why was I charged $59.99?", "Your trial converted to a monthly membership."]]) },
      "contact.html": { title: "Contact – CineVault", body: doc("Contact", [["", "Email billing@cinevault-support.click. We do not offer phone or chat support."]]) },
      "about.html": { title: "About – CineVault", body: doc("About CineVault", [["", "CineVault brings cinema home."]]) },
      "privacy.html": { title: "Privacy – CineVault", body: doc("Privacy", [["", "We share data with advertising partners."]]) },
    },
  },
};

let pages = 0;
for (const [slug, s] of Object.entries(SITES)) {
  const dir = path.join(root, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "style.css"), css(s.palette));
  for (const [file, p] of Object.entries(s.pages)) {
    const out = path.join(dir, file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, layout(s, p));
    pages++;
  }
  fs.writeFileSync(path.join(dir, "robots.txt"), "User-agent: *\nAllow: /\n");
  fs.writeFileSync(path.join(dir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(s.pages).map((f) => `<url><loc>/${f === "index.html" ? "" : f}</loc></url>`).join("\n")}\n</urlset>\n`);
}
console.log(`built ${Object.keys(SITES).length} multi-page sites, ${pages} pages`);
