/**
 * Karty rolí (iter-030, T-007a, arch_iter-030_T-001 sekce 3 a 7.2).
 * Karta = `<section id="<role>">` s H3, pole jako `<dl>`. Vždy všech pět
 * polí v pevném pořadí, pole bez faktu ukáže větu šablony (gate T-006:
 * stejná forma karet je součást neutrality). Karta neodkazuje sama na
 * sebe ani na své pod-kotvy. Zdroje jako u kroku v `<details>`.
 */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { createRoleLinker, linkFact, type RoleLinkOptions } from "@/lib/info-pages/glossary";
import type { ChapterNote, RoleCard } from "@/lib/info-pages/types";
import { ROLE_CARD_FIELD_KINDS } from "@/lib/info-pages/types";
import { ChapterNotes } from "./ChapterNoteBox";
import { ComicStrip } from "./ComicStrip";
import { RichText } from "./RichText";
import { SourceNote } from "./SourceNote";

const R = TEMPLATE_TEXTS.reference;

function RoleCardView({
  card,
  links,
  notes,
}: {
  card: RoleCard;
  links: RoleLinkOptions;
  notes: ChapterNote[];
}) {
  const subAnchors = card.subAnchors ?? [];
  const link = createRoleLinker(links, [card.id, ...subAnchors.map((sub) => sub.id)]);
  const lead = link(card.lead);
  const fields = ROLE_CARD_FIELD_KINDS.map((kind) => ({
    kind,
    texts: (card.fields.find((f) => f.kind === kind)?.facts ?? []).map((fact) => linkFact(link, fact)),
  }));
  const subs = subAnchors.map((sub) => ({ sub, texts: sub.facts.map((fact) => linkFact(link, fact)) }));
  const allFacts = [...card.fields.flatMap((f) => f.facts), ...subAnchors.flatMap((s) => s.facts)];
  const titleId = `${card.id}-title`;

  return (
    <section
      id={card.id}
      aria-labelledby={titleId}
      className="info-role-card rounded-card border border-border bg-surface px-4 py-5 sm:px-6"
    >
      <h3 id={titleId} className="text-xl font-semibold leading-snug text-text-main">
        {card.title}
      </h3>
      {card.comic && <ComicStrip comic={card.comic} />}
      <p className="mt-2 text-lg leading-relaxed text-text-main">
        <RichText segments={lead} />
      </p>
      {card.inChart && (
        <p className="mt-1 text-sm text-text-main">
          <span className="font-medium">{R.inChart}</span> {card.inChart}
        </p>
      )}
      <dl className="mt-4 space-y-4">
        {fields.map((field) => (
          <div key={field.kind} className="info-role-field">
            <dt className="text-sm font-semibold text-navy">{R.fields[field.kind]}</dt>
            <dd className="mt-1">
              {field.texts.length === 0 ? (
                <p className="info-role-empty border-l-2 border-border pl-4 text-base leading-relaxed text-text-main">
                  <span aria-hidden="true">{R.emptyField}</span>
                  <span className="sr-only">{R.emptyFieldSr}</span>
                </p>
              ) : (
                <ul className="space-y-2 border-l-2 border-border-strong pl-4 text-base leading-relaxed text-text-main">
                  {field.texts.map((segments, i) => (
                    <li key={i}>
                      <RichText segments={segments} />
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {card.link && (
        <p className="mt-4">
          <a
            href={card.link.href}
            className="rounded text-base font-medium text-navy underline underline-offset-2 focus:outline-none focus-visible:shadow-focus"
          >
            {card.link.label}
          </a>
        </p>
      )}
      {subs.map(({ sub, texts }) => (
        <section
          key={sub.id}
          id={sub.id}
          aria-labelledby={`${sub.id}-title`}
          className="info-role-sub mt-5 rounded-card bg-background px-4 py-3"
        >
          <h4 id={`${sub.id}-title`} className="text-base font-semibold text-text-main">
            {sub.title}
          </h4>
          <ul className="mt-2 space-y-2 text-base leading-relaxed text-text-main">
            {texts.map((segments, i) => (
              <li key={i}>
                <RichText segments={segments} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <ChapterNotes ids={card.chapterNotes} notes={notes} />
      <SourceNote facts={allFacts} />
    </section>
  );
}

export function RoleCards({
  cards,
  links,
  notes,
}: {
  cards: RoleCard[];
  links: RoleLinkOptions;
  notes: ChapterNote[];
}) {
  return (
    <div className="mt-5 space-y-6">
      {cards.map((card) => (
        <RoleCardView key={card.id} card={card} links={links} notes={notes} />
      ))}
    </div>
  );
}
