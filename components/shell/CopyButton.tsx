"use client";
import { useState } from "react";
import { useToast } from "../ui/Toast";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be blocked (insecure context / permissions): fall back to a temporary textarea.
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { toast("Couldn't copy. Select it manually."); return; } finally { ta.remove(); }
    }
    setDone(true); toast("Copied");
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <button type="button" onClick={copy} className="min-h-[32px] rounded-control border border-line px-2 text-xs font-medium text-dim hover:text-fg">
      {done ? "Copied" : label}
    </button>
  );
}
