/** „Na koho se obrátit": jen role, bez jmen a kontaktů (arch K4). */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import type { InfoPage } from "@/lib/info-pages/types";

export function ContactRoles({ contacts }: { contacts: InfoPage["contacts"] }) {
  if (contacts.length === 0) return null;
  return (
    <section aria-labelledby="kontakty-title" className="info-contacts mt-10">
      <h2 id="kontakty-title" className="text-2xl font-semibold leading-tight text-text-main">
        {TEMPLATE_TEXTS.contactsTitle}
      </h2>
      <ul className="mt-4 space-y-4">
        {contacts.map((contact, i) => (
          <li key={i} className="text-base leading-relaxed text-text-main">
            <p className="font-semibold">{contact.role}</p>
            <p>{contact.when}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
