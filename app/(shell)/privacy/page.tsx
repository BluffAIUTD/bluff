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
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-grotesk text-3xl font-bold tracking-tight">Private by design</h1>
        <p className="mt-1 max-w-2xl text-dim">Bluff reads the shape of a page, never what you typed into it. Forwarding a message is your choice, and the message is dropped as soon as the verdict is made.</p>
      </header>
      <DataFlowDiagram />
      <section aria-label="What is sent" className="flex flex-col gap-3">
        <h2 className="font-grotesk text-xl font-bold">What leaves your device</h2>
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-dim"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Leaves your device?</th><th className="px-4 py-3">Notes</th></tr></thead>
            <tbody className="divide-y divide-line">
              {ROWS.map((r) => (
                <tr key={r.what}>
                  <th scope="row" className="px-4 py-3 font-medium">{r.what}</th>
                  <td className={`px-4 py-3 font-semibold ${r.sent === "Never sent" ? "text-safe" : r.sent === "Sent" ? "text-unsure" : "text-fg"}`}>{r.sent}</td>
                  <td className="px-4 py-3 text-dim">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-label="Other guarantees" className="rounded-card border border-line bg-surface p-4 text-sm">
        <h2 className="mb-2 font-grotesk text-xl font-bold">Other promises</h2>
        <ul className="list-disc space-y-1 pl-5 text-dim">
          <li>Bluff never files, sends or pays anything for you. Disputes are drafts you review.</li>
          <li>When the AI check is on, Bluff&apos;s server fetches the checked site&apos;s public pages itself (never your session on the page or anything you typed) and sends their text, with registry facts and the rules findings, to NVIDIA Nemotron for the verdict: up to 8 pages for a store check, up to 10 per merchant website in the bank scan.</li>
          <li>This demo shares one sample user (&ldquo;Maya&rdquo;), so deleting data resets the demo for everyone.</li>
          <li>All stores and charges are synthetic and labeled as demos.</li>
        </ul>
      </section>
      <section aria-label="Delete everything" className="flex flex-col gap-3">
        <h2 className="font-grotesk text-xl font-bold">Delete everything</h2>
        <p className="text-sm text-dim">Clears exposures, verdicts, texts, disputes and game data, then re-creates the sample user.</p>
        <DeleteEverything />
      </section>
    </div>
  );
}
