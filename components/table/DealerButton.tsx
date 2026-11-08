/** The global mode badge, drawn as a poker dealer button: an ivory disc with the mode on it. */
export function DealerButton({ mode }: { mode: "live" | "demo" }) {
  const live = mode === "live";
  return (
    <span title={live ? "Live: computed just now by the agent" : "Demo: offline agent on synthetic data"} aria-label={`Mode: ${live ? "LIVE" : "DEMO"}`} role="status"
      className="relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#2a1d08]"
      style={{ background: "radial-gradient(circle at 32% 26%, #fffdf3, #efe4c6 62%, #cdbd93)", boxShadow: "0 0 0 2px #120d09, 0 0 0 3px rgba(217,180,107,.7), 0 4px 8px rgba(0,0,0,.6), inset 0 -3px 5px rgba(120,90,30,.35)" }}>
      <span aria-hidden className="absolute inset-[4px] rounded-full border border-dashed border-[#8a6a2a]/60" />
      <span className="relative flex flex-col items-center leading-none">
        <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-[#1a8a57]" : "bg-[#b47a12]"}`} />
        <span className="mt-[3px]">{live ? "LIVE" : "DEMO"}</span>
      </span>
    </span>
  );
}
