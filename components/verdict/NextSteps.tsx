export function NextSteps({ steps, title = "Do this instead" }: { steps: string[]; title?: string }) {
  return (
    <section aria-label={title}>
      <h3 className="label mb-3">{title}</h3>
      <ol className="flex flex-col gap-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-sm leading-snug">
            <span aria-hidden className="mono grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border border-line2 text-[11px] text-dim">{i + 1}</span>
            <span className="pt-px">{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
