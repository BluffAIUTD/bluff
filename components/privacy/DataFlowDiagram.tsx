/** Static SVG: what stays on the device and what reaches Bluff's server. */
export function DataFlowDiagram() {
  return (
    <>
    <div aria-hidden className="flex flex-col gap-3 text-sm sm:hidden">
      <div className="dossier border-ink p-4">
        <p className="font-display text-xl font-semibold">Your device</p>
        <ul className="mt-2 list-disc pl-5 text-dim"><li>What you type (card, CVV, password)</li><li>The page text</li><li>Your input values</li></ul>
        <p className="mt-3 border border-safe bg-safe/10 p-3"><span className="font-semibold">Extension checks locally:</span> is there a card field? gift cards only? countdown timer? contact page?</p>
      </div>
      <p className="eyebrow text-center text-scam">↓ domain + yes/no only ↓</p>
      <div className="dossier border-ink p-4">
        <p className="font-display text-xl font-semibold">Bluff server</p>
        <ul className="mt-2 list-disc pl-5 text-dim"><li>Domain and which kinds of fields</li><li>Yes/no page signals</li><li>Messages you choose to forward (discarded after the verdict)</li></ul>
        <p className="mt-3 text-dim">All demo data is synthetic.</p>
      </div>
    </div>
    <svg role="img" aria-label="Data flow: the browser extension reads field types locally and sends only the domain and yes/no flags to Bluff. Typed values and page text never leave the device." viewBox="0 0 640 260" className="hidden w-full max-w-3xl sm:block">
      <title>Data flow</title>
      <rect x="10" y="20" width="270" height="220" rx="3" fill="var(--surface)" stroke="var(--ink)" />
      <text x="28" y="48" fill="var(--text)" fontFamily="var(--font-display)" fontWeight="600" fontSize="19">Your device</text>
      <text x="28" y="78" fill="var(--text-dim)" fontSize="13">• What you type (card, CVV, password)</text>
      <text x="28" y="100" fill="var(--text-dim)" fontSize="13">• The page text</text>
      <text x="28" y="122" fill="var(--text-dim)" fontSize="13">• Your input values</text>
      <rect x="28" y="140" width="234" height="84" rx="3" fill="rgba(31,107,82,.10)" stroke="var(--safe)" />
      <text x="40" y="164" fill="var(--text)" fontSize="13" fontWeight="600">Extension checks locally:</text>
      <text x="40" y="184" fill="var(--text-dim)" fontSize="12">is there a card field? gift cards only?</text>
      <text x="40" y="202" fill="var(--text-dim)" fontSize="12">countdown timer? contact page?</text>
      <path d="M284 130 H356" stroke="var(--scam)" strokeWidth="2.5" strokeDasharray="1 0" markerEnd="url(#arr)" fill="none" />
      <defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="var(--scam)" /></marker></defs>
      <text x="320" y="104" textAnchor="middle" fill="var(--text)" fontSize="11" fontWeight="600"><tspan x="320">domain +</tspan><tspan x="320" dy="13">yes/no</tspan></text>
      <rect x="360" y="20" width="270" height="220" rx="3" fill="var(--surface)" stroke="var(--ink)" />
      <text x="378" y="48" fill="var(--text)" fontFamily="var(--font-display)" fontWeight="600" fontSize="19">Bluff server</text>
      <text x="378" y="78" fill="var(--text-dim)" fontSize="13">• Domain and which kinds of fields</text>
      <text x="378" y="100" fill="var(--text-dim)" fontSize="13">• Yes/no page signals</text>
      <text x="378" y="122" fill="var(--text-dim)" fontSize="13">• Messages you choose to forward</text>
      <text x="378" y="144" fill="var(--text-dim)" fontSize="13">  (discarded after the verdict)</text>
      <text x="378" y="176" fill="var(--text-dim)" fontSize="13">All demo data is synthetic.</text>
    </svg>
    </>
  );
}
