// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import type { Overview } from "@/lib/overview";
import { HomeView, homeTitle, relativeTime } from "./HomeView";
import { OpenPhoneButton } from "./OpenPhoneButton";

const NOW = new Date("2026-11-07T18:00:00Z");
const empty: Overview = {
  scan: { account: null, merchants: 0, charges: 0, likelyScams: 0, unsure: 0, riskyCharges: 0, atRiskCents: 0, lastScanAt: null, scannedMerchants: 0, reviewedByNemotron: 0, deepAvailable: true, configured: true },
  needsAttention: [], hold: { held: false, since: null }, exposuresThisWeek: 0, alerts: [],
};
const scanned: Overview = {
  scan: { account: "Maya Lopez · Credit Card ••4821", merchants: 14, charges: 20, likelyScams: 2, unsure: 1, riskyCharges: 3, atRiskCents: 25500, lastScanAt: "2026-11-07T17:48:00Z", scannedMerchants: 14, reviewedByNemotron: 12, deepAvailable: true, configured: true },
  needsAttention: [
    { kind: "scan", key: "voltdeals-outlet.test", merchant: "VoltDeals", host: "voltdeals-outlet.test", label: "likely_scam", score: 14, mode: "live", reason: "Address is Suite 0", totalCents: 18900, charges: 1, latestTxnId: "txn-volt", latestTs: "2026-11-05T18:00:00Z", flags: [] },
    { kind: "scan", key: "cinevault.test", merchant: "CineVault", host: "cinevault.test", label: "unsure", score: 52, mode: "basic", reason: "No refund policy page", totalCents: 6000, charges: 2, latestTxnId: "txn-cine", latestTs: "2026-11-04T18:00:00Z", flags: ["card_test"] },
    { kind: "rule", id: "txn-dup", ts: "2026-11-03T18:00:00Z", descriptor: "SQ *COFFEE", amountCents: 450, flags: ["duplicate"] },
  ],
  hold: { held: true, since: "2026-11-07T17:50:00Z" }, exposuresThisWeek: 2,
  alerts: [{ id: "a1", body: "Bluff: a $189.00 charge from VoltDeals looks like a scam site.", status: "sent", createdAt: "2026-11-07T17:49:00Z" }],
};

describe("home page", () => {
  it("leads with the card: Capital One eyebrow, risky-charge headline, scan CTA and the check-a-site link", () => {
    render(<HomeView o={scanned} now={NOW} />);
    expect(screen.getByText(/Capital One · Maya Lopez · Credit Card ••4821/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("3 charges on your card look risky.");
    expect(screen.getByRole("link", { name: "Scan my transactions" })).toHaveAttribute("href", "/scan");
    expect(screen.getByRole("link", { name: "Check a site before you buy" })).toHaveAttribute("href", "/check");
    const glance = screen.getByRole("region", { name: "Your card at a glance" });
    expect(within(glance).getByText("20")).toBeInTheDocument();
    expect(within(glance).getByText("$255.00")).toBeInTheDocument();
    expect(within(glance).getByText("12 min ago")).toBeInTheDocument();
    expect(within(glance).getByText("12/14 sites by Nemotron")).toBeInTheDocument();
  });

  it("ranks scan-flagged merchants first, each linking to its latest charge with verdict and mode", () => {
    render(<HomeView o={scanned} now={NOW} />);
    const links = within(screen.getByRole("region", { name: "Needs attention" })).getAllByRole("listitem").map((li) => within(li).getByRole("link"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/charges/txn-volt", "/charges/txn-cine", "/charges/txn-dup"]);
    expect(links[0]).toHaveTextContent("VoltDeals");
    expect(links[0]).toHaveTextContent("Likely scam");
    expect(links[0]).toHaveTextContent("LIVE");
    expect(links[0]).toHaveTextContent("Address is Suite 0");
    expect(links[1]).toHaveTextContent("BASIC CHECK");
    expect(links[1]).toHaveTextContent("Card test");
    expect(links[2]).toHaveTextContent("Duplicate");
  });

  it("shows the simulated Safe Signal hold, the T-Mobile texts and the footer links", () => {
    render(<HomeView o={scanned} now={NOW} />);
    expect(screen.getByRole("status")).toHaveTextContent("Safe Signal hold is on (simulated): new online charges are declined. Reply UNHOLD on your phone to release.");
    const texts = screen.getByRole("region", { name: "Texts on your T-Mobile phone" });
    expect(within(texts).getByText(/looks like a scam site/)).toBeInTheDocument();
    expect(within(texts).getByRole("button", { name: "Open my phone" })).toBeInTheDocument();
    expect(screen.queryByText("Phone call")).toBeNull();
    expect(screen.getByRole("link", { name: "Proof: how well it works" })).toHaveAttribute("href", "/eval");
    expect(screen.getByRole("link", { name: "Chrome extension" })).toHaveAttribute("href", "/extension");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(within(screen.getByRole("region", { name: "How Bluff works" })).getAllByRole("listitem")).toHaveLength(4);
  });

  it("before any scan: calm headline, sandbox eyebrow, 'never' and a first-scan prompt", () => {
    render(<HomeView o={empty} now={NOW} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bluff watches your card.");
    expect(screen.getByText(/Capital One \(Nessie sandbox\)/)).toBeInTheDocument();
    expect(screen.getByText("never")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run your first scan" })).toHaveAttribute("href", "/scan");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/No texts yet/)).toBeInTheDocument();
  });

  it("headline and relative-time helpers", () => {
    expect(homeTitle(0)).toBe("Bluff watches your card.");
    expect(homeTitle(1)).toBe("1 charge on your card looks risky.");
    expect(homeTitle(4)).toBe("4 charges on your card look risky.");
    expect(relativeTime(null, NOW)).toBe("never");
    expect(relativeTime("2026-11-07T17:59:30Z", NOW)).toBe("just now");
    expect(relativeTime("2026-11-07T15:00:00Z", NOW)).toBe("3 h ago");
    expect(relativeTime("2026-11-06T18:00:00Z", NOW)).toBe("1 day ago");
    expect(relativeTime("2026-11-04T18:00:00Z", NOW)).toBe("3 days ago");
  });
});

describe("OpenPhoneButton", () => {
  it("presses the phone preview button in the top bar", () => {
    const clicks: string[] = [];
    render(<><button type="button" aria-controls="phone-preview" aria-expanded="false" onClick={() => clicks.push("phone")}>Phone</button><OpenPhoneButton /></>);
    fireEvent.click(screen.getByRole("button", { name: "Open my phone" }));
    expect(clicks).toEqual(["phone"]);
  });
});
