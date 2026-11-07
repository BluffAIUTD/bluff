// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { CheckClient } from "./CheckClient";

class ES { addEventListener() {} close() {} static CLOSED = 2; readyState = 1; }
beforeEach(() => { vi.stubGlobal("EventSource", ES); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("CheckClient", () => {
  it("shows all 8 store chips", () => {
    render(<CheckClient />);
    expect(screen.getByRole("group", { name: "Demo stores" }).querySelectorAll("button")).toHaveLength(8);
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
  it("API failure is shown, not thrown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "rate_limited", message: "Too many checks." } }), { status: 429 })));
    render(<CheckClient />);
    fireEvent.click(screen.getByRole("button", { name: "fastkicks-shop" }));
    await waitFor(() => expect(screen.getByText("Too many checks.")).toBeInTheDocument());
  });
});
