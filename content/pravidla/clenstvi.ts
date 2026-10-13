/**
 * Info stránka „Od hosta ke členovi" (/pravidla/clenstvi, iter-031, T-007a).
 *
 * Texty: content-writer T-005a (texty_clenstvi_iter-031_T-005a.md) s úpravami
 * 1 až 18 a bodem 4.3 z gate T-006a. Neměnit bez content-writera. Citace
 * přes `src`, `fact`, `refs` z `./fakta` (rejstřík série, H z
 * `clenstvi-zdroje.ts`, G a M z `role-zdroje.ts`, OM4 z `obor-zdroje.ts`).
 *
 * Kotvy z kontraktu (arch_iter-031_T-003s sekce 4) musí zůstat: `host`,
 * `navsteva`, `prihlaska`, `prestup`, `hlasovani`, `prijeti`, `odmitnuti`,
 * `orientace`, `passport`. Míří na ně jiné stránky série.
 */
import type { InfoPage } from "@/lib/info-pages/types";
import { CLENSTVI_COMICS, CLENSTVI_HERO } from "./clenstvi-komiksy";
import { fact, src } from "./fakta";

const OPS = "ops-manual-2022" as const;
const GP = "general-policies" as const;

/** Etapy vizuálu `process-track`, stejné pole u všech stavů stránky. */
const STAGES = ["Návštěva", "Přihláška", "Prověrka", "Rozhodnutí", "Orientace", "Passport", "Check-in"];

export const CLENSTVI_PAGE: InfoPage<"process-track"> = {
  slug: "clenstvi",
  title: "Od hosta ke členovi",
  description:
    "Jak se z hosta stane člen chapteru. Návštěvy, přihláška, hlasování výboru, první měsíce s mentory a check-in před obnovou.",
  updated: "2026-10-12",
  visual: "process-track",
  hero: CLENSTVI_HERO,

  toc: [
    { label: "Návštěva", anchor: "host" },
    { label: "Přihláška", anchor: "prihlaska" },
    { label: "Rozhodnutí", anchor: "hlasovani" },
    { label: "První měsíce", anchor: "orientace" },
    { label: "Přestup", anchor: "prestup" },
  ],

  situations: [
    { label: "Chci přivést hosta", anchor: "host" },
    { label: "Host váhá, může přijít znovu?", anchor: "prijdu-znovu" },
    { label: "Jak probíhá přihláška", anchor: "prihlaska" },
    { label: "Co čeká nového člena", anchor: "orientace" },
    { label: "Chci přestoupit z jiného chapteru", anchor: "prestup" },
  ],

  intro: {
    question: "Přišel jsi jako host a chceš zůstat. Kdo o tom rozhodne a co tě čeká?",
    lead: [
      "O přijetí rozhoduje členský výbor. Než bude hlasovat, projde tvou přihlášku a sejde se s tebou.",
      "Když na schůzku zveš hosta ty, čeká ho stejná cesta.",
    ],
    visual: {
      stages: STAGES,
      current: -1,
      srText:
        "Cesta od hosta ke členovi má sedm etap: návštěva, přihláška, prověrka, rozhodnutí, orientace, Passport s mentory a check-in.",
    },
  },

  steps: [
    {
      type: "scene",
      variant: "main",
      id: "host",
      label: "Krok 1",
      title: "Někdo z chapteru tě pozve",
      comic: CLENSTVI_COMICS["H1-1"],
      story: ["Známý z chapteru tě u kávy pozve na schůzku. Přijdeš jako host."],
      chapter: [
        fact("Členové chapteru přivádějí hosty a předávají si doporučení.", "H02"),
        {
          ...fact(
            "Host je podnikatel, který zjišťuje, jestli mu BNI a náš chapter dávají smysl. Přihlásit se může, když je jeho obor v chapteru volný.",
            "H11",
            "H10"
          ),
          link: { text: "obor v chapteru volný", href: "/pravidla/obor#jeden-obor" },
        },
        {
          ...fact(
            "Jako host můžeš přijít nejvýš dvakrát za šest měsíců. Na které schůzky hosté chodí, je na stránce schůzky.",
            "H01"
          ),
          link: { text: "Na které schůzky hosté chodí", href: "/pravidla/schuzka#rytmus" },
        },
        {
          ...fact(
            "Člen jiného chapteru k nám přichází jako hostující člen. Když chce přejít k nám, podá novou přihlášku.",
            "H95",
            "G15"
          ),
          link: { text: "přejít k nám", href: "#prestup" },
        },
        {
          ...fact("Kdo přijde místo člena, je náhradník. Pravidla pro náhradníky jsou na stránce schůzky.", "H13"),
          link: { text: "Pravidla pro náhradníky", href: "/pravidla/schuzka#nahradnik" },
        },
      ],
      chapterNotes: ["C15"],
      sourcesSummary: "General Policy #6 a #7, Administrative Policy #8, manuál str. 67 a 68",
      visual: {
        stages: STAGES,
        current: 0,
        outcome: "První návštěva",
        srText: "Jdeš na první schůzku jako host.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "navsteva",
      label: "Krok 2",
      title: "Na schůzce tě přivítají hostitelé",
      comic: CLENSTVI_COMICS["H1-2-3"],
      story: [
        "Ve čtvrtek ráno tě u dveří přivítá hostitel. Sedneš si mezi členy a sleduješ, jak schůzka běží.",
        "Po schůzce zůstaneš s hostiteli ještě chvíli.",
      ],
      chapter: [
        fact("Hostitelé tě přivítají a řeknou ti, co tě na schůzce čeká.", "M90", "H14"),
        fact("Seznámí tě se členy, jejichž obory se s tvým doplňují.", "H16"),
        {
          ...fact("Když je čas, krátce představíš svou firmu. Jak schůzka probíhá, je na stránce schůzky.", "H17"),
          link: { text: "Jak schůzka probíhá", href: "/pravidla/schuzka#program" },
        },
        fact(
          "Po schůzce tě hostitelé provedou orientací pro hosty. Vysvětlí ti přihlášku a pozvou tě, ať se přihlásíš.",
          "H15",
          "H18",
          "H19"
        ),
        fact("Nikdo na tebe netlačí. Dostaneš informace, které k rozhodnutí potřebuješ.", "H23"),
        fact(
          "Do dvou pracovních dnů ti hostitel zavolá a poděkuje za návštěvu. Když ses ještě nepřihlásil, pozve tě znovu.",
          "H21"
        ),
      ],
      sourcesSummary: "manuál str. 66 až 68 a 71",
      visual: {
        stages: STAGES,
        current: 0,
        outcome: "Návštěva 1 ze 2",
        srText: "Jsi na první schůzce. Jako host můžeš za šest měsíců přijít dvakrát.",
      },
    },
    {
      type: "branch",
      id: "po-navsteve",
      question: "Co dál po návštěvě?",
      options: [
        {
          tone: "good",
          id: "chci-se-prihlasit",
          label: "Možnost 1",
          title: "Chceš se přihlásit",
          story: ["Schůzka ti sedí a chceš se přidat."],
          chapter: [fact("Postup přihlášky ti hostitelé vysvětlí na orientaci pro hosty.", "H19")],
          next: "prihlaska",
          nextLabel: "Jak probíhá přihláška",
          sourcesSummary: "manuál str. 67",
          visual: {
            stages: STAGES,
            current: 0,
            outcome: "Chceš se přihlásit",
            srText: "Návštěva je za tebou a chceš se přihlásit.",
          },
        },
        {
          tone: "neutral",
          id: "prijdu-znovu",
          label: "Možnost 2",
          title: "Ještě váháš",
          story: ["Líbilo se ti tam, ale ještě se nechceš rozhodnout."],
          chapter: [
            {
              ...fact("Když váháš, hostitel tě pozve na další otevřenou schůzku.", "H20"),
              link: { text: "otevřenou schůzku", href: "/pravidla/schuzka#rytmus" },
            },
            fact(
              "Za šest měsíců můžeš jako host přijít nejvýš dvakrát. Kdy můžeš přijít znovu, ti řekne tým hostitelů.",
              "H01"
            ),
          ],
          sourcesSummary: "General Policy #7, manuál str. 67",
          visual: {
            stages: STAGES,
            current: 0,
            outcome: "Druhá návštěva",
            srText: "Přijdeš na schůzku podruhé.",
          },
        },
        {
          tone: "neutral",
          id: "obor-obsazeny",
          label: "Možnost 3",
          title: "Tvůj obor už v chapteru někdo má",
          story: ["Na schůzce zjistíš, že tvůj obor už v chapteru zastupuje jiný člen."],
          chapter: [
            {
              ...fact("Přihlásit se můžeš jen do oboru, který je v chapteru volný.", "H10"),
              link: { text: "do oboru, který je v chapteru volný", href: "/pravidla/obor#jeden-obor" },
            },
            fact(
              "Když je tvůj obor obsazený, hostitelé dají vědět konzultantovi regionu. Ten s tebou probere, jak můžeš v BNI pokračovat.",
              "H94",
              "M91"
            ),
          ],
          sourcesSummary: "manuál str. 67",
          visual: {
            stages: STAGES,
            current: 0,
            outcome: "Obor je obsazený",
            srText: "Tvůj obor je v chapteru obsazený. Pomůže ti konzultant regionu.",
          },
        },
      ],
    },
    {
      type: "scene",
      variant: "main",
      id: "prihlaska",
      label: "Krok 3",
      title: "Pošleš přihlášku",
      comic: CLENSTVI_COMICS["H2-1"],
      story: ["Večer doma vyplníš přihlášku."],
      chapter: [
        {
          ...fact("V přihlášce uvedeš jeden obor ze seznamu oborů BNI. Ten budeš v chapteru zastupovat.", "H32"),
          link: { text: "jeden obor ze seznamu oborů BNI", href: "/pravidla/obor#vyber-oboru" },
        },
        fact("Vybereš si členství na rok, nebo na dva roky.", "H33", "H06"),
        fact(
          "Při přihlášce platíš vstupní poplatek. Výši a pokyny k platbě ti řekne sekretář/pokladník.",
          "H05",
          "G8"
        ),
        {
          ...fact(
            "Zaplacené poplatky se po přijetí nevracejí. Když později odejdeš, můžeš požádat o kredit.",
            "H43",
            "G12"
          ),
          link: { text: "požádat o kredit", href: "/pravidla/absence#odchod-s-kreditem" },
        },
        fact(
          "Podpisem přihlášky souhlasíš, že výbor smí kontaktovat tvoje reference. Dej jim předem vědět, že se jim může ozvat.",
          "H36",
          "H97"
        ),
        fact("Novou přihlášku podává i ten, kdo už v BNI byl.", "H34"),
        fact(
          "Členem můžeš být jen v jednom chapteru. Nesmíš být ani v jiné síti, kde se členové zavazují předávat si doporučení.",
          "H03",
          "H04"
        ),
      ],
      sourcesSummary: "General Policy #4, Administrative Policy #1 a #5, manuál str. 44, 45 a 47",
      visual: {
        stages: STAGES,
        current: 1,
        srText: "Posíláš přihlášku s jedním oborem a referencemi.",
      },
    },
    {
      type: "scene",
      variant: "detour",
      id: "prestup",
      label: "Odbočka",
      title: "Přecházíš z jiného chapteru",
      story: ["Jsi členem jiného chapteru BNI a stěhuješ se. Chceš přejít k nám."],
      chapter: [
        fact(
          "Důvodem přestupu bývá stěhování, nově přidělené území nebo nová práce v oboru, který je v dosavadním chapteru obsazený.",
          "H90"
        ),
        fact(
          "Do nového chapteru podáš novou přihlášku. Výbor ji posoudí stejně jako u každého uchazeče.",
          "G15",
          "H35"
        ),
        fact(
          "Náš chapter se obrátí na konzultanta regionu a ten ho postupem provede. Začít můžeš hned, slouží k tomu formulář žádosti o přestup.",
          "M48",
          "H91",
          "H92"
        ),
        fact("Přestup trvá dva až tři týdny.", "H89"),
        fact(
          "Když ti zbývá méně než šest zaplacených měsíců, zaplatíš obnovu. Když víc, nic navíc neplatíš. Po přijetí se ti zbylý čas převede.",
          "H07",
          "H09",
          "H08"
        ),
        {
          ...fact(
            "Kredit za nevyužitou část členství dostaneš na požádání při odchodu z BNI. Při přestupu do sousedního chapteru se nevydává, převede se zbylý čas.",
            "G12",
            "M54"
          ),
          link: { text: "při odchodu z BNI", href: "/pravidla/absence#odchod-s-kreditem" },
        },
        {
          ...fact("Na návštěvě v jiném chapteru jsi hostující člen. Pravidla návštěv jsou na stránce schůzky.", "H95"),
          link: { text: "Pravidla návštěv", href: "/pravidla/schuzka#jiny-chapter" },
        },
      ],
      sourcesSummary: "Administrative Policy #5 a #8, manuál str. 45, 51, 56 a 68",
      visual: {
        stages: STAGES,
        current: 1,
        outcome: "Přestup",
        srText: "Přecházíš z jiného chapteru. Podáváš novou přihlášku.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "proverka",
      label: "Krok 4",
      title: "Výbor si tě prověří",
      comic: CLENSTVI_COMICS["H2-2"],
      story: [
        "Může se stát, že ti obchodní partner napíše, že mu volal někdo z chapteru a ptal se na vaši spolupráci.",
      ],
      chapter: [
        fact(
          "Před přijetím výbor ověří, že jsi ve svém oboru kvalitní profesionál a že tvůj obor do chapteru zapadá.",
          "H24",
          "M41",
          "M103"
        ),
        fact(
          "Prověrku si rozdělí členové výboru. Hlídají, aby se přihlášky posuzovaly včas.",
          "H26",
          "H98"
        ),
        fact(
          "Výbor se může podívat na web tvé firmy a na veřejně dostupné informace.",
          "H28"
        ),
        fact("Když najde něco negativního, musí ověřit, že se to opravdu týká tebe.", "H29"),
        {
          ...fact("Případný překryv tvého oboru s oborem některého člena se vyřeší před přijetím.", "OM4"),
          link: { text: "překryv tvého oboru s oborem některého člena", href: "/pravidla/obor#jeden-obor" },
        },
        fact("Výbor může zavolat některým tvým referencím.", "H36"),
      ],
      sourcesSummary: "manuál str. 30, 39, 40, 42, 44 a 45",
      visual: {
        stages: STAGES,
        current: 2,
        srText: "Výbor tě prověřuje a může zavolat tvým referencím.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "pohovor",
      label: "Krok 5",
      title: "Pohovor s výborem",
      comic: CLENSTVI_COMICS["H2-3"],
      story: ["Sejdeš se s členy výboru u kávy a probíráte, co od chapteru čekáš."],
      chapter: [
        {
          ...fact("Výbor s tebou projde pravidla docházky.", "H39"),
          link: { text: "pravidla docházky", href: "/pravidla/absence#uvod" },
        },
        fact("Zeptá se, jestli zvládneš program pro nové členy zhruba do 60 dnů od přijetí.", "H40"),
        fact("Každý člen prochází Passportem, programem s mentory.", "H41"),
        fact(
          "Pohovor je oboustranný. Přihláška ještě přijatá není a výbor se ptá i tebe, jestli ti chapter sedí.",
          "H44"
        ),
      ],
      sourcesSummary: "manuál str. 46 a 47",
      visual: {
        stages: STAGES,
        current: 2,
        outcome: "Pohovor",
        srText: "Máš pohovor s výborem. Ptá se výbor a ptáš se i ty.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "hlasovani",
      label: "Krok 6",
      title: "Výbor hlasuje",
      comic: CLENSTVI_COMICS["H3-1"],
      story: ["Po pohovoru se výbor sejde a o tvé přihlášce hlasuje."],
      chapter: [
        fact("Viceprezident určí termín a svolá poradu, na které výbor o přihlášce hlasuje.", "M31"),
        fact("Výsledek se dozvíš do další schůzky.", "M45"),
      ],
      chapterNotes: ["C11"],
      sourcesSummary: "manuál str. 40 a 47",
      visual: {
        stages: STAGES,
        current: 3,
        srText: "Výbor o tvé přihlášce hlasuje. Výsledek se dozvíš do další schůzky.",
      },
    },
    {
      type: "branch",
      id: "vysledek",
      question: "Jak výbor rozhodne?",
      options: [
        {
          tone: "good",
          id: "prijeti",
          label: "Možnost 1",
          title: "Výbor tě přijme",
          comic: CLENSTVI_COMICS["H3-2"],
          story: ["Výbor tvou přihlášku schválí. Na otevřené schůzce tě prezident uvede mezi členy."],
          chapter: [
            fact("Po schválení ti zavolá prezident a přivítá tě v chapteru.", "M20"),
            fact("Na schůzce tě slavnostně uvedou mezi členy.", "H56"),
            {
              ...fact("Členové s tebou ve stoje přednesou etický kodex BNI.", "H57"),
              link: { text: "etický kodex BNI", href: "/pravidla/kodex" },
            },
            fact("Členové slíbí, že tě podpoří, než se v chapteru zabydlíš.", "H58"),
          ],
          chapterNotes: ["C22"],
          next: "orientace",
          nextLabel: "Co tě čeká po přijetí",
          sourcesSummary: "manuál str. 14 a 35",
          visual: {
            stages: STAGES,
            current: 3,
            outcome: "Přijetí",
            srText: "Výbor tě přijal. Na otevřené schůzce tě uvede prezident.",
          },
        },
        {
          tone: "neutral",
          id: "odmitnuti",
          label: "Možnost 2",
          title: "Přihláška neprojde",
          story: [
            "Výbor tvou přihlášku nepřijme. Důvod nemusí souviset s kvalitou tvé práce, může to být třeba překryv s oborem jiného člena.",
          ],
          chapter: [
            {
              ...fact(
                "Pravidla uvádějí jen příklady důvodů. Patří k nim překryv oborů, obor, který pro uchazeče není hlavní činností, námitky členů ke kvalitě nebo etice a chybějící oprávnění. Dál členství v konkurenční síti, neúplná přihláška, nemožnost působit v regionu chapteru, nebo když uchazeč nesedí do skladby chapteru. Výbor může mít i jiný důvod.",
                "M46",
                "M47",
                "H45",
                "H46",
                "H47",
                "H48",
                "H49",
                "H50",
                "H51"
              ),
              link: { text: "obor, který pro uchazeče není hlavní činností", href: "/pravidla/obor#hlavni-profese" },
            },
            {
              ...fact(
                "Když je důvodem obsazený obor, konzultant regionu s tebou probere, jak můžeš v BNI pokračovat.",
                "M91"
              ),
              link: { text: "obsazený obor", href: "/pravidla/obor#jeden-obor" },
            },
          ],
          // Uživatel 13. 10. (rozhodnuti_po_gate bod 4): místo úpravy 4 z T-012p C17.
          chapterNotes: ["C17"],
          sourcesSummary: "manuál str. 51 a 67",
          visual: {
            stages: STAGES,
            current: 3,
            outcome: "Přihláška neprošla",
            ended: true,
            srText: "Přihláška neprošla. Další etapy pro tebe nenásledují.",
          },
        },
      ],
    },
    {
      type: "scene",
      variant: "main",
      id: "orientace",
      label: "Krok 7",
      title: "Hned po schůzce: orientace nového člena",
      comic: CLENSTVI_COMICS["H4-1"],
      story: ["Schůzka skončí a ostatní odcházejí do práce. Ty zůstaneš s koordinátorem mentorů."],
      chapter: [
        fact(
          "Dostaneš Passport a hned po schůzce máš s koordinátorem mentorů orientaci nového člena.",
          "H61"
        ),
        {
          ...fact(
            "Dozvíš se, že tě čeká program pro nové členy. Projdeš ho dřív, než budeš mít hlavní prezentaci.",
            "H59",
            "H40"
          ),
          link: { text: "hlavní prezentaci", href: "/pravidla/schuzka#hlavni-prezentace" },
        },
        fact(
          "Tvoje první schůzka jeden na jednoho, tedy osobní schůzka ve dvou, je s koordinátorem mentorů.",
          "H62"
        ),
      ],
      chapterNotes: ["C9"],
      sourcesSummary: "manuál str. 20, 47 a 78",
      visual: {
        stages: STAGES,
        current: 4,
        srText: "Jsi nový člen. Hned po schůzce máš orientaci s koordinátorem mentorů.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "passport",
      label: "Krok 8",
      title: "Passport a mentoři",
      comic: CLENSTVI_COMICS["H4-2"],
      story: [
        "Každý týden se u kávy potkáš s jiným členem chapteru. Postupně tak poznáš lidi, se kterými se ve čtvrtek vídáš.",
      ],
      chapter: [
        fact("Passport vede koordinátor mentorů s proškolenými mentory.", "H75", "M96", "M97"),
        fact(
          "Stačí jedna schůzka jeden na jednoho týdně a na pořadí nezáleží. Mentoři počítají s tím, že se jim ozveš.",
          "H65",
          "H66",
          "H64"
        ),
        fact("Jednu schůzku máš i s konzultantem regionu.", src("H67", "Manuál uvádí i ambasadora chapteru.")),
        fact("Koordinátor mentorů se ti každý týden ozve a pomůže ti Passport dokončit.", "H103", "H71"),
        fact("Na Passport počítej zhruba s 12 týdny. Nikdo nečeká, že ho projdeš rychle.", "H69", "H104"),
        fact("Součástí Passportu je i služba v týmu hostitelů.", "H73"),
        fact(
          "Na měsíčním setkání vedení se probírá, jak noví členové postupují. Kdo nestíhá, dostane pomoc.",
          "H74"
        ),
      ],
      chapterNotes: ["C13"],
      sourcesSummary: "manuál str. 29, 32, 67, 75, 78 a 79",
      visual: {
        stages: STAGES,
        current: 5,
        outcome: "Zhruba 12 týdnů",
        srText: "Procházíš Passportem s mentory. Počítej zhruba s 12 týdny.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "check-in",
      label: "Krok 9",
      title: "Před obnovou: check-in",
      comic: CLENSTVI_COMICS["H4-3"],
      story: [
        "Od přijetí uběhlo sedm měsíců. Člen výboru tě pozve na kávu a probere s tebou, jak se ti v chapteru daří.",
      ],
      chapter: [
        fact(
          "Check-in je rozhovor pět měsíců před obnovou členství, u ročního členství tedy po sedmi měsících. Opakuje se před každou obnovou.",
          "H82"
        ),
        fact("Termíny hlídá člen výboru pro zapojení členů. Rozhovor svěří některému členovi výboru.", "H76", "H77"),
        fact(
          "Rozhovor vede člen výboru, se kterým máš dobrý vztah, ale ne tak blízký, aby rozhovor nebyl věcný.",
          "H79",
          "H83"
        ),
        fact("Předem dostaneš přehled své aktivity v chapteru.", "H80"),
        fact(
          "Cílem je, abys měl jasno, jak se ti v chapteru daří, z tvého pohledu i z pohledu výboru.",
          "H78"
        ),
        fact("Z rozhovoru může vzejít plán a výbor ti případně najde mentora.", "H86", "H85"),
        {
          ...fact(
            "Když se ti v chapteru nedaří, výbor může rozhodnout o zkušební době do konce členství. Během ní se s výborem domluvíte na konkrétních krocích.",
            "H87",
            "SM34"
          ),
          link: { text: "zkušební době", href: "/pravidla/stiznosti#zkusebni-doba" },
        },
        fact("Nic z toho pro tebe nemá být překvapení.", "H84"),
      ],
      sourcesSummary: "manuál str. 33, 52, 53 a 59",
      visual: {
        stages: STAGES,
        current: 6,
        outcome: "5 měsíců před obnovou",
        srText: "Máš check-in pět měsíců před obnovou členství. Opakuje se před každou obnovou.",
      },
    },
  ],

  summary: {
    title: "Ve zkratce",
    goals: [1, 2, 3, 4, 5, 6],
    points: [
      {
        goal: 1,
        text: "Jako host můžeš přijít nejvýš dvakrát za šest měsíců. Po schůzce tě hostitelé provedou orientací pro hosty.",
      },
      {
        goal: 2,
        text: "V přihlášce uvedeš jeden obor a reference. Přihlásit se můžeš jen do volného oboru.",
      },
      {
        goal: 3,
        text: "Výbor tě prověří, sejde se s tebou a o přihlášce hlasuje. Výsledek se dozvíš do další schůzky.",
      },
      {
        goal: 4,
        text: "Důvody nepřijetí jsou v pravidlech jen příklady a výbor může mít i jiný. Když je obor obsazený, poradí ti konzultant regionu.",
      },
      {
        goal: 5,
        text: "Po přijetí máš orientaci a Passport s mentory, počítej zhruba s 12 týdny. Program pro nové členy projdeš ještě před svou hlavní prezentací.",
      },
      {
        goal: 6,
        text: "Před každou obnovou máš check-in a nic z něj pro tebe nemá být překvapení. Z jiného chapteru k nám přestoupíš novou přihláškou.",
      },
    ],
    whereToFind: [
      { doc: GP, page: 1, rule: "General Policy #7", labelCs: "návštěvy hostů" },
      { doc: GP, page: 2, rule: "Administrative Policy #1", labelCs: "vstupní poplatek a délka členství" },
      { doc: GP, page: 3, rule: "Administrative Policy #8", labelCs: "přestup do jiného chapteru" },
      { doc: OPS, page: 14, labelCs: "uvedení nového člena na schůzce" },
      { doc: OPS, page: 42, labelCs: "prověrka přihlášky" },
      { doc: OPS, page: 46, labelCs: "pohovor s uchazečem" },
      { doc: OPS, page: 51, labelCs: "důvody nepřijetí a přestup" },
      { doc: OPS, page: 52, labelCs: "check-in před obnovou" },
      { doc: OPS, page: 66, labelCs: "tým hostitelů a hosté" },
      { doc: OPS, page: 78, labelCs: "orientace nového člena a Passport" },
    ],
  },

  contacts: [
    { role: "Tým hostitelů", when: "Když jsi host a chceš vědět, jak se přihlásit nebo kdy můžeš přijít znovu." },
    { role: "Člen výboru pro posouzení přihlášek", when: "Když se ptáš, jak je na tom tvoje přihláška." },
    { role: "Koordinátor mentorů", when: "Když máš otázku k Passportu nebo k mentorům." },
    { role: "Konzultant regionu", when: "Když přecházíš z jiného chapteru." },
  ],

  disclaimer: [
    "Tahle stránka je výklad našeho chapteru.",
    "Vychází z BNI Chapter Operations Manual 2022-2023, platného od 27. 7. 2022, a z BNI General Policies.",
    "Stav k {updated}.",
  ],
};
