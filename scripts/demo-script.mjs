// Prints the live-pitch script with REAL numbers from eval/results.json, and warns loudly when they are not presentable.
// Usage: npm run demo:script
import fs from "node:fs";

const pct = (n) => (n == null ? "n/a" : (n * 100).toFixed(0) + "%");
const f1 = (x) => (x ? x.f1.toFixed(2) : "n/a");

export function build(results) {
  const warnings = [];
  const a = results?.claimA, b = results?.claimB;
  if (!results) warnings.push("eval/results.json is missing: run the eval harness before presenting numbers.");
  if (a && /stand-?in|not t-mobile/i.test(a.dataset)) warnings.push("Claim A uses the synthetic STAND-IN set, not T-Mobile data. Do NOT say 'on T-Mobile's held-out messages'. Say 'on our synthetic test set (pipeline check)'.");
  if (a && /NOT used|basic/i.test(a.mode)) warnings.push("Claim A verdicts came from the rules-only path, not the Nemotron agent. Re-run against AGENT_MODE=live before claiming agent results.");
  if (a?.baseline && a.bluff.f1 <= a.baseline.f1) warnings.push("Claim A: Bluff did NOT beat the baseline. Lead with linking + explanations and say so honestly.");
  if (b?.caveat) warnings.push("Claim B data is authored by the linker's authors (see caveat on /eval); present it as 'the linker handles abbreviated descriptors and processor prefixes', not as expected real-world accuracy.");
  if (b && b.bluff.f1 <= b.baseline.f1) warnings.push("Claim B: the linker did NOT beat naive matching.");

  const proof = a && b
    ? `Does it work? On our test set, Bluff's detection scores F1 ${f1(a.bluff)} against a baseline's ${f1(a.baseline)}, and it links charges to their source at F1 ${f1(b.bluff)} versus ${f1(b.baseline)} for plain string matching (${b.n} charges). Here are the cases it still gets wrong.`
    : "Does it work? [run the eval harness first]";
  const lines = [
    `[0:00] "Scams don't happen when you click. They show up three days later on your statement. This is Bluff."`,
    `[0:08] "Maya finds sneakers at 70% off. The moment her cursor hits the card field, Bluff's Nemotron agent checks the site: four days old, gift cards only, copies a real brand. Trust Score 18, with the reasons and what to do instead."`,
    `[0:24] "She goes ahead anyway, like most people do. Bluff remembers where her card went, and texts her." (hand the phone to the judge as it buzzes)`,
    `[0:34] "Three days later a charge posts. The agent pulls the merchant's history from Tiger Data, searches Maya's exposures, checks the domain, and links the charge to the exact store from Tuesday. No bank and no browser extension can make that connection." (note: the demo simulates the 3 days passing, and the app says so)`,
    `[0:52] "One tap: a dispute letter, an evidence timeline and next steps. Bluff drafts. Maya decides."`,
    `[1:00] "${proof}"`,
    `[1:12] "Got a sketchy text? Forward it to Bluff. Verdict in seconds, in iMessage. And every day, Call the Bluff: 60 seconds of training on the same red flags."`,
    `[1:24] "Nothing Maya types ever leaves her device. Only the domain and yes/no flags do. Bluff: call their bluff."`,
  ];
  return { warnings, lines };
}

if (process.argv[1]?.endsWith("demo-script.mjs")) {
  let results = null;
  try { results = JSON.parse(fs.readFileSync("eval/results.json", "utf8")); } catch { /* handled as a warning */ }
  const { warnings, lines } = build(results);
  if (warnings.length) { console.log("!! BEFORE YOU PRESENT:"); for (const w of warnings) console.log("   - " + w); console.log(); }
  console.log(lines.join("\n\n"));
  if (results?.claimA) console.log(`\n(Claim A recall ${pct(results.claimA.bluff.r)}, precision ${pct(results.claimA.bluff.p)}, n=${results.claimA.n})`);
}
