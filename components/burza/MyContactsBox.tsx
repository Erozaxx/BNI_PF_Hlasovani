import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { TEXTS } from "@/lib/burza/rules";

/**
 * Box „Tvoje kontakty“ (gate Z10). Kompaktní, bez výpisu položek. Žádná
 * položka: věta a odkaz „Přidat kontakt“. Jinak „Zapsané kontakty: N z 10“ a
 * odkaz „Upravit kontakty“. Pod tím počet využití za 6 měsíců, jen když je
 * větší než 0 (bez jmen).
 */
export function MyContactsBox({
  memberId,
  itemCount,
  usedCount,
}: {
  memberId: string;
  itemCount: number;
  usedCount: number;
}) {
  const empty = itemCount === 0;
  return (
    <Card className="!p-4">
      <h2 className="text-base font-semibold text-text-main">{TEXTS.myContactsTitle}</h2>
      <p className="mt-1 text-sm text-text-muted">
        {empty ? TEXTS.noContacts : TEXTS.myContactsCount(itemCount)}
      </p>
      <div className="mt-3">
        <Link
          href={`/burza/kontakty/${memberId}`}
          className={
            empty
              ? "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-btn bg-primary px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover focus:outline-none focus:shadow-focus sm:w-auto"
              : "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm text-text-main transition-colors hover:bg-background focus:outline-none focus:shadow-focus"
          }
        >
          {empty ? TEXTS.addContact : TEXTS.editContacts}
        </Link>
      </div>
      {usedCount > 0 && (
        <p className="mt-3 text-sm text-text-muted">{TEXTS.contactsUsedByOthers(usedCount)}</p>
      )}
    </Card>
  );
}
