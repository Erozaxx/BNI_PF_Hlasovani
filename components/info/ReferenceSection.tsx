/**
 * Referenční část info stránky (iter-030, T-007a, arch_iter-030_T-001
 * sekce 6.3 a 7.2): úvod „vedení obecně" (`#vedeni`), karty rolí
 * (`#role-karty`), tabulka situací (`#kdo-rozhoduje`) a práva
 * (`#prava-regionu`). Stojí mimo `info-layout`, sticky vizuál tu končí.
 */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { createRoleLinker, linkFact, type RoleLinkOptions } from "@/lib/info-pages/glossary";
import type { ChapterNote, InfoReference } from "@/lib/info-pages/types";
import { REFERENCE_ANCHORS } from "@/lib/info-pages/types";
import { ChapterNotes } from "./ChapterNoteBox";
import { ChapterSide } from "./ChapterSide";
import { DecisionTable } from "./DecisionTable";
import { RichText } from "./RichText";
import { RightsList } from "./RightsList";
import { RoleCards } from "./RoleCards";
import { SectionHeading } from "./SectionHeading";
import { SourceNote } from "./SourceNote";

const R = TEMPLATE_TEXTS.reference;
const A = REFERENCE_ANCHORS;
const h2 = "text-2xl font-semibold leading-tight text-text-main";

export function ReferenceSection({
  reference,
  links,
  notes,
}: {
  reference: InfoReference;
  links: RoleLinkOptions;
  notes: ChapterNote[];
}) {
  const link = createRoleLinker(links);
  const lead = reference.lead.map(link);
  const facts = reference.facts.map((fact) => linkFact(link, fact));

  return (
    <div className="info-reference mt-10">
      <section id={A.intro} aria-labelledby={`${A.intro}-title`} className="info-ref-intro">
        <SectionHeading anchor={A.intro} titleId={`${A.intro}-title`} title={reference.title} className={h2} />
        <div className="mt-4 space-y-4 text-lg leading-relaxed text-text-main">
          {lead.map((segments, i) => (
            <p key={i}>
              <RichText segments={segments} />
            </p>
          ))}
        </div>
        <ChapterSide facts={reference.facts} texts={facts} />
        <ChapterNotes ids={reference.chapterNotes} notes={notes} />
        <SourceNote facts={reference.facts} />
      </section>

      {reference.roles.length > 0 && (
        <section id={A.roles} aria-labelledby={`${A.roles}-title`} className="mt-10">
          <SectionHeading anchor={A.roles} titleId={`${A.roles}-title`} title={R.rolesTitle} className={h2} />
          <RoleCards cards={reference.roles} links={links} notes={notes} />
        </section>
      )}

      {reference.decisions.length > 0 && (
        <section id={A.decisions} aria-labelledby={`${A.decisions}-title`} className="mt-10">
          <SectionHeading anchor={A.decisions} titleId={`${A.decisions}-title`} title={R.decisionsTitle} className={h2} />
          <DecisionTable rows={reference.decisions} links={links} />
        </section>
      )}

      {reference.rights.length > 0 && (
        <section id={A.rights} aria-labelledby={`${A.rights}-title`} className="mt-10">
          <SectionHeading anchor={A.rights} titleId={`${A.rights}-title`} title={R.rightsTitle} className={h2} />
          <RightsList items={reference.rights} links={links} />
        </section>
      )}
    </div>
  );
}
