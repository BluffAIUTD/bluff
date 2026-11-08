import Link from "next/link";
import { DataFlowDiagram } from "@/components/privacy/DataFlowDiagram";
import { DeleteEverything } from "@/components/privacy/DeleteEverything";

export const metadata = { title: "Privacy — Bluff" };

type Tone = "never" | "sent" | "discarded";
type Row = { what: string; where: string; tone: Tone; note: string };

/** Every row must stay true of the code: what each part of Bluff sends, and to whom. */
const PRIVACY_GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Card watch (bank scan)",
    rows: [
      { what: "Your Capital One transactions (Nessie sandbox)", where: "Read by Bluff's server", tone: "sent", note: "Bluff's server pulls the sandbox account's charges from Capital One's Nessie API and keeps them in your demo account." },
      { what: "The merchant's public website", where: "Crawled by Bluff's server", tone: "sent", note: "Up to 10 public pages per merchant (refunds, terms, contact, checkout). You asked for the check, so pages robots.txt hides from bots are read too (and noted); pages built with JavaScript are loaded in a sandboxed headless browser. No form is ever submitted. The page text goes to NVIDIA Nemotron with registry facts." },
      { what: "A merchant's own charge history (dates and amounts)", where: "Sent to Nemotron", tone: "sent", note: "Only that merchant's charges, and only for that merchant's review. Your other charges are not sent." },
      { what: "Real card data", where: "Never", tone: "never", note: "Synthetic only: the Nessie sandbox account and every demo charge are made up. No real customer data." },
    ],
  },
  {
    title: "Checkout Guard extension",
    rows: [
      { what: "What you type into a page (card number, CVV, password, SSN)", where: "Never sent", tone: "never", note: "The extension never reads input values." },
      { what: "Page text, screenshots, and the page's path or query", where: "Never sent", tone: "never", note: "Only the site's origin leaves the page, for example https://shop.example." },
      { what: "The site's origin", where: "Sent", tone: "sent", note: "Needed to check the site and to link a later charge to it." },
      { what: "Which kinds of fields the page asks for", where: "Sent", tone: "sent", note: "For example \"card number\" and \"CVV\", never the values." },
      { what: "Yes/no page signals", where: "Sent", tone: "sent", note: "Gift-card-only, countdown timer, no contact page, and similar." },
    ],
  },
  {
    title: "Texts and links you check",
    rows: [
      { what: "A text you forward or report, or a link you paste", where: "Sent by you, then discarded", tone: "discarded", note: "Sent to Nemotron for the verdict, then discarded. Only the verdict is kept, and for a scam link, the site's host." },
    ],
  },
];

const TONE: Record<Tone, string> = { never: "text-safe", sent: "text-unsure", discarded: "text-fg" };

export default function PrivacyPage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-grotesk text-3xl font-bold tracking-tight">Private by design</h1>
        <p className="mt-1 max-w-2xl text-dim">Bluff reads the shape of a page, never what you typed into it. To check your card, its server reads your sandbox charges and the merchants&apos; public websites. Forwarding a message is your choice, and the message is dropped as soon as the verdict is made.</p>
      </header>
      <DataFlowDiagram />
      <section aria-labelledby="sent-h" className="flex flex-col gap-3">
        <h2 id="sent-h" className="font-grotesk text-xl font-bold">What goes where</h2>
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-dim"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Where it goes</th><th className="px-4 py-3">Notes</th></tr></thead>
            {PRIVACY_GROUPS.map((g) => (
              <tbody key={g.title} className="divide-y divide-line border-t border-line">
                <tr><th colSpan={3} scope="colgroup" className="bg-surface2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dim">{g.title}</th></tr>
                {g.rows.map((r) => (
                  <tr key={r.what}>
                    <th scope="row" className="px-4 py-3 font-medium">{r.what}</th>
                    <td className={`px-4 py-3 font-semibold ${TONE[r.tone]}`}>{r.where}</td>
                    <td className="px-4 py-3 text-dim">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>
      <section aria-labelledby="promises-h" className="rounded-card border border-line bg-surface p-4 text-sm">
        <h2 id="promises-h" className="mb-2 font-grotesk text-xl font-bold">Other promises</h2>
        <ul className="list-disc space-y-1 pl-5 text-dim">
          <li>Bluff never files, sends or pays anything for you. Disputes are drafts you review.</li>
          <li>When the AI check is on, Bluff&apos;s server fetches the checked site&apos;s public pages itself (never your session on the page or anything you typed) and sends their text, with registry facts and the rules findings, to NVIDIA Nemotron for the verdict: up to 8 pages for a store check, up to 10 per merchant website in the bank scan.</li>
          <li>Every visitor gets their own private demo account, kept in a signed cookie and started from the same synthetic card history (the demo persona &ldquo;Maya&rdquo;). Your exposures, texts and disputes are not shown to anyone else.</li>
          <li>Checks of a public website are shared: a recent crawl and Nemotron review of the same site can be reused for any visitor, and the result says so. Anything built from your own charges stays in your account.</li>
          <li>Texts from Bluff appear in the in-app phone preview. No real SMS is sent and no T-Mobile customer data is used.</li>
          <li>All stores and charges are synthetic and labeled as demos.</li>
        </ul>
        <p className="mt-3"><Link href="/eval" className="font-medium text-accent underline">Proof: how well Bluff works</Link> <span className="text-dim">(measured claims, with the failures shown)</span></p>
      </section>
      <section aria-labelledby="delete-h" className="flex flex-col gap-3">
        <h2 id="delete-h" className="font-grotesk text-xl font-bold">Delete everything</h2>
        <p className="text-sm text-dim">Clears your exposures, verdicts, texts, disputes, crawls and game data, then starts your account over from the demo card history. Only your account is affected.</p>
        <DeleteEverything />
      </section>
    </div>
  );
}
