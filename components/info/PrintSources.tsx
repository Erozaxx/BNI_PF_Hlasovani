/**
 * Příloha „Zdroje" jen pro tisk (arch 7.5, 9). `<details>` se v tisku
 * spolehlivě nerozbalují, proto se tu tisknou všechny citace podle kroků.
 * Nahoře oba dokumenty s úplnou adresou PDF.
 */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { uniqueSources } from "@/lib/info-pages/format";
import { SOURCE_DOCS } from "@/lib/info-pages/sources";
import type { InfoPage, SourceDocId, VisualKind } from "@/lib/info-pages/types";
import { SourceQuote } from "./SourceNote";

interface PrintGroup {
  id: string;
  heading: string;
  sources: ReturnType<typeof uniqueSources>;
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
  const docIds = new Set<SourceDocId>(groups.flatMap((g) => g.sources.map((s) => s.doc)));

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
      {groups.map((group) => (
        <div key={group.id} className="info-print-group mt-5">
          <h3 className="text-base font-semibold text-text-main">{group.heading}</h3>
          <ul className="mt-2 space-y-3">
            {group.sources.map((source, i) => (
              <li key={i}>
                <SourceQuote source={source} withLink={false} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
