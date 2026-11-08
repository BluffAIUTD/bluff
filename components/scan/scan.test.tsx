// @vitest-environment jsdom
// Test-only fixtures: nothing here ships in the UI. They stand in for the /api/scan responses and SSE events.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { ScanClient } from "./ScanClient";
import type { Verdict } from "@/lib/schemas";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

const verdict = (o: Partial<Verdict> = {}): Verdict => ({
  score: 20, verdict: "likely_scam", confidence: 0.9, confidence_reason: "Several signals agree", category: "fake_store",
  evidence: ["Domain is 9 days old", "No contact page", "Gift cards only"], evidence_keys: [], next_steps: ["Do not pay again", "Dispute the charge"], linked: {}, mode: "basic", ...o,
});
const basic = (host: string, score: number, label: Verdict["verdict"], findings: { id: string; severity: "high" | "medium" | "low" | "good" | "info"; title: string; detail: string }[] = []) => ({
  key: host, scanId: "s1", host, createdAt: "2026-11-07T00:00:00Z", cached: false,
  report: { score, label, confidence: 0.8, category: "fake_store", findings, stats: { pages: 2, pageTypes: ["home"], emails: [], phones: [], addresses: [], payments: ["gift_card"], companies: [], maxDiscount: 0, selfDescribedDemo: false } },
  verdict: verdict({ score, verdict: label }),
  intel: { domain: host, registration: { createdAt: null, ageDays: 9, expiresAt: null, registrar: "Demo Registrar", source: "demo_registry" }, tls: { ok: true, issuer: null, validFrom: null, validTo: null, ageDays: null }, dns: { mx: 0, ns: [] }, wayback: { firstSeen: null, years: null, source: "none" }, allowlisted: false },
  crawl: { origin: `https://${host}`, finalHost: host, https: true, ms: 1800, ownStore: null, botBlocked: false, robots: true, sitemapUrls: 0, pages: [{ path: "/", type: "home", title: "Home", words: 120, status: 200 }, { path: "/refunds", type: "refund", title: "Refunds", words: 80, status: 200 }], failed: 0, skippedByRobots: 0 },
});
const merchant = (key: string, name: string, cents: number, b: ReturnType<typeof basic> | null, deep: { verdict: Verdict; runId: string | null } | null = null) => ({
  key, merchant: name, host: key, descriptor: name.toUpperCase(), category: null, txns: [{ id: `t-${key}`, ts: "2026-11-05T12:00:00Z", amountCents: cents }], totalCents: cents, basic: b, deep,
});
const volt = merchant("voltdeals.example", "VoltDeals", 18900, basic("voltdeals.example", 14, "likely_scam", [{ id: "refund", severity: "high", title: "Store credit only refunds", detail: "No cash refunds." }]),
  { verdict: verdict({ score: 12, mode: "live", analysis: { summary: "Refunds are store credit only.", findings: [{ title: "Suite 0 address", detail: "", severity: "high", page: "/contact" }] } }), runId: "r1" });
const bakery = merchant("bakery.example", "Bayou Bakery", 1450, basic("bakery.example", 91, "looks_ok", [{ id: "contact", severity: "good", title: "Clear contact page", detail: "Phone and address listed." }]));
const unsure = merchant("mid.example", "Mid Shop", 3200, basic("mid.example", 55, "unsure"), { verdict: verdict({ score: 55, verdict: "unsure", mode: "basic" }), runId: null });

class FakeES {
  static all: FakeES[] = [];
  static CLOSED = 2;
  readyState = 1; closed = false; handlers: Record<string, ((e: MessageEvent) => void)[]> = {};
  constructor(public url: string) { FakeES.all.push(this); }
  addEventListener(t: string, f: (e: MessageEvent) => void) { (this.handlers[t] ??= []).push(f); }
  close() { this.closed = true; this.readyState = 2; }
  emit(t: string, data: unknown) { (this.handlers[t] ?? []).forEach((f) => f({ data: JSON.stringify(data) } as MessageEvent)); }
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
function stubApi(state: unknown, opts: { configured?: boolean; deepAvailable?: boolean } = {}) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/scan/site")) return json({ pages: [], crawl: { origin: "", robots: true, sitemapUrls: 0, ms: 0, skippedByRobots: [], failed: [] }, trace: [] });
    if (url.startsWith("/api/scan") && init?.method === "POST") return json({ scanId: "scan1" });
    if (url === "/api/scan") return json(state === "error" ? { error: { code: "upstream_down", message: "Bank is unreachable." } } : { merchants: state, deepAvailable: opts.deepAvailable ?? true, configured: opts.configured ?? true, account: { name: "Maya", nickname: "Visa" } }, state === "error" ? 503 : 200);
    return json({}, 404);
  });
  vi.stubGlobal("fetch", f);
  return f;
}
beforeEach(() => { FakeES.all = []; vi.stubGlobal("EventSource", FakeES); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("ScanClient", () => {
  it("loading: card skeletons are announced as busy until the state arrives", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<ScanClient />);
    expect(screen.getByLabelText("Loading transactions")).toHaveAttribute("aria-busy", "true");
  });

  it("error: the API message is shown in an alert", async () => {
    stubApi("error");
    render(<ScanClient />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Bank is unreachable.");
  });

  it("empty: invites a scan and the button is enabled", async () => {
    stubApi([]);
    render(<ScanClient />);
    expect(await screen.findByText("No transactions yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan my transactions" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Re-crawl everything" })).toBeNull();
  });

  it("not connected / deep off: says so honestly and disables the scan", async () => {
    stubApi([], { configured: false, deepAvailable: false });
    render(<ScanClient />);
    expect(await screen.findByText(/Capital One isn.t connected/)).toBeInTheDocument();
    expect(screen.getByText(/Deep analysis is off/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan my transactions" })).toBeDisabled();
  });

  it("lists merchants riskiest first with Rules and AI tiers, and opens the riskiest in the detail view", async () => {
    stubApi([bakery, volt, unsure]);
    render(<ScanClient />);
    const list = await screen.findByRole("list", { name: "Merchants" });
    const names = within(list).getAllByRole("button").map((b) => b.querySelector(".serif")?.textContent);
    expect(names).toEqual(["VoltDeals", "Mid Shop", "Bayou Bakery"]);
    const voltCard = within(list).getByRole("button", { name: /VoltDeals/ });
    expect(voltCard).toHaveTextContent("Rules 14");
    expect(voltCard).toHaveTextContent("AI 12");
    expect(voltCard).toHaveTextContent("Likely scam · 1 charge");
    expect(within(list).getByRole("button", { name: /Bayou Bakery/ })).toHaveTextContent("Looks OK");
    // the AI tier is only a number when Nemotron actually ran live
    expect(within(list).getByRole("button", { name: /Mid Shop/ })).toHaveTextContent("AI –");
    await waitFor(() => expect(screen.getAllByLabelText("VoltDeals details").length).toBeGreaterThan(0));
    const sum = within(screen.getByLabelText("Summary"));
    expect(sum.getByText("Likely scams").nextElementSibling).toHaveTextContent("1"); // VoltDeals (live AI headline 12)
    expect(sum.getByText("Money at risk").nextElementSibling).toHaveTextContent("$221.00"); // VoltDeals + Mid Shop (unsure)
  });

  it("detail: basic vs deep tiers, AI findings first, rules tab, and the fallback wording when the AI was unavailable", async () => {
    stubApi([volt, unsure]);
    render(<ScanClient />);
    const detail = (await screen.findAllByLabelText("VoltDeals details"))[0];
    const d = within(detail);
    expect(d.getByRole("heading", { name: "Basic check" })).toBeInTheDocument();
    expect(d.getByRole("heading", { name: "Deep analysis" })).toBeInTheDocument();
    expect(d.getByText("Nemotron read the pages")).toBeInTheDocument();
    expect(d.getByText("Refunds are store credit only.")).toBeInTheDocument();
    expect(d.getByText("Suite 0 address")).toBeInTheDocument();
    fireEvent.click(d.getByRole("tab", { name: /Rules/ }));
    expect(d.getByText("Store credit only refunds")).toBeInTheDocument();
    expect(d.getByRole("link", { name: "Dispute this charge" })).toHaveAttribute("href", "/charges/t-voltdeals.example");

    fireEvent.click(within(screen.getByRole("list", { name: "Merchants" })).getByRole("button", { name: /Mid Shop/ }));
    const mid = within((await screen.findAllByLabelText("Mid Shop details"))[0]);
    expect(mid.getByText("AI unavailable · showing the basic check")).toBeInTheDocument();
  });

  it("a looks-ok merchant offers View charge, not Dispute", async () => {
    stubApi([bakery]);
    render(<ScanClient />);
    const d = within((await screen.findAllByLabelText("Bayou Bakery details"))[0]);
    expect(d.getByRole("link", { name: "View charge" })).toBeInTheDocument();
    expect(d.queryByRole("link", { name: "Dispute this charge" })).toBeNull();
  });

  it("re-crawl posts fresh=1, then a streamed scan fills tiers per merchant and returns to idle", async () => {
    const f = stubApi([volt]);
    render(<ScanClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Re-crawl everything" }));
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/scan?fresh=1", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(FakeES.all.length).toBe(1));
    const es = FakeES.all[0];
    expect(es.url).toBe("/api/scan/scan1/stream");
    expect(await screen.findByRole("button", { name: /Scanning/ })).toBeDisabled();

    const fresh = merchant("newshop.example", "New Shop", 2500, null);
    act(() => es.emit("merchants", { sync: null, merchants: [{ ...fresh, basic: undefined, deep: undefined }], deepAvailable: true }));
    act(() => es.emit("status", { key: "newshop.example", phase: "crawling" }));
    act(() => es.emit("page", { key: "newshop.example", page: { path: "/", type: "home", title: "", words: 10, status: 200 }, n: 1 }));
    const card = within(screen.getByRole("list", { name: "Merchants" })).getByRole("button", { name: /New Shop/ });
    expect(card).toHaveTextContent("Crawling site · 1 pages…");
    expect(screen.getByLabelText("Progress")).toBeInTheDocument();

    act(() => es.emit("basic", basic("newshop.example", 33, "likely_scam")));
    act(() => es.emit("status", { key: "newshop.example", phase: "deep" }));
    await waitFor(() => expect(card).toHaveTextContent("Rules 33"));
    act(() => es.emit("deep", { key: "newshop.example", runId: "r2", verdict: verdict({ score: 28, mode: "live" }), mode: "live" }));
    act(() => es.emit("status", { key: "newshop.example", phase: "done" }));
    await waitFor(() => expect(card).toHaveTextContent("AI 28"));
    act(() => es.emit("done", { ms: 4000 }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Scanning/ })).toBeNull());
    expect(screen.getByRole("button", { name: "Scan again" })).toBeEnabled();
  });

  it("a failed scan start shows the error and keeps the button usable", async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return json({ error: { code: "rate_limited", message: "Scan already running." } }, 429);
      return json({ merchants: [], deepAvailable: true, configured: true, account: null });
    });
    vi.stubGlobal("fetch", f);
    render(<ScanClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Scan my transactions" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Scan already running.");
    expect(screen.getByRole("button", { name: "Scan my transactions" })).toBeEnabled();
  });
});
