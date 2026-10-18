import { RemoveHelpButton } from "@/components/burza/RemoveHelpButton";
import { HELP_RECORDS_LIMIT, helpPartyLabel } from "@/lib/burza/rules";
import { formatDMY } from "@/lib/mastermind/rules";
import type { HelpRecordRow } from "@/lib/db/queries/burza";

/**
 * Záznamy pomoci za 12 měsíců (vedení), nejnovější nahoře (Z5). Bez souhrnu
 * a bez filtru. Na všech šířkách bloky pod sebou, žádný vodorovný posuv.
 */
export function HelpRecordsTable({ records }: { records: HelpRecordRow[] }) {
  if (records.length === 0) {
    return <p className="text-sm text-text-muted">Za posledních 12 měsíců není zapsaná žádná pomoc.</p>;
  }
  return (
    <div className="space-y-3">
      {records.length >= HELP_RECORDS_LIMIT && (
        <p className="text-sm text-text-muted">Zobrazeno posledních {HELP_RECORDS_LIMIT} záznamů.</p>
      )}
      <ul className="max-w-3xl space-y-3">
        {records.map((r) => {
          const labels = helpPartyLabel(r);
          return (
            <li
              key={r.id}
              className="min-w-0 rounded-card border border-border bg-surface p-4 shadow-card"
            >
              <p className="text-sm font-semibold text-text-main">{formatDMY(r.usedOn)}</p>
              <p className="mt-1 text-sm text-text-main break-words">Kdo pomohl: {r.helperName}</p>
              <p className="text-sm text-text-main break-words">Komu: {labels.recipient}</p>
              <p className="text-sm text-text-muted break-words">Zapsal(a): {labels.createdBy}</p>
              {r.note && <p className="mt-1 whitespace-pre-line break-words text-sm text-text-main">{r.note}</p>}
              <div className="mt-3">
                <RemoveHelpButton helpId={r.id} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
