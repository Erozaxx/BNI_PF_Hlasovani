import type { ReactNode } from "react";

// iter-036: společná stavba sekce nápovědy (nadpis, úvod, kroky, žlutý rámeček,
// otázky). Stejné třídy jako dosavadní ruční JSX v sekcích.

export interface HelpFaq {
  q: string;
  a: ReactNode;
}

interface HelpSectionProps {
  title: string;
  intro?: ReactNode;
  steps?: ReactNode[];
  note?: ReactNode;
  faq?: HelpFaq[];
}

export function HelpSection({ title, intro, steps, note, faq }: HelpSectionProps) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {intro && <p className="text-sm text-text-muted mb-3">{intro}</p>}
      {steps && steps.length > 0 && (
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      {note && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm mb-3">
          {note}
        </div>
      )}
      {faq && faq.length > 0 && (
        <ul className="text-sm space-y-1">
          {faq.map((f, i) => (
            <li key={i}>
              {f.q && <strong>{f.q} </strong>}
              {f.a}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
