/** Static SVG: what stays on the device and what reaches Bluff's server (and, when the AI check is on, Nemotron). */
export function DataFlowDiagram() {
  return (
    <svg role="img" aria-label="Data flow: the browser extension reads field types locally and sends only the domain and yes/no flags to Bluff. Typed values and page text never leave the device. When the AI check is on, Bluff&apos;s server reads the site&apos;s public pages and sends that text to Nemotron." viewBox="0 0 760 270" className="w-full">
      <title>Data flow</title>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="var(--accent)" /></marker>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--border)" strokeWidth=".5" /></pattern>
      </defs>
      <rect x=".5" y=".5" width="759" height="269" rx="14" fill="url(#grid)" stroke="var(--border)" />

      <rect x="24" y="24" width="224" height="222" rx="12" fill="var(--surface)" stroke="var(--border-strong)" />
      <text x="42" y="50" fill="var(--text-dim)" fontFamily="var(--font-geist-mono)" fontSize="10.5" letterSpacing="1.5">YOUR DEVICE</text>
      <text x="42" y="78" fill="var(--text)" fontSize="13">Card, CVV, passwords you type</text>
      <text x="42" y="100" fill="var(--text)" fontSize="13">The page text</text>
      <text x="42" y="122" fill="var(--text)" fontSize="13">Your input values</text>
      <rect x="42" y="142" width="188" height="86" rx="8" fill="rgb(70 243 185 / .07)" stroke="var(--safe)" strokeOpacity=".5" />
      <text x="54" y="164" fill="var(--text)" fontSize="12.5" fontWeight="600">Extension checks locally</text>
      <text x="54" y="184" fill="var(--text-dim)" fontSize="12">card field? gift cards only?</text>
      <text x="54" y="204" fill="var(--text-dim)" fontSize="12">countdown timer? contact page?</text>

      <path d="M252 150 H334" stroke="var(--accent)" strokeWidth="2" markerEnd="url(#arr)" fill="none" />
      <text x="256" y="124" fill="var(--text)" fontFamily="var(--font-geist-mono)" fontSize="10">domain</text><text x="256" y="137" fill="var(--text)" fontFamily="var(--font-geist-mono)" fontSize="10">+ yes/no</text>

      <rect x="338" y="24" width="184" height="222" rx="12" fill="var(--surface)" stroke="var(--border-strong)" />
      <text x="354" y="50" fill="var(--text-dim)" fontFamily="var(--font-geist-mono)" fontSize="10.5" letterSpacing="1.5">BLUFF SERVER</text>
      <text x="354" y="78" fill="var(--text)" fontSize="12.5">Domain, field kinds</text>
      <text x="354" y="100" fill="var(--text)" fontSize="12.5">Yes/no page signals</text>
      <text x="354" y="122" fill="var(--text)" fontSize="12.5">Texts you forward</text>
      <text x="354" y="142" fill="var(--text-dim)" fontSize="11.5">dropped after the verdict</text>
      <text x="354" y="176" fill="var(--text-dim)" fontSize="11.5">Fetches the checked site&apos;s</text>
      <text x="354" y="194" fill="var(--text-dim)" fontSize="11.5">public pages itself</text>
      <text x="354" y="226" fill="var(--unsure)" fontFamily="var(--font-geist-mono)" fontSize="10.5">SYNTHETIC DATA ONLY</text>

      <path d="M526 150 H576" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 4" markerEnd="url(#arr)" fill="none" />
      <text x="528" y="124" fill="var(--text)" fontFamily="var(--font-geist-mono)" fontSize="10">page text</text><text x="528" y="137" fill="var(--text)" fontFamily="var(--font-geist-mono)" fontSize="10">if AI on</text>

      <rect x="580" y="24" width="156" height="222" rx="12" fill="var(--surface)" stroke="var(--border-strong)" strokeDasharray="4 4" />
      <text x="596" y="50" fill="var(--text-dim)" fontFamily="var(--font-geist-mono)" fontSize="10.5" letterSpacing="1.5">NEMOTRON</text>
      <text x="596" y="78" fill="var(--text)" fontSize="12.5">Public site text,</text>
      <text x="596" y="98" fill="var(--text)" fontSize="12.5">registry facts,</text>
      <text x="596" y="118" fill="var(--text)" fontSize="12.5">rules findings</text>
      <text x="596" y="160" fill="var(--text-dim)" fontSize="11.5">Never your session</text>
      <text x="596" y="178" fill="var(--text-dim)" fontSize="11.5">or anything you typed</text>
    </svg>
  );
}
