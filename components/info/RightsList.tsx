/**
 * Úplný seznam práv BNI, regionu, franšízanta a konzultanta regionu
 * (iter-030, T-007a, arch_iter-030_T-001 sekce 4 a 7.2). Všechny položky
 * stejnou formou v pořadí z dat, nic se nezvýrazňuje. Zdroj u každé
 * položky v `<details>`.
 *
 * iter-031: `ordered: false` = odrážkový seznam (referenční sekce stránky
 * stiznosti), výchozí číslovaný.
 */
import { createRoleLinker, type RoleLinkOptions } from "@/lib/info-pages/glossary";
import type { RightsItem } from "@/lib/info-pages/types";
import { RichText } from "./RichText";
import { SourceDetails } from "./SourceNote";

export function RightsList({
  items,
  links,
  ordered = true,
}: {
  items: RightsItem[];
  links: RoleLinkOptions;
  ordered?: boolean;
}) {
  const List = ordered ? "ol" : "ul";
  return (
    <List
      className={`info-rights mt-5 ${ordered ? "list-decimal" : "list-disc"} space-y-4 pl-7 text-base leading-relaxed text-text-main`}
    >
      {items.map((item) => (
        <li key={item.id} id={item.id} className="pl-1">
          <RichText segments={createRoleLinker(links)(item.text)} />
          <SourceDetails sources={item.sources} spacing="mt-2" />
        </li>
      ))}
    </List>
  );
}
