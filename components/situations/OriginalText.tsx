import { UI_TEXTS, type OriginalSnapshot } from "@/lib/situations/rules";

/**
 * iter-049 (arch 7.4): původní text z workshopu 22. 10. Rozbalovací box
 * (výchozí rozbalený pro vlastníka, sbalený pro ostatní). Bez snímku se
 * neukáže. Texty z `original` se vypisují jako text, žádné HTML.
 */
export function OriginalText({
  original,
  defaultOpen,
}: {
  original: OriginalSnapshot | null;
  defaultOpen: boolean;
}) {
  if (!original || (!original.q1 && !original.q2 && !original.name)) return null;
  return (
    <details open={defaultOpen} className="rounded-lg border border-border bg-background p-3">
      <summary className="flex min-h-[44px] cursor-pointer select-none items-center rounded text-sm font-medium text-text-main focus:outline-none focus:shadow-focus md:min-h-0">
        {UI_TEXTS.originalTitle}
      </summary>
      <div className="mt-2 space-y-3 text-sm">
        {original.name && (
          <div>
            <p className="text-xs font-medium text-text-muted">{UI_TEXTS.originalName}</p>
            <p className="whitespace-pre-wrap break-words">{original.name}</p>
          </div>
        )}
        {original.q1 && (
          <div>
            <p className="text-xs font-medium text-text-muted">{UI_TEXTS.originalQ1}</p>
            <p className="whitespace-pre-wrap break-words">{original.q1}</p>
          </div>
        )}
        {original.q2 && (
          <div>
            <p className="text-xs font-medium text-text-muted">{UI_TEXTS.originalQ2}</p>
            <p className="whitespace-pre-wrap break-words">{original.q2}</p>
          </div>
        )}
      </div>
    </details>
  );
}
