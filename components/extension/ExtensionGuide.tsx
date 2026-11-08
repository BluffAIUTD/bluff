import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/shell/CopyButton";
import { CornerIndex } from "../table/PlayingCardFace";
import { EXTENSION_ZIP_URL, type ExtensionZip } from "./download";

export type ExtensionGuideProps = {
  /** The app's canonical origin (appOrigin()). */
  app: string;
  zip: Pick<ExtensionZip, "bytes" | "version" | "app"> | null;
  stores: { scam: string; legit: string };
};

const SECTION = "font-grotesk uppercase text-brass";
const PRIMARY = "btn-brass chip-btn inline-flex min-h-[52px] items-center justify-center rounded-full px-6 text-[15px] transition duration-ui";

const HOW = [
  { title: "Wakes up only at checkout", body: "It stays quiet until a page asks for your card number, CVV or Social Security number. On login and sign-up forms it only shows a small “Check this site with Bluff” button, and sends nothing unless you click it." },
  { title: "Checks the store before you pay", body: "Bluff's server crawls the store's public pages (refund policy, contact, terms) and an NVIDIA Nemotron agent rates the site with the evidence it found. A panel slides in next to the checkout. If the AI can't finish, you get Bluff's rules-only basic check, labeled as one." },
  { title: "Remembers where your card went", body: "If you continue anyway, Bluff logs the site. When a charge from that store later shows up on your card, Bluff links it back to this visit, alerts you in the phone view and drafts a dispute for you to review." },
];

const SENT = [
  "The site's address only (its origin, like https://shop.example), never the page path, search terms or anything after it",
  "Which kinds of fields the page asks for, like “card number” and “CVV”, never what you type in them",
  "Yes/no page signals, like “has a countdown timer” or “has a refund policy”",
  "When you press Continue: that you used this site, so a later charge can be linked back to it",
];
const NEVER_SENT = [
  "What you type: card numbers, CVV, passwords, Social Security numbers",
  "The page's text, screenshots or its full URL",
  "Pages without a card or SSN field, unless you click “Check this site with Bluff”",
  "Your login or cookies for the site you're on",
  "The sites you mark as safe. That list stays in your browser.",
];

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="stitch flex gap-3 rounded-card border brass-hairline bg-surface p-4 [&>*]:relative [&>*]:z-10">
      <span aria-hidden className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-dashed border-accent/70 bg-black/30 text-sm font-bold text-brass">{n}</span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </li>
  );
}

function Download({ app, zip }: Pick<ExtensionGuideProps, "app" | "zip">) {
  if (!zip) {
    const cmd = `BLUFF_APP_URL=${app} npm run ext:zip`;
    return (
      <div className="rounded-card border border-dashed brass-hairline p-4 text-sm text-dim" role="status">
        <p>The download isn&apos;t built on this server yet. From the repo, run:</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-control bg-black/40 px-3 py-2 font-mono text-xs text-fg">{cmd}</code>
          <CopyButton text={cmd} />
        </div>
        <p className="mt-2">Then reload this page. (The Docker image builds it automatically.)</p>
      </div>
    );
  }
  const kb = Math.max(1, Math.round(zip.bytes / 1024));
  const otherApp = zip.app && zip.app !== app ? zip.app : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <a href={EXTENSION_ZIP_URL} download className={PRIMARY}>Download for Chrome</a>
        <span className="text-sm text-dim">.zip · {kb} KB{zip.version ? ` · version ${zip.version}` : ""} · desktop Chrome and other Chromium browsers</span>
      </div>
      {otherApp && <p role="status" className="rounded-control border border-unsure/50 bg-unsure/10 px-4 py-2.5 text-sm">This build checks stores with {otherApp}, not this site.</p>}
    </div>
  );
}

/** /extension: what Checkout Guard does, exactly what it sends, how to install it, and where to try it. */
export function ExtensionGuide({ app, zip, stores }: ExtensionGuideProps) {
  const appHost = new URL(app).host;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brass">Chrome extension · optional</p>
        <h1 className="text-4xl font-semibold tracking-tight">Checkout Guard for Chrome</h1>
        <p className="max-w-2xl text-dim">
          Bluff checks a store the moment it asks for your card, before you pay. If you pay anyway, Bluff remembers the site, so a later
          charge on your card links straight back to it.
        </p>
        <Download app={app} zip={zip} />
        <p className="text-sm text-dim">
          No Chrome, or on a phone? <Link href="/check" className="text-brass underline">Use Check a site</Link>: paste a store link and get the same check with nothing to install.
        </p>
      </header>

      <section aria-label="How it works" className="flex flex-col gap-3">
        <h2 className={SECTION}>How it works</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {HOW.map((h, i) => (
            <li key={h.title} className="card-face deal relative min-h-[140px] rounded-[14px] py-4 pl-14 pr-4" style={{ ["--i" as string]: i }}>
              <CornerIndex rank={i + 1} suit={(["unsure", "scam", "safe"] as const)[i % 3]} />
              <h3 className="serif text-xl font-bold">{h.title}</h3>
              <p className="mt-1 text-sm leading-snug text-[#4d4128]">{h.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="What it sends" className="flex flex-col gap-3">
        <h2 className={SECTION}>Exactly what it sends</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="stitch rounded-card border brass-hairline bg-surface p-4 [&>*]:relative [&>*]:z-10">
            <h3 className="serif text-xl font-semibold text-unsure">Sent to Bluff</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-dim">{SENT.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
          <div className="stitch rounded-card border brass-hairline bg-surface p-4 [&>*]:relative [&>*]:z-10">
            <h3 className="serif text-xl font-semibold text-safe">Never sent</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-dim">{NEVER_SENT.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        </div>
        <p className="max-w-3xl text-sm text-dim">
          Bluff&apos;s server then visits the store&apos;s public pages itself, like any shopper could, and sends their text to NVIDIA Nemotron for the review.{" "}
          <Link href="/privacy" className="text-brass underline">Privacy</Link> lists everything Bluff keeps.
        </p>
      </section>

      <section aria-label="Install" className="flex flex-col gap-3">
        <h2 className={SECTION}>Install in four steps</h2>
        <ol className="flex flex-col gap-2">
          <Step n={1}>Download the zip and unzip it. You get a folder with <code className="font-mono text-xs">manifest.json</code> inside.</Step>
          <Step n={2}>
            <span>Open <code className="font-mono text-xs text-fg">chrome://extensions</code> in a new tab and switch on <strong>Developer mode</strong> (top right).</span>
            <span className="ml-2 inline-block align-middle"><CopyButton text="chrome://extensions" label="Copy address" /></span>
          </Step>
          <Step n={3}>Click <strong>Load unpacked</strong> and choose the unzipped folder.</Step>
          <Step n={4}>Pin it: open the puzzle-piece menu and pin <strong>Bluff Checkout Guard</strong>. Click its icon any time to see that it&apos;s on.</Step>
        </ol>
        <p className="max-w-3xl text-sm text-dim">
          Chrome lists it with access to all sites, because it has to look for card fields on any checkout page.
          It reads field labels only, never what you type. Open {appHost} once in the same browser so what it logs lands in your Bluff account.
        </p>
      </section>

      <section aria-label="Try it" className="flex flex-col gap-3">
        <h2 className={SECTION}>Try it on a demo store</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <a href={stores.scam} target="_blank" rel="noopener" className="shimmer stitch flex flex-col gap-1 rounded-card border brass-hairline bg-surface p-5 transition duration-ui hover:bg-white/[0.04] [&>*]:relative [&>*]:z-10">
            <Badge tone="scam">Scam pattern</Badge>
            <span className="serif mt-1 text-xl font-bold">FastKicks</span>
            <span className="text-sm text-dim">Built from common fake-store tricks. Expect a warning.</span>
            <span className="truncate text-xs text-dim">{new URL(stores.scam).host}</span>
          </a>
          <a href={stores.legit} target="_blank" rel="noopener" className="shimmer stitch flex flex-col gap-1 rounded-card border brass-hairline bg-surface p-5 transition duration-ui hover:bg-white/[0.04] [&>*]:relative [&>*]:z-10">
            <Badge tone="safe">Legit</Badge>
            <span className="serif mt-1 text-xl font-bold">Bayou Bakery</span>
            <span className="text-sm text-dim">An ordinary small shop, for comparison.</span>
            <span className="truncate text-xs text-dim">{new URL(stores.legit).host}</span>
          </a>
        </div>
        <p className="max-w-3xl text-sm text-dim">
          Both are demo stores, not real shops: don&apos;t enter real card details. On a demo store, press <strong>Continue and watch my charges</strong> and
          the panel offers <strong>Make this purchase on the test card</strong>: a simulated purchase on Bluff&apos;s sandbox card that the bank scan then links back to your visit.
        </p>
      </section>
    </div>
  );
}
