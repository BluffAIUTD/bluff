// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NAV_ITEMS, isActive } from "./nav";

const nav = vi.hoisted(() => ({ pathname: "/charges/abc" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
import { NavLinks } from "./NavLinks";

beforeEach(() => { nav.pathname = "/charges/abc"; });

describe("navigation", () => {
  it("has the 5 sections in order, every one on the phone tab bar", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual(["/", "/scan", "/check", "/play", "/privacy"]);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Home", "Card watch", "Check a site", "Daily game", "Privacy"]);
    render(<NavLinks />);
    const [rail, tabs] = screen.getAllByRole("navigation", { name: "Primary" });
    expect(within(tabs).getAllByRole("link")).toHaveLength(5);
    expect(within(rail).getAllByRole("link")).toHaveLength(6); // logo + 5 sections
  });
  it("active matching: root only exact, others by prefix or their sub-routes", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/charges/abc", "/")).toBe(false);
    expect(isActive("/scan", "/scan")).toBe(true);
    expect(isActive("/charges", "/scan")).toBe(true);
    expect(isActive("/charges/abc", "/scan")).toBe(true);
    expect(isActive("/chargesx", "/scan")).toBe(false);
    expect(isActive("/exposure", "/check")).toBe(true);
    expect(isActive("/extension", "/check")).toBe(true);
    expect(isActive("/eval", "/privacy")).toBe(true);
    expect(isActive("/eval", "/check")).toBe(false);
    expect(isActive("/play", "/privacy")).toBe(false);
  });
  it("renders rail + tab bar with aria-current on the section that owns the route", () => {
    render(<NavLinks />);
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current.length).toBe(2); // one in the rail, one in the tab bar
    expect(current.every((a) => a.getAttribute("href") === "/scan")).toBe(true);
    expect(screen.getAllByRole("navigation", { name: "Primary" })).toHaveLength(2);
  });
  it("highlights Check a site on the exposure log and Privacy on the eval page", () => {
    nav.pathname = "/exposure";
    const { unmount } = render(<NavLinks />);
    expect(screen.getAllByRole("link", { current: "page" }).map((a) => a.getAttribute("href"))).toEqual(["/check", "/check"]);
    unmount();
    nav.pathname = "/eval";
    render(<NavLinks />);
    expect(screen.getAllByRole("link", { current: "page" }).map((a) => a.getAttribute("href"))).toEqual(["/privacy", "/privacy"]);
  });
});
