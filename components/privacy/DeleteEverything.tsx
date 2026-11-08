"use client";
import { useState } from "react";
import { api, ApiFailure } from "@/lib/client/api";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";

/** Resets only this visitor's own private demo account (DELETE /api/me). */
export function DeleteEverything() {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    if (!confirm("Delete your exposures, verdicts, texts, disputes and game data? Your private demo account starts over from the sample card history. Other visitors are not affected.")) return;
    setState("busy"); setErr(null);
    try { await api("/api/me", { method: "DELETE" }); setState("done"); }
    catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't delete. Try again."); setState("idle"); }
  }
  return (
    <div className="flex flex-col gap-3">
      <Button variant="danger" onClick={run} disabled={state === "busy"} className="self-start">{state === "busy" ? "Deleting…" : "Delete everything"}</Button>
      {state === "done" && <p role="status" className="text-sm text-safe">Done. Your exposures, verdicts, texts, disputes and game data are gone, and your account starts over from the sample card history.</p>}
      {err && <ErrorState message={err} />}
    </div>
  );
}
