import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/shell/CopyButton";
import { EXTENSION_ZIP_URL, type ExtensionZip } from "./download";

export type ExtensionGuideProps = {
  /** The app's canonical origin (appOrigin()). */
  app: string;
  zip: Pick<ExtensionZip, "bytes" | "version" | "app"> | null;
  stores: { scam: string; legit: string };
};

const SECTION = "font-grotesk text-sm font-medium uppercase tracking-wide text-dim";
const PRIMARY = "inline-flex min-h-[48px] items-center justify-center rounded-control bg-accent px-5 font-semibold text-white transition duration-ui hover:brightness-110";

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
    <li className="flex gap-3 rounded-card border border-line bg-surface p-4">
      <span aria-hidden className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent/20 font-grotesk text-sm font-bold text-[#b9b9ff]">{n}</span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </li>
  );
}

function Download({ app, zip }: Pick<ExtensionGuideProps, "app" | "zip">) {
  if (!zip) {
    const cmd = `BLUFF_APP_URL=${app} npm run ext:zip`;
    return (
      <div className="rounded-card border border-dashed border-line p-4 text-sm text-dim" role="status">
        <p>The download isn&apos;t built on this server yet. From the repo, run:</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-control bg-surface2 px-3 py-2 font-mono text-xs text-fg">{cmd}</code>
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
      {otherApp && <p role="status" className="rounded-control border border-unsure/40 bg-unsure/10 px-3 py-2 text-sm">This build checks stores with {otherApp}, not this site.</p>}
    </div>
  );
}

/** /extension: what Checkout Guard does, exactly what it sends, how to install it, and where to try it. */
export function ExtensionGuide({ app, zip, stores }: ExtensionGuideProps) {
  const appHost = new URL(app).host;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-dim">Chrome extension · optional</p>
        <h1 className="font-grotesk text-3xl font-bold tracking-tight sm:text-4xl">Checkout Guard for Chrome</h1>
        <p className="max-w-2xl text-dim">
          Bluff checks a store the moment it asks for your card, before you pay. If you pay anyway, Bluff remembers the site, so a later
          charge on your card links straight back to it.
        </p>
        <Download app={app} zip={zip} />
        <p className="text-sm text-dim">
          No Chrome, or on a phone? <Link href="/check" className="text-accent underline">Use Check a site</Link>: paste a store link and get the same check with nothing to install.
        </p>
      </header>

      <section aria-label="How it works" className="flex flex-col gap-3">
        <h2 className={SECTION}>How it works</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {HOW.map((h, i) => (
            <li key={h.title} className="rounded-card border border-line bg-surface p-4">
              <p className="num text-xs text-dim">{i + 1}</p>
              <h3 className="mt-1 font-grotesk text-lg font-bold">{h.title}</h3>
              <p className="mt-1 text-sm text-dim">{h.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="What it sends" className="flex flex-col gap-3">
        <h2 className={SECTION}>Exactly what it sends</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-card border border-line bg-surface p-4">
            <h3 className="font-grotesk text-lg font-bold text-unsure">Sent to Bluff</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-dim">{SENT.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
          <div className="rounded-card border border-line bg-surface p-4">
            <h3 className="font-grotesk text-lg font-bold text-safe">Never sent</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-dim">{NEVER_SENT.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        </div>
        <p className="max-w-3xl text-sm text-dim">
          Bluff&apos;s server then visits the store&apos;s public pages itself, like any shopper could, and sends their text to NVIDIA Nemotron for the review.{" "}
          <Link href="/privacy" className="text-accent underline">Privacy</Link> lists everything Bluff keeps.
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
          <a href={stores.scam} target="_blank" rel="noopener" className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4 transition duration-ui hover:bg-surface2">
            <Badge tone="scam">Scam pattern</Badge>
            <span className="mt-1 font-grotesk text-lg font-bold">FastKicks</span>
            <span className="text-sm text-dim">Built from common fake-store tricks. Expect a warning.</span>
            <span className="truncate text-xs text-dim">{new URL(stores.scam).host}</span>
          </a>
          <a href={stores.legit} target="_blank" rel="noopener" className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4 transition duration-ui hover:bg-surface2">
            <Badge tone="safe">Legit</Badge>
            <span className="mt-1 font-grotesk text-lg font-bold">Bayou Bakery</span>
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
