// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DeleteEverything } from "./DeleteEverything";
import { DataFlowDiagram } from "./DataFlowDiagram";

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
  it("has an accessible description of the flow", () => {
    render(<DataFlowDiagram />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/never leave the device/);
  });
});
