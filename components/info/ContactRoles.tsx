/** „Na koho se obrátit": jen role, bez jmen a kontaktů (arch K4). */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { createRoleLinker, type RoleLinkOptions } from "@/lib/info-pages/glossary";
import type { InfoPage } from "@/lib/info-pages/types";
import { RichText } from "./RichText";
import { SectionHeading } from "./SectionHeading";

export function ContactRoles({
  contacts,
  links,
}: {
  contacts: InfoPage["contacts"];
  links: RoleLinkOptions;
}) {
  if (contacts.length === 0) return null;
  const link = createRoleLinker(links);
  const roles = contacts.map((contact) => link(contact.role));
  return (
    <section aria-labelledby="kontakty-title" className="info-contacts mt-10">
      {/* Sekce nemá vlastní id, kotva je id nadpisu (`kontakty-title` je v RESERVED_IDS). */}
      <SectionHeading
        anchor="kontakty-title"
        titleId="kontakty-title"
        title={TEMPLATE_TEXTS.contactsTitle}
        className="text-2xl font-semibold leading-tight text-text-main"
      />
      <ul className="mt-4 space-y-4">
        {contacts.map((contact, i) => (
          <li key={i} className="text-base leading-relaxed text-text-main">
            <p className="font-semibold">
              <RichText segments={roles[i]} />
            </p>
            <p>{contact.when}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
