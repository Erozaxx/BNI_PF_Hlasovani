/**
 * Společné texty šablony info stránek (rozcestník, legenda, štítky,
 * zdroje, patička). Texty: content-writer T-005 (schváleno T-006).
 * `{updated}` se nahradí českým datem, `{n}` číslem.
 */

export const TEMPLATE_TEXTS = {
  hub: {
    title: "Pravidla chapteru",
    lead: "Jak u nás v chapteru fungují pravidla BNI. Krok za krokem.",
    situationsTitle: "Najdi svou situaci",
    topicsTitle: "Témata",
  },
  updated: "Stav k {updated}",
  skipToSummary: "Přeskočit na shrnutí",
  legend: {
    chapterNote: "Co náš chapter dělá navíc nad pravidla BNI.",
  },
  chapterNote: {
    label: "U nás v chapteru",
    draftSuffix: "návrh",
  },
  sources: {
    summaryPrefix: "Zdroj: ",
    whereToFindTitle: "Kde to najdeš",
    printTitle: "Zdroje",
  },
  contactsTitle: "Na koho se obrátit",
  print: "Vytisknout",
  /** Legenda osy `absence-timeline`. */
  timeline: {
    title: "Půl roku v chapteru",
    present: "byl jsi na schůzce",
    substitute: "poslal jsi náhradníka",
    absence: "chyběl jsi bez náhradníka",
    leave: "schválené volno",
    expired: "absence starší než šest měsíců, už se nepočítá",
    presentName: "přítomen",
    substituteName: "náhradník",
    absenceName: "absence",
    leaveName: "volno",
    expiredName: "vypršelá absence",
    month: "{n}. měsíc",
    /** Počitadla: do limitu 3 včetně, o jednu nad limit, víc nad limitem (T-010r). */
    absences: "absence {n} ze 3",
    absencesOverByOne: "absence {n}, o jednu nad limit",
    absencesOver: "absence {n}, nad limitem 3",
    substitutes: "náhradník {n} ze 3",
    substitutesOverByOne: "náhradník {n}, o jednu nad limit",
    substitutesOver: "náhradník {n}, nad limitem 3",
  },
} as const;
