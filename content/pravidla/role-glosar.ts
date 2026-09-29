/**
 * Glosář rolí celé série „Pravidla chapteru" (iter-030, T-007a,
 * arch_iter-030_T-001 sekce 3, 7.1 a 7.3).
 *
 * `name` je krátký název do schématu vedení a do pruhu „Rozhoduje: …".
 * `forms` jsou české tvary, ze kterých `linkRoles()` (lib/info-pages/glossary.ts)
 * udělá odkaz na kartu role `/pravidla/role#<id>`. Tvary se hledají od
 * nejdelšího, velké první písmeno se toleruje, text se nemění.
 * `en` je anglický název z pravidel, jde do `title` odkazu. Specializace
 * výboru anglický název nemají (arch 3.5, K7: anglicky jen ve zdroji).
 *
 * Tvary doplněné podle textů stránky rolí (T-007b): množné číslo
 * regionálního týmu. „Regionální nebo oblastní ředitel" (Regional or Area
 * Director, M26) se vědomě neodkazuje, oblastní ředitel nemá kartu.
 *
 * `clen` (ty, čtenář) v glosáři není: nemá kartu a slovo „člen" se neodkazuje.
 * Každé id z glosáře musí mít na stránce `role` kartu nebo pod-kotvu
 * (hlídá `validateRegistry`). Žádná jména ani konkrétní osoby.
 */
import type { RoleId } from "@/lib/info-pages/types";

export interface RoleGlossaryEntry {
  id: RoleId;
  /** Tvary v textu (pády, u některých rolí množné číslo). */
  forms: string[];
  /** Anglický název z pravidel pro `title` odkazu. */
  en?: string;
}

/**
 * Názvy uzlů ve schématu (texty content-writer T-005). V pruhu „Rozhoduje: …"
 * se první písmeno zmenší (`roleNameInline`).
 */
export const ROLE_NAMES: Record<RoleId, string> = {
  clen: "Ty",
  prezident: "Prezident",
  viceprezident: "Viceprezident",
  "clensky-vybor": "Členský výbor",
  "vybor-rust": "Růst chapteru",
  "vybor-prihlasky": "Posouzení přihlášek",
  "vybor-zapojeni": "Zapojení členů",
  "vybor-vztahy": "Vztahy mezi členy",
  "sekretar-pokladnik": "Sekretář/pokladník",
  "vzdelavaci-koordinator": "Vzdělávací koordinátor",
  "koordinator-mentoru": "Koordinátor mentorů",
  hostitele: "Tým hostitelů",
  "konzultant-regionu": "Konzultant regionu",
  "reditel-regionu": "Ředitel regionu",
  region: "Regionální kancelář BNI",
};

/** Název role uvnitř věty („Musí souhlasit: konzultant regionu"). */
export function roleNameInline(id: RoleId): string {
  const name = ROLE_NAMES[id];
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Název v pruhu „Provádí: …": specializace výboru celým názvem role
 * („člen výboru pro vztahy mezi členy"), ne jen oblastí (review T-008, N-1).
 */
export function roleBarName(id: RoleId): string {
  if (id.startsWith("vybor-")) return `člen výboru pro ${roleNameInline(id)}`;
  return roleNameInline(id);
}

/** Tvary „člen výboru pro …" ve čtyřech pádech. */
function committeeMember(specialization: string): string[] {
  return ["člen", "člena", "členovi", "členem"].map((m) => `${m} výboru pro ${specialization}`);
}

export const ROLE_GLOSSARY: RoleGlossaryEntry[] = [
  {
    id: "viceprezident",
    forms: ["viceprezident", "viceprezidenta", "viceprezidentovi", "viceprezidentem"],
    en: "Vice President",
  },
  {
    id: "prezident",
    forms: ["prezident", "prezidenta", "prezidentovi", "prezidentem"],
    en: "President",
  },
  {
    id: "clensky-vybor",
    forms: [
      "členský výbor",
      "členského výboru",
      "členskému výboru",
      "členském výboru",
      "členským výborem",
      "výbor",
      "výboru",
      "výborem",
    ],
    en: "Membership Committee",
  },
  {
    id: "vybor-rust",
    forms: [...committeeMember("růst chapteru"), ...committeeMember("růst")],
  },
  {
    id: "vybor-prihlasky",
    forms: [...committeeMember("posouzení přihlášek"), ...committeeMember("přihlášky")],
  },
  {
    id: "vybor-zapojeni",
    forms: [...committeeMember("zapojení členů"), ...committeeMember("zapojení")],
  },
  {
    id: "vybor-vztahy",
    forms: [...committeeMember("vztahy mezi členy"), ...committeeMember("vztahy")],
  },
  {
    id: "sekretar-pokladnik",
    forms: [
      "sekretář/pokladník",
      "sekretáře/pokladníka",
      "sekretáři/pokladníkovi",
      "sekretářem/pokladníkem",
    ],
    en: "Secretary/Treasurer",
  },
  {
    id: "vzdelavaci-koordinator",
    forms: [
      "vzdělávací koordinátor",
      "vzdělávacího koordinátora",
      "vzdělávacímu koordinátorovi",
      "vzdělávacím koordinátorem",
    ],
    en: "Education Coordinator",
  },
  {
    id: "koordinator-mentoru",
    forms: ["koordinátor mentorů", "koordinátora mentorů", "koordinátorovi mentorů", "koordinátorem mentorů"],
    en: "Mentor Coordinator",
  },
  {
    id: "hostitele",
    forms: ["tým hostitelů", "týmu hostitelů", "týmem hostitelů", "hostitelé", "hostitelů", "hostitelům"],
    en: "Visitor Host Team",
  },
  {
    id: "konzultant-regionu",
    forms: [
      "konzultant regionu",
      "konzultanta regionu",
      "konzultantovi regionu",
      "konzultantem regionu",
      "konzultanti regionu",
      "konzultantů regionu",
      "konzultantům regionu",
    ],
    en: "Director / Director Consultant",
  },
  {
    id: "reditel-regionu",
    forms: [
      "ředitel regionu",
      "ředitele regionu",
      "řediteli regionu",
      "ředitelem regionu",
    ],
    en: "Executive Director / Regional Director",
  },
  {
    id: "region",
    forms: [
      "regionální kancelář",
      "regionální kanceláře",
      "regionální kanceláři",
      "regionální kanceláří",
      "regionální tým",
      "regionálního týmu",
      "regionálnímu týmu",
      "regionálním týmem",
      "regionální týmy",
      "regionálních týmů",
      "region BNI",
      "regionu BNI",
      // T-010r5 (uživatel): franšízant je samostatná role, patří ke kartě „BNI a region".
      "franšízant",
      "franšízanta",
      "franšízantovi",
      "franšízantem",
      "franšízanti",
      "franšízantů",
      "franšízantům",
    ],
    en: "BNI Regional Office",
  },
];

/**
 * Výrazy, ve kterých se tvary rolí neodkazují (např. „výbor" ve smyslu
 * jiného výboru). Zatím prázdné (arch 7.3, varianta H jen jako výjimka).
 */
export const ROLE_NO_LINK: string[] = [];
