/**
 * Referenční seznamy za příběhem (iter-031, T-007s, arch_iter-031_T-001c SC3,
 * gate T-004 c K2): na stránce stiznosti etický kodex, respekt a kontakty.
 * Stojí mimo `info-layout` (sticky vizuál tu končí), za referenční částí
 * a před shrnutím. Pořadí v sekci: H2, úvod, komiks, seznam, fakta,
 * „U nás v chapteru", zdroje faktů (T-007z: fakta pod seznamem, jak je
 * psal content-writer). `factsFirst` dá fakta nad seznam, když ho uvádějí
 * (kodex). Zdroj položky je u položky.
 */
import { createRoleLinker, linkFact, type RoleLinkOptions } from "@/lib/info-pages/glossary";
import type { ChapterNote, InfoListSection } from "@/lib/info-pages/types";
import { ChapterNotes } from "./ChapterNoteBox";
import { ChapterSide } from "./ChapterSide";
import { ComicStrip } from "./ComicStrip";
import { RichText } from "./RichText";
import { RightsList } from "./RightsList";
import { SourceNote } from "./SourceNote";

function ListSection({
  section,
  links,
  notes,
}: {
  section: InfoListSection;
  links: RoleLinkOptions;
  notes: ChapterNote[];
}) {
  // Jeden `seen` na úvod a fakta sekce, položky mají vlastní (jako RightsList).
  const link = createRoleLinker(links);
  const lead = (section.lead ?? []).map(link);
  const facts = section.facts ?? [];
  const factTexts = facts.map((fact) => linkFact(link, fact));
  const titleId = `${section.id}-title`;
  return (
    <section id={section.id} aria-labelledby={titleId} className="info-list-section mt-10">
      <h2 id={titleId} className="text-2xl font-semibold leading-tight text-text-main">
        {section.title}
      </h2>
      {lead.length > 0 && (
        <div className="mt-4 space-y-4 text-lg leading-relaxed text-text-main">
          {lead.map((segments, i) => (
            <p key={i}>
              <RichText segments={segments} />
            </p>
          ))}
        </div>
      )}
      {section.comic && <ComicStrip comic={section.comic} />}
      {section.factsFirst && <ChapterSide facts={facts} texts={factTexts} />}
      <RightsList items={section.items} links={links} ordered={section.ordered ?? false} />
      {!section.factsFirst && <ChapterSide facts={facts} texts={factTexts} />}
      <ChapterNotes ids={section.chapterNotes} notes={notes} />
      <SourceNote facts={facts} />
    </section>
  );
}

export function ListSections({
  sections,
  links,
  notes,
}: {
  sections: InfoListSection[];
  links: RoleLinkOptions;
  notes: ChapterNote[];
}) {
  if (sections.length === 0) return null;
  return (
    <div className="info-sections">
      {sections.map((section) => (
        <ListSection key={section.id} section={section} links={links} notes={notes} />
      ))}
    </div>
  );
}
