import { DataFlowDiagram } from "@/components/privacy/DataFlowDiagram";
import { DeleteEverything } from "@/components/privacy/DeleteEverything";

export const metadata = { title: "Privacy | Bluff" };

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
      <header className="max-w-2xl">
        <p className="label">Privacy by design</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Private by design</h1>
        <p className="mt-2 text-dim">Bluff reads the shape of a page, never what you typed into it. Forwarding a message is your choice, and the message is dropped as soon as the verdict is made.</p>
      </header>
      <div className="panel p-3 sm:p-4"><DataFlowDiagram /></div>
      <section id="sent" aria-label="What is sent" className="flex scroll-mt-20 flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">What leaves your device</h2>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[540px] text-left text-sm">
            <thead><tr className="label border-b border-line"><th className="px-4 py-3 font-medium">Data</th><th className="px-4 py-3 font-medium">Leaves your device?</th><th className="px-4 py-3 font-medium">Notes</th></tr></thead>
            <tbody className="divide-y divide-line">
              {ROWS.map((r) => (
                <tr key={r.what}>
                  <th scope="row" className="px-4 py-3 font-medium">{r.what}</th>
                  <td className={`mono px-4 py-3 text-[13px] font-semibold ${r.sent === "Never sent" ? "text-safe" : r.sent === "Sent" ? "text-unsure" : "text-fg"}`}>{r.sent}</td>
                  <td className="px-4 py-3 text-dim">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-label="Other guarantees" className="panel p-4 text-sm sm:p-5">
        <h2 className="mb-3 text-xl font-semibold tracking-tight">Other promises</h2>
        <ul className="list-disc space-y-2 pl-5 text-dim marker:text-gray-5">
          <li>Bluff never files, sends or pays anything for you. Disputes are drafts you review.</li>
          <li>When the AI check is on, Bluff&apos;s server fetches the checked site&apos;s public pages itself (never your session on the page or anything you typed) and sends their text, with registry facts and the rules findings, to NVIDIA Nemotron for the verdict: up to 8 pages for a store check, up to 10 per merchant website in the bank scan.</li>
          <li>This demo shares one sample user (&ldquo;Maya&rdquo;), so deleting data resets the demo for everyone.</li>
          <li>All stores and charges are synthetic and labeled as demos.</li>
        </ul>
      </section>
      <section id="delete" aria-label="Delete everything" className="panel panel-glow-scam flex scroll-mt-20 flex-col gap-3 p-4 sm:p-5">
        <h2 className="text-xl font-semibold tracking-tight">Delete everything</h2>
        <p className="text-sm text-dim">Clears exposures, verdicts, texts, disputes and game data, then re-creates the sample user.</p>
        <DeleteEverything />
      </section>
    </div>
  );
}
