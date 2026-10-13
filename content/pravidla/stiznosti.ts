/**
 * Info stránka „Stížnost a spor" (/pravidla/stiznosti, iter-031, T-007c).
 *
 * Texty: content-writer T-005c (texty_stiznosti_iter-031_T-005c.md) s 11
 * úpravami gate T-006c (gate_iter-031_T-006c.md, sekce 3) a rozhodnutím
 * orchestrátora po gate („vzdělávací okénko"). Neměnit bez content-writera.
 * Citace přes `src`, `fact`, `refs` z `./fakta` (rejstříky `stiznosti-zdroje.ts`,
 * `role-zdroje.ts`, `obor-zdroje.ts`). Pole `obligation` se nevyplňuje.
 * Žádná jména ani konkrétní případy.
 *
 * Kotvy z kontraktu (arch_iter-031_T-003s sekce 4), míří na ně jiné stránky:
 * `nejdriv-rozhovor`, `pisemna-stiznost`, `domluva`, `zkusebni-doba`,
 * `posouzeni` (cíl z kodexu). Sekce `eticky-kodex` se v T-007e přesunula na
 * stránku kodex (`kodex.ts`), kotva `eticky-kodex` zanikla.
 */
import type { InfoPage, ProcessTrackState } from "@/lib/info-pages/types";
import { fact, refs, src } from "./fakta";
import { STIZNOSTI_COMICS, STIZNOSTI_HERO } from "./stiznosti-komiksy";

/** Etapy postupu, stejné pole ve všech stavech vizuálu. */
const STAGES = [
  "Rozhovor mezi vámi",
  "Člen výboru",
  "Písemná stížnost",
  "Rozhovory s oběma",
  "Posouzení",
  "Řešení",
  "Výsledek",
];

/** Stav vizuálu `process-track` u kroku. */
function track(current: number, srText: string, outcome?: string): ProcessTrackState {
  return outcome ? { stages: STAGES, current, outcome, srText } : { stages: STAGES, current, srText };
}

export const STIZNOSTI_PAGE: InfoPage<"process-track"> = {
  slug: "stiznosti",
  title: "Stížnost a spor",
  description:
    "Co dělat, když se s někým z chapteru nepohodneš. Od rozhovoru přes stížnost po rozhodnutí výboru. Respekt a kontakty na členy.",
  updated: "2026-10-13",
  visual: "process-track",
  hero: STIZNOSTI_HERO,
  situations: [
    { label: "Chci si stěžovat na člena", anchor: "nejdriv-rozhovor" },
    { label: "Někdo si stěžuje na mě", anchor: "kdyz-jde-o-tebe" },
    { label: "Smím členům posílat nabídky?", anchor: "kontakty-clenu" },
  ],
  toc: [
    { label: "Postup", anchor: "nejdriv-rozhovor" },
    { label: "Možnosti řešení", anchor: "reseni" },
    { label: "Respekt", anchor: "respekt" },
    { label: "Kontakty na členy", anchor: "kontakty-clenu" },
  ],
  intro: {
    question: "S jiným členem chapteru se něco nepovedlo. Co teď?",
    lead: [
      "Většinou stačí si spolu promluvit. Když to nepomůže, věc převezme členský výbor.",
      "Výbor vyslechne obě strany, každou zvlášť.",
    ],
    visual: track(
      -1,
      "Postup u stížnosti má sedm etap: rozhovor mezi vámi, člen výboru, písemná stížnost, rozhovory s oběma, posouzení, řešení a výsledek."
    ),
  },
  steps: [
    {
      type: "scene",
      variant: "main",
      id: "nejdriv-rozhovor",
      label: "Krok 1",
      title: "Nejdřív si spolu promluvte",
      story: [
        "Přes chapter sis objednal práci od jiného člena. Faktura přijde vyšší, než byla nabídka, a ty nevíš proč.",
        "Než to začneš řešit s výborem, domluvíš si s ním schůzku jeden na jednoho.",
      ],
      chapter: [
        fact("Většina stížností vznikne z nedorozumění.", "SM12"),
        fact(
          "Nejdřív to zkus s druhým členem vyřešit sám. Pomůže schůzka jeden na jednoho: řeknete si, co vám vadí, a vyjasníte si nedorozumění.",
          "SM13",
          "SM14"
        ),
        {
          ...fact(
            "Na měsíčním setkání vedení chapteru se probírá, jak obavy vyřešit dřív, než z nich bude písemná stížnost.",
            "SM51"
          ),
          link: { text: "vedení chapteru", href: "/pravidla/role#vedeni" },
        },
        {
          // Gate T-006c, úprava 1.
          ...fact(
            "Stížnost často začne obavou, že člen postupně nabízí i služby z cizího oboru. Jak se řeší spor o obor, je na stránce obor.",
            "OM12"
          ),
          link: { text: "spor o obor", href: "/pravidla/obor#spor-o-obor" },
        },
        {
          // Gate T-006c, úprava 2.
          ...fact("Když jde o docházku, platí postup ze stránky absence.", "SM11"),
          link: { text: "stránky absence", href: "/pravidla/absence#treti-absence" },
        },
      ],
      sourcesSummary: "manuál str. 32, 57 a 58",
      visual: track(0, "Řešíte to mezi sebou. Výbor zatím nic nedělá."),
    },
    {
      type: "scene",
      variant: "main",
      id: "clen-vyboru-pro-vztahy",
      label: "Krok 2",
      title: "Řekneš to členovi výboru pro vztahy mezi členy",
      story: [
        "Rozhovor nepomohl. Zavoláš členovi výboru pro vztahy mezi členy a řekneš mu, co se stalo.",
        "Zatím nic nepodáváš. Člen výboru ti pomůže hledat, jak se s druhým členem domluvit.",
      ],
      chapter: [
        fact("Člen výboru pro vztahy mezi členy přijímá obavy i stížnosti, ústní i písemné.", "M58"),
        fact("Pomáhá členům, aby se domluvili, a všímá si, co by mohlo přerůst v problém.", "SM7"),
        fact("Může členy koučovat sám, nebo k tomu domluví mentora nebo jiného člena výboru.", "SM8"),
        fact("Obavu můžeš říct i ústně.", "M58"),
      ],
      sourcesSummary: "manuál str. 57",
      // Gate T-006c, úprava 10: bez komiksu (S1/3 je u kroku `rozhovory`).
      visual: track(1, "O tvé obavě ví člen výboru pro vztahy mezi členy. Výbor zatím nehlasuje."),
    },
    {
      type: "scene",
      variant: "main",
      id: "pisemna-stiznost",
      label: "Krok 3",
      title: "Podáš stížnost písemně",
      story: [
        "Chceš, aby to výbor řešil. Sepíšeš, co se stalo a co jsi sám zažil, a pošleš to členovi výboru pro vztahy mezi členy.",
        "Od téhle chvíle se stížností pracuje výbor.",
      ],
      chapter: [
        fact("Výbor postupuje dál, až když je stížnost napsaná.", "M60"),
        fact(
          "Stížnost píše člen BNI z našeho nebo jiného chapteru. Popisuje v ní, co sám zažil.",
          "SM56",
          "SM39",
          "SM40"
        ),
        fact(
          "Jakmile písemná stížnost přijde, člen výboru pro vztahy mezi členy dá hned vědět viceprezidentovi a konzultantovi regionu.",
          "M59"
        ),
        // Gate T-006c, úprava 5: fakt M61 vypuštěn.
        fact("Stížnost řeší úplný a proškolený výbor.", "SM42"),
        fact(
          "Písemnou stížnost výbor řeší hned, jak přijde. Dokud není vyřízená, nosí ji člen výboru pro vztahy mezi členy na každé měsíční setkání vedení.",
          "SM50",
          "SM9"
        ),
      ],
      sourcesSummary: "manuál str. 33, 57, 58 a 60",
      comic: STIZNOSTI_COMICS.pisemnaStiznost,
      visual: track(2, "Stížnost je napsaná. Viceprezident a konzultant regionu o ní vědí."),
    },
    {
      type: "scene",
      variant: "main",
      id: "rozhovory",
      label: "Krok 4",
      title: "Výbor vyslechne obě strany, každou zvlášť",
      story: [
        // Gate T-006c, úprava 3.
        "Člen výboru si s tebou domluví rozhovor. Zvlášť mluví i s členem, na kterého sis stěžoval.",
        "Každý řekne, jak to vidí.",
      ],
      chapter: [
        fact(
          "Viceprezident určí členy výboru, kteří vedou rozhovory. S každou stranou mluví jeden nebo dva z nich, s každou zvlášť.",
          "SM41",
          "SM15",
          "SM18"
        ),
        fact("S tebou rozhovor doplní, co ve stížnosti chybí.", "SM16"),
        fact("Z rozhovorů vznikne zápis: datum, hlavní body a jak kdo reagoval.", "SM19"),
        fact(
          "Viceprezident může podle potřeby přizvat další členy chapteru, třeba aby u rozhovorů byli muži i ženy.",
          "M72",
          "SM38"
        ),
        fact("Když se spor týká člena výboru, ten po dobu sporu svou funkci ve výboru nevykonává.", "M71"),
      ],
      sourcesSummary: "manuál str. 58 až 60",
      // Gate T-006c, úprava 11: S1/3, pak S2/1.
      comic: STIZNOSTI_COMICS.rozhovory,
      visual: track(3, "Výbor mluví s každou stranou zvlášť."),
    },
    {
      type: "scene",
      variant: "detour",
      id: "kdyz-jde-o-tebe",
      label: "Odbočka",
      title: "Když si někdo stěžuje na tebe",
      story: [
        "Na tebe přišla stížnost. Člen výboru se ti ozve a domluví si s tebou rozhovor.",
        // Gate T-006c, úprava 4.
        "Na rozhovoru řekneš, jak to vidíš ty.",
      ],
      chapter: [
        fact("Výbor tě vyslechne zvlášť, abys mohl říct svou verzi.", "SM17", "SM15"),
        fact("Samotnou písemnou stížnost ti výbor neukáže. Hlavní body ti sdělit může.", "SM20"),
        fact("Když máš spor se členem výboru, ten po dobu sporu ve výboru nepůsobí.", "M71"),
        {
          ...fact("Výbor posuzuje podle pravidel BNI a etického kodexu.", "SM21"),
          link: { text: "etického kodexu", href: "/pravidla/kodex" },
        },
      ],
      chapterNotes: ["C3"],
      sourcesSummary: "manuál str. 58 a 59",
      visual: track(3, "Výbor si zvlášť vyslechne i tvoji verzi.", "Stížnost na tebe"),
    },
    {
      type: "scene",
      variant: "main",
      id: "posouzeni",
      label: "Krok 5",
      title: "Výbor posoudí, jestli šlo o porušení pravidel",
      story: [
        "Výbor se sejde a projde zápisy z rozhovorů. Porovná je s pravidly BNI a s etickým kodexem.",
        "Rozhoduje výbor jako celek.",
      ],
      chapter: [
        fact("Celý výbor včetně viceprezidenta se sejde a probere, co zaznělo v rozhovorech.", "M64"),
        {
          ...fact("Posoudí, jestli člen porušil pravidla BNI nebo etický kodex, a jak vážně.", "SM21", "SM22", "SM43"),
          link: { text: "etický kodex", href: "/pravidla/kodex" },
        },
        {
          // S3b (T-001e): jediné místo, odkud čtenář dojde na výčet hodnot BNI.
          ...fact(
            "Výbor může dát zkušební dobu nebo uvolnit místo, když člen nedodržuje pravidla pro členy, etický kodex nebo hodnoty BNI.",
            "G2"
          ),
          link: { text: "hodnoty BNI", href: "/pravidla/kodex#hodnoty" },
        },
        fact(
          "Když je vážně zpochybněná kvalita služeb nebo profesionalita člena, projde výbor celým tímhle postupem dřív, než by uvolnil jeho místo.",
          "SM54"
        ),
        fact(
          "O stížnosti rozhoduje většina úplného a proškoleného výboru. Cílem je shoda na řešení, které je v nejlepším zájmu chapteru.",
          "M63",
          "SM23"
        ),
      ],
      chapterNotes: ["C11"],
      sourcesSummary: "General Policies (úvod), manuál str. 58 a 60",
      comic: STIZNOSTI_COMICS.posouzeni,
      visual: track(4, "Výbor jako celek posuzuje, jestli šlo o porušení pravidel."),
    },
    {
      type: "branch",
      id: "reseni",
      question: "Jak může výbor rozhodnout?",
      options: [
        {
          id: "domluva",
          tone: "good",
          label: "Možnost 1",
          title: "Domluva a pomoc",
          next: "vysledek",
          nextLabel: "Jak se výsledek dozvíte",
          story: [
            // Gate T-006c, úprava 6.
            "Výbor hledá řešení s vámi oběma. Člen, na kterého sis stěžoval, může projít kurz nebo věc probrat se svým mentorem.",
          ],
          chapter: [
            fact("Výbor se ptá, jak pomoct spor vyřešit, a do řešení zapojí obě strany.", "SM25"),
            fact(
              "Výbor může členovi domluvit schůzku jeden na jednoho s jeho mentorem nebo kurz v BNI Business Builderu, vzdělávacím portálu BNI.",
              "SM27",
              "SM28"
            ),
            // Rozhodnutí orchestrátora po gate: „vzdělávací okénko" v celé sérii.
            fact(
              "Když jde o téma celého chapteru, výbor může požádat vzdělávacího koordinátora o vzdělávací okénko nebo konzultanta regionu o hlavní prezentaci.",
              "SM26",
              "M70"
            ),
          ],
          sourcesSummary: "manuál str. 58 a 59",
          comic: STIZNOSTI_COMICS.domluva,
          visual: track(5, "Výbor rozhodl o domluvě a pomoci.", "Domluva a pomoc"),
        },
        {
          id: "zkusebni-doba",
          tone: "neutral",
          label: "Možnost 2",
          title: "Zkušební doba",
          next: "vysledek",
          nextLabel: "Jak se výsledek dozvíte",
          story: [
            "Výbor dá členovi zkušební dobu. Na schůzky chodí dál a s výborem si domluví, co má být jinak.",
            "Na konci zkušební doby výbor vyhodnotí, jestli se to podařilo.",
          ],
          chapter: [
            fact("O zkušební době stačí rozhodnout většinou výboru. Výbor se ale snaží o shodu.", "M65"),
            fact("Délku zkušební doby určí výbor.", "M67"),
            fact("Konzultant regionu potvrdí, že se dodržel postup, a dopis předem schválí.", "M66", "M74"),
            // Gate T-006c, úprava 7: „jméno člena" místo „tvoje jméno".
            fact(
              "V dopise je jen jméno člena, datum, porušené pravidlo a délka zkušební doby. Nic dalšího se do něj nepíše.",
              "SM29",
              "SM30"
            ),
            fact("Dopis přijde e-mailem, když to jde, s potvrzením o přečtení.", "SM31"),
            fact(
              "Dva členové výboru s členem proberou, jaké chování by zkušební dobu porušilo, a domluví měřitelné kroky, třeba znovu projít program pro nové členy.",
              "SM32",
              "SM33",
              "SM34"
            ),
            fact(
              "Na konci zkušební doby výbor vyhodnotí, jestli se problém vyřešil. Když ne, sejde se a zváží uvolnění místa.",
              "SM36"
            ),
          ],
          sourcesSummary: "manuál str. 59 a 60",
          comic: STIZNOSTI_COMICS.zkusebniDoba,
          visual: track(5, "Výbor rozhodl o zkušební době. Člen chodí na schůzky dál.", "Zkušební doba"),
        },
        {
          id: "uvolneni-mista",
          tone: "serious",
          label: "Možnost 3",
          title: "Uvolnění místa",
          story: [
            "Výbor rozhodne, že místo člena v chapteru uvolní. Jeho členství tím končí a jeho obor může v chapteru zastupovat někdo jiný.",
          ],
          chapter: [
            fact("Místo se smí uvolnit až poté, co konzultant regionu potvrdí, že se dodržel postup.", "M68"),
            fact("Bez předchozí zkušební doby jen se souhlasem konzultanta regionu a ředitele regionu.", "M62"),
            {
              ...fact("Jak uvolnění probíhá a co se děje s oborem, je na stránce obor.", "M69"),
              link: { text: "na stránce obor", href: "/pravidla/obor#uvolneni-oboru" },
            },
          ],
          chapterNotes: ["C1", "C10", "C5"],
          sourcesSummary: "manuál str. 58 a 59",
          visual: track(5, "Výbor rozhodl o uvolnění místa. Členství toho člena končí.", "Uvolnění místa"),
        },
      ],
    },
    {
      type: "scene",
      variant: "main",
      id: "vysledek",
      label: "Krok 7",
      title: "Obě strany se dozví výsledek",
      // Gate T-006c, úprava 8: jen první věta.
      story: ["Výbor dá výsledek vědět tobě i členovi, na kterého sis stěžoval."],
      chapter: [
        fact("Výbor dá výsledek vědět oběma stranám.", "SM24", "SM44"),
        fact("Dopisy s rozhodnutím podepisuje vždy členský výbor, nikdy jednotlivec.", "M75"),
        fact("Dopisy jsou schválené vzory. Nemění se a posílají se všem stejně, bez výjimek.", "SM46", "SM45"),
      ],
      chapterNotes: ["C12", "C13"],
      sourcesSummary: "manuál str. 58 a 60",
      visual: track(6, "Výsledek se dozví obě strany."),
    },
  ],
  sections: [
    {
      id: "respekt",
      title: "Respekt ke každému",
      comic: STIZNOSTI_COMICS.respekt,
      facts: [fact("Obavu i stížnost přijímá člen výboru pro vztahy mezi členy, ústně i písemně.", "M58")],
      items: [
        {
          id: "nediskriminace",
          text: "Chapter vybírá členy do všech oborů podle kvalifikace. Nehraje roli rasa, barva pleti, pohlaví, náboženství, národnost, rodinný stav, sexuální orientace, věk ani zdravotní postižení. Rozhodnutí chapteru, které by tohle porušilo, BNI nepodpoří.",
          sources: refs("SM4", "M02"),
        },
        {
          // Gate T-006c, úprava 9: bez věty o str. 9 (je ve „Kde to najdeš").
          id: "obtezovani",
          text: "BNI netoleruje obtěžování franšízantů, regionálních týmů, vedení ani členů. Zakázané je jakékoli obtěžování na základě rasy, pohlaví, náboženství, věku, zdravotního postižení a dalších znaků, které chrání zákon. Obtěžování se řeší jako disciplinární věc. Všichni máme být kulturně citliví, abychom si navzájem rozuměli.",
          sources: refs("M03", "SM5", "SM6"),
        },
      ],
    },
    {
      id: "kontakty-clenu",
      title: "Kontakty na členy",
      items: [
        {
          id: "seznamy-clenu",
          text: "Seznamy členů BNI jsou jen pro předávání doporučení.",
          sources: refs("SG1"),
        },
        {
          id: "souhlas-mimo-chapter",
          text: "Než pošleš reklamu nebo obchodní nabídku členům BNI mimo náš chapter nebo konzultantům regionu, musí s tím souhlasit.",
          sources: refs("G6"),
        },
        {
          id: "podoba-souhlasu",
          text: "Souhlas musí být dobrovolný, konkrétní, informovaný a jednoznačný.",
          sources: [
            src("SM3", "General Policies mají v této větě překlep („information“), proto je citace z manuálu."),
          ],
        },
      ],
    },
  ],
  summary: {
    title: "Ve zkratce",
    goals: [1, 2, 3, 4, 5, 6],
    points: [
      {
        goal: 1,
        text: "Nejdřív si to s druhým členem zkus vyříkat sám. Většina stížností vznikne z nedorozumění.",
      },
      {
        goal: 2,
        text: "Obavu řekneš členovi výboru pro vztahy mezi členy, klidně ústně. Výbor postupuje dál, až když je stížnost napsaná.",
      },
      {
        goal: 3,
        text: "Výbor vyslechne obě strany, každou zvlášť. Člen výboru, kterého se spor týká, po dobu sporu ve výboru nepůsobí.",
      },
      {
        goal: 4,
        text: "Výbor může pomoct s domluvou, dát zkušební dobu nebo uvolnit místo. U zkušební doby a uvolnění místa konzultant regionu potvrdí, že se dodržel postup. Uvolnit místo bez zkušební doby jde jen se souhlasem konzultanta regionu a ředitele regionu.",
      },
      {
        goal: 5,
        text: "Členy chapter vybírá podle kvalifikace a obtěžování BNI netoleruje.",
      },
      {
        goal: 6,
        text: "Seznamy členů jsou jen pro předávání doporučení. Nabídku členům mimo náš chapter pošleš, až když s tím souhlasí.",
      },
    ],
    whereToFind: [
      {
        doc: "general-policies",
        page: 1,
        rule: "General Policies, úvod a General Policy #11",
        labelCs: "pravomoc výboru a kontakty na členy",
      },
      { doc: "ops-manual-2022", page: 9, labelCs: "nediskriminace a obtěžování" },
      { doc: "ops-manual-2022", page: 57, labelCs: "člen výboru pro vztahy mezi členy" },
      { doc: "ops-manual-2022", page: 58, labelCs: "postup u stížnosti" },
      { doc: "ops-manual-2022", page: 59, labelCs: "zkušební doba a uvolnění místa" },
      { doc: "ops-manual-2022", page: 60, labelCs: "kontrolní list a dopisy výboru" },
    ],
  },
  contacts: [
    {
      role: "Člen výboru pro vztahy mezi členy",
      when: "Když máš s někým z chapteru problém nebo chceš podat stížnost.",
    },
    {
      role: "Viceprezident chapteru, vede členský výbor",
      when: "Když chceš vědět, jak postup u stížnosti probíhá.",
    },
  ],
  disclaimer: [
    "Tahle stránka je výklad našeho chapteru.",
    "Vychází z BNI Chapter Operations Manual 2022-2023, platného od 27. 7. 2022, a z BNI General Policies.",
    "Stav k {updated}.",
  ],
};
