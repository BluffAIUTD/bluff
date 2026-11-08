// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExposureTimeline } from "./ExposureTimeline";
import type { ExposureDto } from "@/lib/types";

const ex = (o: Partial<ExposureDto> = {}): ExposureDto => ({ id: "e1", url: "u", host: "fastkicks-shop", label: "fastkicks-shop", fieldTypes: ["card_number"], score: 18, verdict: "likely_scam", verdictId: "v", watch: false, userAction: "continue", createdAt: "2026-11-07T18:00:00Z", linkedCount: 1, ...o });
afterEach(() => { vi.unstubAllGlobals(); });

describe("ExposureTimeline", () => {
  it("empty state", () => { render(<ExposureTimeline initial={[]} />); expect(screen.getByText("No exposures yet")).toBeInTheDocument(); });

  it("groups by day (newest first as given), shows host, fields, score badge and linked count", () => {
    render(<ExposureTimeline initial={[ex(), ex({ id: "e2", host: "bayou-bakery", score: 90, linkedCount: 0, createdAt: "2026-11-05T18:00:00Z" })]} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Saturday, Nov 7", "Thursday, Nov 5"]);
    expect(screen.getByText("Score 18")).toBeInTheDocument();
    expect(screen.getByText("1 linked charge")).toBeInTheDocument();
    expect(screen.getByText("No linked charges")).toBeInTheDocument();
  });

  it("a link from a reported scam text says so instead of listing entered fields", () => {
    render(<ExposureTimeline initial={[ex({ host: "deliveryfix-help.bluffai.us", userAction: "received_link", source: "sms", fieldTypes: [], linkedCount: 0 })]} />);
    expect(screen.getByText(/Link in a scam text you reported/)).toBeInTheDocument();
    expect(screen.getByText("(text discarded)")).toBeInTheDocument();
    expect(screen.queryByText(/· info$/)).toBeNull();
  });

  it("watch toggle is optimistic and rolls back with an error on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "upstream_down", message: "Nope" } }), { status: 503 })));
    render(<ExposureTimeline initial={[ex()]} />);
    const box = screen.getByRole("checkbox", { name: "Watch" });
    fireEvent.click(box);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Nope"));
    expect(box).not.toBeChecked();
  });

  it("watch persists; delete asks for confirmation and removes the row", async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 })); vi.stubGlobal("fetch", f);
    const confirm = vi.fn(() => false); vi.stubGlobal("confirm", confirm);
    render(<ExposureTimeline initial={[ex()]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Watch" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Watch" })).toBeChecked());
    fireEvent.click(screen.getByRole("button", { name: "Delete fastkicks-shop" }));
    expect(screen.getByText("fastkicks-shop")).toBeInTheDocument(); // declined
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete fastkicks-shop" }));
    await waitFor(() => expect(screen.getByText("No exposures yet")).toBeInTheDocument());
    expect(f).toHaveBeenCalledWith("/api/exposures/e1", expect.objectContaining({ method: "DELETE" }));
  });
});
