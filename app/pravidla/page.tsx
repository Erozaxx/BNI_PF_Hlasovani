/**
 * Rozcestník /pravidla (arch_iter-029_T-001 sekce 8). Statický, bez JS,
 * bez vyhledávání. Situace a karty se skládají z registru stránek.
 *
 * iter-031 (arch_iter-031_T-003s 1.7, X9): situace seskupené po stránkách.
 * T-012x: nahoře mřížka karet témat (hero obrázek, celá karta je jeden odkaz),
 * situace pod nimi v `<details>` po stránkách (zavřené, bez JS). Stránka bez
 * situací se mezi situacemi nevypíše, karta v „Témata" zůstává.
 */
import type { Metadata } from "next";
import type { ComicPanel } from "@/lib/info-pages/types";
import Link from "next/link";
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { fillTemplate } from "@/lib/info-pages/format";
import { INFO_PAGES } from "@/lib/info-pages/registry";
import { assertValidRegistry } from "@/lib/info-pages/validate";
import { ROLE_COMICS } from "@/content/pravidla/role-komiksy";
import { CHAPTER_NOTES } from "@/content/pravidla/u-nas-v-chapteru";

export const dynamic = "error";

const T = TEMPLATE_TEXTS.hub;

/**
 * Obrázek karty pro stránku bez `hero` (T-012x), aby měly všechny karty
 * stejnou výšku. Data stránky se nemění.
 */
const HUB_IMAGE_FALLBACK: Record<string, ComicPanel> = {
  role: ROLE_COMICS.R10.panels[1],
  // iter-044: ilustraci semaforu dodá Tom, do té doby existující panel.
  semafor: ROLE_COMICS.R10.panels[1],
};

export const metadata: Metadata = {
  title: { absolute: T.title },
  description: T.lead,
  openGraph: {
    title: T.title,
    description: T.lead,
    type: "website",
    locale: "cs_CZ",
  },
};

const linkClass =
  "rounded font-medium text-navy underline underline-offset-2 focus:outline-none focus-visible:shadow-focus";

export default function PravidlaHubPage() {
  // Rozcestník odkazuje na kotvy všech stránek, validace i tady (T-007r, M-1).
  assertValidRegistry(INFO_PAGES, CHAPTER_NOTES);
  const groups = INFO_PAGES.filter((page) => page.situations.length > 0).map(
    (page) => ({
      slug: page.slug,
      title: page.title,
      situations: page.situations.map((s) => ({
        ...s,
        href: `/pravidla/${page.slug}#${s.anchor}`,
      })),
    }),
  );
  return (
    <div className="info-hub max-w-4xl pt-6">
      <h1 className="max-w-2xl text-3xl font-bold leading-tight text-text-main">
        {T.title}
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-text-main">
        {T.lead}
      </p>

      <section aria-labelledby="temata-title" className="mt-10">
        <h2 id="temata-title" className="text-2xl font-semibold text-text-main">
          {T.topicsTitle}
        </h2>
        <ul className="info-hub-cards mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {INFO_PAGES.map((page) => {
            const image = page.hero ?? HUB_IMAGE_FALLBACK[page.slug];
            return (
              <li key={page.slug} className="info-hub-card">
                {image && (
                  // alt="": název stránky je hned pod obrázkem (stejný odkaz).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.src}
                    alt=""
                    width={image.width}
                    height={image.height}
                    loading="lazy"
                    decoding="async"
                    className="info-hub-card-image"
                  />
                )}
                <div className="p-5">
                  <h3 className="text-xl font-semibold">
                    <Link
                      href={`/pravidla/${page.slug}`}
                      className="info-hub-card-link"
                    >
                      {page.title}
                    </Link>
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-text-main">
                    {page.description}
                  </p>
                  <p className="mt-2 text-sm text-text-main">
                    {fillTemplate(TEMPLATE_TEXTS.updated, {
                      updated: page.updated,
                    })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="situace-title" className="mt-12 max-w-2xl">
        <h2
          id="situace-title"
          className="text-2xl font-semibold text-text-main"
        >
          {T.situationsTitle}
        </h2>
        <div className="info-hub-screen mt-4 space-y-3">
          {groups.map((group) => (
            <details
              key={group.slug}
              className="info-hub-group rounded-lg border border-border"
            >
              <summary className="info-hub-summary cursor-pointer rounded px-4 py-3 text-lg font-semibold text-text-main focus:outline-none focus-visible:shadow-focus">
                {T.groupSummary
                  .replace("{title}", group.title)
                  .replace("{count}", String(group.situations.length))}
              </summary>
              <ul className="space-y-3 px-4 pb-4 pt-1 text-lg">
                {group.situations.map((s) => (
                  <li key={s.href}>
                    <Link href={s.href} className={linkClass}>
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
        {/* Jen pro tisk: obsah zavřeného <details> se v Chromiu netiskne. */}
        <div className="info-print-only info-hub-print">
          {groups.map((group) => (
            <div key={group.slug} className="info-hub-print-group">
              <p className="font-semibold">
                {T.groupSummary
                  .replace("{title}", group.title)
                  .replace("{count}", String(group.situations.length))}
              </p>
              <ul>
                {group.situations.map((s) => (
                  <li key={s.href}>
                    <Link href={s.href} className={linkClass}>
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
