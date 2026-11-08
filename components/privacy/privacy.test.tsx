// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DeleteEverything } from "./DeleteEverything";
import { DataFlowDiagram } from "./DataFlowDiagram";
import PrivacyPage from "@/app/(shell)/privacy/page";

afterEach(() => { vi.unstubAllGlobals(); });

describe("DeleteEverything", () => {
  it("does nothing if the user cancels", () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f); vi.stubGlobal("confirm", () => false);
    render(<DeleteEverything />);
    fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
    expect(f).not.toHaveBeenCalled();
  });
  it("calls DELETE /api/me and confirms; shows an error on failure", async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 })); vi.stubGlobal("fetch", f); vi.stubGlobal("confirm", () => true);
    const { unmount } = render(<DeleteEverything />);
    fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Done.");
    expect(f).toHaveBeenCalledWith("/api/me", expect.objectContaining({ method: "DELETE" }));
    unmount();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "upstream_down", message: "DB down" } }), { status: 503 })));
    render(<DeleteEverything />);
    fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("DB down"));
  });
});

describe("DataFlowDiagram", () => {
  it("has an accessible description of both flows", () => {
    render(<DataFlowDiagram />);
    const img = screen.getByRole("img");
    expect(img).toHaveAccessibleName(/never leave the device/);
    expect(img).toHaveAccessibleName(/Capital One Nessie sandbox charges, crawls each merchant's public pages/);
    expect(img).toHaveAccessibleName(/NVIDIA Nemotron/);
  });
});

describe("privacy page", () => {
  const row = (name: string) => screen.getByRole("rowheader", { name }).closest("tr")!;

  it("states the bank-scan flow, the extension's origin-only rule and the discard rule truthfully", () => {
    render(<PrivacyPage />);
    expect(row("Your Capital One transactions (Nessie sandbox)")).toHaveTextContent("Read by Bluff's server");
    expect(row("A merchant's own charge history (dates and amounts)")).toHaveTextContent(/Sent to Nemotron.*Only that merchant's charges/);
    expect(row("Real card data")).toHaveTextContent(/Never.*Synthetic only/);
    expect(row("Page text, screenshots, and the page's path or query")).toHaveTextContent("Never sent");
    expect(row("The site's origin")).toHaveTextContent("Sent");
    expect(row("A text you forward or report, or a link you paste")).toHaveTextContent(/then discarded.*Only the verdict is kept, and for a scam link, the site's host/);
    // The old, inaccurate claims are gone.
    expect(screen.queryByText(/Your card statement/)).toBeNull();
    expect(screen.queryByText(/resets the demo for everyone/)).toBeNull();
    expect(screen.queryByText(/re-creates the sample user/)).toBeNull();
  });
  it("says every visitor has a private account and links to the proof", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/Every visitor gets their own private demo account/)).toBeInTheDocument();
    expect(screen.getByText(/Only your account is affected/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Proof: how well Bluff works" })).toHaveAttribute("href", "/eval");
  });
});
