// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { CheckClient } from "./CheckClient";

class ES { addEventListener() {} close() {} static CLOSED = 2; readyState = 1; }
beforeEach(() => { vi.stubGlobal("EventSource", ES); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("CheckClient", () => {
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
