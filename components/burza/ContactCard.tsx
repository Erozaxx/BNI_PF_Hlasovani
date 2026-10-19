import Link from "next/link";
import { ContactUsedToggle } from "@/components/burza/ContactUsedToggle";
import { TEXTS, canRecordHelp } from "@/lib/burza/rules";

export interface ContactCardData {
  id: string;
  memberId: string;
  name: string;
  company: string | null;
  obor: string | null;
  label: string;
  createdAt: string;
}

/**
 * Karta jedné položky kontaktu (arch 6.4, gate Z8, Z11). Popisek „Na koho mám
 * kontakt“, text položky, „Nabízí: jméno · firma · obor“ (chybějící vynechat).
 * „Využil(a) jsem“ jen na cizí kartě, „Upravit“ jen vedení. Bez data a bez
 * poznámky.
 */
export function ContactCard({
  data,
  viewerId,
  viewerIsManagement,
  used,
}: {
  data: ContactCardData;
  viewerId: string;
  viewerIsManagement: boolean;
  used: boolean;
}) {
  const offeredBy = TEXTS.offeredBy(
    [data.name, data.company, data.obor]
      .filter((v): v is string => !!v && v.trim().length > 0)
      .join(" · ")
  );
  const canUse = canRecordHelp(viewerId, data.memberId);

  return (
    <article className="min-w-0 rounded-card border border-border bg-surface p-4 shadow-card sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {TEXTS.contactLabel}
      </p>
      <p className="mt-1 whitespace-pre-line break-words text-base text-text-main">{data.label}</p>
      <p className="mt-2 text-sm text-text-muted break-words">{offeredBy}</p>

      {(canUse || viewerIsManagement) && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {canUse && <ContactUsedToggle contactId={data.id} initialUsed={used} />}
          {viewerIsManagement && (
            <Link
              href={`/burza/kontakty/${data.memberId}`}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm text-text-main transition-colors hover:bg-background focus:outline-none focus:shadow-focus sm:w-auto"
            >
              Upravit
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
