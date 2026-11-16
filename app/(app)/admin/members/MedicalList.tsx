import { Card } from "@/components/ui/Card";
import { MEDICAL_TEXTS } from "@/lib/members/medical";
import { MedicalControls } from "./MedicalControls";

/**
 * iter-046 (arch 4.4): karta Medical pro držitele `members.medical` bez
 * `members.manage` (Člen výboru). Do klienta jde jen id, jméno a konec
 * období aktivních členů kromě volajícího.
 */
export interface MedicalListRow {
  id: string;
  name: string;
  /** Konec období, které ještě neskončilo; jinak `null`. */
  until: string | null;
}

export function MedicalList({
  rows,
  todayPrague,
  maxDate,
}: {
  rows: MedicalListRow[];
  todayPrague: string;
  maxDate: string;
}) {
  return (
    <Card>
      <h2 className="text-lg font-semibold mb-1">{MEDICAL_TEXTS.listTitle}</h2>
      <p className="mb-3 text-sm text-text-muted">{MEDICAL_TEXTS.intro}</p>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="py-3">
            <p className="mb-2 font-medium">{r.name}</p>
            <MedicalControls
              memberId={r.id}
              initialUntil={r.until}
              todayPrague={todayPrague}
              maxDate={maxDate}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
