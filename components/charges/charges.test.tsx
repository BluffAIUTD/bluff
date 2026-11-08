// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransactionTable } from "./TransactionTable";
import { LinkedChargeCard } from "./LinkedChargeCard";
import { PriceSparkline } from "./PriceSparkline";
import { canBuildDispute, ChargeDetailClient, linkInfoFor, type Detail } from "./ChargeDetailClient";
import { SiteVerdictCard } from "./SiteVerdictCard";
import { ToastProvider } from "../ui/Toast";
import type { SiteCheck } from "@/lib/disputes";
import type { TransactionDto } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const charge = { descriptor: "FKSHP*LLC", amountCents: 4999, ts: "2026-11-07T18:00:00Z" };
const tx = (o: Partial<TransactionDto> = {}): TransactionDto => ({ id: "1", ts: "2026-11-07T18:00:00Z", descriptor: "FKSHP*LLC", descriptorNorm: "fkshp", amountCents: 4999, mccCategory: null, isRecurring: false, flags: ["exposure_link"], ...o });

describe("TransactionTable", () => {
  it("rows link to detail, show amount and flag badges", () => {
    render(<TransactionTable rows={[tx()]} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/charges/1");
    expect(screen.getByText("$49.99")).toBeInTheDocument();
    expect(screen.getByText("Exposure link")).toBeInTheDocument();
  });
  it("empty state invites a simulation", () => {
    render(<TransactionTable rows={[]} />);
    expect(screen.getByText("No charges yet")).toBeInTheDocument();
  });
});

describe("LinkedChargeCard", () => {
  const info = { host: "fastkicks-shop", exposureAt: "2026-11-04T18:00:00Z", exposureScore: 18, fieldTypes: ["card_number"], reasons: ["descriptor 'FKSHP' abbreviates 'fastkicks-shop'", "charged 3 days after exposure"], days: 3 };
  it("flagged: names the exposure's domain, date, score, field types and the match reasons", () => {
    render(<LinkedChargeCard link={{ kind: "flagged", ...info }} charge={charge} />);
    expect(screen.getByText("fastkicks-shop")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText(/Score/)).toHaveTextContent("card");
    expect(screen.getByText("charged 3 days after exposure")).toBeInTheDocument();
    expect(screen.getByText("Charge · 3 days later")).toBeInTheDocument();
  });
  it("expected, possible and none each say the right thing; none never invents a link", () => {
    const { rerender } = render(<LinkedChargeCard link={{ kind: "expected", ...info }} charge={charge} />);
    expect(screen.getByRole("heading", { name: "Expected charge" })).toBeInTheDocument();
    rerender(<LinkedChargeCard link={{ kind: "possible", ...info, otherCount: 1 }} charge={charge} />);
    expect(screen.getByText("Possible match, low confidence")).toBeInTheDocument();
    expect(screen.getByText("1 other possible match")).toBeInTheDocument();
    rerender(<LinkedChargeCard link={{ kind: "none" }} charge={charge} pending />);
    expect(screen.getByText("No linked exposure")).toBeInTheDocument();
    expect(screen.queryByText("fastkicks-shop")).toBeNull();
    expect(screen.getByText("explanation loading…")).toBeInTheDocument();
  });
});

describe("linkInfoFor", () => {
  const best = { exposureId: "e", host: "h", exposureAt: "2026-11-04T00:00:00Z", exposureScore: 18, fieldTypes: ["card_number"], reasons: ["r"], days: 3, kind: "flagged" as const };
  const d = (b: typeof best | null) => ({ transaction: { ...tx(), scripted: false, scriptId: null }, best: b, otherCount: 0, verdict: null, priceHistory: [], dispute: null }) as Detail;
  it("no candidate → none; agent 'possible' downgrades a strong SQL link to amber", () => {
    expect(linkInfoFor(d(null), null).kind).toBe("none");
    expect(linkInfoFor(d(best), null).kind).toBe("flagged");
    expect(linkInfoFor(d(best), { linked: { kind: "possible" } } as never).kind).toBe("possible");
  });
  it("Build dispute follows the server's basis (a bank-scan site check counts); old payloads fall back to the link rule", () => {
    expect(canBuildDispute({ ...d(null), basis: "site" })).toBe(true);
    expect(canBuildDispute({ ...d(best), basis: null })).toBe(false);
    expect(canBuildDispute(d(best))).toBe(true);
    expect(canBuildDispute(d(null))).toBe(false);
  });
});

describe("Safe Signal on the charge page", () => {
  const site: SiteCheck = {
    host: "voltdeals-outlet.bluffai.us", score: 12, label: "likely_scam", confidence: 0.82, mode: "live", category: "fake_store", checkedAt: "2026-11-07T18:00:00Z", verdictId: "v", allowlisted: false,
    findings: [{ title: "Address is 'Suite 0'", detail: "No such suite.", page: "https://voltdeals-outlet.bluffai.us/contact" }, { title: "Domain registered 21 days ago" }],
  };
  it("SiteVerdictCard: score, confidence and mode as given, findings with the page they came from", () => {
    render(<SiteVerdictCard site={site} />);
    expect(screen.getByRole("heading", { name: "Merchant website looks like a scam" })).toBeInTheDocument();
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByLabelText("Merchant website check")).toHaveTextContent("score 12/100, 82% sure");
    expect(screen.getByRole("link", { name: "/contact" })).toHaveAttribute("href", "https://voltdeals-outlet.bluffai.us/contact");
  });
  it("basic-only checks are labeled; allowlisted sites say so", () => {
    render(<SiteVerdictCard site={{ ...site, mode: "basic", label: "unsure", score: 45, allowlisted: true }} />);
    expect(screen.getByText("BASIC CHECK")).toBeInTheDocument();
    expect(screen.getByLabelText("Merchant website check")).toHaveTextContent("rules only (no AI review)");
    expect(screen.getByText(/You marked this site safe/)).toBeInTheDocument();
  });
  it("LinkedChargeCard names a reported scam text as the source of the link", () => {
    render(<LinkedChargeCard link={{ kind: "flagged", host: "deliveryfix-help.bluffai.us", exposureAt: "2026-11-04T18:00:00Z", exposureScore: 22, fieldTypes: [], reasons: [], days: 1, via: "text" }} charge={charge} />);
    expect(screen.getByRole("heading", { name: "Linked to a scam text you reported" })).toBeInTheDocument();
    expect(screen.getByText("Link in a scam text you reported")).toBeInTheDocument();
    expect(screen.queryByText("You entered info on")).toBeNull();
  });
  it("a bank-scan charge with no exposure shows the site check instead of 'No linked exposure'", () => {
    const detail = { transaction: { ...tx({ flags: ["risky_site"] }), scripted: false, scriptId: null }, best: null, otherCount: 0, verdict: { id: "v", score: 30, verdict: "likely_scam", confidence: 0.8, confidence_reason: "x", category: "fake_store", evidence: ["a", "b", "c"], evidence_keys: [], next_steps: ["a", "b"], linked: {}, mode: "basic" }, priceHistory: [], dispute: null, basis: "site", siteCheck: site } as Detail;
    render(<ToastProvider><ChargeDetailClient detail={detail} /></ToastProvider>);
    expect(screen.queryByText("No linked exposure")).toBeNull();
    expect(screen.getByRole("heading", { name: "Merchant website looks like a scam" })).toBeInTheDocument();
    expect(screen.getByText("Risky site")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build dispute" })).toBeEnabled();
    expect(screen.getByText(/Based on Bluff's check of the merchant website/)).toBeInTheDocument();
  });
});

describe("PriceSparkline", () => {
  it("needs ≥ 2 points", () => {
    render(<PriceSparkline points={[{ day: "2026-11-01", sumCents: 100 }]} />);
    expect(screen.getByText(/Not enough history/)).toBeInTheDocument();
  });
  it("draws a labeled chart", () => {
    render(<PriceSparkline points={[{ day: "2026-10-01", sumCents: 1599 }, { day: "2026-11-01", sumCents: 3198 }]} />);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", expect.stringContaining("$31.98"));
  });
});
