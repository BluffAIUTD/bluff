// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { highlightSpans } from "@/lib/client/highlight";
import { ToastProvider } from "../ui/Toast";
import { GameClient, type GameState } from "./GameClient";
import { formatCountdown, revealSegments, tapRange, wordTokens } from "./text";

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

describe("tap helpers", () => {
  it("tokenizes words with body offsets and trims punctuation from the tap range", () => {
    const body = "Pay (now): fee.\n\nOk";
    const words = wordTokens(body).filter((t) => t.word);
    expect(words.map((w) => w.text)).toEqual(["Pay", "(now):", "fee.", "Ok"]);
    expect(wordTokens(body).map((t) => t.text).join("")).toBe(body);
    const r = tapRange(words[1]);
    expect(body.slice(r.start, r.end)).toBe("now");
    expect(body.slice(tapRange(words[2]).start, tapRange(words[2]).end)).toBe("fee");
    expect(tapRange({ text: "—", start: 3, end: 4, word: true })).toEqual({ start: 3, end: 4 });
  });
  it("reveal segments combine red-flag highlights with the tapped word", () => {
    const body = "Pay fee now or else";
    const segs = revealSegments(body, [{ span: "Pay fee", why: "fee" }], { start: 8, end: 11 });
    expect(segs.map((s) => s.text).join("")).toBe(body);
    expect(segs).toEqual([{ text: "Pay fee", why: "fee" }, { text: " " }, { text: "now", tapped: true }, { text: " or else" }]);
    expect(revealSegments(body, [{ span: "Pay fee", why: "fee" }], { start: 4, end: 7 })).toEqual([{ text: "Pay ", why: "fee" }, { text: "fee", why: "fee", tapped: true }, { text: " now or else" }]);
  });
  it("formats the countdown", () => {
    expect(formatCountdown(3_723_000)).toBe("01:02:03");
    expect(formatCountdown(-5)).toBe("00:00:00");
  });
});

const cards = [1, 2].map((n) => ({ id: `c${n}`, kind: "text", content: { from: "+1 555", body: `Pay fee now ${n}` }, difficulty: n === 1 ? "easy" : "hard" }));
const flags = [{ span: "Pay fee", why: "Small fee request" }];
const stats = { played: 3, winPct: 67, perfectPct: 33, currentStreak: 2, maxStreak: 4, dist: [0, 0, 1, 0, 1, 1] };
const share = "Call the Bluff #1 · 2/5 · 🔥1\n🟩🟩🟥🟥🟥\n🔍 1 giveaway spotted\nlocalhost:3000/play";
const done = { day: "2026-11-07", score: 2, giveaways: 1, streak: 1, weakest: null, shareText: share, practice: false, results: [true, true, false, false, false] };
const state = (over: Partial<GameState> = {}): GameState => ({
  day: "2026-11-07", n: 1, isToday: true, practice: false, cards: cards as GameState["cards"], progress: [], done: null, stats, streak: 0,
  nextAt: new Date(Date.now() + 3_600_000).toISOString(), serverNow: new Date().toISOString(), bonus: null, archive: [], ...over,
});
const reveal = (cardId: string, guess: "legit" | "scam", tap: { start: number; end: number } | null = null) =>
  ({ cardId, guess, correct: guess === "scam", isScam: true, redFlags: flags, category: "delivery_fee", whyLegit: null, source: cardId === "b1" ? "bank" : "dataset", origin: "Bluff message set · bm-0001", tap, giveaway: !!tap && tap.start < 7 });

function stub(today: GameState = state(), after: GameState = state({ done, progress: [reveal("c1", "scam", { start: 0, end: 3 }), reveal("c2", "legit")], streak: 1 })) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/game/today")) return new Response(JSON.stringify(today));
    if (url === "/api/game/answer") { const b = JSON.parse(init!.body as string); return new Response(JSON.stringify(reveal(b.cardId, b.guess, b.tap ?? null))); }
    return new Response(JSON.stringify(after));
  });
  vi.stubGlobal("fetch", f); return f;
}
const renderGame = (day?: string) => render(<ToastProvider><GameClient day={day} /></ToastProvider>);
const body = (f: ReturnType<typeof stub>, url: string) => f.mock.calls.filter((c) => c[0] === url).map((c) => JSON.parse(c[1]!.body as string));

describe("GameClient", () => {
  it("plays through: Bluff! asks for the giveaway, the tap is sent, Legit submits at once, finish shows the board", async () => {
    const f = stub();
    const clip = vi.fn(async () => {}); Object.assign(navigator, { clipboard: { writeText: clip } });
    renderGame();
    expect(await screen.findByText("Card 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Easy")).toBeInTheDocument();
    expect(screen.queryByText(/message set/)).not.toBeInTheDocument(); // no source badge before the guess
    fireEvent.click(screen.getByRole("button", { name: "Bluff!" }));
    expect(screen.getByText("What gave it away? Tap the word or phrase")).toBeInTheDocument();
    expect(f.mock.calls.some((c) => c[0] === "/api/game/answer")).toBe(false); // nothing revealed or sent yet
    fireEvent.click(screen.getByRole("button", { name: "Pay" }));
    expect(await screen.findByText("Correct")).toBeInTheDocument();
    expect(screen.getAllByText((_, el) => el?.tagName === "MARK" && el.textContent === "Pay fee")).not.toHaveLength(0);
    expect(screen.getByText(/Small fee request/)).toBeInTheDocument();
    expect(screen.getByText(/Giveaway spotted/)).toBeInTheDocument();
    expect(screen.getByText("Bluff message set (synthetic)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next card" }));
    expect(await screen.findByText("Card 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Hard")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Legit" }));
    expect(await screen.findByText("Not quite")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "See my score" }));
    expect(await screen.findByLabelText("Score 2 out of 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Share preview")).toHaveTextContent("Call the Bluff #1 · 2/5 · 🔥1");
    expect(screen.getByText("1 day")).toBeInTheDocument();
    expect(screen.getByText("None. Clean sweep.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bluff!" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(clip).toHaveBeenCalledWith(share));
    expect(body(f, "/api/game/answer")).toEqual([{ cardId: "c1", guess: "scam", tap: { start: 0, end: 3 }, day: "2026-11-07" }, { cardId: "c2", guess: "legit", tap: null, day: "2026-11-07" }]);
    expect(body(f, "/api/game/finish")).toEqual([{ day: "2026-11-07" }]); // today's answers are locked server-side
  });

  it("'Just lock it in' submits a Bluff! with no tap; Back returns to the two calls", async () => {
    const f = stub();
    renderGame();
    fireEvent.click(await screen.findByRole("button", { name: "Bluff!" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Legit" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bluff!" }));
    fireEvent.click(screen.getByRole("button", { name: "Just lock it in" }));
    expect(await screen.findByText("Correct")).toBeInTheDocument();
    expect(body(f, "/api/game/answer")).toEqual([{ cardId: "c1", guess: "scam", tap: null, day: "2026-11-07" }]);
  });

  it("resumes at the first unanswered card after a reload", async () => {
    stub(state({ progress: [reveal("c1", "legit")] }));
    renderGame();
    expect(await screen.findByText("Card 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bluff!" })).toBeInTheDocument();
  });

  it("finished today: shows the board, stats with today's bar, countdown and the scan nudge; no replay", async () => {
    stub(state({ done, progress: [reveal("c1", "scam"), reveal("c2", "legit")], bonus: { status: "locked" }, archive: [{ day: "2026-11-06", n: 0, score: 3 }] }));
    renderGame();
    expect(await screen.findByLabelText("Score 2 out of 5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bluff!" })).not.toBeInTheDocument();
    const s = screen.getByRole("region", { name: "Statistics" });
    expect(within(s).getByText("Played").nextSibling).toHaveTextContent("3");
    expect(within(s).getByText("Win %")).toBeInTheDocument();
    expect(within(s).getByText("2 right: 1 game (this game)")).toBeInTheDocument();
    expect(screen.getByText(/Next Bluff in/)).toHaveTextContent(/Next Bluff in \d\d:\d\d:\d\d/);
    expect(screen.getByRole("link", { name: "Scan your transactions to unlock a bonus card" })).toHaveAttribute("href", "/scan");
    expect(screen.getByRole("link", { name: /Yesterday's puzzle/ })).toHaveAttribute("href", "/play?d=2026-11-06");
  });

  it("bonus card from your own scan: answered without touching the daily game", async () => {
    const bonusCard = { id: "b1", kind: "bank_alert", content: { from: "Capital One · your bank scan", body: "$89.99 charge at SHADY on Nov 6." }, difficulty: "medium" as const };
    const f = stub(state({ done, progress: [reveal("c1", "scam"), reveal("c2", "legit")], bonus: { status: "ready", card: bonusCard } }));
    renderGame();
    expect(await screen.findByText("Bonus: a charge from your own Capital One scan")).toBeInTheDocument();
    const bonus = screen.getByRole("region", { name: "Bonus card" });
    fireEvent.click(within(bonus).getByRole("button", { name: "Bluff!" }));
    expect(await within(bonus).findByText("It was a bluff")).toBeInTheDocument();
    expect(within(bonus).getByText("From your Capital One scan")).toBeInTheDocument();
    expect(body(f, "/api/game/answer")).toEqual([{ cardId: "b1", guess: "scam" }]);
  });

  it("past day: practice note, and the finish sends the practice answers", async () => {
    const f = stub(state({ day: "2026-11-06", isToday: false, practice: true }), state({ day: "2026-11-06", isToday: false, practice: true, done: { ...done, practice: true } }));
    renderGame("2026-11-06");
    expect(await screen.findByRole("status")).toHaveTextContent(/Practice: puzzle #1/);
    fireEvent.click(screen.getByRole("button", { name: "Legit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next card" }));
    fireEvent.click(await screen.findByRole("button", { name: "Legit" }));
    fireEvent.click(await screen.findByRole("button", { name: "See my score" }));
    expect(await screen.findByLabelText("Score 2 out of 5")).toBeInTheDocument();
    expect(screen.getByText("Not counted")).toBeInTheDocument();
    expect(body(f, "/api/game/finish")).toEqual([{ day: "2026-11-06", answers: [{ cardId: "c1", guess: "legit", tap: null }, { cardId: "c2", guess: "legit", tap: null }] }]);
    expect(f.mock.calls[0][0]).toBe("/api/game/today?d=2026-11-06");
  });

  it("load failure shows an error with retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "upstream_down", message: "Pool empty" } }), { status: 503 })));
    renderGame();
    expect(await screen.findByRole("alert")).toHaveTextContent("Pool empty");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
