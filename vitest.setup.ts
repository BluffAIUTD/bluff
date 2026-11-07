import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest globals are off, so testing-library's automatic cleanup is not registered: do it explicitly.
afterEach(() => cleanup());
