/**
 * Příloha „Zdroje" jen pro tisk (arch 7.5, 9). `<details>` se v tisku
 * spolehlivě nerozbalují, proto se tu tisknou všechny citace podle kroků.
 * Nahoře oba dokumenty s úplnou adresou PDF.
 *
 * iter-030 (arch_iter-030 7.4): za kroky citace z referenční části,
 * seskupené podle podsekce (úvod, karty rolí, tabulka situací, práva).
 * Každá citace se tiskne jen jednou s číslem, další skupiny na ni odkazují
 * číslem (review T-008, S-4).
 */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { joinCs, uniqueSources } from "@/lib/info-pages/format";
import { SOURCE_DOCS } from "@/lib/info-pages/sources";
import type { InfoPage, InfoReference, SourceDocId, SourceRef, VisualKind } from "@/lib/info-pages/types";
import { SourceQuote } from "./SourceNote";

interface PrintGroup {
  id: string;
  heading: string;
  sources: ReturnType<typeof uniqueSources>;
}

/** Bez duplicit v pořadí prvního výskytu (stejný klíč jako `uniqueSources`). */
function uniqueRefs(refs: SourceRef[]): SourceRef[] {
  return uniqueSources([{ text: "", sources: refs }]);
}

/** Čísluje citace v pořadí prvního výskytu, opakované vrací jen číslem. */
export function numberGroups(groups: PrintGroup[]) {
  const numbers = new Map<string, number>();
  return groups.map((group) => {
    const fresh: { n: number; source: SourceRef }[] = [];
    const repeated: number[] = [];
    for (const source of group.sources) {
      const key = `${source.doc}|${source.page}|${source.quoteEn}`;
      const known = numbers.get(key);
      if (known !== undefined) {
        if (!repeated.includes(known)) repeated.push(known);
        continue;
      }
      const n = numbers.size + 1;
      numbers.set(key, n);
      fresh.push({ n, source });
    }
    return { id: group.id, heading: group.heading, fresh, repeated };
  });
}

function referenceGroups(reference: InfoReference): PrintGroup[] {
  const R = TEMPLATE_TEXTS.reference;
  const groups: PrintGroup[] = [
    { id: "ref-intro", heading: reference.title, sources: uniqueSources(reference.facts) },
    ...reference.roles.map((card) => ({
      id: `ref-${card.id}`,
      heading: `${R.rolesTitle}: ${card.title}`,
      sources: uniqueSources([
        ...card.fields.flatMap((f) => f.facts),
        ...(card.subAnchors ?? []).flatMap((s) => s.facts),
      ]),
    })),
    {
      id: "ref-decisions",
      heading: R.decisionsTitle,
      sources: uniqueRefs(reference.decisions.flatMap((row) => row.sources)),
    },
    {
      id: "ref-rights",
      heading: R.rightsTitle,
      sources: uniqueRefs(reference.rights.flatMap((item) => item.sources)),
    },
  ];
  return groups.filter((g) => g.sources.length > 0);
}

export function PrintSources<K extends VisualKind>({
  page,
  baseUrl,
}: {
  page: InfoPage<K>;
  baseUrl: string;
}) {
  const groups: PrintGroup[] = [];
  for (const step of page.steps) {
    const items = step.type === "scene" ? [step] : step.options;
    for (const item of items) {
      const sources = uniqueSources(item.chapter);
      if (sources.length > 0) groups.push({ id: item.id, heading: `${item.label}: ${item.title}`, sources });
    }
  }
  if (page.reference) groups.push(...referenceGroups(page.reference));
  const docIds = new Set<SourceDocId>(groups.flatMap((g) => g.sources.map((s) => s.doc)));
  const numbered = numberGroups(groups);

  return (
    <section className="info-print-only info-print-sources mt-10">
      <h2 className="text-2xl font-semibold text-text-main">{TEMPLATE_TEXTS.sources.printTitle}</h2>
      <ul className="mt-3 space-y-1 text-sm">
        {Array.from(docIds).map((doc) => (
          <li key={doc}>
            {SOURCE_DOCS[doc].labelCs}: {baseUrl}
            {SOURCE_DOCS[doc].href}
          </li>
        ))}
      </ul>
      {numbered.map((group) => (
        <div key={group.id} className="info-print-group mt-5">
          <h3 className="text-base font-semibold text-text-main">{group.heading}</h3>
          {group.fresh.length > 0 && (
            <ul className="mt-2 space-y-3">
              {group.fresh.map(({ n, source }) => (
                <li key={n}>
                  <SourceQuote source={source} withLink={false} prefix={`[${n}]`} />
                </li>
              ))}
            </ul>
          )}
          {group.repeated.length > 0 && (
            <p className="info-print-repeat mt-2 text-sm text-text-main">
              {TEMPLATE_TEXTS.sources.printRepeated} {joinCs(group.repeated.map((n) => `[${n}]`))}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
