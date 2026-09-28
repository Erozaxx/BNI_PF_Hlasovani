/**
 * Info stránka série (arch_iter-029_T-001 sekce 4.1). Staticky při buildu
 * z registru, neznámý slug = 404, žádné dynamické API.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InfoPageView } from "@/components/info/InfoPageView";
import { CHAPTER_NOTES } from "@/content/pravidla/u-nas-v-chapteru";
import { getInfoPage, INFO_PAGES } from "@/lib/info-pages/registry";
import { assertValidRegistry } from "@/lib/info-pages/validate";

export const dynamic = "error";
export const dynamicParams = false;

type Params = { params: { slug: string } };

export function generateStaticParams() {
  // Build spadne na nevalidních datech (T-007r, M-1), repo nemá CI.
  assertValidRegistry(INFO_PAGES, CHAPTER_NOTES);
  return INFO_PAGES.map((page) => ({ slug: page.slug }));
}

export function generateMetadata({ params }: Params): Metadata {
  const page = getInfoPage(params.slug);
  if (!page) return {};
  return {
    title: page.title,
    description: page.description,
    openGraph: {
      title: page.title,
      description: page.description,
      type: "article",
      locale: "cs_CZ",
    },
  };
}

export default function InfoPageRoute({ params }: Params) {
  const page = getInfoPage(params.slug);
  if (!page) notFound();
  return (
    <InfoPageView
      page={page}
      notes={CHAPTER_NOTES}
      baseUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
    />
  );
}
