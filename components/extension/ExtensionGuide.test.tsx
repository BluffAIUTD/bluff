// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ExtensionGuide } from "./ExtensionGuide";
import ExtensionPage from "@/app/(shell)/extension/page";

const STORES = { scam: "https://fastkicks-shop.bluffai.us", legit: "https://bayou-bakery.bluffai.us" };
const ZIP = { bytes: 18_227, version: "1.1.0", app: "https://bluffai.us" };

describe("/extension page", () => {
  it("explains the use case, what is sent, the install steps, and links the download, demo stores and /check", () => {
    render(<ExtensionGuide app="https://bluffai.us" zip={ZIP} stores={STORES} />);
    expect(screen.getByRole("heading", { level: 1, name: "Checkout Guard for Chrome" })).toBeInTheDocument();
    const dl = screen.getByRole("link", { name: "Download for Chrome" });
    expect(dl).toHaveAttribute("href", "/downloads/bluff-checkout-guard.zip");
    expect(screen.getByText(/18 KB · version 1\.1\.0/)).toBeInTheDocument();
    expect(screen.getByText(/card number, CVV or Social Security number/)).toBeInTheDocument();
    const sends = screen.getByRole("region", { name: "What it sends" });
    expect(within(sends).getByText(/never the page path/)).toBeInTheDocument();
    expect(within(sends).getByText(/never what you type in them/)).toBeInTheDocument();
    expect(within(sends).getByText("Never sent")).toBeInTheDocument();
    const steps = within(screen.getByRole("region", { name: "Install" })).getAllByRole("listitem");
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.textContent).join(" ")).toMatch(/unzip[\s\S]*chrome:\/\/extensions[\s\S]*Developer mode[\s\S]*Load unpacked[\s\S]*Pin/i);
    expect(screen.getByRole("link", { name: /FastKicks/ })).toHaveAttribute("href", STORES.scam);
    expect(screen.getByRole("link", { name: /Bayou Bakery/ })).toHaveAttribute("href", STORES.legit);
    expect(screen.getByRole("link", { name: "Use Check a site" })).toHaveAttribute("href", "/check");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("without a built zip it shows the build command instead of a broken link", () => {
    render(<ExtensionGuide app="http://localhost:3000" zip={null} stores={STORES} />);
    expect(screen.queryByRole("link", { name: "Download for Chrome" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("BLUFF_APP_URL=http://localhost:3000 npm run ext:zip");
  });

  it("warns when the zip was built for another address", () => {
    render(<ExtensionGuide app="https://bluffai.us" zip={{ ...ZIP, app: "http://localhost:3000" }} stores={STORES} />);
    expect(screen.getByRole("status")).toHaveTextContent("This build checks stores with http://localhost:3000");
  });
});

describe("/extension route (server component)", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it("uses the canonical app address, the demo store origins and the zip on disk", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bluff-ext-page-"));
    const zip = path.join(dir, "bluff-checkout-guard.zip");
    fs.writeFileSync(zip, Buffer.alloc(4096));
    fs.writeFileSync(path.join(dir, "bluff-checkout-guard.json"), JSON.stringify({ version: "1.1.0", app: "https://bluffai.us" }));
    Object.assign(process.env, { BASE_DOMAIN: "bluffai.us", EXTENSION_ZIP_PATH: zip });
    delete process.env.APP_URL;
    render(<ExtensionPage />);
    expect(screen.getByRole("link", { name: "Download for Chrome" })).toBeInTheDocument();
    expect(screen.getByText(/4 KB · version 1\.1\.0/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /FastKicks/ })).toHaveAttribute("href", "https://fastkicks-shop.bluffai.us");
    expect(screen.getByText(/Open bluffai\.us once in the same browser/)).toBeInTheDocument();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
