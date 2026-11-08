// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { RefundBuilder, SLOW_DRAFT_MS } from "./RefundBuilder";
import { ToastProvider } from "../ui/Toast";
import type { DisputeDto } from "@/lib/disputes";

const dispute = (o: Partial<DisputeDto> = {}): DisputeDto => ({
  id: "d1", txnId: "t1", exposureId: "e1", letter: "To: Card issuer\nAmount: $49.99", status: "draft", generatedBy: "template", createdAt: "2026-11-07T00:00:00Z",
  timeline: [{ kind: "exposure", at: "2026-11-04T18:00:00Z", label: "Entered card on fastkicks-shop", detail: "score 18" }, { kind: "charge", at: "2026-11-07T18:00:00Z", label: "$49.99 charged by FKSHP*LLC", detail: "match" }],
  nextSteps: ["Call the number on the back of your card", "Lock or replace the card"], ...o,
});
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("RefundBuilder", () => {
  it("disabled with a tooltip and explanation when the charge isn't linked", () => {
    wrap(<RefundBuilder txnId="t1" canBuild={false} initial={null} />);
    expect(screen.getByRole("button", { name: "Build dispute" })).toBeDisabled();
    expect(screen.getByText(/isn.t linked to a risky site/)).toBeInTheDocument();
    expect(screen.getByText("Bluff drafts. You decide. Not legal or financial advice.")).toBeInTheDocument();
  });

  it("builds a dispute: letter, timeline, next steps, template badge, copy/download/mark filed", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      if (url === "/api/disputes") return new Response(JSON.stringify({ dispute: dispute() }), { status: 201 });
      return new Response(JSON.stringify({ dispute: dispute({ status: "filed" }) }), { status: 200 });
    }));
    const clip = vi.fn(async () => {}); Object.assign(navigator, { clipboard: { writeText: clip } });
    wrap(<RefundBuilder txnId="t1" canBuild initial={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Build dispute" }));
    expect(await screen.findByLabelText(/Letter/)).toHaveValue("To: Card issuer\nAmount: $49.99");
    expect(screen.getByText("Template letter")).toBeInTheDocument();
    expect(screen.getByText("Entered card on fastkicks-shop")).toBeInTheDocument();
    expect(screen.getByText("Lock or replace the card")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy letter" }));
    await waitFor(() => expect(clip).toHaveBeenCalledWith("To: Card issuer\nAmount: $49.99"));
    fireEvent.click(screen.getByRole("button", { name: "Mark as filed" }));
    expect((await screen.findAllByText("Marked as filed")).length).toBeGreaterThan(0); // badge + toast
    expect(screen.queryByRole("button", { name: "Mark as filed" })).toBeNull();
    expect(calls).toEqual(["POST /api/disputes", "PATCH /api/disputes/d1"]);
  });

  it("edits to the letter are what gets copied", async () => {
    const clip = vi.fn(async () => {}); Object.assign(navigator, { clipboard: { writeText: clip } });
    wrap(<RefundBuilder txnId="t1" canBuild initial={dispute()} />);
    fireEvent.change(screen.getByLabelText(/Letter/), { target: { value: "edited" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy letter" }));
    await waitFor(() => expect(clip).toHaveBeenCalledWith("edited"));
  });

  it("shows a skeleton, then 'Still drafting' after 8 s; failure shows retry", async () => {
    vi.useFakeTimers();
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    wrap(<RefundBuilder txnId="t1" canBuild initial={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Build dispute" }));
    expect(screen.getByText("Drafting…")).toBeInTheDocument();
    expect(screen.queryByText("Still drafting…")).toBeNull();
    act(() => { vi.advanceTimersByTime(SLOW_DRAFT_MS + 100); });
    expect(screen.getByText("Still drafting…")).toBeInTheDocument();
    await act(async () => { resolve(new Response(JSON.stringify({ error: { code: "upstream_down", message: "Drafting failed" } }), { status: 503 })); });
    expect(screen.getByRole("alert")).toHaveTextContent("Drafting failed");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("site-check evidence: the timeline links the pages it cites; the basis note shows before drafting", () => {
    const { unmount } = wrap(<RefundBuilder txnId="t1" canBuild initial={null} basisNote="Based on Bluff's check of the merchant website." />);
    expect(screen.getByText("Based on Bluff's check of the merchant website.")).toBeInTheDocument();
    unmount();
    wrap(<RefundBuilder txnId="t1" canBuild initial={dispute({ exposureId: null, timeline: [
      { kind: "charge", at: "2026-11-05T18:00:00Z", label: "$189.00 charged by VOLTDEALS OUTLET", detail: "Merchant website: voltdeals-outlet.bluffai.us" },
      { kind: "site_check", at: "2026-11-07T18:00:00Z", label: "Bluff checked voltdeals-outlet.bluffai.us: 12/100, likely scam", detail: "Nemotron deep review, 82% sure.", sources: ["https://voltdeals-outlet.bluffai.us/contact", "javascript:alert(1)"] },
    ] })} />);
    expect(screen.getByText("Bluff checked voltdeals-outlet.bluffai.us: 12/100, likely scam")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://voltdeals-outlet.bluffai.us/contact");
    expect(links[0]).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("existing filed dispute renders as filed", () => {
    wrap(<RefundBuilder txnId="t1" canBuild initial={dispute({ status: "filed", generatedBy: "ai" })} />);
    expect(screen.getAllByText("Marked as filed").length).toBeGreaterThan(0);
    expect(screen.queryByText("Template letter")).toBeNull();
  });
});
