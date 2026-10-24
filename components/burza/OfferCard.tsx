import Link from "next/link";
import { HelpUsedToggle } from "@/components/burza/HelpUsedToggle";
import { TEXTS, canRecordHelp, formatMonthYear } from "@/lib/burza/rules";

export interface OfferCardData {
  memberId: string;
  name: string;
  company: string | null;
  obor: string | null;
  offer: string;
  contact: string | null;
  note: string | null;
  /** Den posledního potvrzení, „YYYY-MM-DD“ */
  confirmedDay: string;
}

/**
 * Karta řádku burzy (6.3, Z2, Z4). Jméno, firma a obor z `member`, „S čím
 * pomůžu“, kontakt a poznámka jako prostý text (bez automatických odkazů),
 * prázdný kontakt a poznámka = pomlčka. Bez štítku „Zapsalo vedení“, bez
 * veřejného počtu pomoci. „Využil(a) jsem“ je přepínač na cizí kartě.
 */
export function OfferCard({
  data,
  viewerId,
  viewerIsManagement,
  recordedHelpId,
  bonusOn = true,
}: {
  data: OfferCardData;
  viewerId: string;
  viewerIsManagement: boolean;
  /** `id` záznamu pomoci zapsaného tento měsíc přihlášeným na tuhle kartu. */
  recordedHelpId: string | null;
  /** Burza dává bonus do semaforu (semafor i Burza zapnuté): rozhoduje o větě pod přepínačem. */
  bonusOn?: boolean;
}) {
  const subtitle = [data.company, data.obor].filter((v): v is string => !!v && v.trim().length > 0).join(" · ");
  const canUse = canRecordHelp(viewerId, data.memberId);

  return (
    <article className="min-w-0 rounded-card border border-border bg-surface p-4 shadow-card sm:p-5">
      <h3 className="text-base font-semibold text-text-main break-words">{data.name}</h3>
      {subtitle && <p className="mt-1 text-sm text-text-muted break-words">{subtitle}</p>}

      <div className="mt-3 space-y-2 text-sm text-text-main">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">S čím pomůžu</p>
          <p className="whitespace-pre-line break-words">{data.offer}</p>
        </div>
        <p className="break-words">
          <span className="font-medium">Kontakt:</span>{" "}
          <span className="whitespace-pre-line">{data.contact || "–"}</span>
        </p>
        <p className="break-words">
          <span className="font-medium">Poznámka:</span>{" "}
          <span className="whitespace-pre-line">{data.note || "–"}</span>
        </p>
        <p className="text-xs text-text-muted">potvrzeno {formatMonthYear(data.confirmedDay)}</p>
      </div>

      {(canUse || viewerIsManagement) && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {canUse && (
            <HelpUsedToggle
              key={`${data.memberId}-${recordedHelpId ?? "none"}`}
              helperId={data.memberId}
              initialHelpId={recordedHelpId}
            />
          )}
          {viewerIsManagement && (
            <Link
              href={`/burza/${data.memberId}/edit`}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm text-text-main transition-colors hover:bg-background focus:outline-none focus:shadow-focus sm:w-auto"
            >
              Upravit
            </Link>
          )}
        </div>
      )}
      {canUse && <p className="mt-2 text-sm text-text-muted">{TEXTS.usedHelpHint(bonusOn)}</p>}
    </article>
  );
}
