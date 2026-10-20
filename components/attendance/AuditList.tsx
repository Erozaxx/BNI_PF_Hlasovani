import { SHEET_TEXTS, auditLine, type AuditRow } from "@/lib/attendance/sheet";

/**
 * iter-038 (T-003b, arch 13.3, gate sekce 5): historie oprav docházky. Čistě
 * zobrazovací, bez stavu, použitelná na serveru i v klientské komponentě.
 * Řádek: „21. 10. 2026 9:14 · Jméno opravil(a) u Člena den 15. 10.: Přítomen → Náhradník Jméno“.
 */
export function AuditList({ rows, title = SHEET_TEXTS.auditTitle }: { rows: AuditRow[]; title?: string }) {
  return (
    <section aria-labelledby="audit-title">
      <h2 id="audit-title" className="mb-2 text-base font-semibold text-text-main">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{SHEET_TEXTS.auditEmpty}</p>
      ) : (
        <ul className="space-y-1 text-sm text-text-main">
          {rows.map((r) => (
            <li key={r.id}>{auditLine(r)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
