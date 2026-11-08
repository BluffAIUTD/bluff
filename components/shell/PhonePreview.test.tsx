// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { PhonePreview, actionsFor, chipTargetId, unreadCount, type PhoneMsg } from "./PhonePreview";

const m = (o: Partial<PhoneMsg>): PhoneMsg => ({ id: "m", direction: "out", body: "b", kind: "alert", status: "delivered", createdAt: "2026-11-07T18:00:00Z", meta: {}, ...o });

describe("phone helpers", () => {
  it("chips come from meta.actions (only known commands), else are inferred for older alerts; HOLD becomes UNHOLD while held", () => {
    expect(actionsFor(m({ meta: { actions: ["DISPUTE", "HOLD", "SAFE", "rm -rf"] } }))).toEqual(["DISPUTE", "HOLD", "SAFE"]);
    expect(actionsFor(m({ meta: { txn_id: "t", exposure_id: "e" } }))).toEqual(["DISPUTE", "HOLD", "SAFE"]);
    expect(actionsFor(m({ meta: { exposure_id: "e" } }))).toEqual(["WATCH", "SAFE"]);
    expect(actionsFor(m({ kind: "reply", meta: { exposure_id: "e" } }))).toEqual([]);
    expect(actionsFor(m({ direction: "in", meta: { actions: ["SAFE"] } }))).toEqual([]);
    expect(actionsFor(m({ meta: { actions: ["DISPUTE", "HOLD"] } }), { held: true, since: null })).toEqual(["DISPUTE", "UNHOLD"]);
  });
  it("chips go under the newest actionable message; unread counts Bluff's messages since the thread was last open", () => {
    const msgs = [m({ id: "a", meta: { exposure_id: "e" }, createdAt: "2026-11-07T18:00:00Z" }), m({ id: "b", meta: { txn_id: "t" }, createdAt: "2026-11-07T18:01:00Z" }), m({ id: "c", kind: "reply", createdAt: "2026-11-07T18:02:00Z" }), m({ id: "d", direction: "in", createdAt: "2026-11-07T18:03:00Z" })];
    expect(chipTargetId(msgs)).toBe("b");
    expect(unreadCount(msgs, null)).toBe(3);
    expect(unreadCount(msgs, "2026-11-07T18:01:00Z")).toBe(1);
  });
});

describe("PhonePreview", () => {
  let posts: { url: string; body: unknown }[];
  let hold = { held: false, since: null as string | null };
  const messages = [
    m({ id: "a1", body: "You just entered your card on fastkicks-shop. Reply WATCH and I'll check for charges from it.", meta: { exposure_id: "e1" }, createdAt: "2026-11-07T18:00:00Z" }),
    m({ id: "a2", body: "New charge: $189 at VOLTDEALS OUTLET on your Capital One card.", meta: { source: "scan", txn_id: "t1", host: "voltdeals-outlet.bluffai.us", actions: ["DISPUTE", "HOLD", "SAFE"] }, createdAt: "2026-11-07T18:05:00Z" }),
  ];
  beforeEach(() => {
    posts = []; hold = { held: false, since: null };
    Element.prototype.scrollIntoView = vi.fn(); // not implemented in jsdom
    try { window.localStorage.clear(); } catch { /* ignore */ }
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") { posts.push({ url, body: JSON.parse(String(init.body)) }); return new Response(JSON.stringify({ status: "handled", reply: "ok" }), { status: 200 }); }
      if (url.startsWith("/api/messages")) return new Response(JSON.stringify({ messages, hold }), { status: 200 });
      if (url.startsWith("/api/demo/scam-text")) return new Response(JSON.stringify({ texts: [{ id: "deliveryfix", sender: "(214) 555-0147", received: "9:12 AM", body: "ParcelPoint: pay $1.99 at http://deliveryfix-help.localhost:3000/track" }] }), { status: 200 });
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("button reads 'T-Mobile alerts', keeps the 'Phone preview' name and shows the unread count", async () => {
    render(<PhonePreview />);
    const btn = screen.getByRole("button", { name: /Phone preview/ });
    expect(btn).toHaveTextContent("T-Mobile alerts");
    await waitFor(() => expect(btn).toHaveAccessibleName("Phone preview: T-Mobile alerts, 2 unread"));
  });

  it("reply chips under the newest alert send the command", async () => {
    render(<PhonePreview />);
    fireEvent.click(screen.getByRole("button", { name: /Phone preview/ }));
    await screen.findByText(/New charge: \$189/);
    const chips = screen.getByRole("group", { name: "Quick replies" });
    expect(within(chips).getAllByRole("button").map((b) => b.textContent)).toEqual(["DISPUTE", "HOLD", "SAFE"]);
    expect(screen.getAllByRole("group", { name: "Quick replies" })).toHaveLength(1); // only under the newest alert
    fireEvent.click(within(chips).getByRole("button", { name: "HOLD" }));
    await waitFor(() => expect(posts).toEqual([{ url: "/api/demo/inbound", body: { text: "HOLD" } }]));
  });

  it("shows the hold banner while the card is held; Lift sends UNHOLD", async () => {
    hold = { held: true, since: "2026-11-07T18:10:00Z" };
    render(<PhonePreview />);
    fireEvent.click(screen.getByRole("button", { name: /Phone preview/ }));
    expect(await screen.findByText("Safe Signal hold on")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Quick replies" })).getByRole("button", { name: "UNHOLD" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lift" }));
    await waitFor(() => expect(posts[0]).toEqual({ url: "/api/demo/inbound", body: { text: "UNHOLD" } }));
  });

  it("Messages tab: open a text (link not clickable), Report to Bluff sends it and switches to the Bluff thread", async () => {
    render(<PhonePreview />);
    fireEvent.click(screen.getByRole("button", { name: /Phone preview/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Messages" }));
    fireEvent.click(await screen.findByRole("button", { name: /\(214\) 555-0147/ }));
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Report to Bluff" }));
    await waitFor(() => expect(posts).toEqual([{ url: "/api/demo/scam-text", body: { id: "deliveryfix" } }]));
    expect(screen.getByRole("tab", { name: /Bluff/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Messages" }));
    expect(await screen.findByText("Reported to Bluff")).toBeInTheDocument();
  });
});
