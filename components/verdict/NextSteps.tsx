export function NextSteps({ steps, title = "Do this instead" }: { steps: string[]; title?: string }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-3 font-grotesk uppercase text-dim">{title}</h3>
      <ol className="flex flex-col gap-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-sm leading-relaxed">
            <span aria-hidden className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-accent/70 bg-black/30 text-xs font-bold text-brass">{i + 1}</span>
            <span className="pt-[2px]">{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
