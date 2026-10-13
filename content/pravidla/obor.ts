/**
 * Info stránka „Jeden obor, jeden člověk" (/pravidla/obor, iter-031, T-007b).
 *
 * Texty: content-writer T-005b (texty_obor_iter-031_T-005b.md) s šesti
 * úpravami z gate T-006b (gate_iter-031_T-006b.md, sekce 3), u dotčených
 * míst odkaz „Gate T-006b, úprava N". Neměnit bez content-writera.
 * Citace přes `src`, `fact` z `./fakta` (rejstřík série, mimo jiné
 * `obor-zdroje.ts`). Pole `obligation` se nevyplňuje. Žádná jména ani
 * konkrétní případy. Kotvy `jeden-obor`, `hlavni-profese`, `vyber-oboru`,
 * `zmena-oboru`, `spor-o-obor` a `uvolneni-oboru` jsou cíle odkazů
 * z jiných stránek (arch_iter-031_T-003s sekce 4), nepřejmenovávat.
 */
import type { InfoPage } from "@/lib/info-pages/types";
import { fact, src } from "./fakta";
import { OBOR_COMICS, OBOR_HERO } from "./obor-komiksy";

export const OBOR_PAGE: InfoPage<"none"> = {
  slug: "obor",
  title: "Jeden obor, jeden člověk",
  description:
    "Proč je v chapteru z každého oboru jen jeden člen. Jak obor vybrat a změnit, co dělat při překryvu oborů a kdy se obor uvolní.",
  updated: "2026-10-12",
  visual: "none",
  hero: OBOR_HERO,
  situations: [
    { label: "Dělám víc věcí, můžu mít dva obory?", anchor: "hlavni-profese" },
    { label: "Chci změnit obor", anchor: "zmena-oboru" },
    { label: "Můj obor se překrývá s oborem jiného člena", anchor: "spor-o-obor" },
    { label: "Co znamená uvolnění oboru?", anchor: "uvolneni-oboru" },
  ],
  intro: {
    question: "Proč v chapteru nemůžou být dva fotografové?",
    lead: [
      "V chapteru má každý obor jedno místo. O tom, kdo ho zastupuje, rozhoduje členský výbor.",
      "Pravidla jsou stejná pro každého.",
    ],
    visual: {},
  },
  steps: [
    {
      type: "scene",
      variant: "main",
      id: "jeden-obor",
      label: "Krok 1",
      title: "Fotograf už v chapteru je",
      story: [
        "Přivedeš na schůzku kamarádku, která fotí svatby. Schůzka se jí líbí a chce se přidat.",
        "Fotografa ale chapter už má. Dokud je členem, kamarádka se přihlásit nemůže.",
      ],
      chapter: [
        fact(
          "Z každého oboru může být v chapteru jen jeden člen. Každý člen má v chapteru jen jeden obor.",
          "OG1"
        ),
        fact("Dokud jsi členem, nikdo další z tvého oboru se členem nestane.", "OM1"),
        {
          ...fact("Host se může do chapteru přihlásit, jen když je jeho obor volný.", "H10"),
          link: { text: "Host", href: "/pravidla/clenstvi#host" },
        },
        // Gate T-006b, úprava 1.
        fact("O pravidlech BNI má v chapteru konečné slovo členský výbor.", "G1"),
      ],
      sourcesSummary: "General Policy #1, General Policies úvod, manuál str. 19 a 67",
      comic: OBOR_COMICS["jeden-obor"],
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "hlavni-profese",
      label: "Krok 2",
      title: "Zastupuješ svou hlavní profesi",
      story: [
        "Hlásíš se do chapteru. Jsi grafik: navrhuješ loga a tiskoviny a občas uděláš i jednoduchý web.",
        "Na přihlášku napíšeš grafiku, protože ji děláš nejvíc.",
      ],
      chapter: [
        fact("V chapteru zastupuješ svou hlavní profesi.", "OG2"),
        fact("Druhou profesi navíc v chapteru zastupovat nemůžeš. Máš jeden obor, a to svou hlavní profesi.", "OG1", "OG2"),
        fact("Při přihlášce se tě výbor zeptá, jestli je tvůj obor tvoje hlavní profese.", "OM7"),
        {
          // Gate T-006b, úprava 2.
          ...fact(
            "Když obor na přihlášce není tvoje hlavní profese, je to jeden z důvodů, proč může výbor přihlášku odmítnout.",
            "H45",
            "M46"
          ),
          link: { text: "jeden z důvodů", href: "/pravidla/clenstvi#odmitnuti" },
        },
      ],
      sourcesSummary: "General Policy #1 a #2, manuál str. 45 a 51",
      comic: OBOR_COMICS["hlavni-profese"],
      visual: {},
    },
    {
      type: "scene",
      variant: "detour",
      id: "mlm",
      label: "Odbočka",
      title: "Když podnikáš v síťovém marketingu",
      story: [
        "Prodáváš kosmetiku přes síťový marketing (MLM). Do své sítě jsi přivedl i pár dalších prodejců.",
        "V chapteru mluvíš o kosmetice, kterou prodáváš.",
      ],
      chapter: [
        fact(
          "Když podnikáš v síťovém marketingu, zastupuješ v BNI produkty a služby, které prodáváš. Nábor nových lidí do své sítě v BNI nenabízíš.",
          "OG3"
        ),
        fact(
          "Nábor do sítě by se překrýval s obory, které se zabývají zaměstnáváním a náborem lidí, třeba s personální agenturou.",
          "OM15"
        ),
      ],
      sourcesSummary: "General Policies (Business Representation), manuál str. 58",
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "vyber-oboru",
      label: "Krok 3",
      title: "Obor vybereš při přihlášce",
      story: [
        "Přihlášku vyplňuješ online v systému BNI Connect. Obor vybereš ze seznamu oborů BNI.",
        "Pak si přihlášku prověří člen výboru pro posouzení přihlášek. Zajímá ho i to, jestli se tvůj obor nekryje s oborem někoho z chapteru.",
      ],
      chapter: [
        {
          ...fact("Obor vybíráš při přihlášce v systému BNI Connect ze seznamu oborů BNI.", "OM3"),
          link: { text: "při přihlášce", href: "/pravidla/clenstvi#prihlaska" },
        },
        fact("Když děláš víc věcí, na přihlášce musí být jasně jeden obor.", "OM5"),
        fact("Když se obor upraví podle pravidel BNI, opraví se na přihlášce a ty změnu potvrdíš zkráceným podpisem.", "OM6"),
        fact(
          "Manuál BNI má katalog oborů rozdělený do skupin, třeba stavebnictví nebo finance a pojištění. Každá skupina končí prázdným řádkem pro obor, který v ní není.",
          "OM9",
          src("OM43", "Katalog má 27 skupin a každá končí řádkem pro obor mimo seznam.")
        ),
        fact("Člen výboru pro posouzení přihlášek ověří, že tvůj obor do chapteru zapadá.", "M41"),
        fact(
          "Hlídá, aby výběr oborů vedl ke spolupráci členů. Pečlivý výběr oborů předejde mnoha sporům.",
          "M103",
          "OM16"
        ),
        {
          ...fact(
            "Možný překryv s oborem některého člena se řeší ještě před přijetím. Jestli je překryv nepřijatelný, posoudí výbor.",
            "OM4",
            "M47"
          ),
          link: { text: "před přijetím", href: "/pravidla/clenstvi#hlasovani" },
        },
        // Gate T-006b, úprava 3: fakt G18 vypuštěn, pravidlo nese krok spor-o-obor.
      ],
      // Gate T-006b, úprava 3b.
      sourcesSummary: "manuál str. 30, 42, 44, 48 a 51",
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "zmena-oboru",
      label: "Krok 4",
      title: "Chceš změnit obor",
      story: ["Po pár letech děláš hlavně weby. V chapteru chceš místo grafiky zastupovat tvorbu webů."],
      chapter: [
        fact("Když chceš změnit obor, podáš novou přihlášku. Schvaluje ji výbor.", "G5"),
      ],
      sourcesSummary: "General Policy #10",
      comic: OBOR_COMICS["zmena-oboru"],
      visual: {},
    },
    {
      type: "branch",
      id: "novy-obor",
      question: "Je nový obor v chapteru volný?",
      options: [
        {
          tone: "good",
          id: "novy-obor-volny",
          label: "Možnost 1",
          title: "Nový obor je volný",
          story: ["Tvorbu webů v chapteru nikdo nezastupuje."],
          chapter: [
            fact(
              "Výbor posoudí novou přihlášku stejně jako každou jinou, včetně možného překryvu s obory ostatních členů.",
              "G5",
              "OM4",
              "M47"
            ),
          ],
          sourcesSummary: "General Policy #10, manuál str. 44 a 51",
          visual: {},
        },
        {
          tone: "neutral",
          id: "novy-obor-obsazeny",
          label: "Možnost 2",
          title: "Nový obor už někdo zastupuje",
          story: ["Tvorbu webů už v chapteru někdo zastupuje."],
          chapter: [
            {
              ...fact(
                "Změna na obor, který už v chapteru někdo zastupuje, je podle pravidel jeden z důvodů k přestupu do jiného chapteru.",
                "OM10"
              ),
              link: { text: "přestupu do jiného chapteru", href: "/pravidla/clenstvi#prestup" },
            },
            // Gate T-006b, úprava 4.
            fact("S přestupem pomáhá konzultant regionu.", "M48"),
          ],
          sourcesSummary: "manuál str. 51",
          visual: {},
        },
      ],
    },
    {
      type: "scene",
      variant: "main",
      id: "spor-o-obor",
      label: "Krok 5",
      title: "Když se obory překrývají",
      story: [
        "V týdenním představení zazní nabídka, která podle tebe patří k tvému oboru.",
        "Nevíš, jestli je to v pořádku. Můžeš to probrat se členem výboru pro vztahy mezi členy.",
      ],
      chapter: [
        fact("Zastupuješ jen ten obor, který schválil výbor.", "OM11", "G18"),
        {
          ...fact(
            "Jedna z nejčastějších obav, ze kterých bývá stížnost, je rozšiřování oboru. Obvykle začne zmínkou o jiném oboru v týdenním představení.",
            "OM12",
            "OM13"
          ),
          link: { text: "týdenním představení", href: "/pravidla/schuzka#predstaveni" },
        },
        fact("Obavu nebo stížnost, ústní i písemnou, přijímá člen výboru pro vztahy mezi členy.", "M58"),
        fact("Pro spor o obor platí stejný postup jako u každé stížnosti.", "M58"),
      ],
      sourcesSummary: "General Policies (Business Representation), manuál str. 57",
      comic: OBOR_COMICS["spor-o-obor"],
      visual: {},
    },
    {
      type: "branch",
      id: "spor-dal",
      question: "Jak se to může vyřešit?",
      options: [
        {
          tone: "good",
          id: "spor-domluva",
          label: "Možnost 1",
          title: "Domluvíte se mezi sebou",
          story: ["Sejdeš se s druhým členem na kávu a proberete, kdo co nabízí."],
          chapter: [
            {
              ...fact("Nejdřív se máte zkusit domluvit mezi sebou.", "SM13"),
              link: { text: "domluvit mezi sebou", href: "/pravidla/stiznosti#nejdriv-rozhovor" },
            },
          ],
          sourcesSummary: "manuál str. 58",
          visual: {},
        },
        {
          tone: "neutral",
          id: "spor-koucink",
          label: "Možnost 2",
          title: "Výbor pomůže najít řešení",
          story: ["Sami se nedomluvíte, a tak požádáš o pomoc výbor."],
          chapter: [
            {
              ...fact("Výbor se zeptá, jak může pomoct, a zapojí obě strany do hledání řešení.", "SM25"),
              link: { text: "hledání řešení", href: "/pravidla/stiznosti#domluva" },
            },
          ],
          sourcesSummary: "manuál str. 58",
          visual: {},
        },
        {
          tone: "serious",
          id: "spor-stiznost",
          label: "Možnost 3",
          title: "Podáš stížnost",
          story: ["Ani s pomocí výboru se nedomluvíte. Obavu podáš jako stížnost."],
          chapter: [
            {
              // Gate T-006b, úprava 5.
              ...fact("Když domluva nepomůže, řeší výbor obavu postupem u stížnosti.", "M58"),
              link: { text: "postupem u stížnosti", href: "/pravidla/stiznosti#pisemna-stiznost" },
            },
          ],
          sourcesSummary: "manuál str. 57",
          visual: {},
        },
      ],
    },
    {
      type: "branch",
      id: "proc-uvolneni",
      question: "Kdy se může tvoje místo uvolnit?",
      options: [
        {
          tone: "good",
          id: "odchod",
          label: "Možnost 1",
          title: "Odchod z chapteru",
          story: ["Rozhodneš se z chapteru odejít. Tvůj obor pak může zastupovat někdo jiný."],
          chapter: [
            {
              ...fact("Když se po odchodu budeš chtít vrátit, tvůj obor už může být obsazený.", "OM34"),
              link: { text: "po odchodu", href: "/pravidla/absence#odchod-s-kreditem" },
            },
          ],
          sourcesSummary: "manuál str. 56",
          visual: {},
        },
        {
          tone: "neutral",
          id: "dochazka",
          label: "Možnost 2",
          title: "Absence a pozdní příchody",
          story: ["Několik měsíců po sobě často chybíš na schůzkách nebo chodíš pozdě."],
          chapter: [
            {
              ...fact("Po čtvrté absenci během šesti měsíců může výbor tvoje členství ukončit dopisem.", "OM42"),
              link: { text: "čtvrté absenci", href: "/pravidla/absence#ctvrta-absence" },
            },
            {
              ...fact(
                "Když se pozdní příchody a dřívější odchody dál opakují, tvoje místo se může uvolnit.",
                "QG10"
              ),
              link: { text: "pozdní příchody", href: "/pravidla/schuzka#pozdni-prichod" },
            },
          ],
          sourcesSummary: "General Policies (Absences and Tardiness), manuál str. 55",
          visual: {},
        },
        {
          tone: "serious",
          id: "poruseni-pravidel",
          label: "Možnost 3",
          title: "Porušení pravidel",
          story: ["Výbor řeší, jestli dodržuješ pravidla BNI a etický kodex."],
          chapter: [
            {
              ...fact(
                "Za porušení pravidel pro členy, etického kodexu nebo hodnot BNI může výbor dát zkušební dobu nebo uvolnit místo. Ve zkušební době se s výborem domluvíš na konkrétních krocích.",
                "G2",
                "SM34"
              ),
              link: { text: "zkušební dobu", href: "/pravidla/stiznosti#zkusebni-doba" },
            },
          ],
          sourcesSummary: "General Policies úvod, manuál str. 59",
          // Gate T-006b, otevřený bod 2: konzultant regionu `approves` zůstává (OM19).
          visual: {},
        },
      ],
    },
    {
      type: "scene",
      variant: "main",
      id: "uvolneni-oboru",
      label: "Krok 6",
      title: "Když se obor uvolní",
      story: ["Výbor rozhodne, že tvoje místo v chapteru uvolní. Kromě dopisu ti zavolá i jeden člen výboru."],
      chapter: [
        fact(
          "Uvolnění místa znamená, že tvůj obor může v chapteru zastupovat někdo jiný. V pravidlech BNI se tomu říká otevření oboru.",
          "OM41",
          "M69"
        ),
        fact(
          "Místo se smí uvolnit až poté, co konzultant regionu potvrdí, že se dodržel postup. Předem schválí i dopis.",
          "M68",
          "OM19"
        ),
        fact("Když výbor uvolňuje místo bez předchozí zkušební doby, musí souhlasit i ředitel regionu.", "M62"),
        fact("Dopis podepisuje výbor jako celek. Je v něm jen jméno, datum a porušené pravidlo.", "M75", "OM18", "SM30"),
        fact("Jeden člen výboru ti zavolá a rozhodnutí krátce vysvětlí.", "OM17"),
        fact(
          "Výbor pak může chapteru na schůzce oznámit, že je obor volný. Třeba takhle: „Hledáme finančního poradce.“",
          "OM23",
          "OM24"
        ),
      ],
      chapterNotes: ["C5", "C10"],
      sourcesSummary: "manuál str. 41, 58, 59 a 60",
      comic: OBOR_COMICS["uvolneni-oboru"],
      // Gate T-006b, otevřený bod 1: `clen informed` místo `region informed`.
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "chybejici-obory",
      label: "Krok 7",
      title: "Obory, které chapter hledá",
      story: [
        "Na schůzce zazní, které obory chapter hledá. Jeden z nich je architekt.",
        "Znáš architektku, se kterou rád spolupracuješ. Pozveš ji na schůzku jako hosta.",
      ],
      chapter: [
        fact(
          "Člen výboru pro růst chapteru vede seznam oborů, které chapter nejvíc hledá, a sdílí ho s chapterem.",
          "OM25",
          "OM26"
        ),
        fact(
          "Hledané obory se určují podle kontaktních sfér. To jsou skupiny oborů, které si navzájem nejvíc předávají doporučení.",
          "OM27"
        ),
        fact("Ze své kontaktní sféry dostáváš 50 až 60 % doporučení.", "OM28"),
        fact("Nejdřív se podporují sféry, které v chapteru už jsou. Teprve pak se stavějí nové.", "OM29"),
        {
          ...fact(
            "Zpráva členského výboru zazní na schůzce každý týden. Říká i to, které profese chapter hledá.",
            "OM45",
            "OM31"
          ),
          link: { text: "na schůzce každý týden", href: "/pravidla/schuzka#hlavni-prezentace" },
        },
        fact(
          "Když pozveš hosta z oboru, který chapter hledá, pomůžeš zaplnit mezery ve své síti doporučení.",
          "OM32"
        ),
        fact("Pravidla od členů čekají, že budou do chapteru přivádět hosty nebo přinášet doporučení.", "H02"),
      ],
      sourcesSummary: "General Policy #6, manuál str. 16, 54 a 55",
      comic: OBOR_COMICS["chybejici-obory"],
      visual: {},
    },
  ],
  summary: {
    title: "Ve zkratce",
    goals: [1, 2, 3, 4, 5, 6],
    points: [
      {
        goal: 1,
        text: "Z každého oboru může být v chapteru jen jeden člen a každý člen má jen jeden obor.",
      },
      {
        goal: 2,
        text: "Zastupuješ svou hlavní profesi v oboru, který schválil výbor. Když podnikáš v síťovém marketingu, mluvíš o produktech a službách, které prodáváš.",
      },
      { goal: 3, text: "Obor změníš novou přihláškou. Schvaluje ji výbor." },
      {
        goal: 4,
        text: "S obavou kolem oboru se obrať na člena výboru pro vztahy mezi členy. Dál platí stejný postup jako u každé stížnosti.",
      },
      {
        goal: 5,
        text: "Uvolnění místa znamená, že tvůj obor může zastupovat někdo jiný. Konzultant regionu musí potvrdit, že se dodržel postup. Bez předchozí zkušební doby musí souhlasit i ředitel regionu.",
      },
      {
        goal: 6,
        text: "Chapter hledá chybějící obory. Pomůžeš, když pozveš hosta z hledaného oboru.",
      },
    ],
    whereToFind: [
      {
        doc: "general-policies",
        page: 1,
        rule: "General Policy #1, #2 a #10",
        labelCs: "jeden obor, hlavní profese a změna oboru",
      },
      {
        doc: "general-policies",
        page: 4,
        rule: "Business Representation",
        labelCs: "schválený obor a síťový marketing",
      },
      { doc: "ops-manual-2022", page: 16, labelCs: "zpráva členského výboru na schůzce" },
      { doc: "ops-manual-2022", page: 44, labelCs: "obor na přihlášce" },
      { doc: "ops-manual-2022", page: 48, labelCs: "katalog oborů BNI" },
      { doc: "ops-manual-2022", page: 54, labelCs: "hledané obory a kontaktní sféry" },
      { doc: "ops-manual-2022", page: 57, labelCs: "rozšiřování oboru a obavy" },
      { doc: "ops-manual-2022", page: 59, labelCs: "uvolnění místa a dopis" },
    ],
  },
  contacts: [
    { role: "Člen výboru pro posouzení přihlášek", when: "Když vybíráš obor na přihlášce." },
    { role: "Sekretář/pokladník chapteru", when: "Když měníš obor a ptáš se na poplatek." },
    { role: "Člen výboru pro vztahy mezi členy", when: "Když se tvůj obor překrývá s oborem jiného člena." },
    { role: "Člen výboru pro růst chapteru", when: "Když znáš někoho z oboru, který chapter hledá." },
    { role: "Viceprezident chapteru, vede členský výbor", when: "Když jde o rozhodnutí výboru o tvém oboru." },
  ],
  disclaimer: [
    "Tahle stránka je výklad našeho chapteru.",
    "Vychází z BNI Chapter Operations Manual 2022-2023, platného od 27. 7. 2022, a z BNI General Policies.",
    "Stav k {updated}.",
  ],
};
