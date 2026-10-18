import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ConfirmOfferButton } from "@/components/burza/ConfirmOfferButton";
import { RemoveOfferButton } from "@/components/burza/RemoveOfferButton";
import { TEXTS, formatMonthYear, isStale } from "@/lib/burza/rules";
import type { OfferRow } from "@/lib/db/queries/burza";

const linkButton =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm text-text-main transition-colors hover:bg-background focus:outline-none focus:shadow-focus";

/**
 * Box „Tvůj řádek“ (6.2, Z4, Z5). Kompaktní, aby hledací pole zůstalo vidět:
 * náhled na 3 řádky, celý text po rozkliknutí (`<details>`), tlačítka vedle
 * sebe se zalomením. „Platí dál“ jen u řádku starého 90 dní a víc. Pod tím
 * počet zapsané pomoci od ostatních za 6 měsíců, jen když je větší než 0.
 */
export function MyOfferBox({
  memberId,
  offer,
  helpedCount,
  today,
}: {
  memberId: string;
  offer: OfferRow | null;
  helpedCount: number;
  today: string;
}) {
  if (!offer) {
    return (
      <Card className="!p-4">
        <h2 className="text-base font-semibold text-text-main">Tvůj řádek</h2>
        <p className="mt-1 text-sm text-text-muted">{TEXTS.noOffer}</p>
        <div className="mt-3">
          <Link
            href={`/burza/${memberId}/edit`}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-btn bg-primary px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover focus:outline-none focus:shadow-focus sm:w-auto"
          >
            Přidat svůj řádek
          </Link>
        </div>
        {helpedCount > 0 && <HelpedLine count={helpedCount} />}
      </Card>
    );
  }

  const stale = isStale(offer.confirmedDay, today);

  return (
    <Card className="!p-4">
      <h2 className="text-base font-semibold text-text-main">Tvůj řádek</h2>
      {stale && (
        <p className="mt-1 text-sm font-medium text-warning">
          {TEXTS.staleOwn}
        </p>
      )}
      <p className="mt-2 line-clamp-3 whitespace-pre-line break-words text-sm text-text-main">
        {offer.offer}
      </p>
      <details className="mt-1">
        <summary className="flex min-h-[44px] cursor-pointer select-none items-center rounded text-sm font-medium text-navy focus:outline-none focus:shadow-focus">
          Zobrazit celé
        </summary>
        <div className="space-y-2 pb-1 text-sm text-text-main">
          <p className="whitespace-pre-line break-words">{offer.offer}</p>
          <p className="break-words">
            <span className="font-medium">Kontakt:</span> {offer.contact || "–"}
          </p>
          <p className="break-words">
            <span className="font-medium">Poznámka:</span> {offer.note || "–"}
          </p>
          <p className="text-xs text-text-muted">potvrzeno {formatMonthYear(offer.confirmedDay)}</p>
        </div>
      </details>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link href={`/burza/${memberId}/edit`} className={linkButton}>
          Upravit
        </Link>
        {stale && <ConfirmOfferButton />}
        <RemoveOfferButton memberId={memberId} own />
      </div>
      {helpedCount > 0 && <HelpedLine count={helpedCount} />}
    </Card>
  );
}

function HelpedLine({ count }: { count: number }) {
  return (
    <p className="mt-3 text-sm text-text-muted">
      Zapsaná pomoc od ostatních za posledních 6 měsíců: {count}
    </p>
  );
}
