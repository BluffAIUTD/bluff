import { storeUrl } from "./links";

export type PopupProps = {
  app: string;
  version: string;
  safeHosts: string[];
  onRemove(host: string): void;
};

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, props: { cls?: string; text?: string; href?: string } = {}, kids: Node[] = []) {
  const e = doc.createElement(tag);
  if (props.cls) e.className = props.cls;
  if (props.text != null) e.textContent = props.text;
  if (props.href) { e.setAttribute("href", props.href); e.setAttribute("target", "_blank"); e.setAttribute("rel", "noopener"); }
  for (const k of kids) e.appendChild(k);
  return e;
}

/** The toolbar popup: status, what it does, links to the app and two demo stores, and the safe-sites list. Text only. */
export function renderPopup(root: HTMLElement, p: PopupProps) {
  const doc = root.ownerDocument;
  const appHost = new URL(p.app).host;
  const safe = p.safeHosts.length
    ? el(doc, "ul", { cls: "safe" }, p.safeHosts.map((h) => {
        const b = el(doc, "button", { cls: "rm", text: "Remove" });
        b.setAttribute("aria-label", `Remove ${h} from safe sites`);
        b.onclick = () => p.onRemove(h);
        return el(doc, "li", {}, [el(doc, "span", { text: h }), b]);
      }))
    : el(doc, "p", { cls: "dim", text: "None yet. Use \"Mark this site as safe\" in the panel to stop checks on a site." });

  root.replaceChildren(
    el(doc, "header", {}, [el(doc, "span", { cls: "dot" }), el(doc, "h1", { text: "Bluff Checkout Guard is on" })]),
    el(doc, "p", { text: "When a page asks for your card number or CVV, Bluff checks the store before you pay. It never reads what you type." }),
    el(doc, "a", { cls: "btn pri", text: "Open Bluff", href: p.app }),
    el(doc, "h2", { text: "Try it on a demo store" }),
    el(doc, "div", { cls: "try" }, [
      el(doc, "a", { cls: "btn", text: "FastKicks (scam pattern)", href: storeUrl(p.app, "fastkicks-shop") }),
      el(doc, "a", { cls: "btn", text: "Bayou Bakery (legit)", href: storeUrl(p.app, "bayou-bakery") }),
    ]),
    el(doc, "p", { cls: "dim", text: "Demo stores, not real shops. Don't enter real card details there." }),
    el(doc, "h2", { text: "Sites you marked safe" }),
    safe,
    el(doc, "p", { cls: "dim foot", text: `Version ${p.version} · checks with ${appHost}` }),
  );
}
