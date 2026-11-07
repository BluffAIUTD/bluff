// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeBadge } from "./ModeBadge";
import { FlagBadge } from "./FlagBadge";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";

describe("ui primitives", () => {
  it("labels every run mode", () => {
    for (const [m, l] of [["live", "LIVE"], ["cached", "CACHED"], ["replayed", "REPLAYED"], ["basic", "BASIC CHECK"], ["demo", "DEMO"]] as const) {
      const { unmount } = render(<ModeBadge mode={m} />);
      expect(screen.getByText(l)).toBeInTheDocument();
      unmount();
    }
  });
  it("renders flag labels", () => {
    render(<FlagBadge kind="exposure_link" />);
    expect(screen.getByText("Exposure link")).toBeInTheDocument();
  });
  it("empty and error states are accessible", () => {
    render(<><EmptyState title="Nothing yet" hint="Try it" /><ErrorState message="boom" /></>);
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
