import { Card } from "@/components/ui/Card";
import { ThanksForm, type MemberOpt } from "@/components/semafor/PointsForms";
import { DeleteOwnThanksButton } from "@/components/semafor/DeleteButtons";
import type { WrittenThanksRow } from "@/lib/db/queries/semafor-points";
import { formatCzDate } from "@/lib/members/activity";
import { POINT_TEXTS } from "@/lib/semafor/texts";

/**
 * iter-044 (arch 7.1): karta „Poděkovat“. Formulář je klientský jen pro
 * odeslání, seznam „Tvoje poděkování“ za 6 měsíců s mazáním je serverový
 * (nové poděkování je v něm vidět po `revalidatePath`, LL-017). Do klienta jde
 * jen seznam jmen pro select a vlastní napsaná poděkování.
 */
export function ThanksCard({ recipients, written }: { recipients: MemberOpt[]; written: WrittenThanksRow[] }) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-text-main">{POINT_TEXTS.thanksTitle}</h2>
      <p className="mt-1 text-sm text-text-muted">{POINT_TEXTS.thanksIntro}</p>
      <ThanksForm recipients={recipients} />
      {written.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-text-main">{POINT_TEXTS.thanksMine}</h3>
          <ul className="mt-1 divide-y divide-border">
            {written.map((w) => (
              <li key={w.id} className="space-y-1 py-2 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium text-text-main">{w.recipientName}</span>
                  <span className="text-text-muted">{formatCzDate(w.earnedOn)}</span>
                </p>
                <p className="text-text-main">{w.note}</p>
                <DeleteOwnThanksButton pointId={w.id} name={w.recipientName} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
