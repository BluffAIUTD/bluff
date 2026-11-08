// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChipStack, bandOf } from "./ChipStack";
import { FlipCard } from "./FlipCard";
import { DealerButton } from "./DealerButton";
import { ExposureActions } from "../check/ExposureActions";
import { ToastProvider } from "../ui/Toast";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => { vi.unstubAllGlobals(); });

describe("ChipStack", () => {
  it("one chip per 10 points (rounded up), at most 10, none for a zero score", () => {
    const count = (s: number) => { const { container, unmount } = render(<ChipStack score={s} topTone="scam" animate={false} />); const n = container.querySelectorAll("svg").length; unmount(); return n; };
    expect(count(0)).toBe(0);
    expect(count(1)).toBe(1);
    expect(count(18)).toBe(2);
    expect(count(70)).toBe(7);
    expect(count(100)).toBe(10);
  });
  it("bands follow the verdict thresholds", () => {
    expect(bandOf(0)).toBe("scam"); expect(bandOf(30)).toBe("scam"); expect(bandOf(40)).toBe("unsure"); expect(bandOf(60)).toBe("unsure"); expect(bandOf(70)).toBe("safe");
  });
  it("is decorative: hidden from assistive tech (the score is announced by its parent)", () => {
    const { container } = render(<ChipStack score={50} topTone="unsure" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("FlipCard and DealerButton", () => {
  it("flipped state is exposed for the 3D transform", () => {
    const { container, rerender } = render(<FlipCard flipped={false} front={<p>front</p>} back={<p>back</p>} />);
    expect(container.querySelector(".flip-card")).toHaveAttribute("data-flipped", "false");
    rerender(<FlipCard flipped front={<p>front</p>} back={<p>back</p>} />);
    expect(container.querySelector(".flip-card")).toHaveAttribute("data-flipped", "true");
  });
  it("dealer button keeps the LIVE/DEMO label", () => {
    const { rerender } = render(<DealerButton mode="demo" />);
    expect(screen.getByText("DEMO")).toBeInTheDocument();
    rerender(<DealerButton mode="live" />);
    expect(screen.getByText("LIVE")).toBeInTheDocument();
  });
});

describe("ExposureActions (chips you press)", () => {
  const wrap = (onLeave = vi.fn()) => render(<ToastProvider><ExposureActions verdictId="v1" url="https://fastkicks-shop" host="fastkicks-shop" onLeave={onLeave} /></ToastProvider>);
  it("three labeled chip buttons; Leave only leaves and logs nothing", () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const onLeave = vi.fn(); wrap(onLeave);
    expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(onLeave).toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });
  it("only a real, successful log places the chip; a failure keeps the chips and shows the error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "upstream_down", message: "Couldn't reach the log" } }), { status: 503 })));
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Continue and watch my charges" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the log");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(screen.queryByRole("status")).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => new Response(JSON.stringify({ exposure: { id: "e1", host: "fastkicks-shop", watch: JSON.parse(init!.body as string).action === "watch" }, alert: "delivered" }), { status: 201 })));
    fireEvent.click(screen.getByRole("button", { name: "Continue and watch my charges" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("I’ll watch your charges"));
    expect(document.querySelector(".chip-place")).toBeTruthy(); // the chip slid into the placed spot
    expect(screen.getByRole("button", { name: "Simulate a charge from this store" })).toBeInTheDocument();
  });
});
