/**
 * Tabulka „Kdo o čem rozhoduje" (iter-030, T-007a, arch_iter-030_T-001
 * sekce 5 a 7.2). Jeden DOM: od 768 px tabulka s `<th scope>`, pod 768 px
 * každý řádek jako karta (CSS v `app/pravidla/pravidla.css`, popisky
 * buněk z `data-label`). Explicitní role drží sémantiku tabulky i při
 * `display: block`. Bez vodorovného posuvníku.
 */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { createRoleLinker, type RoleLinkOptions } from "@/lib/info-pages/glossary";
import type { DecisionRow } from "@/lib/info-pages/types";
import { RichText } from "./RichText";
import { SourceDetails } from "./SourceNote";

const C = TEMPLATE_TEXTS.reference.columns;
const CELLS = ["decides", "approves", "advises", "informed"] as const;

export function DecisionTable({ rows, links }: { rows: DecisionRow[]; links: RoleLinkOptions }) {
  return (
    <table role="table" className="info-decisions mt-5 w-full border-collapse text-left text-base text-text-main">
      <thead role="rowgroup">
        <tr role="row">
          {[C.situation, ...CELLS.map((key) => C[key]), C.sources].map((label) => (
            <th key={label} role="columnheader" scope="col" className="text-sm font-semibold">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup">
        {rows.map((row) => {
          // Jeden `seen` na řádek: role má v řádku nejvýš jeden odkaz.
          const link = createRoleLinker(links);
          return (
            <tr key={row.id} id={row.id} role="row" className="info-decision-row">
              <th role="rowheader" scope="row" data-label={C.situation} className="font-semibold">
                {row.situation}
                {row.link && (
                  <a
                    href={row.link.href}
                    className="mt-1 block rounded text-sm font-medium text-navy underline underline-offset-2 focus:outline-none focus-visible:shadow-focus"
                  >
                    {row.link.label}
                  </a>
                )}
              </th>
              {CELLS.map((key) => (
                <td key={key} role="cell" data-label={C[key]}>
                  <RichText segments={link(row[key])} />
                </td>
              ))}
              <td role="cell" data-label={C.sources}>
                <SourceDetails sources={row.sources} spacing="mt-0" />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
