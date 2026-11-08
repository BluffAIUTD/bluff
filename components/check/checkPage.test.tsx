// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ExposureDto } from "@/lib/types";

const h = vi.hoisted(() => ({ rows: [] as ExposureDto[] | Error }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/server/currentUser", () => ({ currentUserId: async () => "u1" }));
vi.mock("@/lib/db", () => ({ getPool: () => ({}) }));
vi.mock("@/lib/exposures", () => ({ listExposures: async () => { if (h.rows instanceof Error) throw h.rows; return h.rows; } }));
import CheckPage from "@/app/(shell)/check/page";

class ES { addEventListener() {} close() {} static CLOSED = 2; readyState = 1; }
beforeEach(() => { vi.stubGlobal("EventSource", ES); h.rows = []; });
afterEach(() => { vi.unstubAllGlobals(); });

const page = async () => render(await CheckPage({ searchParams: Promise.resolve({}) }));
const row: ExposureDto = { id: "e1", url: "https://fastkicks-shop", host: "fastkicks-shop", label: "fastkicks-shop", fieldTypes: ["card_number"], score: 18, verdict: "likely_scam", verdictId: "v1", watch: true, userAction: "watch", createdAt: "2026-11-07T18:00:00Z", linkedCount: 1 };

describe("/check page", () => {
  it("has the checker, the Checkout Guard card and the sites you used your card on", async () => {
    h.rows = [row];
    await page();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Check a site before you pay");
    expect(screen.getByRole("link", { name: /Checkout Guard for Chrome: checks automatically when a page asks for your card\./ })).toHaveAttribute("href", "/extension");
    const sites = screen.getByRole("region", { name: "Sites you used your card on" });
    expect(sites).toHaveAttribute("id", "exposures");
    expect(within(sites).getByText("fastkicks-shop")).toBeInTheDocument();
    expect(within(sites).getByText("1 linked charge")).toBeInTheDocument();
  });
  it("an empty or failing exposure log never hides the checker", async () => {
    const { unmount } = await page();
    expect(screen.getByText(/None yet\. Check a store above/)).toBeInTheDocument();
    unmount();
    h.rows = new Error("db down");
    await page();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your sites");
    expect(screen.getByRole("button", { name: "fastkicks-shop" })).toBeInTheDocument();
  });
});
