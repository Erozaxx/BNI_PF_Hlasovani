export const dynamic = "force-dynamic";

import { requirePageSession } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/permissions";
import { listAliases, listMonths } from "@/lib/db/queries/semafor";
import { importMonthOptions, previousMonthStart } from "@/lib/semafor/months";
import { SEMAFOR_TEXTS, monthLabel } from "@/lib/semafor/texts";
import { formatCzDate } from "@/lib/members/activity";
import { Card } from "@/components/ui/Card";
import { SemaforTabs } from "@/components/semafor/SemaforTabs";
import { ImportSemaforForm } from "@/components/semafor/ImportSemaforForm";
import { DeleteMonthButton, RemoveAliasButton } from "@/components/semafor/DeleteButtons";

/**
 * iter-041 (arch 5, 6.2, gate Z7): nahrání měsíčního souboru se skóre. Jen
 * `semafor.import` (admin, Prezident, Viceprezident při přihlášení heslem).
 */
export default async function SemaforImportPage() {
  const session = await requirePageSession({ permission: "semafor.import", denyTo: "/dashboard" });
  const [months, aliases] = await Promise.all([listMonths(), listAliases()]);

  return (
    <div className="max-w-3xl space-y-6">
      <SemaforTabs active="import" canViewAll={can(session, "semafor.view_all")} canImport />
      <h1 className="text-2xl font-bold text-text-main">{SEMAFOR_TEXTS.importTitle}</h1>

      <ImportSemaforForm
        monthOptions={importMonthOptions().map((value) => ({ value, label: monthLabel(value) }))}
        defaultMonth={previousMonthStart()}
      />

      {months.length > 0 && (
        <Card>
          <ul className="divide-y divide-border">
            {months.map((m) => (
              <li key={m.month} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <span className="text-text-main">
                  <span className="font-medium">{monthLabel(m.month)}</span>
                  <span className="ml-2 text-text-muted">
                    {m.rows}
                    {m.lastUploadedOn ? ` · ${formatCzDate(m.lastUploadedOn)}` : ""}
                    {m.uploadedByName ? ` · ${m.uploadedByName}` : ""}
                  </span>
                </span>
                <DeleteMonthButton month={m.month} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {aliases.length > 0 && (
        <Card>
          <h2 className="text-base font-semibold text-text-main">{SEMAFOR_TEXTS.aliases}</h2>
          <ul className="mt-2 divide-y divide-border">
            {aliases.map((a) => (
              <li key={a.nameKey} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <span className="break-words text-text-main">
                  {a.nameKey} <span className="text-text-muted">{`→ ${a.memberName}`}</span>
                </span>
                <RemoveAliasButton nameKey={a.nameKey} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
