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
  /** Nadpis rychlé navigace pod úvodem (T-010r3). */
  tocTitle: "Na stránce",
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
    /** Tisková příloha: citace, které už byly vytištěné výš (review T-008, S-4). */
    printRepeated: "Citace uvedené výš:",
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
  /**
   * Schéma vedení `leadership-chart` (iter-030). Texty: content-writer T-005
   * (texty_role_iter-030_T-005.md), schváleno gate T-006.
   */
  leadership: {
    legendTitle: "Co znamenají štítky ve schématu",
    /** Štítek u role ve schématu. */
    relations: {
      decides: "rozhoduje",
      approves: "musí souhlasit",
      advises: "radí",
      acts: "provádí",
      informed: "dozví se",
    },
    /** Začátek řádku v kompaktním pruhu („Rozhoduje: členský výbor"). */
    barLabels: {
      decides: "Rozhoduje",
      approves: "Musí souhlasit",
      advises: "Radí",
      acts: "Provádí",
      informed: "Dozví se",
    },
    /** Vysvětlení v legendě. */
    legend: {
      decides: "O věci rozhoduje.",
      approves: "Bez jeho souhlasu se dál nepokračuje.",
      advises: "Radí a pomáhá.",
      acts: "Dělá, co je v tom kroku potřeba.",
      informed: "Dostane informaci.",
    },
    /** Pruh bez zvýrazněné role (úvod), dřívější statusLabel úvodu. */
    barIdle: "Vedení chapteru",
    chapterBand: "Chapter",
    regionBand: "Region BNI, mimo chapter",
    notInCommittee: "není ve výboru",
  },
  /** Referenční část (iter-030, texty content-writer T-005, gate T-006). */
  reference: {
    rolesTitle: "Role jedna po druhé",
    decisionsTitle: "Kdo o čem rozhoduje",
    rightsTitle: "Co pravidla dávají BNI a regionu",
    inChart: "Ve schématu:",
    fields: {
      does: "Co dělá",
      decides: "Rozhoduje",
      approval: "Musí předem odsouhlasit někdo jiný",
      notDecides: "Nerozhoduje",
      notDefined: "Pravidla neurčují",
    },
    /**
     * Pole bez faktu (všech pět polí na každé kartě, gate T-006): jen znak
     * prázdné hodnoty, čtečka dostane `emptyFieldSr` (uživatel, T-010r2).
     */
    emptyField: "–",
    emptyFieldSr: "nic",
    columns: {
      situation: "Situace",
      decides: "Rozhoduje",
      approves: "Musí předem souhlasit",
      advises: "Radí, pomáhá, provádí",
      informed: "Dozví se",
      sources: "Zdroje",
    },
  },
  /** Patička tisku u stránek s odkazy na role (arch_iter-030 sekce 7.3). */
  roleLinks: {
    /** Za větu se doplní adresa a tečka: „Role jsou vysvětlené na /pravidla/role." */
    printNote: "Role jsou vysvětlené na",
    /** Odkaz v bublině u názvu role (T-010r4): stránka rolí / ostatní stránky. */
    popoverLinkSelf: "Přejít na kartu role →",
    popoverLinkOther: "Otevřít kartu role →",
  },
} as const;
