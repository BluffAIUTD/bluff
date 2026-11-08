import { DataFlowDiagram } from "@/components/privacy/DataFlowDiagram";
import { DeleteEverything } from "@/components/privacy/DeleteEverything";

export const metadata = { title: "Privacy — Bluff" };

const ROWS: { what: string; sent: "Sent" | "Never sent" | "Sent by you, then discarded"; note: string }[] = [
  { what: "What you type into a page (card number, CVV, password, SSN)", sent: "Never sent", note: "The extension never reads input values." },
  { what: "Page text and screenshots", sent: "Never sent", note: "Only yes/no signals such as \"has a countdown timer\"." },
  { what: "Domain of the page", sent: "Sent", note: "Needed to check the site and to link later charges to it." },
  { what: "Which kinds of fields the page asks for", sent: "Sent", note: "For example \"card number\" and \"CVV\", never the values." },
  { what: "Yes/no page signals", sent: "Sent", note: "Gift-card-only, countdown timer, no contact page, and similar." },
  { what: "A text or link you paste or forward", sent: "Sent by you, then discarded", note: "Used for the verdict and then dropped. Only the verdict is kept." },
  { what: "Your card statement", sent: "Never sent", note: "This demo uses synthetic charges only. No real customer data." },
];

export default function PrivacyPage() {
  return (
    <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-w-0 flex-col gap-12">
        <header className="flex flex-col gap-3 border-b-2 border-ink pb-5">
          <p className="eyebrow">Statement</p>
          <h1 className="font-display text-[38px] font-semibold leading-[1.05] tracking-tight sm:text-5xl">Private by design</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-dim">Bluff reads the shape of a page, never what you typed into it. Forwarding a message is your choice, and the message is dropped as soon as the verdict is made.</p>
        </header>
        <DataFlowDiagram />
        <section aria-label="What is sent" className="flex flex-col gap-4">
          <div className="rule-top pt-3"><h2 className="font-display text-2xl font-semibold">What leaves your device</h2></div>
          <div className="dossier overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="eyebrow border-b border-ink"><tr><th className="px-4 py-3 font-medium">Data</th><th className="px-4 py-3 font-medium">Leaves your device?</th><th className="px-4 py-3 font-medium">Notes</th></tr></thead>
              <tbody className="divide-y divide-line">
                {ROWS.map((r) => (
                  <tr key={r.what}>
                    <th scope="row" className="px-4 py-3 font-medium">{r.what}</th>
                    <td className={`px-4 py-3 font-mono text-xs font-bold uppercase tracking-wide ${r.sent === "Never sent" ? "text-safe" : r.sent === "Sent" ? "text-unsure" : "text-fg"}`}>{r.sent}</td>
                    <td className="px-4 py-3 text-dim">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section aria-label="Other guarantees" className="flex flex-col gap-4">
          <div className="rule-top pt-3"><h2 className="font-display text-2xl font-semibold">Other promises</h2></div>
          <ul className="flex max-w-3xl list-disc flex-col gap-2 pl-5 text-[15px] leading-relaxed text-dim marker:text-scam">
            <li>Bluff never files, sends or pays anything for you. Disputes are drafts you review.</li>
            <li>When the AI check is on, Bluff&apos;s server fetches the checked site&apos;s public pages itself (never your session on the page or anything you typed) and sends their text, with registry facts and the rules findings, to NVIDIA Nemotron for the verdict: up to 8 pages for a store check, up to 10 per merchant website in the bank scan.</li>
            <li>This demo shares one sample user (&ldquo;Maya&rdquo;), so deleting data resets the demo for everyone.</li>
            <li>All stores and charges are synthetic and labeled as demos.</li>
          </ul>
        </section>
      </div>
      <aside aria-label="Marginalia" className="flex flex-col gap-4 lg:border-l lg:border-line lg:pl-8">
        <section aria-label="Delete everything" className="dossier flex flex-col gap-3 border-t-[5px] border-t-scam p-5 lg:sticky lg:top-20">
          <h2 className="font-display text-2xl font-semibold">Delete everything</h2>
          <p className="text-sm text-dim">Clears exposures, verdicts, texts, disputes and game data, then re-creates the sample user.</p>
          <DeleteEverything />
        </section>
      </aside>
    </div>
  );
}
