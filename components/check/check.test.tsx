// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { CheckClient } from "./CheckClient";
import { ExposureActions } from "./ExposureActions";

class ES { addEventListener() {} close() {} static CLOSED = 2; readyState = 1; }
beforeEach(() => { vi.stubGlobal("EventSource", ES); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("CheckClient", () => {
  it("leads with checking a site before paying", () => {
    render(<CheckClient />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Check a site before you pay");
    expect(screen.getByText("Paste a store link or a text you got. Bluff crawls the site and Nemotron rates it.")).toBeInTheDocument();
  });
  it("shows all 10 store chips", () => {
    render(<CheckClient />);
    expect(screen.getByRole("group", { name: "Demo stores" }).querySelectorAll("button")).toHaveLength(10);
  });
  it("empty link and empty text show specific messages and do not call the API", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    render(<CheckClient />);
    fireEvent.click(screen.getByRole("button", { name: "Check link" }));
    expect(await screen.findByText("Paste a link or pick a store")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check text" }));
    expect(await screen.findByText("Paste a text message or link to check")).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });
  it("says when the site's pages go to Nemotron, and when only the domain was checked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ runId: "r1", siteReview: true }), { status: 200, headers: { "content-type": "application/json" } })));
    const { unmount } = render(<CheckClient />);
    fireEvent.change(screen.getByLabelText("Or paste a link"), { target: { value: "https://example-store.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Check link" }));
    expect(await screen.findByText(/sending them to Nemotron for review/)).toBeInTheDocument();
    expect(screen.queryByText(/Limited check/)).toBeNull();
    unmount();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ runId: "r2", siteReview: false }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<CheckClient />);
    fireEvent.change(screen.getByLabelText("Or paste a link"), { target: { value: "https://example-store.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Check link" }));
    expect(await screen.findByText(/Limited check: page not analyzed/)).toBeInTheDocument();
  });
  it("API failure is shown, not thrown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "rate_limited", message: "Too many checks." } }), { status: 429 })));
    render(<CheckClient />);
    fireEvent.click(screen.getByRole("button", { name: "fastkicks-shop" }));
    await waitFor(() => expect(screen.getByText("Too many checks.")).toBeInTheDocument());
  });
});

describe("ExposureActions", () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const exposure = { id: "e1", url: "https://x.test", host: "x.test", label: "x.test", fieldTypes: ["card_number"], score: 20, verdict: "likely_scam", verdictId: "v1", watch: true, userAction: "watch", createdAt: "2026-11-07T18:00:00Z" };

  it("logs the site, refreshes the list under the checker and points to it", async () => {
    router.refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => json({ exposure })));
    render(<ExposureActions verdictId="v1" url="https://x.test" host="x.test" onLeave={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue and watch my charges" }));
    expect(await screen.findByRole("link", { name: "Sites you used your card on" })).toHaveAttribute("href", "#exposures");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // not a demo store: no simulated charge, and the demo-store count is right
    expect(screen.getByText("Charge simulation is available for the 10 demo stores.")).toBeInTheDocument();
  });
  it("offers the simulated charge for a demo store", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ exposure: { ...exposure, host: "fastkicks-shop" } })));
    render(<ExposureActions verdictId="v1" url="https://fastkicks-shop" host="fastkicks-shop" onLeave={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue and watch my charges" }));
    expect(await screen.findByRole("button", { name: "Simulate a charge from this store" })).toBeInTheDocument();
  });
});
