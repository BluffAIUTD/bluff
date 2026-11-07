export function NextSteps({ steps, title = "Do this instead" }: { steps: string[]; title?: string }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-2 font-grotesk text-sm font-medium uppercase tracking-wide text-dim">{title}</h3>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span aria-hidden className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface2 text-xs font-bold">{i + 1}</span>
            <span className="pt-[2px]">{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
