import { verdictLabel, type Verdict } from "../schemas";
import type { Crawl } from "./crawl";
import { RISKY_PAYMENTS, type PageFacts } from "./extract";
import type { SiteIntel } from "./intel";
import { registrableDomain } from "./intel";

/** The basic check: deterministic rules over the crawl + registry facts. No model. Every finding names its source page. */
export type Severity = "high" | "medium" | "low" | "good" | "info";
export type Finding = { id: string; severity: Severity; title: string; detail: string; page?: string };
export type BasicReport = {
  score: number; label: Verdict["verdict"]; confidence: number; category: string; findings: Finding[];
  stats: { pages: number; pageTypes: string[]; emails: string[]; phones: string[]; addresses: string[]; payments: string[]; companies: string[]; maxDiscount: number; selfDescribedDemo: boolean };
};

const W: Record<Severity, number> = { high: -24, medium: -11, low: -4, good: 0, info: 0 };
const FREEMAIL = /@(gmail|googlemail|yahoo|outlook|hotmail|live|aol|icloud|proton(mail)?|gmx|mail|yandex|zoho)\.(com|me|net|ru)$/i;
const RISKY_TLD = /\.(top|xyz|icu|help|click|live|support|work|rest|cfd|sbs|shop|store|online|site)$/i;
const NEXT: Record<Verdict["verdict"], string[]> = {
  likely_scam: ["Don't pay this merchant again", "Dispute the charge with your card issuer", "Freeze or replace the card if you shared it", "Report the site to the FTC"],
  unsure: ["Check your order status before paying again", "Look up the company's address and reviews", "Pay only with a card you can dispute"],
  looks_ok: ["Keep receipts and order numbers", "Watch for unexpected repeat charges"],
};
const uniq = <T,>(a: T[]) => [...new Set(a)];
const where = (pages: PageFacts[], pred: (p: PageFacts) => boolean) => pages.find(pred)?.url;

export function basicCheck(crawl: Crawl, intel: SiteIntel, history: { priorCharges: number } = { priorCharges: 0 }): BasicReport {
  const f: Finding[] = [];
  const add = (x: Finding) => { if (!f.some((y) => y.id === x.id)) f.push(x); };
  let good = 0;
  const plus = (n: number, x: Omit<Finding, "severity">) => { good += n; add({ ...x, severity: "good" }); };
  const pages = crawl.pages;
  const age = intel.registration.ageDays;
  const established = intel.allowlisted || (age != null && age > 2 * 365) || (intel.wayback.years ?? 0) >= 3;
  const all = (k: keyof PageFacts) => uniq(pages.flatMap((p) => p[k] as unknown as string[]));

  // --- domain & hosting -------------------------------------------------------------------------------------------
  if (intel.allowlisted) plus(20, { id: "allowlisted", title: "Well-known merchant", detail: `${intel.domain} is on Bluff's list of major retailers and services.` });
  if (age != null) {
    const created = intel.registration.createdAt?.slice(0, 10);
    if (age < 30) add({ id: "domain_new", severity: "high", title: `Domain registered ${age} days ago`, detail: `Registered ${created}${intel.registration.registrar ? ` via ${intel.registration.registrar}` : ""}. Most scam stores are weeks old.` });
    else if (age < 180) add({ id: "domain_young", severity: "medium", title: `Domain is only ${age} days old`, detail: `Registered ${created}.` });
    else if (age > 5 * 365) plus(15, { id: "domain_old", title: `Domain registered ${Math.floor(age / 365)} years ago`, detail: `Registered ${created}${intel.registration.registrar ? ` via ${intel.registration.registrar}` : ""}.` });
    else if (age > 365) plus(6, { id: "domain_established", title: `Domain registered ${Math.floor(age / 365)}+ years ago`, detail: `Registered ${created}.` });
  } else add({ id: "domain_unknown", severity: "info", title: "Domain age unknown", detail: "The registry didn't return a registration date." });
  if (intel.registration.brandCloneOf) add({ id: "brand_clone", severity: "high", title: `Imitates ${intel.registration.brandCloneOf}`, detail: "Name and styling borrow a well-known brand it isn't part of." });
  if ((intel.wayback.years ?? 0) >= 5) plus(8, { id: "archive_history", title: `Online since ${intel.wayback.firstSeen?.slice(0, 4)}`, detail: "The Internet Archive has snapshots of this site going back years." });
  else if (intel.wayback.source === "archive.org" && !intel.wayback.firstSeen) add({ id: "no_archive", severity: "low", title: "No public history", detail: "The Internet Archive has never captured this site." });
  if (history.priorCharges >= 2) plus(8, { id: "known_merchant", title: `You've paid them ${history.priorCharges} times before`, detail: "Repeat charges from a merchant you already use." });

  if (crawl.error) add({ id: "unreachable", severity: "medium", title: "Website could not be reached", detail: crawl.error });
  else {
    if (crawl.ownStore) add({ id: "demo_hosting", severity: "info", title: "Bluff demo storefront", detail: "Synthetic site hosted for the demo; HTTPS and certificate checks don't apply locally." });
    else if (!crawl.https) add({ id: "no_https", severity: "high", title: "No HTTPS", detail: "The site is served without encryption." });
    else if (intel.tls.ok) plus(3, { id: "https_ok", title: "Valid HTTPS certificate", detail: `Issued by ${intel.tls.issuer ?? "a trusted authority"}.` });
    if (!crawl.ownStore && intel.tls.issuer === null && crawl.https === false) { /* covered above */ }
    if (crawl.redirectedOffsite) add({ id: "redirect_offsite", severity: "medium", title: `Redirects to ${crawl.finalHost}`, detail: "The address on your statement sends visitors to a different site." });
    if (crawl.botBlocked) add({ id: "bot_blocked", severity: "info", title: "Site blocks automated visits", detail: "Common for big brands; the check relies more on registry facts." });
    if (pages[0] && pages[0].wordCount < 60 && !crawl.botBlocked) add({ id: "thin_content", severity: "info", title: "Little readable text", detail: "The homepage renders mostly with JavaScript." });
  }

  // --- pages ------------------------------------------------------------------------------------------------------
  if (pages.length) {
    const types = uniq(pages.map((p) => p.type));
    const emails = all("emails"), phones = all("phones"), payments = all("payments");
    const siteDomain = registrableDomain(crawl.finalHost);
    const offDomain = emails.filter((e) => { const d = e.split("@")[1]; return !crawl.ownStore ? registrableDomain(d) !== siteDomain : !d.startsWith(crawl.ownStore ?? "~"); });
    if (!types.includes("contact") && !emails.length && !phones.length) add({ id: "no_contact", severity: established ? "low" : "medium", title: "No way to contact the business", detail: "No contact page, email address or phone number was found." });
    for (const e of offDomain) {
      if (FREEMAIL.test(e)) add({ id: "freemail_contact", severity: "medium", title: "Support uses a free webmail address", detail: `${e} instead of an address on the store's own domain.`, page: where(pages, (p) => p.emails.includes(e)) });
      else if (RISKY_TLD.test(e.split("@")[1]) || !established) add({ id: "offdomain_contact", severity: "medium", title: "Support email is on a different domain", detail: `${e} doesn't match ${crawl.ownStore ? "the store's site" : siteDomain}.`, page: where(pages, (p) => p.emails.includes(e)) });
    }
    if (types.includes("contact") && (emails.length || phones.length) && !offDomain.length) plus(4, { id: "contact_ok", title: "Contact details on the site's domain", detail: [...emails.slice(0, 2), ...phones.slice(0, 1)].join(" · ") });

    const hasRefund = types.includes("refund") || pages.some((p) => /refund|return/i.test(p.text));
    if (!hasRefund && !established) add({ id: "no_refund_policy", severity: "medium", title: "No refund or returns policy", detail: "No page explains how to get your money back." });

    const flags = pages.flatMap((p) => p.policyFlags.map((q) => ({ ...q, page: p.url })));
    const flag = (id: string) => flags.find((x) => x.id === id);
    const polic = (id: string, severity: Severity, title: string) => { const x = flag(id); if (x) add({ id, severity, title, detail: `"${x.quote}"`, page: x.page }); };
    polic("hidden_membership", "high", "Paying enrolls you in a paid membership");
    if (flag("auto_renew") && flag("cancel_by_mail")) add({ id: "subscription_trap", severity: "high", title: "Renews automatically, cancel only by mail", detail: `"${flag("auto_renew")!.quote}" · "${flag("cancel_by_mail")!.quote}"`, page: flag("cancel_by_mail")!.page });
    else polic("cancel_by_mail", "medium", "Cancellation only in writing / by mail");
    polic("store_credit_only", "medium", "Refunds only as store credit");
    polic("restocking_fee", "medium", "Large restocking fee");
    polic("overseas_returns", "medium", "Returns must be shipped overseas at your cost");
    polic("chargeback_threat", "medium", "Threatens customers who dispute charges");
    polic("no_refunds", established ? "info" : "medium", "No refunds");
    polic("all_sales_final", established ? "info" : "low", "All sales final");
    polic("short_return_window", "low", "Very short return window");
    polic("long_refund_delay", "low", "Refunds take months");
    polic("no_phone_support", "low", "No phone support");
    polic("data_sharing", "info", "Shares your data with partners");

    const risky = payments.filter((p) => RISKY_PAYMENTS.has(p));
    const safe = payments.filter((p) => !RISKY_PAYMENTS.has(p));
    if (flag("card_unavailable") || (risky.length && !safe.length && pages.some((p) => p.type === "checkout" || /only/i.test(p.text) && p.payments.some((x) => RISKY_PAYMENTS.has(x)))))
      add({ id: "untraceable_payment", severity: "high", title: "Steers you to untraceable payment", detail: `Accepts ${risky.map((x) => x.replace("_", " ")).join(", ")}${flag("card_unavailable") ? ", and says card payments are unavailable" : ""}. These can't be disputed.`, page: where(pages, (p) => p.payments.some((x) => RISKY_PAYMENTS.has(x)) && (p.type === "checkout" || p.type === "faq")) ?? where(pages, (p) => p.payments.some((x) => RISKY_PAYMENTS.has(x))) });
    // SSN or license number anywhere, or date of birth on a payment form (a signup form asking DOB is normal).
    const idForm = pages.find((p) => p.forms.some((fm) => fm.fields.some((x) => x === "ssn" || x === "license") || (fm.fields.includes("dob") && fm.fields.includes("card_number"))));
    if (idForm) add({ id: "identity_harvest", severity: "high", title: "Payment page asks for identity details", detail: `The form asks for ${uniq(idForm.forms.flatMap((fm) => fm.fields.filter((x) => ["ssn", "dob", "license"].includes(x)))).map((x) => ({ ssn: "your Social Security number", dob: "date of birth", license: "driver license number" })[x]).join(", ")}.`, page: idForm.url });
    const giftForm = pages.find((p) => p.forms.some((fm) => fm.fields.includes("gift_card") || fm.fields.includes("crypto_wallet")));
    if (giftForm) add({ id: "giftcard_checkout", severity: "high", title: "Checkout takes gift cards or crypto", detail: "The payment form asks for a gift card code or sends you to a crypto wallet.", page: giftForm.url });

    const pressure = uniq(pages.flatMap((p) => p.pressure));
    if (pressure.includes("countdown")) add({ id: "countdown", severity: "medium", title: "Countdown timer pressure", detail: "A timer pushes you to pay before thinking.", page: where(pages, (p) => p.pressure.includes("countdown")) });
    if (pressure.includes("threat") && pressure.includes("final_notice")) add({ id: "threats", severity: "medium", title: "Threatens fines or penalties", detail: "\"Final notice\" language with fines or suspension.", page: where(pages, (p) => p.pressure.includes("threat")) });
    if (pressure.includes("scarcity")) add({ id: "scarcity", severity: "low", title: "Fake-scarcity banners", detail: "\"Only 3 left\" style pressure.", page: where(pages, (p) => p.pressure.includes("scarcity")) });

    const maxDisc = Math.max(0, ...pages.flatMap((p) => p.discounts));
    if (maxDisc >= 70) add({ id: "too_cheap", severity: "high", title: `Discounts up to ${maxDisc}% off`, detail: "Prices far below what the product sells for elsewhere.", page: where(pages, (p) => p.discounts.includes(maxDisc)) });
    else if (maxDisc >= 55 && !established) add({ id: "deep_discount", severity: "medium", title: `Discounts up to ${maxDisc}% off`, detail: "Unusually deep discounts for a new store.", page: where(pages, (p) => p.discounts.includes(maxDisc)) });

    const ph = pages.find((p) => p.placeholders.length);
    if (ph) add({ id: "template_text", severity: "medium", title: "Template text left in the policies", detail: `Contains "${ph.placeholders[0]}".`, page: ph.url });
    const companies = uniq(pages.flatMap((p) => p.companyNames)).filter((c) => !/^(The|Our|Your)\b/.test(c));
    const roots = uniq(companies.map((c) => c.toLowerCase().split(/\s/)[0]));
    if (!established && roots.length >= 2) add({ id: "company_mismatch", severity: "medium", title: "Different company names across pages", detail: companies.slice(0, 3).join(" vs "), page: where(pages, (p) => p.companyNames.length > 0 && p.type === "about") });
    const created = intel.registration.createdAt ? Number(intel.registration.createdAt.slice(0, 4)) : null;
    const claim = Math.min(...pages.flatMap((p) => [...p.copyrightYears, ...[...p.text.matchAll(/since (19\d\d|20\d\d)/gi)].map((m) => Number(m[1]))]), 9999);
    if (created && claim < created - 1 && (age ?? 9999) < 365) add({ id: "history_claim", severity: "medium", title: `Claims to operate since ${claim}`, detail: `But the domain was registered in ${created}.`, page: where(pages, (p) => p.copyrightYears.includes(claim) || p.text.includes(String(claim))) });
    if (pages.some((p) => p.selfDescribedDemo)) add({ id: "self_demo", severity: "info", title: "Says it is a demo or practice store", detail: "The site describes itself as a demo/test shop, not a real retailer.", page: where(pages, (p) => p.selfDescribedDemo) });
    if (types.includes("privacy")) plus(2, { id: "privacy_page", title: "Has a privacy policy", detail: "" });
    if (hasRefund && !f.some((x) => ["store_credit_only", "restocking_fee", "overseas_returns", "no_refunds", "subscription_trap"].includes(x.id))) plus(4, { id: "refund_ok", title: "Has a refund or returns policy", detail: "" });
  }

  // --- score ------------------------------------------------------------------------------------------------------
  const bad = f.reduce((s, x) => s + W[x.severity], 0);
  const score = Math.max(1, Math.min(98, Math.round(55 + bad + good)));
  const label = verdictLabel(score);
  const badW = -bad, n = f.filter((x) => x.severity !== "info").length;
  const agreement = badW + good === 0 ? 0 : Math.abs(badW - good) / (badW + good);
  const coverage = Math.min(1, Math.min(pages.length, 6) / 6 * 0.5 + (age != null ? 0.3 : 0) + (n >= 3 ? 0.2 : 0));
  const confidence = Number(Math.min(0.97, 0.35 + 0.4 * agreement + 0.22 * coverage).toFixed(2));
  const ids = new Set(f.map((x) => x.id));
  const category = label === "looks_ok" ? (history.priorCharges >= 2 || intel.allowlisted ? "known_merchant" : "legit_store")
    : ids.has("subscription_trap") || ids.has("hidden_membership") ? "subscription_trap"
    : ids.has("identity_harvest") ? "identity_theft" : label === "likely_scam" ? "fake_store" : "unclear";
  const order: Severity[] = ["high", "medium", "low", "good", "info"];
  return {
    score, label, confidence, category,
    findings: f.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)),
    stats: {
      pages: pages.length, pageTypes: uniq(pages.map((p) => p.type)), emails: all("emails").slice(0, 5), phones: all("phones").slice(0, 3), addresses: all("addresses").slice(0, 3),
      payments: all("payments"), companies: uniq(pages.flatMap((p) => p.companyNames)).slice(0, 5), maxDiscount: Math.max(0, ...pages.flatMap((p) => p.discounts)), selfDescribedDemo: pages.some((p) => p.selfDescribedDemo),
    },
  };
}

const KEYMAP: Record<string, string> = { domain_new: "domain_age_lt_30", domain_young: "domain_age_lt_90", domain_old: "domain_age_gt_365", domain_established: "domain_age_gt_365", brand_clone: "brand_clone", allowlisted: "allowlisted", known_merchant: "known_merchant", no_https: "no_https", https_ok: "https_ok", no_contact: "no_contact_page", contact_ok: "has_contact_page", no_refund_policy: "no_refund_policy", refund_ok: "has_refund_policy", untraceable_payment: "gift_card_only", giftcard_checkout: "gift_card_only", countdown: "countdown_timer", scarcity: "scarcity_banner", too_cheap: "too_good_discount", deep_discount: "too_good_discount", unreachable: "site_unreachable", redirect_offsite: "redirects_offsite", privacy_page: "has_privacy_policy", identity_harvest: "credential_request", threats: "threat_language", offdomain_contact: "lookalike_domain", freemail_contact: "lookalike_domain" };

/** The basic report in the shared Verdict shape (labeled mode "basic": rules only, no AI). */
export function basicVerdict(r: BasicReport): Verdict {
  const evidence = r.findings.filter((x) => x.severity !== "info").slice(0, 5).map((x) => x.title.slice(0, 90));
  while (evidence.length < 3) evidence.push(["Rules-only check over the crawled pages", "Registry facts from RDAP and the Internet Archive", "No AI review in this result"][evidence.length]);
  return {
    score: r.score, verdict: r.label, confidence: r.confidence, confidence_reason: `${r.findings.filter((x) => x.severity !== "info").length} findings from ${r.stats.pages} pages and registry data`.slice(0, 120),
    category: r.category, evidence, evidence_keys: [...new Set(r.findings.map((x) => KEYMAP[x.id]).filter(Boolean))].slice(0, 12),
    next_steps: NEXT[r.label], linked: {}, mode: "basic",
  };
}
