/**
 * Info stránka „Etický kodex" (/pravidla/kodex, iter-031, T-007e).
 *
 * Texty: content-writer T-005e (texty_kodex_iter-031_T-005e.md) s úpravami
 * gate T-006e (gate_iter-031_T-006e.md, sekce 3 a 4), u dotčených míst odkaz
 * „Gate T-006e". Neměnit bez content-writera. Znění sedmi bodů a faktů KM1+KM2,
 * KM3 je schválené u stránky stížností (T-005c, gate T-006c) a stojí tu beze
 * změny. Citace přes `src`, `fact`, `refs` z `./fakta` (rejstřík
 * `kodex-zdroje.ts`, sdílené H57 a G2). Pole `obligation` se nevyplňuje.
 * Bez jmen a konkrétních případů, kontakty jsou na stránce stížností.
 *
 * Kotvy z kontraktu (arch_iter-031_T-001e sekce 7), míří na ně jiné stránky
 * a rozcestník: `slib`, `kodex-1` až `kodex-7`, `v-praxi`, `hodnoty`.
 * Stránka `stiznosti` odkazuje na `hodnoty` (fakt G2 v kroku `posouzeni`).
 */
import type { InfoPage } from "@/lib/info-pages/types";
import { fact, refs } from "./fakta";
import { KODEX_COMICS, KODEX_HERO } from "./kodex-komiksy";

export const KODEX_PAGE: InfoPage<"none"> = {
  slug: "kodex",
  title: "Etický kodex",
  description:
    "Etický kodex BNI má sedm bodů a každý člen se k němu zavazuje při přijetí. Podle něj výbor posuzuje spory.",
  updated: "2026-10-13",
  visual: "none",
  hero: KODEX_HERO,
  situations: [
    { label: "Co je etický kodex BNI", anchor: "slib" },
    { label: "Moje profese má vlastní kodex. Co platí?", anchor: "kodex-7" },
    { label: "Platí kodex i na situace, které v něm nejsou?", anchor: "v-praxi" },
    { label: "Co jsou hodnoty BNI", anchor: "hodnoty" },
  ],
  toc: [
    { label: "Slib", anchor: "slib" },
    { label: "Sedm bodů", anchor: "kodex-1" },
    { label: "V praxi", anchor: "v-praxi" },
    { label: "Hodnoty BNI", anchor: "hodnoty" },
  ],
  intro: {
    question: "Co slibuješ, když tě do chapteru přijmou?",
    lead: [
      // Gate T-006e, úprava 3.1: jeden odstavec, věta o stejných pravidlech pryč.
      "Slíbíš, že budeš dodržovat etický kodex BNI. Má sedm bodů a stejný slib dává každý člen.",
    ],
    visual: {},
  },
  steps: [
    {
      type: "scene",
      variant: "main",
      id: "slib",
      label: "Slib",
      title: "Při přijetí slíbíš kodex dodržovat",
      story: [
        "Výbor tvoji přihlášku schválil. Na otevřené schůzce tě uvedou mezi členy.",
        "Kodex přednesete společně.",
      ],
      chapter: [
        fact("Při přijetí do BNI se každý člen zavazuje kodex dodržovat.", "KM3"),
        fact("Když chapter uvádí nového člena, všichni členové s ním ve stoje přednesou etický kodex.", "H57"),
        fact("Přednes kodexu závazek potvrzuje.", "KM4"),
      ],
      chapterNotes: ["C22"],
      sourcesSummary: "manuál str. 7, 14 a 15",
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "kodex-1",
      label: "Bod 1",
      // Gate T-006e, úprava 3.2.
      title: "Dodržíš kvalitu a cenu z nabídky",
      story: ["Jsi truhlář a nabídl jsi zákazníkovi police.", "Dodáš je v kvalitě a za cenu z nabídky."],
      chapter: [fact("Poskytnu služby v kvalitě a za ceny, které jsem nabídl.", "KG1")],
      sourcesSummary: "General Policies, Code of Ethics",
      comic: KODEX_COMICS["kodex-1"],
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "kodex-2",
      label: "Bod 2",
      // Gate T-006e, úprava 3.5.
      title: "Jednáš pravdivě",
      story: ["Zákazník z doporučení chce termín co nejdřív.", "Ty mu řekneš ten, který opravdu stihneš."],
      chapter: [fact("Budu jednat pravdivě se členy i s lidmi, které od nich dostanu jako doporučení.", "KG2")],
      sourcesSummary: "General Policies, Code of Ethics",
      comic: KODEX_COMICS["kodex-2"],
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "kodex-3",
      label: "Bod 3",
      title: "Buduješ dobré vztahy a důvěru",
      // Gate T-006e, úprava 3.3.
      story: ["Znáš dva lidi, kteří si můžou navzájem pomoct.", "Propojíš je."],
      chapter: [fact("Budu budovat dobré vztahy a důvěru se členy i s lidmi z jejich doporučení.", "KG3")],
      sourcesSummary: "General Policies, Code of Ethics",
      comic: KODEX_COMICS["kodex-3"],
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "kodex-4",
      label: "Bod 4",
      title: "Na doporučení se ozveš",
      // Gate T-006e, úprava 3.4.
      story: ["Jiný člen ti předá doporučení na zákazníka.", "Zákazníkovi se ozveš."],
      chapter: [fact("Na doporučení, která dostanu, se ozvu. Je to moje odpovědnost.", "KG4")],
      sourcesSummary: "General Policies, Code of Ethics",
      comic: KODEX_COMICS["kodex-4"],
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "kodex-5",
      label: "Bod 5",
      title: "Máš pozitivní a vstřícný přístup",
      story: ["Člen chapteru má na schůzce hlavní prezentaci.", "Podpoříš ho."],
      chapter: [fact("Budu mít pozitivní a vstřícný přístup.", "KG5")],
      sourcesSummary: "General Policies, Code of Ethics",
      comic: KODEX_COMICS["kodex-5"],
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "kodex-6",
      label: "Bod 6",
      // Gate T-006e, úprava 3.6.
      title: "Držíš se etiky své profese",
      story: ["Jsi elektrikář.", "Práci děláš podle etických pravidel své profese."],
      chapter: [fact("Budu dodržovat etická pravidla své profese.", "KG6")],
      sourcesSummary: "General Policies, Code of Ethics",
      comic: KODEX_COMICS["kodex-6"],
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "kodex-7",
      label: "Bod 7",
      title: "Řídíš se přísnějším kodexem své profese",
      // Gate T-006e, úprava 3.7.
      story: ["Tvoje profese má vlastní kodex, přísnější než kodex BNI.", "Řídíš se jím."],
      chapter: [
        fact("Když má moje profese vlastní kodex s přísnějšími pravidly, řídím se tím přísnějším.", "KG7"),
      ],
      sourcesSummary: "General Policies, Code of Ethics",
      comic: KODEX_COMICS["kodex-7"],
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "v-praxi",
      label: "V praxi",
      title: "Kodex platí i tam, kde situace není vyjmenovaná",
      story: ["Nastane spor, který žádný ze sedmi bodů přesně nepopisuje."],
      chapter: [
        fact("Kodex není výčet konkrétních situací. Výbor ho v principu použije skoro na každý spor.", "KM1", "KM2"),
        {
          // Gate T-004e 3.1: jeden fakt, jeden odkaz.
          ...fact("Když člen kodex nedodržuje, výbor mu může dát zkušební dobu nebo uvolnit jeho místo.", "G2"),
          link: { text: "zkušební dobu", href: "/pravidla/stiznosti#posouzeni" },
        },
      ],
      sourcesSummary: "General Policies (úvod), manuál str. 7",
      visual: {},
    },
  ],
  sections: [
    {
      id: "hodnoty",
      title: "Hodnoty BNI",
      ordered: true,
      items: [
        {
          id: "hodnota-1",
          // Gate T-006e, úprava 3.8.
          text: "Givers Gain: buď ochotný dávat dřív, než čekáš, že něco získáš.",
          sources: refs("KM5"),
        },
        {
          id: "hodnota-2",
          text: "Budování vztahů: silné vztahy vytvářejí prostředí důvěry a podpory, které přináší radost, příležitosti a smysl.",
          sources: refs("KM6"),
        },
        {
          id: "hodnota-3",
          text: "Celoživotní učení: investuj do sebe, abys byl lídrem, jakým chceš být.",
          sources: refs("KM7"),
        },
        {
          id: "hodnota-4",
          text: "Tradice a inovace: ctíme své tradice a díváme se do lepší budoucnosti, kterou pohání inovace, optimismus a nadšení.",
          sources: refs("KM8"),
        },
        {
          id: "hodnota-5",
          text: "Pozitivní přístup: na všem, co se nám stane, najdeme něco dobrého a to posouvá náš život dál.",
          sources: refs("KM9"),
        },
        {
          id: "hodnota-6",
          text: "Odpovědnost: dodržujeme sliby, které dáme, zvlášť když je to těžké.",
          sources: refs("KM10"),
        },
        {
          id: "hodnota-7",
          text: "Uznání: víme, že uznání pohání růst úspěšných organizací.",
          sources: refs("KM11"),
        },
      ],
    },
  ],
  summary: {
    title: "Ve zkratce",
    goals: [1, 2, 3, 4, 5],
    points: [
      {
        goal: 1,
        text: "Kodex slíbí každý člen při přijetí. Na otevřené schůzce ho s novým členem přednesou všichni ve stoje.",
      },
      {
        goal: 2,
        text: "Kodex má sedm bodů. Týkají se nabídky a ceny, pravdivosti, důvěry, doporučení, přístupu a etiky tvé profese.",
      },
      { goal: 3, text: "Když má tvoje profese přísnější kodex, řídíš se jím." },
      {
        goal: 4,
        // Gate T-006e, úprava 3.9: bez odkazu, jedna věta o stížnostech.
        text: "Kodex platí v principu i na situace, které nevyjmenovává. Výbor podle něj posuzuje spory, celý postup je na stránce stížnosti.",
      },
      {
        goal: 5,
        text: "Hodnot BNI je sedm: Givers Gain, budování vztahů, celoživotní učení, tradice a inovace, pozitivní přístup, odpovědnost a uznání.",
      },
    ],
    whereToFind: [
      {
        doc: "general-policies",
        page: 1,
        rule: "General Policies, úvod",
        labelCs: "pravomoc výboru",
      },
      { doc: "general-policies", page: 2, rule: "Code of Ethics", labelCs: "etický kodex" },
      { doc: "ops-manual-2022", page: 6, labelCs: "hodnoty BNI" },
      { doc: "ops-manual-2022", page: 7, labelCs: "etický kodex a hodnoty BNI" },
      { doc: "ops-manual-2022", page: 14, labelCs: "uvedení nového člena" },
      { doc: "ops-manual-2022", page: 15, labelCs: "přednes kodexu při uvedení nových členů" },
    ],
  },
  contacts: [],
  disclaimer: [
    "Tahle stránka je výklad našeho chapteru.",
    "Vychází z BNI Chapter Operations Manual 2022-2023, platného od 27. 7. 2022, a z BNI General Policies.",
    "Stav k {updated}.",
  ],
};
