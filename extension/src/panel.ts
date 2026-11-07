/** Shadow-DOM side panel (slides in from the right, 360 px). Renders with textContent only: page-controlled strings are never parsed as HTML. */
export type PanelVerdict = { score: number; verdict: string; confidence: number; confidence_reason: string; evidence: string[]; next_steps: string[]; mode: string };
export type PanelState =
  | { phase: "running"; steps: { tool: string | null; output: string }[]; host: string }
  | { phase: "done"; verdict: PanelVerdict; verdictId: string | null; host: string; basicNote?: string }
  | { phase: "logged"; host: string; dashboardUrl: string; watch: boolean }
  | { phase: "error"; message: string; host: string };

const CSS = `
:host{all:initial}
.p{position:fixed;top:0;right:0;height:100vh;width:360px;max-width:100vw;background:#0e1014;color:#f6f4ef;font:14px/1.45 Inter,system-ui,sans-serif;box-shadow:-8px 0 32px rgba(0,0,0,.45);transform:translateX(100%);transition:transform 180ms ease-out;z-index:2147483647;display:flex;flex-direction:column}
.p.in{transform:none}
header{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #2a2a31;font:700 16px "Space Grotesk",system-ui,sans-serif}
button{font:600 14px inherit;font-family:inherit;min-height:44px;border-radius:8px;border:1px solid #2a2a31;background:#1d212a;color:#f6f4ef;padding:0 14px;cursor:pointer}
button.pri{background:#5b5bd6;border-color:#5b5bd6}button.x{min-height:32px;padding:0 10px}
.b{padding:16px;overflow:auto;display:flex;flex-direction:column;gap:12px}
.score{font:700 56px "Space Grotesk",system-ui,sans-serif;line-height:1}.sc-scam{color:#e5484d}.sc-unsure{color:#f5a524}.sc-safe{color:#2f9e6e}
.tag{display:inline-block;border:1px solid #2a2a31;border-radius:999px;padding:1px 8px;font-size:11px;margin-left:6px}
ul,ol{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px}.dim{color:#c8c8ce;font-size:12px}
.step{font:12px ui-monospace,monospace;background:#1d212a;border-radius:8px;padding:6px 8px}
.row{display:flex;flex-direction:column;gap:8px}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: { cls?: string; text?: string } = {}, kids: (Node | null)[] = []) {
  const e = document.createElement(tag);
  if (props.cls) e.className = props.cls;
  if (props.text != null) e.textContent = props.text;
  for (const k of kids) if (k) e.appendChild(k);
  return e;
}

export type PanelHandlers = { onLeave(): void; onContinue(watch: boolean): void; onSafe(): void; onClose(): void };

export class Panel {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private wrap: HTMLElement;
  constructor(private h: PanelHandlers, doc: Document = document) {
    this.host = doc.createElement("div");
    this.host.setAttribute("data-bluff-panel", "");
    this.root = this.host.attachShadow({ mode: "open" });
    const style = doc.createElement("style"); style.textContent = CSS;
    this.wrap = el("div", { cls: "p" });
    this.root.append(style, this.wrap);
    (doc.body ?? doc.documentElement).appendChild(this.host);
    requestAnimationFrame(() => this.wrap.classList.add("in"));
  }
  close() { this.host.remove(); }

  render(s: PanelState) {
    const header = el("header", {}, [el("span", { text: "Bluff · Checkout Guard" }), (() => { const b = el("button", { cls: "x", text: "✕" }); b.setAttribute("aria-label", "Close"); b.onclick = () => this.h.onClose(); return b; })()]);
    const body = el("div", { cls: "b" });
    if (s.phase === "running") {
      body.append(el("p", { text: `Checking ${s.host}…` }));
      for (const st of s.steps) body.append(el("div", { cls: "step", text: `${st.tool ?? "plan"} → ${st.output}` }));
    } else if (s.phase === "error") {
      body.append(el("p", { text: s.message }), el("p", { cls: "dim", text: "Nothing was sent from this page except its domain and yes/no signals." }));
    } else if (s.phase === "logged") {
      body.append(el("p", { text: `Logged ${s.host} in your Exposure Log${s.watch ? ", and Bluff will watch your charges" : ""}.` }));
      const a = el("a", { text: "Open dashboard" }); a.setAttribute("href", s.dashboardUrl); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener");
      a.style.color = "#b9b9ff"; body.append(a);
    } else {
      const v = s.verdict;
      const cls = v.score < 40 ? "sc-scam" : v.score < 70 ? "sc-unsure" : "sc-safe";
      const label = v.confidence < 0.5 ? "Unsure" : v.verdict === "likely_scam" ? "Likely scam" : v.verdict === "looks_ok" ? "Looks OK" : "Unsure";
      body.append(
        el("div", {}, [el("span", { cls: `score ${cls}`, text: String(v.score) }), el("span", { cls: "tag", text: v.mode.toUpperCase() })]),
        el("p", { text: label }),
        el("p", { cls: "dim", text: `${Math.round(v.confidence * 100)}% sure. ${v.confidence_reason}` }),
        el("ul", {}, v.evidence.map((t) => el("li", { text: t }))),
        el("p", { cls: "dim", text: v.confidence < 0.5 ? "What to check yourself" : "Do this instead" }),
        el("ol", {}, v.next_steps.map((t) => el("li", { text: t }))),
      );
      if (s.basicNote) body.append(el("p", { cls: "dim", text: s.basicNote }));
      const leave = el("button", { text: "Leave" }); leave.onclick = () => this.h.onLeave();
      const cont = el("button", { text: "Continue" }); cont.onclick = () => this.h.onContinue(false); cont.disabled = !s.verdictId;
      const watch = el("button", { cls: "pri", text: "Continue and watch my charges" }); watch.onclick = () => this.h.onContinue(true); watch.disabled = !s.verdictId;
      const safe = el("button", { cls: "x", text: "Mark this site as safe" }); safe.onclick = () => this.h.onSafe();
      body.append(el("div", { cls: "row" }, [leave, cont, watch, safe]));
    }
    this.wrap.replaceChildren(header, body);
  }
}
