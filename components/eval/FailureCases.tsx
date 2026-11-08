type Failure = { id: string; text: string; expected: string; predicted: string; note: string };

export function FailureCases({ title, items }: { title: string; items: Failure[] }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {items.length === 0 ? <p className="text-sm text-dim">No failures in this run.</p> : (
        <ul className="flex flex-col gap-3">
          {items.map((f) => (
            <li key={f.id} className="dossier border-l-4 border-l-scam p-4 text-sm">
              <p className="font-mono text-[13px]">{f.text}</p>
              <p className="mt-2"><span className="text-dim">Expected</span> <b>{f.expected}</b> · <span className="text-dim">Got</span> <b className="text-scam">{f.predicted}</b></p>
              <p className="mt-1 text-dim">{f.note}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
