/**
 * Rozcestník /pravidla (arch_iter-029_T-001 sekce 8). Statický, bez JS,
 * bez vyhledávání. Situace a karty se skládají z registru stránek.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { fillTemplate } from "@/lib/info-pages/format";
import { INFO_PAGES } from "@/lib/info-pages/registry";
import { assertValidRegistry } from "@/lib/info-pages/validate";
import { CHAPTER_NOTES } from "@/content/pravidla/u-nas-v-chapteru";

export const dynamic = "error";

const T = TEMPLATE_TEXTS.hub;

export const metadata: Metadata = {
  title: { absolute: T.title },
  description: T.lead,
  openGraph: { title: T.title, description: T.lead, type: "website", locale: "cs_CZ" },
};

const linkClass =
  "rounded font-medium text-navy underline underline-offset-2 focus:outline-none focus-visible:shadow-focus";

export default function PravidlaHubPage() {
  // Rozcestník odkazuje na kotvy všech stránek, validace i tady (T-007r, M-1).
  assertValidRegistry(INFO_PAGES, CHAPTER_NOTES);
  const situations = INFO_PAGES.flatMap((page) =>
    page.situations.map((s) => ({ ...s, href: `/pravidla/${page.slug}#${s.anchor}` }))
  );
  return (
    <div className="info-hub max-w-2xl pt-6">
      <h1 className="text-3xl font-bold leading-tight text-text-main">{T.title}</h1>
      <p className="mt-3 text-lg leading-relaxed text-text-main">{T.lead}</p>

      <section aria-labelledby="situace-title" className="mt-10">
        <h2 id="situace-title" className="text-2xl font-semibold text-text-main">
          {T.situationsTitle}
        </h2>
        <ul className="mt-4 space-y-3 text-lg">
          {situations.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className={linkClass}>
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="temata-title" className="mt-10">
        <h2 id="temata-title" className="text-2xl font-semibold text-text-main">
          {T.topicsTitle}
        </h2>
        <ul className="mt-4 space-y-4">
          {INFO_PAGES.map((page) => (
            <li key={page.slug}>
              <Card>
                <h3 className="text-xl font-semibold">
                  <Link href={`/pravidla/${page.slug}`} className={linkClass}>
                    {page.title}
                  </Link>
                </h3>
                <p className="mt-2 text-base leading-relaxed text-text-main">{page.description}</p>
                <p className="mt-2 text-sm text-text-main">
                  {fillTemplate(TEMPLATE_TEXTS.updated, { updated: page.updated })}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
