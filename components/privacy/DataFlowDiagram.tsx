import type { ReactNode } from "react";

const LABEL =
  "Data flow. Checkout Guard extension: it checks the page's fields locally and sends Bluff only the site's origin, the kinds of fields and yes/no signals; " +
  "what you type and the page text never leave the device. Card watch: Bluff's server reads the Capital One Nessie sandbox charges, crawls each merchant's " +
  "public pages, and sends that page text with that merchant's own charge dates and amounts to NVIDIA Nemotron for its review.";

function Box({ title, tone = "neutral", children }: { title: string; tone?: "neutral" | "safe" | "accent"; children: ReactNode }) {
  const border = tone === "safe" ? "border-dashed border-safe/70 bg-safe/10" : tone === "accent" ? "border-accent/70 bg-accent/10" : "brass-hairline bg-black/25";
  return (
    <div className={`min-w-0 flex-1 rounded-card border p-3 ${border}`}>
      <p className="font-sans text-lg font-bold tracking-tight">{title}</p>
      <div className="mt-1 text-xs leading-relaxed text-dim">{children}</div>
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 py-1 text-[11px] font-semibold text-fg md:flex-col md:gap-0 md:px-1 md:py-0">
      <span className="inline-block rotate-90 text-lg leading-none text-brass md:rotate-0">→</span>
      <span>{label}</span>
    </div>
  );
}

/** What stays on the device and what reaches Bluff's server, for the extension and for the bank scan. Responsive: rows stack on a phone. */
export function DataFlowDiagram() {
  return (
    <figure role="img" aria-label={LABEL} className="flex max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="font-grotesk uppercase text-brass">Checkout Guard extension</p>
        <div className="flex flex-col md:flex-row md:items-stretch">
          <Box title="Your device" tone="safe">
            <p>Stays here: what you type (card, CVV, password), your input values, the page text and the page&apos;s path or query.</p>
            <p className="mt-1">The extension checks locally: is there a card field? gift cards only? countdown timer? contact page?</p>
          </Box>
          <Arrow label="origin + yes/no" />
          <Box title="Bluff server">
            <p>The site&apos;s origin, which kinds of fields it asks for, and yes/no page signals.</p>
          </Box>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="font-grotesk uppercase text-brass">Card watch (bank scan)</p>
        <div className="flex flex-col md:flex-row md:items-stretch">
          <Box title="Capital One Nessie">
            <p>Sandbox account with synthetic charges. No real card data.</p>
          </Box>
          <Arrow label="charges" />
          <Box title="Bluff server">
            <p>Groups your charges by the merchant&apos;s website.</p>
          </Box>
          <Arrow label="crawl" />
          <Box title="Merchant's public site">
            <p>Public pages only, read on your request, no forms submitted.</p>
          </Box>
          <Arrow label="page text" />
          <Box title="NVIDIA Nemotron" tone="accent">
            <p>Reads the pages plus that merchant&apos;s own charge dates and amounts, then rates the site.</p>
          </Box>
        </div>
      </div>
      <figcaption className="text-xs text-dim">All demo data is synthetic. Messages you choose to check are discarded after the verdict.</figcaption>
    </figure>
  );
}
