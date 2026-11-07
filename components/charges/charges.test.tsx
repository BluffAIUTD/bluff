// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransactionTable } from "./TransactionTable";
import { LinkedChargeCard } from "./LinkedChargeCard";
import { PriceSparkline } from "./PriceSparkline";
import { linkInfoFor, type Detail } from "./ChargeDetailClient";
import type { TransactionDto } from "@/lib/types";

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
  const d = (b: typeof best | null) => ({ transaction: { ...tx(), scripted: false, scriptId: null }, best: b, otherCount: 0, verdict: null, priceHistory: [] }) as Detail;
  it("no candidate → none; agent 'possible' downgrades a strong SQL link to amber", () => {
    expect(linkInfoFor(d(null), null).kind).toBe("none");
    expect(linkInfoFor(d(best), null).kind).toBe("flagged");
    expect(linkInfoFor(d(best), { linked: { kind: "possible" } } as never).kind).toBe("possible");
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
