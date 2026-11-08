import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest globals are off, so testing-library's automatic cleanup is not registered: do it explicitly.
afterEach(() => cleanup());

// Model calls in tests hit fake servers: no pacing between calls, no 429 retries.
process.env.NVIDIA_MIN_GAP_MS = "0";
process.env.NVIDIA_RETRIES = "0";
