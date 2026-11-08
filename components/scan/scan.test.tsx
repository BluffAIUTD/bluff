// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ScanClient } from "./ScanClient";
import { LivePush } from "./LivePush";
import { ago, linkText } from "./types";

/** EventSource stand-in: tests emit server events by hand. */
class ES {
  static all: ES[] = [];
  static CLOSED = 2;
  readyState = 1;
  listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  constructor(public url: string) { ES.all.push(this); }
  addEventListener(type: string, fn: (e: MessageEvent) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  close() { this.readyState = 2; }
  emit(type: string, data: unknown) { for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) } as MessageEvent); }
}
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const merchant = (key: string, name: string, cents: number, txnId: string) => ({ key, merchant: name, host: key, descriptor: name.toUpperCase(), category: null, txns: [{ id: txnId, ts: "2026-11-05T18:00:00Z", amountCents: cents }], totalCents: cents, link: null });
const basicOf = (key: string, score: number, label: string) => ({ key, scanId: "s", host: key, createdAt: "2026-11-07T00:00:00Z", cached: true, report: { score, label, confidence: 0.8, category: "x", findings: [], stats: { pages: 1, payments: [], emails: [], phones: [], addresses: [], companies: [] } }, verdict: { score, verdict: label, confidence: 0.8, confidence_reason: "x", category: "x", evidence: ["a", "b", "c"], evidence_keys: [], next_steps: ["a", "b"], linked: {}, mode: "basic" }, intel: null, crawl: { origin: "", finalHost: "", https: true, ms: 1, ownStore: null, botBlocked: false, robots: false, sitemapUrls: 0, pages: [], failed: 0, skippedByRobots: 0 } });

beforeEach(() => { ES.all = []; vi.stubGlobal("EventSource", ES); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("scan helpers", () => {
  it("link memory wording: card on a site, scam text, unknown kinds read like a page check", () => {
    expect(linkText({ host: "fastkicks-shop.bluffai.us", at: "2026-11-05T18:00:00Z", userAction: "continue", fieldTypes: ["card_number"] })).toBe("Linked: you entered your card on fastkicks-shop.bluffai.us on Nov 5");
    expect(linkText({ host: "tollpay-tx.bluffai.us", at: "2026-11-05T18:00:00Z", userAction: "received_link", fieldTypes: [] })).toBe("Linked: the link in a scam text you reported on Nov 5");
    expect(linkText({ host: "x.example", at: "2026-11-05T18:00:00Z", userAction: "something_new", fieldTypes: ["email"] })).toBe("Linked: you entered your details on x.example on Nov 5");
    expect(ago(new Date(Date.now() - 5_000).toISOString())).toBe("5 s ago");
  });
});

describe("LivePush", () => {
  it("preselects ?push=<store>, posts whole dollars and shows the Nessie purchase", async () => {
    const f = vi.fn(async () => ok({ purchaseId: "6a1f0c2b-1111", txnId: "t1", scanId: "s1", preset: "voltdeals-outlet", merchant: "VoltDeals Outlet", amount: 189, purchaseDate: "2026-11-07", card: { nickname: "Quicksilver", last4: "4778" } }));
    vi.stubGlobal("fetch", f);
    const onPushed = vi.fn();
    render(<LivePush initialPreset="voltdeals-outlet" tracked={null} onPushed={onPushed} />);
    expect(screen.getByText("Try it: make a purchase on Maya's test card")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Scam-pattern demo stores (Bluff's own fake sites)" }).querySelectorAll("button")).toHaveLength(5);
    expect(screen.getByRole("group", { name: "Real and demo legit merchants" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /VoltDeals Outlet/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Charge the card $189" }));
    await screen.findByText(/Posted \$189 to Capital One Nessie/);
    expect(screen.getByText("6a1f…")).toBeInTheDocument();
    expect(screen.getByText("Checking the site…")).toBeInTheDocument();
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ preset: "voltdeals-outlet", amount: 189, fresh: true });
    expect(onPushed).toHaveBeenCalledWith(expect.objectContaining({ scanId: "s1" }));
  });

  it("shows the Safe Signal decline and rejects amounts Nessie can't store", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ error: { code: "card_on_hold", message: "Declined: your card is on a Safe Signal hold (simulated). Reply UNHOLD on your phone to release it." } }, 409)));
    render(<LivePush defaultOpen tracked={null} onPushed={vi.fn()} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1500" } });
    expect(screen.getByRole("button", { name: /Charge the card/ })).toBeDisabled();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Charge the card $25" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Safe Signal hold (simulated)");
  });

  it("is collapsed by default without ?push or ?demo", () => {
    render(<LivePush tracked={null} onPushed={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Charge the card/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("button", { name: /Charge the card/ })).toBeInTheDocument();
  });
});

describe("ScanClient", () => {
  it("a partial scan merges its merchant on top with a NEW badge instead of replacing the list", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/scan") return ok({ merchants: [{ ...merchant("netflix.com", "Netflix", 1500, "n1"), basic: basicOf("netflix.com", 90, "looks_ok"), deep: null }, { ...merchant("target.com", "Target", 5400, "t1"), basic: basicOf("target.com", 85, "looks_ok"), deep: null }], deepAvailable: false, configured: true, account: { name: "Maya Patel", nickname: "Quicksilver ••4778" }, lastSyncAt: null });
      if (url === "/api/scan/watch") return ok({ configured: true, checkedAt: new Date().toISOString(), scanId: "w1", newTxnIds: ["v2"], imported: 1, firstSync: false, throttled: false });
      return ok({});
    }));
    render(<ScanClient />);
    await screen.findByText("Netflix");
    expect(screen.getByText(/Bluff checks the website behind every charge on your card/)).toBeInTheDocument();
    await waitFor(() => expect(ES.all.some((e) => e.url === "/api/scan/w1/stream")).toBe(true)); // the watcher found a new purchase
    expect(screen.getByRole("button", { name: /Watching your card/ })).toHaveAttribute("aria-pressed", "true");
    const es = ES.all.find((e) => e.url === "/api/scan/w1/stream")!;
    act(() => es.emit("merchants", { sync: null, merchants: [{ ...merchant("voltdeals-outlet.bluffai.us", "VoltDeals Outlet", 18900, "v2"), link: { exposureId: "e1", host: "voltdeals-outlet.bluffai.us", at: "2026-11-05T18:00:00Z", userAction: "continue", fieldTypes: ["card_number"], kind: "flagged", txnId: "v2" } }], deepAvailable: false, partial: true, reason: "watch", newTxnIds: ["v2"] }));
    const list = screen.getByRole("list", { name: "Merchants" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("VoltDeals Outlet");
    expect(within(rows[0]).getByText("NEW")).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: /VoltDeals Outlet/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getAllByText("Linked: you entered your card on voltdeals-outlet.bluffai.us on Nov 5").length).toBeGreaterThan(0);
    act(() => es.emit("basic", basicOf("voltdeals-outlet.bluffai.us", 18, "likely_scam")));
    act(() => es.emit("done", { ms: 10 }));
    expect(within(rows[0]).getByText(/Likely scam/)).toBeInTheDocument();
    expect(es.readyState).toBe(2);
  });

  it("a server-sent 'Scan not found' error ends the scan instead of reconnecting forever; a plain network error keeps retrying", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/scan" && init?.method === "POST") return ok({ scanId: "s1" });
      if (url === "/api/scan") return ok({ merchants: [{ ...merchant("netflix.com", "Netflix", 1500, "n1"), basic: basicOf("netflix.com", 90, "looks_ok"), deep: null }], deepAvailable: false, configured: true, account: null, lastSyncAt: null });
      if (url === "/api/scan/watch") return ok({ configured: true, checkedAt: null, scanId: null, newTxnIds: [], imported: 0, firstSync: false, throttled: false });
      return ok({});
    }));
    render(<ScanClient />);
    await screen.findByText("Netflix");
    fireEvent.click(screen.getByRole("button", { name: "Scan again" }));
    await waitFor(() => expect(ES.all.some((e) => e.url === "/api/scan/s1/stream")).toBe(true));
    const es = ES.all.find((e) => e.url === "/api/scan/s1/stream")!;
    expect(screen.getByRole("button", { name: /Scanning/ })).toBeDisabled();
    act(() => es.emit("merchants", { sync: null, merchants: [merchant("netflix.com", "Netflix", 1500, "n1")], deepAvailable: false }));
    act(() => es.emit("status", { key: "netflix.com", phase: "crawling" }));
    // A dropped connection (no data, still reconnecting): the scan keeps going.
    act(() => { for (const fn of es.listeners.get("error") ?? []) fn({} as MessageEvent); });
    expect(es.readyState).toBe(1);
    expect(screen.getByRole("button", { name: /Scanning/ })).toBeDisabled();
    // The server lost the scan (restart): its error event is final.
    act(() => es.emit("error", { message: "Scan not found" }));
    expect(es.readyState).toBe(2);
    expect(screen.getByRole("button", { name: "Scan my transactions" })).toBeEnabled(); // no longer "Scanning…"
    expect(screen.getByText("That scan is no longer running. Press Scan again.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Merchants" })).queryByText(/Crawling site/)).toBeNull();
  });
});
