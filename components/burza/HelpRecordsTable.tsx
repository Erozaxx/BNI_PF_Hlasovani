import { RemoveHelpButton } from "@/components/burza/RemoveHelpButton";
import { HELP_RECORDS_LIMIT, helpPartyLabel, recordKindLabel } from "@/lib/burza/rules";
import { formatDMY } from "@/lib/mastermind/rules";
import type { ContactUseRow, HelpRecordRow } from "@/lib/db/queries/burza";

export type UseRecord =
  | (HelpRecordRow & { kind: "help" })
  | (ContactUseRow & { kind: "contact" });

/**
 * Záznamy pomoci i využitých kontaktů za 12 měsíců (vedení), nejnovější
 * nahoře (Z5). První řádek bloku: „D. M. YYYY · Pomoc“ nebo „D. M. YYYY ·
 * Kontakt: {text položky}“. U kontaktu není řádek „Zapsal(a)“ a poznámka (Z9).
 * Bez souhrnu a bez filtru. Na všech šířkách bloky pod sebou.
 */
export function HelpRecordsTable({ records }: { records: UseRecord[] }) {
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
          const recipient =
            r.kind === "help"
              ? helpPartyLabel(r).recipient
              : (r.recipientName ?? "příjemce už není členem");
          return (
            <li
              key={`${r.kind}-${r.id}`}
              className="min-w-0 rounded-card border border-border bg-surface p-4 shadow-card"
            >
              <p className="text-sm font-semibold text-text-main break-words">
                {formatDMY(r.usedOn)} · {recordKindLabel(r.kind, r.kind === "contact" ? r.contactLabel : null)}
              </p>
              <p className="mt-1 text-sm text-text-main break-words">Kdo pomohl: {r.helperName}</p>
              <p className="text-sm text-text-main break-words">Komu: {recipient}</p>
              {r.kind === "help" && (
                <p className="text-sm text-text-muted break-words">
                  Zapsal(a): {helpPartyLabel(r).createdBy}
                </p>
              )}
              {r.kind === "help" && r.note && (
                <p className="mt-1 whitespace-pre-line break-words text-sm text-text-main">{r.note}</p>
              )}
              <div className="mt-3">
                <RemoveHelpButton helpId={r.id} kind={r.kind} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
