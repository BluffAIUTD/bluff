import type { PanelLink } from "./links";

/** Shadow-DOM side panel (slides in from the right, 360 px). Renders with textContent only: page-controlled strings are never parsed as HTML. */
export type PanelVerdict = { score: number; verdict: string; confidence: number; confidence_reason: string; evidence: string[]; next_steps: string[]; mode: string;
  /** Nemotron's read of the site's crawled pages (live/cached verdicts only). */
  analysis?: { summary: string } };
export type PanelState =
  | { phase: "running"; steps: { tool: string | null; output: string }[]; host: string }
  /** `retry`: the check ended without a saved verdict (Continue stays off), so offer to run it again. */
  | { phase: "done"; verdict: PanelVerdict; verdictId: string | null; host: string; basicNote?: string; retry?: boolean }
  /** Bluff couldn't finish (timeout, worker stopped, server unreachable): local rules-only findings + Try again. */
  | { phase: "stalled"; host: string; message: string; findings: string[] }
  | { phase: "logged"; host: string; watch: boolean; links: PanelLink[]; note?: string }
  | { phase: "error"; message: string; host: string };

const SENT_NOTE = "Only this site's address, the kinds of fields on the page and yes/no signals were sent. Never what you type.";

const CSS = `
:host{all:initial}
.p{position:fixed;top:0;right:0;height:100vh;width:360px;max-width:100vw;background:#0e1014;color:#f6f4ef;font:14px/1.45 Inter,system-ui,sans-serif;box-shadow:-8px 0 32px rgba(0,0,0,.45);transform:translateX(100%);transition:transform 180ms ease-out;z-index:2147483647;display:flex;flex-direction:column}
.p.in{transform:none}
header{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #2a2a31;font:700 16px "Space Grotesk",system-ui,sans-serif}
button{font:600 14px inherit;font-family:inherit;min-height:44px;border-radius:8px;border:1px solid #2a2a31;background:#1d212a;color:#f6f4ef;padding:0 14px;cursor:pointer}
button:disabled{opacity:.5;cursor:not-allowed}
button.pri,a.pri{background:#5b5bd6;border-color:#5b5bd6}button.x{min-height:32px;padding:0 10px}
a.btn{display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:8px;border:1px solid #2a2a31;background:#1d212a;color:#f6f4ef;font-weight:600;text-decoration:none;padding:0 14px;text-align:center}
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

function button(text: string, onClick: () => void, cls?: string) {
  const b = el("button", { cls, text });
  b.onclick = onClick;
  return b;
}

function link(l: PanelLink) {
  const a = el("a", { cls: l.primary ? "btn pri" : "btn", text: l.label });
  a.setAttribute("href", l.href); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener");
  return a;
}

export type PanelHandlers = { onLeave(): void; onContinue(watch: boolean): void; onSafe(): void; onClose(): void; onRetry?(): void };

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
    const close = button("✕", () => this.h.onClose(), "x"); close.setAttribute("aria-label", "Close");
    const header = el("header", {}, [el("span", { text: "Bluff · Checkout Guard" }), close]);
    const body = el("div", { cls: "b" });
    const retry = () => button("Try again", () => this.h.onRetry?.(), "pri");
    if (s.phase === "running") {
      body.append(el("p", { text: `Checking ${s.host}…` }), el("p", { cls: "dim", text: "Bluff is checking this store before you pay. Hold off on paying until it's done." }));
      for (const st of s.steps) body.append(el("div", { cls: "step", text: `${st.tool ?? "plan"} → ${st.output}` }));
    } else if (s.phase === "error") {
      body.append(el("p", { text: s.message }), el("p", { cls: "dim", text: SENT_NOTE }));
    } else if (s.phase === "stalled") {
      body.append(
        el("p", { text: s.message }),
        el("p", { cls: "dim", text: "Basic check of this page (rules only, no AI):" }),
        el("ul", {}, s.findings.map((t) => el("li", { text: t }))),
        el("p", { cls: "dim", text: "Bluff didn't rate this store. Don't enter your card until you trust it." }),
        el("div", { cls: "row" }, [retry(), button("Leave", () => this.h.onLeave())]),
      );
    } else if (s.phase === "logged") {
      body.append(el("p", { text: `Logged ${s.host} in your Exposure Log${s.watch ? ", and Bluff will watch your charges" : ""}.` }));
      if (s.note) body.append(el("p", { cls: "dim", text: s.note }));
      body.append(el("div", { cls: "row" }, s.links.map(link)));
    } else {
      const v = s.verdict;
      const cls = v.score < 40 ? "sc-scam" : v.score < 70 ? "sc-unsure" : "sc-safe";
      const label = v.confidence < 0.5 ? "Unsure" : v.verdict === "likely_scam" ? "Likely scam" : v.verdict === "looks_ok" ? "Looks OK" : "Unsure";
      body.append(
        el("div", {}, [el("span", { cls: `score ${cls}`, text: String(v.score) }), el("span", { cls: "tag", text: v.mode === "basic" ? "BASIC CHECK" : v.mode.toUpperCase() })]),
        el("p", { text: label }),
        el("p", { cls: "dim", text: `${Math.round(v.confidence * 100)}% sure. ${v.confidence_reason}` }),
        el("ul", {}, v.evidence.map((t) => el("li", { text: t }))),
        el("p", { cls: "dim", text: v.confidence < 0.5 ? "What to check yourself" : "Do this instead" }),
        el("ol", {}, v.next_steps.map((t) => el("li", { text: t }))),
      );
      if (v.analysis?.summary && (v.mode === "live" || v.mode === "cached")) body.insertBefore(el("p", { text: v.analysis.summary }), body.querySelector("ul"));
      if (s.basicNote) body.append(el("p", { cls: "dim", text: s.basicNote }));
      const leave = button("Leave", () => this.h.onLeave());
      const cont = button("Continue", () => this.h.onContinue(false)); cont.disabled = !s.verdictId;
      const watch = button("Continue and watch my charges", () => this.h.onContinue(true), "pri"); watch.disabled = !s.verdictId;
      const safe = button("Mark this site as safe", () => this.h.onSafe(), "x");
      body.append(el("div", { cls: "row" }, s.retry ? [retry(), leave, safe] : [leave, cont, watch, safe]));
    }
    this.wrap.replaceChildren(header, body);
  }
}

const CHIP_CSS = `
:host{all:initial}
.c{position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;align-items:center;gap:2px;background:#161920;color:#f6f4ef;border:1px solid #2a2a31;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.35);font:600 13px/1 Inter,system-ui,sans-serif;padding:2px}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;min-height:36px;border-radius:999px;padding:0 12px;display:flex;align-items:center;gap:8px}
button:hover{background:#1d212a}
.dot{width:10px;height:10px;border-radius:50%;background:#e5484d;display:inline-block}
.x{padding:0 10px;color:#c8c8ce}
`;

/** Small, unobtrusive "Check this site with Bluff" button for login/sign-up style forms. Nothing is sent unless it is clicked. */
export class Chip {
  readonly host: HTMLElement;
  constructor(h: { onCheck(): void; onClose(): void }, doc: Document = document) {
    this.host = doc.createElement("div");
    this.host.setAttribute("data-bluff-chip", "");
    const root = this.host.attachShadow({ mode: "open" });
    const style = doc.createElement("style"); style.textContent = CHIP_CSS;
    const check = el("button", {}, [el("span", { cls: "dot" }), el("span", { text: "Check this site with Bluff" })]);
    check.onclick = () => h.onCheck();
    const x = button("✕", () => h.onClose(), "x"); x.setAttribute("aria-label", "Hide Bluff for this page");
    root.append(style, el("div", { cls: "c" }, [check, x]));
    (doc.body ?? doc.documentElement).appendChild(this.host);
  }
  close() { this.host.remove(); }
}
