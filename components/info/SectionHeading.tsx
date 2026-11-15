/**
 * iter-045 (arch 2.2): nadpis sekce (H2) s ikonou odkazu na sekci. Ikona je
 * vedle H2, ne uvnitř: sekce mají `aria-labelledby` na id nadpisu a název
 * tlačítka by se jinak přidal do názvu sekce. Obsah H2 se nemění.
 * Server komponenta, `SectionLink` je klientská.
 */
import type { ReactNode } from "react";
import { SectionLink } from "./SectionLink";

export function SectionHeading({
  anchor,
  titleId,
  title,
  className,
  children,
}: {
  /** Kotva, na kterou odkaz míří (id sekce). */
  anchor: string;
  titleId: string;
  title: string;
  className: string;
  children?: ReactNode;
}) {
  return (
    <div className="info-heading flex flex-wrap items-start gap-x-1">
      <h2 id={titleId} className={`${className} min-w-0`}>
        {children ?? title}
      </h2>
      <SectionLink anchor={anchor} title={title} />
    </div>
  );
}
