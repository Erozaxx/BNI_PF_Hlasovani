/**
 * Rychlá navigace „Na stránce" pod úvodem (iter-030, T-010r3). Statické
 * odkazy na kotvy stránky, bez JS. Hlavní položky v jednom zalomitelném
 * řádku, `children` jako druhý řádek. V tisku skrytá. Kotvy kroků mají
 * `scroll-margin-top` pod sticky pruh (`pravidla.css`).
 */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import type { InfoPage } from "@/lib/info-pages/types";

const link =
  "rounded text-navy underline underline-offset-2 focus:outline-none focus-visible:shadow-focus";

export function PageToc({ items }: { items: NonNullable<InfoPage["toc"]> }) {
  const children = items.flatMap((item) => (item.children ? [item] : []));
  return (
    <nav aria-labelledby="na-strance-title" className="info-toc mt-6 rounded-card border border-border px-4 py-3 print:hidden">
      <h2 id="na-strance-title" className="text-base font-semibold text-text-main">
        {TEMPLATE_TEXTS.tocTitle}
      </h2>
      <ul className="info-toc-main mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-base">
        {items.map((item) => (
          <li key={item.anchor}>
            <a href={`#${item.anchor}`} className={link}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      {children.map((item) => (
        <div key={item.anchor} className="mt-2">
          <p className="text-sm font-medium text-text-main" id={`na-strance-${item.anchor}`}>
            {item.label}:
          </p>
          <ul
            aria-labelledby={`na-strance-${item.anchor}`}
            className="info-toc-sub mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm"
          >
            {item.children!.map((child) => (
              <li key={child.anchor}>
                <a href={`#${child.anchor}`} className={link}>
                  {child.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
