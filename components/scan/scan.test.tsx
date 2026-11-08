// @vitest-environment jsdom
// All fixtures below are test-only; nothing here ships in the UI.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { ScanClient } from "./ScanClient";

const verdict = (over: Record<string, unknown> = {}) => ({
  score: 15, verdict: "likely_scam", confidence: 0.9, confidence_reason: "Several signals agree", category: "fake_store",
  evidence: ["Domain is 5 days old", "Store credit only", "No contact page"], evidence_keys: [], next_steps: ["Dispute the charge", "Replace the card"], linked: {}, mode: "basic", ...over,
});
const basic = (key: string, host: string, score: number, label: string) => ({
  key, scanId: "s1", host, createdAt: "2026-11-01T00:00:00Z", cached: true,
  report: { score, label, confidence: 0.8, category: "fake_store", findings: [{ title: "Refunds are store credit only", detail: "Policy page says so", severity: "high", page: "/refunds" }], stats: { pages: 2, pageTypes: ["home"], emails: [], phones: [], addresses: [], payments: ["gift_card"], companies: [], maxDiscount: 0, selfDescribedDemo: false } },
  verdict: verdict({ score, verdict: label }),
  intel: { domain: host, registration: { createdAt: null, ageDays: 5, expiresAt: null, registrar: "NameBargain", source: "demo_registry" }, tls: { ok: true, issuer: null, validFrom: null, validTo: null, ageDays: null }, dns: { mx: 0, ns: [] }, wayback: { firstSeen: null, years: null, source: "none" }, allowlisted: false },
  crawl: { origin: `https://${host}`, finalHost: host, https: true, ms: 1200, ownStore: null, botBlocked: false, robots: true, sitemapUrls: 0, pages: [{ path: "/", type: "home", title: "Home", words: 120, status: 200 }], failed: 0, skippedByRobots: 0 },
});
const merchants = [
  { key: "voltdeals.example", merchant: "VoltDeals", host: "voltdeals.example", descriptor: "VOLTDEALS", category: "electronics", txns: [{ id: "t1", ts: "2026-11-02T12:00:00Z", amountCents: 18900 }], totalCents: 18900, basic: basic("voltdeals.example", "voltdeals.example", 15, "likely_scam"), deep: { verdict: verdict({ mode: "live", analysis: { summary: "Refunds are store credit only.", findings: [] } }), runId: "r1" } },
  { key: "books.example", merchant: "Books Co", host: "books.example", descriptor: "BOOKS CO", category: "books", txns: [{ id: "t2", ts: "2026-11-03T12:00:00Z", amountCents: 2350 }], totalCents: 2350, basic: basic("books.example", "books.example", 88, "looks_ok"), deep: null },
];

class FakeES {
  static last: FakeES | null = null; static CLOSED = 2; readyState = 1; closed = false;
  handlers: Record<string, ((e: MessageEvent) => void)[]> = {};
  constructor(public url: string) { FakeES.last = this; }
  addEventListener(t: string, f: (e: MessageEvent) => void) { (this.handlers[t] ??= []).push(f); }
  close() { this.closed = true; }
  emit(t: string, data: unknown) { (this.handlers[t] ?? []).forEach((f) => f({ data: JSON.stringify(data) } as MessageEvent)); }
}

function mockFetch(state: unknown, opts: { stateStatus?: number; scanStatus?: number } = {}) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/scan/site")) return new Response(JSON.stringify({ pages: [], crawl: { origin: "", robots: true, sitemapUrls: 0, ms: 1, skippedByRobots: [], failed: [] }, trace: [] }), { status: 200 });
    if (url.startsWith("/api/scan") && init?.method === "POST") {
      return opts.scanStatus && opts.scanStatus >= 400 ? new Response(JSON.stringify({ error: { code: "upstream_down", message: "Couldn't start the scan." } }), { status: opts.scanStatus }) : new Response(JSON.stringify({ scanId: "scan1" }), { status: 200 });
    }
    if (opts.stateStatus && opts.stateStatus >= 400) return new Response(JSON.stringify({ error: { code: "upstream_down", message: "Couldn't load your transactions." } }), { status: opts.stateStatus });
    return new Response(JSON.stringify(state), { status: 200 });
  });
  vi.stubGlobal("fetch", f);
  return f;
}
beforeEach(() => { vi.stubGlobal("EventSource", FakeES); FakeES.last = null; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("ScanClient", () => {
  it("shows a loading skeleton, then the honest empty state when nothing is imported", async () => {
    mockFetch({ merchants: [], deepAvailable: false, configured: false, account: null });
    const { container } = render(<ScanClient />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(await screen.findByText("No transactions yet")).toBeInTheDocument();
    expect(screen.getByText(/Capital One isn.t connected/)).toBeInTheDocument();
    expect(screen.getByText(/Deep analysis is off/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan my transactions" })).toBeDisabled();
  });

  it("shows a load error", async () => {
    mockFetch(null, { stateStatus: 500 });
    render(<ScanClient />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your transactions.");
  });

  it("lists merchants riskiest first with both tier scores, and opens merchant detail", async () => {
    mockFetch({ merchants, deepAvailable: true, configured: true, account: { name: "Maya", nickname: "Visa" } });
    render(<ScanClient />);
    const list = await screen.findByRole("list", { name: "Merchants" });
    const items = Array.from(list.children) as HTMLElement[];
    expect(items[0]).toHaveTextContent("VoltDeals");
    expect(items[1]).toHaveTextContent("Books Co");
    expect(items[0]).toHaveTextContent("Likely scam");
    expect(screen.getByText("Likely scams").nextElementSibling).toHaveTextContent("1");
    // riskiest merchant is auto-selected; both tiers render
    await waitFor(() => expect(screen.getAllByText("Basic check").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Deep analysis").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Refunds are store credit only.").length).toBeGreaterThan(0);
    fireEvent.click(within(list).getByRole("button", { name: /Books Co/ }));
    await waitFor(() => expect(screen.getAllByLabelText("Books Co details").length).toBeGreaterThan(0));
  });

  it("starts a scan, streams per-merchant progress, and offers re-crawl", async () => {
    const f = mockFetch({ merchants, deepAvailable: true, configured: true, account: null });
    render(<ScanClient />);
    await screen.findByRole("list", { name: "Merchants" });
    fireEvent.click(screen.getByRole("button", { name: "Re-crawl everything" }));
    await waitFor(() => expect(f.mock.calls.some(([u, i]) => String(u) === "/api/scan?fresh=1" && (i as RequestInit)?.method === "POST")).toBe(true));
    await waitFor(() => expect(FakeES.last).not.toBeNull());
    expect(screen.getByRole("button", { name: /Scanning/ })).toBeDisabled();
    act(() => {
      FakeES.last!.emit("merchants", { sync: null, merchants: merchants.map((m) => ({ key: m.key, merchant: m.merchant, host: m.host, descriptor: m.descriptor, category: m.category, txns: m.txns, totalCents: m.totalCents })), deepAvailable: true });
      FakeES.last!.emit("status", { key: "voltdeals.example", phase: "crawling" });
      FakeES.last!.emit("page", { key: "voltdeals.example", page: { path: "/refunds", type: "policy", title: "Refunds", words: 90, status: 200 } });
    });
    expect(screen.getByRole("region", { name: "Progress" })).toBeInTheDocument();
    expect(screen.getByText(/Crawling site · 1 pages/)).toBeInTheDocument();
    act(() => {
      FakeES.last!.emit("basic", basic("voltdeals.example", "voltdeals.example", 20, "likely_scam"));
      FakeES.last!.emit("done", { ms: 1000 });
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Scan again" })).toBeEnabled());
    expect(FakeES.last!.closed).toBe(true);
  });

  it("shows an error when the scan can't start", async () => {
    mockFetch({ merchants, deepAvailable: true, configured: true, account: null }, { scanStatus: 500 });
    render(<ScanClient />);
    await screen.findByRole("list", { name: "Merchants" });
    fireEvent.click(screen.getByRole("button", { name: "Scan again" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't start the scan.");
  });
});
