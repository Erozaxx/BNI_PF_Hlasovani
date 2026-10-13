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
    /** Souhrn skupiny situací: název stránky a počet situací. */
    groupSummary: "{title} · {count}",
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
    substitutes: "náhradník {n}",
    substitutesOverByOne: "náhradník {n}",
    substitutesOver: "náhradník {n}",
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
  /**
   * Postup v etapách `process-track` (iter-031, clenstvi a stiznosti). Texty:
   * content-writer T-005c, schváleno gate T-006c. `{label}` = název etapy,
   * nebo `outcome` stavu.
   */
  processTrack: {
    position: "Etapa {n} ze {total}: {label}",
    /** Úvod (`current = -1`), žádná etapa nesvítí. */
    overview: "Celkem {total} etap",
    ariaLabel: "Kde právě jsi",
  },
  /**
   * Program otevřené schůzky `meeting-agenda` (iter-031, schuzka). Texty:
   * content-writer T-012w, schváleno gate T-012w2 (pořadí podle rozhodnutí
   * uživatele 13. 10. 2026). Bloky bez času, délka je v názvu („Představení
   * členů, každý 30 sekund"). Prázdný `time` = řádek jen s názvem.
   */
  agenda: {
    blocks: {
      uvod: { time: "", name: "Prezident: BNI, hodnoty a noví členové" },
      seznam: { time: "", name: "Tým hostitelů: seznam hostů a změny" },
      clenove: { time: "", name: "Představení členů, každý 30 sekund" },
      hoste: { time: "", name: "Představení hostů, každý 60 sekund" },
      vzdelavani: { time: "", name: "Vzdělávací okénko, 5 minut" },
      prezentace: { time: "", name: "Hlavní prezentace, 5 minut" },
      zprava: { time: "", name: "Zpráva viceprezidenta: čísla chapteru" },
      doporuceni: { time: "", name: "Doporučení a reference" },
      networking: { time: "", name: "Volný networking" },
    },
    /** Oddělovač času a názvu, použije se jen u neprázdného času. */
    separator: " · ",
    /** Pruh bez zvýraznění (`current: []`). */
    idle: "Program otevřené schůzky",
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
