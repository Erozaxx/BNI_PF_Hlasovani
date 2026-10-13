/**
 * Info stránka „Jak probíhá čtvrteční schůzka" (/pravidla/schuzka, iter-031).
 *
 * Texty: content-writer T-005d (texty_schuzka_iter-031_T-005d.md) se sedmi
 * úpravami gate T-006d (gate_iter-031_T-006d.md, sekce 3) a rozhodnutím
 * orchestrátora po gate („vzdělávací okénko"). Program otevřené schůzky podle
 * našeho pořadí: content-writer T-012w (texty_schuzka_program_iter-031_T-012w.md),
 * gate T-012w2. Neměnit bez content-writera.
 * Citace přes `src`, `fact`, `refs` z `./fakta` (rejstřík `schuzka-zdroje.ts`
 * a převzaté G, H, M). Pole `obligation` se nevyplňuje. Žádná jména ani
 * konkrétní případy. Kotvy `program`, `predstaveni`, `hlavni-prezentace`,
 * `pozdni-prichod`, `nahradnik`, `jiny-chapter`, `rytmus` drží kontrakt
 * kotev (arch_iter-031_T-003s sekce 4), míří na ně jiné stránky.
 */
import type { InfoPage } from "@/lib/info-pages/types";
import { fact } from "./fakta";
import { SCHUZKA_C5, SCHUZKA_COMICS, SCHUZKA_HERO } from "./schuzka-komiksy";

const [C2_PREDSTAVENI, C2_PREZENTACE, C2_DOPORUCENI] = SCHUZKA_COMICS.C2.panels;

export const SCHUZKA_PAGE: InfoPage<"meeting-agenda"> = {
  slug: "schuzka",
  title: "Jak probíhá čtvrteční schůzka",
  description:
    "Program otevřené čtvrteční schůzky od příchodu po volný networking. Co se čeká od tebe, kdy máš hlavní prezentaci a co dělá náhradník.",
  updated: "2026-10-13",
  visual: "meeting-agenda",
  hero: SCHUZKA_HERO,

  toc: [
    { label: "Schůzka krok za krokem", anchor: "pred-schuzkou" },
    { label: "Když nemůžeš na schůzku", anchor: "nestihnes" },
    { label: "Náhradník", anchor: "nahradnik" },
    { label: "Jiný chapter", anchor: "jiny-chapter" },
    { label: "Otevřená a interní schůzka", anchor: "rytmus" },
  ],

  situations: [
    // Gate T-006d, úprava 3.7.
    { label: "Posílám za sebe náhradníka", anchor: "nahradnik" },
    { label: "Přijdu pozdě nebo odejdu dřív", anchor: "pozdni-prichod" },
    { label: "Kdy budu mít hlavní prezentaci", anchor: "hlavni-prezentace" },
    { label: "Chci navštívit jiný chapter", anchor: "jiny-chapter" },
  ],

  intro: {
    question: "Čtvrtek ráno, schůzka chapteru. Co tě na ní čeká?",
    lead: ["Otevřená schůzka má pevný program a vede ji prezident.", "Každá druhá schůzka je u nás interní, bez hostů."],
    visual: {
      current: [],
      srText:
        "Program otevřené schůzky. Prezident představí BNI a jeho hodnoty a uvede nové členy. Tým hostitelů uvede seznam hostů a změny. Členové se představují 30 sekund každý, hosté 60 sekund každý. Pak je vzdělávací okénko, 5 minut, a hlavní prezentace, 5 minut. Viceprezident řekne čísla chapteru. Následují doporučení a reference. Na konci je volný networking.",
    },
  },

  steps: [
    {
      type: "scene",
      variant: "main",
      id: "pred-schuzkou",
      label: "Schůzka, krok 1",
      title: "Příchod",
      comic: SCHUZKA_COMICS.C1,
      story: [
        "Ve čtvrtek ráno přijdeš na začátek schůzky. U dveří už stojí hostitelé a vítají první hosty.",
        "Pozdravíš kolegy i hosty. Pak program otevře prezident.",
      ],
      chapter: [
        fact("Schůzka jde podle programu.", "QM2"),
        fact("Přijď včas a zůstaň až do konce. Na spolehlivosti stojí vztahy v chapteru.", "QG1", "QM37"),
        {
          ...fact("Vedení a hostitelé přijdou aspoň 15 minut před začátkem, aby přivítali hosty.", "QM3", "QM31"),
          link: { text: "Vedení", href: "/pravidla/role#vedeni" },
        },
      ],
      sourcesSummary: "General Policy #3, manuál str. 11, 12, 35 a 55",
      visual: { current: [], srText: "Příchod na schůzku. Program ještě nezačal." },
    },
    {
      type: "scene",
      variant: "main",
      id: "program",
      label: "Schůzka, krok 2",
      title: "Prezident a seznam hostů",
      story: [
        "Schůzku vede prezident. Na úvod představí BNI a jeho hodnoty. Pokud jsou noví členové, uvede je na konci své části.",
        "Potom tým hostitelů uvede seznam hostů a případné změny: kdo chybí nebo má náhradníka.",
      ],
      chapter: [
        fact("Schůzku vede prezident. Když chybí, vede ji viceprezident.", "M18", "M30"),
        {
          ...fact(
            "Noví členové přijdou dopředu a slavnostně se uvedou do chapteru. Všechny předtím schválil členský výbor.",
            "H56"
          ),
          link: { text: "slavnostně se uvedou", href: "/pravidla/clenstvi#prijeti" },
        },
      ],
      chapterNotes: ["C20", "C22"],
      sourcesSummary: "manuál str. 14, 35 a 39",
      visual: {
        current: ["uvod", "seznam"],
        srText:
          "Na začátku prezident představí BNI a jeho hodnoty a uvede nové členy. Potom tým hostitelů uvede seznam hostů a změny.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "predstaveni",
      label: "Schůzka, krok 3",
      title: "Představení členů a hostů",
      comic: { panels: [C2_PREDSTAVENI] },
      story: [
        "Potom se představují členové. Postavíš se a máš 30 sekund: kdo jsi, co děláš a koho hledáš.",
        "Konkrétní žádost zní třeba „hledám majitele restaurace, který otevírá druhou pobočku“.",
        "Po členech se představí hosté, každý má 60 sekund.",
      ],
      chapter: [
        fact(
          "V týdenním představení řekne člen své jméno, firmu, co dělá a koho konkrétně hledá.",
          "QM14",
          "QM15"
        ),
        fact("Čas hlídá sekretář/pokladník, u členů i u hostů.", "QM39"),
        {
          ...fact("Za chybějícího člena řekne jeho představení náhradník.", "QM16"),
          link: { text: "náhradník", href: "#nahradnik" },
        },
        {
          ...fact("Hosté se představí až po všech členech.", "QM18"),
          link: { text: "Hosté", href: "#rytmus" },
        },
      ],
      chapterNotes: ["C21"],
      sourcesSummary: "manuál str. 15, 16 a 62",
      visual: {
        current: ["clenove", "hoste"],
        srText: "Představení členů, 30 sekund každý. Potom představení hostů, 60 sekund každý.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "hlavni-prezentace",
      label: "Schůzka, krok 4",
      title: "Vzdělávací okénko a hlavní prezentace",
      comic: { panels: [C2_PREZENTACE] },
      story: [
        "Pak přijde vzdělávací okénko, 5 minut.",
        "Potom má hlavní prezentaci jeden z členů, také 5 minut. Pořadí prezentací vede sekretář/pokladník. U něj zjistíš, kdy jsi na řadě ty.",
      ],
      chapter: [
        fact(
          "Vzdělávací okénko pomáhá členům zlepšit se v networkingu. Má ho vzdělávací koordinátor nebo člen, kterého o to požádá.",
          "QM11",
          "M95"
        ),
        fact("Hlavní prezentace ukáže ostatním, komu a jak můžou firmu řečníka doporučit.", "QM22"),
        fact("Pořadí prezentací vede sekretář/pokladník.", "M81"),
        {
          ...fact(
            "Hlavní prezentaci smí mít jen člen, který prošel programem pro nové členy, a konzultant regionu. Do rozpisu se nový člen dostane až po programu.",
            "G3",
            "QM40"
          ),
          link: { text: "programem pro nové členy", href: "/pravidla/clenstvi#orientace" },
        },
      ],
      chapterNotes: ["C23"],
      sourcesSummary: "General Policy #8, manuál str. 13, 17, 64 a 72",
      visual: {
        current: ["vzdelavani", "prezentace"],
        srText: "Vzdělávací okénko, 5 minut. Potom hlavní prezentace, 5 minut.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "doporuceni",
      label: "Schůzka, krok 5",
      title: "Čísla chapteru, doporučení a networking",
      comic: { panels: [C2_DOPORUCENI] },
      story: [
        "Viceprezident řekne čísla chapteru.",
        "Pak přijdou doporučení a reference. Všichni se postaví. Postupně říkáte, komu jste za týden předali doporučení, nebo pochválíte práci někoho z chapteru.",
        "Na konci je volný networking.",
      ],
      chapter: [
        fact(
          "Viceprezident řekne čísla chapteru: kolik doporučení a hostů má chapter průměrně za měsíc a kolik doporučení celkem.",
          "QM19"
        ),
        fact(
          "Doporučení a reference jsou nejdůležitější část schůzky. Všichni členové stojí a hlásí, komu předali doporučení, nebo řeknou referenci na kohokoli z chapteru.",
          "QM24",
          "QM25"
        ),
      ],
      sourcesSummary: "manuál str. 16 a 17",
      visual: {
        current: ["zprava", "doporuceni", "networking"],
        srText: "Zpráva viceprezidenta, doporučení a reference. Na konci volný networking.",
      },
    },
    {
      type: "branch",
      id: "nestihnes",
      question: "Nemůžeš na schůzku, nebo jen na její část?",
      options: [
        {
          tone: "good",
          id: "vis-predem",
          next: "nahradnik",
          nextLabel: "Co dělá náhradník",
          label: "Možnost 1",
          title: "Víš to dopředu",
          story: ["Za dva týdny jedeš ve čtvrtek na veletrh a víš to už teď. Za sebe pošleš náhradníka."],
          chapter: [fact("Náhradník je na nepřítomnost, o které víš předem.", "QM35")],
          sourcesSummary: "manuál str. 55",
          visual: {
            current: ["seznam", "clenove"],
            srText: "Náhradník je uvedený v seznamu změn a při představení členů řekne tvoje představení.",
          },
        },
        {
          tone: "neutral",
          id: "pozdni-prichod",
          label: "Možnost 2",
          title: "Přijdeš později nebo odejdeš dřív",
          story: [
            "Ráno stojíš v koloně a přijdeš, až když se představují členové. Jindy musíš odejít před koncem kvůli zákazníkovi.",
          ],
          chapter: [
            fact("Docházku vede viceprezident.", "QM32"),
            fact(
              "Členský výbor sleduje, kdo opakovaně chodí pozdě nebo odchází dřív, a pomáhá mu to změnit.",
              "QM38"
            ),
            {
              ...fact("Když to pokračuje, výbor může dát upozornění a obor se může uvolnit.", "G17", "QG10"),
              link: { text: "obor se může uvolnit", href: "/pravidla/obor#uvolneni-oboru" },
            },
          ],
          sourcesSummary: "General Policies (Absences and Tardiness), manuál str. 39 a 55",
          visual: {
            current: ["uvod", "networking"],
            srText: "Pozdní příchod se týká začátku schůzky, dřívější odchod jejího konce.",
          },
        },
        {
          tone: "neutral",
          id: "bez-nahradnika",
          label: "Možnost 3",
          title: "Nepřijdeš a náhradníka nepošleš",
          story: ["Ráno ti onemocní dítě a náhradníka už neseženeš."],
          chapter: [
            {
              ...fact(
                "Je to absence. Za šest měsíců můžeš mít tři. Jak se počítají a co následuje, je na stránce o absencích.",
                "QG2"
              ),
              link: { text: "na stránce o absencích", href: "/pravidla/absence" },
            },
          ],
          sourcesSummary: "General Policy #5",
          visual: { current: [], srText: "Na schůzce chybíš celou dobu." },
        },
      ],
    },
    {
      type: "scene",
      variant: "main",
      id: "nahradnik",
      label: "Náhradník",
      title: "Za tebe přijde náhradník",
      comic: SCHUZKA_COMICS.C3,
      story: [
        "Na veletrh jedeš za dva týdny. Domluvíš se s kolegyní, že za tebe ve čtvrtek přijde, a dáš o tom vědět týmu hostitelů.",
        "Tým hostitelů ji uvede mezi změnami. Při představení členů řekne tvoje představení, které jste spolu připravili.",
      ],
      chapter: [
        {
          ...fact(
            "Náhradník se nepočítá jako absence. Kdo jím může být, je na stránce o absencích.",
            "QG2"
          ),
          link: { text: "na stránce o absencích", href: "/pravidla/absence#nahradnik" },
        },
        fact("Výbor ti pomůže najít jednoho nebo dva lidi, kteří za tebe můžou přijít.", "QM36"),
        fact(
          "Dej předem vědět týmu hostitelů, že za tebe přijde náhradník, ať může být u dveří řádně přivítán a zapsán.",
          "QG12",
          "M90",
          "H100"
        ),
        fact("Při představení členů řekne tvoje týdenní představení.", "QM16"),
        fact(
          "Když jeho vlastní obor v chapteru nikdo nemá, vedení mu může dovolit, aby mezi hosty představil i svou firmu.",
          "QM1"
        ),
      ],
      chapterNotes: ["C18", "C19"],
      sourcesSummary:
        "General Policy #5, General Policies (Substitute Program), manuál str. 10, 15, 55 a 66",
      visual: {
        current: ["seznam", "clenove"],
        srText: "Náhradník je uvedený v seznamu změn a při představení členů řekne tvoje představení.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "jiny-chapter",
      label: "Jiný chapter",
      title: "Navštívíš jiný chapter",
      story: [
        "Chceš se podívat, jak schůzku vede jiný chapter. Před návštěvou zavoláš jeho prezidentovi.",
        "Na schůzce řekneš, že jsi z jiného chapteru.",
      ],
      chapter: [
        fact("Před návštěvou zavolej prezidentovi toho chapteru.", "QG4"),
        fact("Na schůzce řekni, že jsi z jiného chapteru.", "QG5"),
        fact("Nic neříkej ani nedělej tak, aby to konkurovalo členovi toho chapteru.", "QG6"),
        {
          // Gate T-006d, úprava 3.2.
          ...fact(
            "Pro chapter, který navštívíš, jsi hostující člen. Platí pro tebe stejné pravidlo jako pro hosty: nejvýš dvakrát za šest měsíců.",
            "H95",
            "QG9"
          ),
          link: { text: "stejné pravidlo jako pro hosty", href: "/pravidla/clenstvi#host" },
        },
        fact(
          "Chapter má být opatrný u doporučení pro lidi, které nezná. Platí to i pro členy z jiných chapterů.",
          "QG7"
        ),
      ],
      sourcesSummary: "General Policies (Visiting Chapters), manuál str. 68",
      visual: {
        current: [],
        srText: "Na schůzce jiného chapteru řekneš, že jsi z jiného chapteru.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "rytmus",
      label: "Náš rytmus",
      title: "Otevřená a interní schůzka",
      comic: SCHUZKA_COMICS.C4,
      comicWide: SCHUZKA_C5,
      story: ["Chceš na schůzku vzít obchodního partnera, ať chapter pozná. Pozveš ho na otevřenou schůzku."],
      chapter: [
        {
          ...fact("Host smí na schůzky chapteru přijít nejvýš dvakrát za šest měsíců.", "H01"),
          link: { text: "nejvýš dvakrát za šest měsíců", href: "/pravidla/clenstvi#host" },
        },
        // Gate T-006d, úprava 3.3: fakt M90 o hostitelích vypuštěn.
      ],
      chapterNotes: ["C15", "C16"],
      // Gate T-006d, úprava 3.3.
      sourcesSummary: "General Policy #7",
      visual: { current: [], srText: "Otevřené a interní schůzky se u nás střídají." },
    },
  ],

  summary: {
    title: "Ve zkratce",
    goals: [1, 2, 3, 4, 5, 6],
    points: [
      {
        goal: 1,
        text: "Přijď včas a zůstaň do konce. Schůzka má pevný program.",
      },
      {
        goal: 2,
        text: "Na týdenní představení máš 30 sekund. Řekni v něm, koho konkrétně hledáš.",
      },
      {
        goal: 3,
        text: "Hlavní prezentaci máš až po programu pro nové členy. Trvá 5 minut. Pořadí prezentací vede sekretář/pokladník.",
      },
      {
        goal: 4,
        text: "Když víš předem, že nemůžeš, pošli náhradníka a dej vědět týmu hostitelů. Výbor ti pomůže někoho najít a náhradník za tebe řekne tvoje představení.",
      },
      {
        goal: 5,
        // Gate T-006d, úprava 3.2.
        text: "Před návštěvou jiného chapteru zavolej jeho prezidentovi. Nekonkuruj tam jeho členům. Jako hostující člen smíš přijít nejvýš dvakrát za šest měsíců.",
      },
      {
        goal: 6,
        text: "U nás je každá druhá schůzka interní, bez hostů. Hosta pozveš na otevřenou.",
      },
    ],
    whereToFind: [
      {
        doc: "general-policies",
        page: 1,
        rule: "General Policy #3",
        labelCs: "příchod včas a celá schůzka",
      },
      { doc: "general-policies", page: 1, rule: "General Policy #5", labelCs: "absence a náhradníci" },
      {
        doc: "general-policies",
        page: 1,
        rule: "General Policy #7",
        labelCs: "hosté nejvýš dvakrát za šest měsíců",
      },
      {
        doc: "general-policies",
        page: 1,
        rule: "General Policy #8",
        labelCs: "pořadí prezentací",
      },
      { doc: "general-policies", page: 3, labelCs: "návštěva jiného chapteru a náhradník" },
      { doc: "ops-manual-2022", page: 11, labelCs: "obecný program schůzky BNI" },
      { doc: "ops-manual-2022", page: 55, labelCs: "náhradník, pozdní příchod a dřívější odchod" },
      { doc: "ops-manual-2022", page: 64, labelCs: "pořadí prezentací" },
    ],
  },

  contacts: [
    { role: "Prezident chapteru", when: "Když jde o program schůzky." },
    {
      role: "Viceprezident chapteru",
      when: "Když přijdeš později, odejdeš dřív nebo se ptáš na docházku.",
    },
    { role: "Sekretář/pokladník chapteru", when: "Když se ptáš, kdy máš hlavní prezentaci." },
    { role: "Tým hostitelů", when: "Když za tebe přijde náhradník." },
  ],

  disclaimer: [
    "Tahle stránka je výklad našeho chapteru.",
    "Vychází z BNI Chapter Operations Manual 2022-2023, platného od 27. 7. 2022, a z BNI General Policies.",
    "Stav k {updated}.",
  ],
};
