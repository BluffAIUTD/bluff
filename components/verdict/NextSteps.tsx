export function NextSteps({ steps, title = "Do this instead" }: { steps: string[]; title?: string }) {
  return (
    <section aria-label={title}>
      <h3 className="eyebrow mb-3">{title}</h3>
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-[15px]">
            <span aria-hidden className="numeral w-6 shrink-0 text-right text-[26px] font-medium text-gray-5">{i + 1}</span>
            <span className="pt-[2px]">{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
