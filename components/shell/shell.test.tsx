// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NAV_ITEMS, isActive } from "./nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/charges/abc" }));
import { NavLinks } from "./NavLinks";

describe("navigation", () => {
  it("has the 8 items in order: 3 tabs, the floating Check action, 4 in the More sheet", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual(["/", "/scan", "/check", "/charges", "/exposure", "/play", "/eval", "/privacy"]);
    expect(NAV_ITEMS.filter((i) => i.slot === "tab")).toHaveLength(3);
    expect(NAV_ITEMS.filter((i) => i.slot === "fab").map((i) => i.href)).toEqual(["/check"]);
    expect(NAV_ITEMS.filter((i) => i.slot === "more")).toHaveLength(4);
  });
  it("active matching: root only exact, others by prefix", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/charges/abc", "/")).toBe(false);
    expect(isActive("/charges/abc", "/charges")).toBe(true);
    expect(isActive("/chargesx", "/charges")).toBe(false);
  });
  it("renders rail + tab bar with aria-current on the active section", () => {
    render(<NavLinks />);
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current.length).toBe(2); // one in the rail, one in the tab bar
    expect(current.every((a) => a.getAttribute("href") === "/charges")).toBe(true);
    expect(screen.getAllByRole("navigation", { name: "Primary" })).toHaveLength(2);
  });
});
