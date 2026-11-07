// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { highlightSpans } from "@/lib/client/highlight";
import { ToastProvider } from "../ui/Toast";
import { GameClient } from "./GameClient";

afterEach(() => { vi.unstubAllGlobals(); });

describe("highlightSpans", () => {
  it("splits verbatim spans in order, keeps plain text, skips missing and overlapping spans", () => {
    const t = "Pay $1.99 redelivery fee within 12 hrs now";
    const segs = highlightSpans(t, [{ span: "within 12 hrs", why: "b" }, { span: "Pay $1.99 redelivery fee", why: "a" }, { span: "not present", why: "c" }, { span: "12 hrs", why: "overlap" }]);
    expect(segs.map((s) => s.text).join("")).toBe(t);
    expect(segs.filter((s) => s.why).map((s) => s.why)).toEqual(["a", "b"]);
    expect(segs[0]).toEqual({ text: "Pay $1.99 redelivery fee", why: "a" });
  });
  it("no flags → one plain segment", () => { expect(highlightSpans("hello", [])).toEqual([{ text: "hello" }]); });
});

const cards = [1, 2].map((n) => ({ id: `c${n}`, kind: "text", content: { from: "+1 555", body: `Pay fee now ${n}` } }));
const flags = [{ span: "Pay fee", why: "Small fee request" }];

function stub(over: Record<string, unknown> = {}) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/game/today")) return new Response(JSON.stringify({ day: "2026-11-07", n: 1, isToday: true, cards, streak: 0, alreadyPlayed: null, ...over }));
    if (url === "/api/game/answer") return new Response(JSON.stringify({ correct: JSON.parse(init!.body as string).guess === "scam", isScam: true, redFlags: flags, category: "delivery_fee" }));
    return new Response(JSON.stringify({ score: 2, streak: 1, weakest: null, shareText: "Call the Bluff #1 🟩🟩 2/5 localhost:3000/play", practice: false, results: [true, true] }));
  });
  vi.stubGlobal("fetch", f); return f;
}
const renderGame = () => render(<ToastProvider><GameClient /></ToastProvider>);

describe("GameClient", () => {
  it("plays through: answer reveals flags and category, next, finish shows score/streak/share", async () => {
    const f = stub();
    const clip = vi.fn(async () => {}); Object.assign(navigator, { clipboard: { writeText: clip } });
    renderGame();
    expect(await screen.findByText("Card 1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bluff!" }));
    expect(await screen.findByText("Correct")).toBeInTheDocument();
    expect(screen.getAllByText("Pay fee").some((e) => e.tagName === "MARK")).toBe(true);
    expect(screen.getByText(/Small fee request/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next card" }));
    expect(await screen.findByText("Card 2 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Legit" }));
    expect(await screen.findByText("Not quite")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "See my score" }));
    expect(await screen.findByLabelText("Score 2 out of 5")).toBeInTheDocument();
    expect(screen.getByText("1 day")).toBeInTheDocument();
    expect(screen.getByText("None. Clean sweep.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(clip).toHaveBeenCalledWith("Call the Bluff #1 🟩🟩 2/5 localhost:3000/play"));
    const finishCall = f.mock.calls.find((c) => c[0] === "/api/game/finish")!;
    expect(JSON.parse(finishCall[1]!.body as string)).toEqual({ day: "2026-11-07", answers: [{ cardId: "c1", guess: "scam" }, { cardId: "c2", guess: "legit" }] });
  });

  it("already played today shows the practice note", async () => {
    stub({ alreadyPlayed: { score: 4 } });
    renderGame();
    expect(await screen.findByRole("status")).toHaveTextContent("You scored 4/5 today");
  });

  it("load failure shows an error with retry; answer failure keeps the card playable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "upstream_down", message: "Pool empty" } }), { status: 503 })));
    renderGame();
    expect(await screen.findByRole("alert")).toHaveTextContent("Pool empty");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
