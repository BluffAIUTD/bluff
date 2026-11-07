"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastItem = { id: number; text: string };
const Ctx = createContext<(text: string) => void>(() => {});

export function useToast() { return useContext(Ctx); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text }]);
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 2600);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 lg:bottom-6">
        {items.map((t) => (
          <div key={t.id} className="rounded-control border border-line bg-surface px-4 py-2 text-sm shadow-lg">{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
