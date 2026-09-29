/**
 * Info stránka „Kdo o čem v chapteru rozhoduje" (/pravidla/role, iter-030).
 *
 * Texty: content-writer T-005 (texty_role_iter-030_T-005.md) se 12 úpravami
 * a rozhodnutím otevřených bodů z gate T-006 (gate_iter-030_T-006.md).
 * Neměnit bez content-writera. Anglické citace jsou doslova z rejstříku
 * návrhu (`role-zdroje.ts`). Pole `obligation` se nevyplňuje: pravidla
 * a doporučení se na stránce nerozlišují. Žádná jména ani konkrétní případy.
 */
import type { Fact, InfoPage, RoleCard, SourceRef } from "@/lib/info-pages/types";
import { ROLE_COMICS } from "./role-komiksy";
import { ROLE_SOURCES } from "./role-zdroje";

/** Citace z rejstříku, neznámé id shodí build. */
function src(id: string, noteCs?: string): SourceRef {
  const ref = ROLE_SOURCES[id];
  if (!ref) throw new Error(`role.ts: citace ${id} není v rejstříku`);
  return noteCs ? { ...ref, noteCs } : ref;
}

function fact(text: string, ...sources: (string | SourceRef)[]): Fact {
  return { text, sources: sources.map((s) => (typeof s === "string" ? src(s) : s)) };
}

function refs(...ids: string[]): SourceRef[] {
  return ids.map((id) => src(id));
}

const NOT_STATED = "Manuál to neuvádí.";
const ALL_COMMITTEE = fact("O členství rozhoduje výbor jako celek.", "G1", "M63");

const CARDS: RoleCard[] = [
  {
    id: "prezident",
    title: "Prezident",
    lead: "Vede týdenní schůzky a dává chapteru směr.",
    inChart: "jádro vedení chapteru",
    comic: ROLE_COMICS.R1,
    fields: [
      {
        kind: "does",
        facts: [
          // T-010r3 (uživatel po BFU): úplný výčet toho, co prezident řídí (manuál str. 35 a 36).
          fact("Vede týdenní schůzku podle agendy BNI.", "M18"),
          fact("Vede měsíční setkání vedení, a to jeho první polovinu.", "M104", "M24"),
          fact("Dohlíží, aby všechny role ve vedení plnily svoje úkoly.", "M19"),
          fact("Dává chapteru směr a motivaci, aby splnil svoje cíle.", "M19"),
          fact("Každý týden mluví s konzultantem regionu.", "M19"),
          fact("Po schválení výborem zavolá přijatým uchazečům a přivítá je.", "M20"),
        ],
      },
      {
        kind: "decides",
        facts: [
          fact("Schvaluje platby, které platí sekretář/pokladník.", "M78"),
        ],
      },
      {
        kind: "approval",
        facts: [fact("Změnu místa schůzek musí předem schválit regionální nebo oblastní ředitel.", "M26")],
      },
      {
        kind: "notDecides",
        facts: [
          fact("O přijetí, volnu, zkušební době i konci členství rozhoduje členský výbor.", "G1", "M20"),
          fact("Z části měsíčního setkání, kde se jedná o členech, odchází. Tu část vede viceprezident.", "M11", "M12"),
        ],
      },
      {
        kind: "notDefined",
        facts: [
          fact(
            "Manuál prezidenta neuvádí mezi členy výboru ani neuvádí, že by o členství hlasoval.",
            src("M35", NOT_STATED)
          ),
        ],
      },
    ],
  },
  {
    id: "viceprezident",
    title: "Viceprezident",
    lead: "Vede členský výbor a hlídá docházku.",
    inChart: "jádro vedení chapteru, vede členský výbor",
    comic: ROLE_COMICS.R2,
    fields: [
      {
        kind: "does",
        facts: [
          fact(
            "Řídí členský výbor a svolává jeho měsíční i krátké týdenní porady. Vede evidenci docházky a hlídá pravidlo docházky.",
            "M28",
            "M29"
          ),
          fact(
            "Vede druhou polovinu měsíčního setkání, kde se jedná o členech. Když chybí prezident, vede týdenní schůzku.",
            "M12",
            "M30"
          ),
          fact(
            "Rozděluje úkoly ve výboru a odpovídá za to, že se včas splní. Při sporu může přizvat další členy chapteru.",
            "M36",
            "M72"
          ),
          fact(
            "Řídí prodlužování členství. Když výbor rozhodne členství neprodloužit, viceprezident prodloužení zamítne v systému BNI Connect. Když do 14 dnů před výročím nic neudělá, systém členství schválí sám.",
            "M99",
            "M100",
            "M101"
          ),
        ],
      },
      {
        kind: "decides",
        facts: [
          fact("Předem schvaluje týdenní zprávu výboru.", "M38"),
          fact("Určuje termín a poradu, na které výbor hlasuje o přihláškách.", "M31"),
          fact(
            "Spolu s konzultantem regionu dává souhlas, než člen výboru zavolá po čtvrté absenci nebo pošle dopis o uvolnění místa.",
            "M51"
          ),
        ],
      },
      { kind: "approval", facts: [] },
      {
        kind: "notDecides",
        facts: [
          fact(
            "O volnu, zkušební době ani konci členství nerozhoduje sám. Rozhoduje výbor a viceprezident v něm má stejný hlas jako ostatní.",
            "M35",
            "G1",
            "G4",
            "M65"
          ),
        ],
      },
      {
        kind: "notDefined",
        facts: [
          fact(
            "Kdo obsadí místo člena výboru, kterého se spor týká, manuál neurčuje.",
            src("M71", "Manuál odkazuje na postup, který na uvedeném místě nepopisuje."),
            "M72"
          ),
        ],
      },
    ],
  },
  {
    id: "clensky-vybor",
    title: "Členský výbor",
    lead: "Skupina členů chapteru, která rozhoduje o členství. Vede ji viceprezident.",
    inChart: "pod viceprezidentem, se čtyřmi specializacemi",
    comic: ROLE_COMICS.R3,
    fields: [
      {
        kind: "does",
        facts: [
          // T-010r2 (uživatel): složení na začátku karty, sloučeno s faktem M35.
          fact(
            "Členský výbor se skládá z členů, kteří zastupují tyto role: posouzení přihlášek, růst chapteru, zapojení členů a vztahy mezi členy. Vede ho viceprezident, který hlasuje stejně jako ostatní.",
            "M37",
            "M35"
          ),
          fact(
            "Každý chapter musí mít členský výbor. Má lichý počet členů včetně viceprezidenta a funkce v něm trvá po dobu období vedení.",
            "M32",
            "M33",
            "M34"
          ),
          fact("Porady výboru jsou otevřené viceprezidentovi, členům výboru a konzultantovi regionu.", "M40"),
          fact("Dopisy výboru se podepisují vždy za výbor, nikdy jménem jednotlivce.", "M75"),
          // T-010r2 (uživatel): přesunuto z karty viceprezidenta.
          fact(
            "Než výbor u stížnosti postoupí dál, viceprezident se obrátí na konzultanta regionu pro podporu.",
            "M61"
          ),
        ],
      },
      {
        kind: "decides",
        facts: [
          fact(
            "V otázkách pravidel BNI má v chapteru konečné slovo. Může člena dát na zkušební dobu nebo uvolnit jeho místo.",
            "G1",
            "G2"
          ),
          fact(
            "Přijímá nové členy a schvaluje obor, který člen zastupuje. Změna oboru znamená novou přihlášku.",
            "M20",
            "G18",
            "G5"
          ),
          fact("Rozhoduje o volnu, obvykle do 8 týdnů. Delší volno může povolit podle situace.", "G4", "M55", "M56"),
          fact(
            "O zkušební době stačí většina výboru včetně viceprezidenta, výbor se ale snaží o shodu. Délku určí výbor.",
            "M65",
            "M67"
          ),
          fact("O stížnosti rozhoduje většina úplného a proškoleného výboru. Cílem je shoda.", "M63", "M64"),
          fact(
            "Rozhoduje, jestli se členství prodlouží. Konečné rozhodnutí o neprodloužení padá kolem data výročí.",
            "M50",
            "M15"
          ),
          fact("Může napomenout členy, kteří chodí pozdě nebo odcházejí dřív.", "G17"),
        ],
      },
      {
        kind: "approval",
        facts: [
          fact(
            "Než výbor uvolní něčí místo nebo pošle dopis o zkušební době, konzultant regionu potvrdí, že se dodržel postup, a dopis předem schválí.",
            "M66",
            "M68",
            "M74"
          ),
          fact(
            "Uvolnit místo bez zkušební doby může výbor se souhlasem konzultanta regionu a ředitele regionu.",
            "M62",
            "M69"
          ),
        ],
      },
      {
        kind: "notDecides",
        facts: [
          fact(
            "O poplatcích a o vyřazení za jejich nezaplacení nerozhoduje. To řeší BNI a regionální kancelář.",
            "G10",
            "M85"
          ),
        ],
      },
      {
        kind: "notDefined",
        // Gate T-006, úprava 10: věta o G1/G14 smazána.
        facts: [fact("Kdo obsadí místo člena výboru, kterého se spor týká, manuál neurčuje.", "M71")],
      },
    ],
    subAnchors: [
      {
        id: "vybor-prihlasky",
        title: "Posouzení přihlášek",
        facts: [
          fact(
            "Prověřuje uchazeče a jejich obor dřív, než je výbor přijme. Dbá, aby obory členů v chapteru do sebe zapadaly.",
            "M41",
            "M103"
          ),
          ALL_COMMITTEE,
        ],
      },
      {
        id: "vybor-rust",
        title: "Růst chapteru",
        facts: [
          fact(
            "Volá členům, kteří chyběli, a vede seznam oborů, které chapter nejvíc hledá. Před telefonátem po čtvrté absenci a před dopisem o uvolnění místa potřebuje souhlas viceprezidenta a konzultanta regionu.",
            "M51"
          ),
          ALL_COMMITTEE,
        ],
      },
      {
        id: "vybor-zapojeni",
        title: "Zapojení členů",
        facts: [
          fact(
            "Hlídá, aby se o prodloužení členství rozhodlo včas. Chystá rozhovor se členem v sedmém měsíci jeho členství.",
            "M49"
          ),
          ALL_COMMITTEE,
        ],
      },
      {
        id: "vybor-vztahy",
        title: "Vztahy mezi členy",
        facts: [
          fact(
            "Přijímá obavy a stížnosti, ústní i písemné. Když přijde písemná stížnost, dá hned vědět viceprezidentovi a konzultantovi regionu.",
            "M58",
            "M59"
          ),
          ALL_COMMITTEE,
        ],
      },
    ],
    chapterNotes: ["C9", "C10", "C11", "C12"],
  },
  {
    id: "konzultant-regionu",
    title: "Konzultant regionu",
    lead: "Člověk z regionu BNI, který má náš chapter na starosti. V pravidlech je to Director nebo Director Consultant.",
    inChart: "region BNI, mimo chapter",
    comic: ROLE_COMICS.R4,
    fields: [
      {
        kind: "does",
        facts: [
          fact(
            "Každý týden mluví s prezidentem, viceprezidentem a sekretářem/pokladníkem. Vede výběr nového vedení.",
            "M22",
            "M23"
          ),
          fact(
            "Provede chapter postupem u převodu člena a u volna. Vydává kredit za nevyčerpané členství.",
            "M48",
            "M57",
            "M53"
          ),
          fact(
            "Může mít na schůzce prezentaci. Když jde o téma celého chapteru, výbor ho o ni může požádat.",
            "G3",
            "M70"
          ),
          fact("Může být na poradách výboru a na celém měsíčním setkání vedení.", "M40", "M14", "M24"),
          fact("Dostává kopie dopisů výboru a upozornění k prodloužení členství.", "M76", "M102"),
        ],
      },
      {
        kind: "decides",
        facts: [
          fact(
            "Potvrzuje, že výbor dodržel postup u zkušební doby a u uvolnění místa. Dopisy o zkušební době a o uvolnění místa předem schvaluje.",
            "M66",
            "M68",
            "M74"
          ),
          fact(
            "Spolu s viceprezidentem dává souhlas, než člen výboru zavolá po čtvrté absenci nebo pošle dopis o uvolnění místa.",
            "M51"
          ),
        ],
      },
      {
        kind: "approval",
        facts: [
          fact(
            "Když výbor uvolňuje místo bez zkušební doby, musí vedle konzultanta regionu souhlasit i ředitel regionu.",
            "M62",
            "M69"
          ),
        ],
      },
      {
        kind: "notDecides",
        facts: [
          fact("O volnu a o délce zkušební doby rozhoduje výbor.", "G4", "M67"),
          fact("Účet chapteru pro jiné než BNI činnosti nekoordinuje. Je věcí členů.", "M82"),
        ],
      },
      {
        kind: "notDefined",
        facts: [
          fact(
            "Manuál konzultanta regionu neuvádí mezi členy výboru ani neuvádí, že by ve výboru hlasoval.",
            src("M35", NOT_STATED),
            "M63",
            "M65"
          ),
        ],
      },
    ],
    chapterNotes: ["C11"],
  },
  {
    id: "region",
    title: "BNI a region",
    lead: "Patří sem BNI Global, franšízant s licencí BNI pro náš region a regionální kancelář BNI.",
    inChart: "region BNI, mimo chapter",
    comic: ROLE_COMICS.R5,
    fields: [
      {
        kind: "does",
        facts: [
          fact("BNI zakládá chaptery a v jednom městě jich může otevřít víc.", "G9"),
          fact("Regionální kancelář zpracovává všechny poplatky za členství.", "M85"),
          fact("Regionální tým pomáhá, aby se z hostů stávali členové.", "M08"),
          // Gate T-006, úprava 8: posouzení změn pravidel není souhlas.
          fact("Každý návrh na změnu pravidel BNI nejdřív posoudí mezinárodní poradní rada BNI.", "G7"),
        ],
      },
      {
        kind: "decides",
        facts: [
          fact("Změnu místa schůzek předem schvaluje regionální nebo oblastní ředitel.", "M26"),
          fact("Schůzku delší než 90 minut v chapteru s 50 a víc členy schvaluje ředitel regionu.", "M07"),
          fact(
            "S uvolněním místa bez zkušební doby musí souhlasit ředitel regionu, spolu s konzultantem regionu.",
            "M62",
            "M69"
          ),
        ],
      },
      { kind: "approval", facts: [] },
      {
        kind: "notDecides",
        facts: [
          fact(
            "Účet chapteru pro jiné než BNI činnosti je věcí členů. BNI ani franšízant za něj neručí.",
            "M82",
            "M83",
            "M84"
          ),
        ],
      },
      // Gate T-006, úprava 9: věta o G1/G14 smazána, právo G14 je v seznamu práv (R10).
      { kind: "notDefined", facts: [] },
    ],
    link: { href: "#prava-regionu", label: "Všechna práva BNI a regionu" },
    subAnchors: [
      {
        id: "reditel-regionu",
        title: "Ředitel regionu",
        facts: [
          fact(
            // T-010r5 (uživatel): u ředitele regionu jen název z pravidel (M01).
            "V pravidlech Executive Director nebo Regional Director.",
            "M01"
          ),
          fact("Souhlasí s uvolněním místa bez zkušební doby a se schůzkou delší než 90 minut.", "M62", "M07"),
        ],
      },
    ],
  },
  {
    id: "sekretar-pokladnik",
    title: "Sekretář/pokladník",
    lead: "Stará se o poplatky, pořadí prezentací a peníze chapteru.",
    inChart: "jádro vedení chapteru",
    comic: ROLE_COMICS.R6,
    fields: [
      {
        kind: "does",
        facts: [
          fact("Hlídá a připomíná poplatky za členství.", "M77"),
          fact("Vede pořadí prezentací a zařadí do něj i termíny konzultanta regionu.", "M81"),
          fact("Platí účty chapteru a jednou ročně sestaví rozpočet.", "M78", "M79"),
          fact("Účastní se výběru nového vedení.", "M80"),
        ],
      },
      { kind: "decides", facts: [] },
      { kind: "approval", facts: [fact("Platby z účtu chapteru předem schvaluje prezident.", "M78")] },
      {
        kind: "notDecides",
        facts: [
          fact("Peníze za členství nepřijímá. Jdou vždy regionální kanceláři.", "M85", "M87"),
          fact(
            "O účtu chapteru pro jiné než BNI činnosti (jídlo, dárky, akce) rozhodují členové. Podepisují ho dva lidé, typicky prezident a sekretář/pokladník.",
            "M83",
            "M88"
          ),
        ],
      },
      { kind: "notDefined", facts: [] },
    ],
  },
  {
    id: "vzdelavaci-koordinator",
    title: "Vzdělávací koordinátor",
    lead: "Připravuje krátké vzdělávací okénko na schůzce.",
    inChart: "širší tým vedení",
    comic: ROLE_COMICS.R7,
    fields: [
      {
        kind: "does",
        facts: [
          fact("Připravuje dvou až tříminutové vzdělávací okénko. Může ho svěřit jiným členům.", "M93", "M95"),
          fact("Každý týden ladí témata s prezidentem.", "M94"),
        ],
      },
      { kind: "decides", facts: [fact("Vybírá téma okénka tak, aby odpovídalo cílům chapteru.", "M94")] },
      { kind: "approval", facts: [] },
      { kind: "notDecides", facts: [fact("O členství nerozhoduje, rozhoduje členský výbor.", "G1")] },
      { kind: "notDefined", facts: [] },
    ],
  },
  {
    id: "koordinator-mentoru",
    title: "Koordinátor mentorů",
    lead: "Stará se o to, aby každý nový člen měl mentora.",
    inChart: "širší tým vedení, není ve výboru",
    comic: ROLE_COMICS.R8,
    fields: [
      {
        kind: "does",
        facts: [
          fact("Dohlíží, aby každý nový člen prošel programem mentorů, a přiděluje mentory.", "M96"),
          fact("Jednomu mentorovi nepřiděluje víc úloh najednou, aby nový člen poznal víc lidí.", "M98"),
        ],
      },
      { kind: "decides", facts: [fact("Spolu s členským výborem vybírá kandidáty na mentory.", "M97")] },
      { kind: "approval", facts: [] },
      { kind: "notDecides", facts: [fact("O členství nerozhoduje. Členem výboru není.", "M17", "G1")] },
      { kind: "notDefined", facts: [] },
    ],
  },
  {
    id: "hostitele",
    title: "Tým hostitelů",
    lead: "Vítá hosty a náhradníky na schůzce.",
    inChart: "širší tým vedení",
    comic: ROLE_COMICS.R9,
    fields: [
      {
        kind: "does",
        facts: [
          fact("Vítá hosty a náhradníky. Po schůzce jim vysvětlí, jak se přihlásit, a ozve se jim.", "M90"),
          fact("Když má host zájem, ale jeho obor je obsazený, dá vědět konzultantovi regionu.", "M91"),
          fact("Koordinátor hostitelů chodí na měsíční setkání vedení.", "M92"),
        ],
      },
      { kind: "decides", facts: [] },
      { kind: "approval", facts: [] },
      { kind: "notDecides", facts: [fact("O přijetí hosta rozhoduje členský výbor.", "M20", "G18")] },
      { kind: "notDefined", facts: [] },
    ],
  },
];

export const ROLE_PAGE: InfoPage<"leadership-chart"> = {
  slug: "role",
  title: "Kdo o čem v chapteru rozhoduje",
  // Gate T-006, úprava 1.
  description: "Kdo v chapteru přijímá nové členy, kdo řeší stížnosti a jak se mění vedení.",
  updated: "2026-09-29",
  visual: "leadership-chart",
  situations: [
    { label: "Kdo mi schválí volno", anchor: "situace-volno" },
    { label: "Kdo rozhoduje o přijetí nového člena", anchor: "situace-prihlaska" },
    { label: "Chci si stěžovat na člena", anchor: "stiznost-podani" },
    { label: "Kdo vybírá nové vedení", anchor: "situace-vedeni" },
    { label: "Kdo je konzultant regionu", anchor: "konzultant-regionu" },
    { label: "Co pravidla dávají BNI a regionu", anchor: "prava-regionu" },
  ],
  // T-010r3 (uživatel po BFU): rychlá navigace pod úvodem.
  toc: [
    { label: "Příběhy", anchor: "prihlaska-host" },
    { label: "Vedení chapteru", anchor: "vedeni" },
    {
      label: "Role",
      anchor: "role-karty",
      children: [
        { label: "Prezident", anchor: "prezident" },
        { label: "Viceprezident", anchor: "viceprezident" },
        { label: "Členský výbor", anchor: "clensky-vybor" },
        { label: "Konzultant regionu", anchor: "konzultant-regionu" },
        { label: "Region a franšízant", anchor: "region" },
        { label: "Sekretář/pokladník", anchor: "sekretar-pokladnik" },
        { label: "Vzdělávací koordinátor", anchor: "vzdelavaci-koordinator" },
        { label: "Koordinátor mentorů", anchor: "koordinator-mentoru" },
        { label: "Tým hostitelů", anchor: "hostitele" },
      ],
    },
    { label: "Kdo o čem rozhoduje", anchor: "kdo-rozhoduje" },
    { label: "Práva BNI a regionu", anchor: "prava-regionu" },
  ],
  intro: {
    question: "Chceš do chapteru přivést nového člena. Kdo o něm rozhodne?",
    lead: ["Každá věc v chapteru má svoji roli, která o ní rozhoduje. Někdy musí předem souhlasit ještě někdo další."],
    comic: ROLE_COMICS.R10,
    visual: {
      roles: [],
      srText:
        "Schéma vedení chapteru. Prezident, viceprezident a sekretář/pokladník tvoří jádro vedení. Viceprezident vede členský výbor se čtyřmi specializacemi. Mimo chapter je region BNI s konzultantem regionu a ředitelem regionu.",
    },
  },
  steps: [
    {
      type: "scene",
      variant: "main",
      id: "prihlaska-host",
      label: "Přihláška, krok 1",
      title: "Přivedeš hosta, který chce do chapteru",
      story: [
        "Na schůzku vezmeš svého účetního, se kterým roky spolupracuješ. Schůzka se mu líbí a chce se přidat.",
        "U dveří ho přivítá tým hostitelů. Po schůzce mu vysvětlí, jak se přihlásit, a ozve se mu.",
      ],
      chapter: [
        fact("Tým hostitelů vítá hosty i náhradníky, aby si ze schůzky odnesli dobrý první dojem.", "M90"),
        fact("Aby se z hosta stal člen, pomáhá i regionální tým BNI.", "M08"),
        fact(
          "Když má host zájem, ale jeho obor už v chapteru někdo zastupuje, hostitelé dají vědět konzultantovi regionu.",
          "M91"
        ),
      ],
      sourcesSummary: "manuál str. 28, 66 a 67",
      comic: ROLE_COMICS.R9,
      visual: {
        roles: [
          { role: "hostitele", relation: "acts" },
          { role: "region", relation: "advises", label: "regionální tým BNI" },
        ],
        srText: "Hosta vítá tým hostitelů. Regionální tým BNI pomáhá.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "prihlaska-posouzeni",
      label: "Přihláška, krok 2",
      title: "Výbor přihlášku posoudí a hlasuje",
      story: [
        // Gate T-006, úprava 2.
        "Tvůj účetní pošle přihlášku. Člen výboru pro posouzení přihlášek ji prověří. Dívá se hlavně na to, jestli obor účetního do chapteru zapadá.",
        "Viceprezident určí termín a poradu, na které výbor o přihlášce hlasuje.",
      ],
      chapter: [
        fact(
          "Člen výboru pro posouzení přihlášek ověří, že uchazeč je ve svém oboru kvalitní profesionál a že jeho obor do chapteru zapadá.",
          "M41",
          "M103"
        ),
        fact("O přijetí rozhoduje členský výbor. Schvaluje i obor, který člen v chapteru zastupuje.", "M20", "G18"),
        fact("Jestli se obor uchazeče nepřekrývá s oborem někoho z chapteru, posoudí výbor.", "M47"),
        fact("Uchazeč se výsledek dozví do další schůzky.", "M45"),
      ],
      sourcesSummary: "General Policies (Business Representation), manuál str. 30, 35, 42, 47 a 51",
      visual: {
        roles: [
          { role: "vybor-prihlasky", relation: "acts" },
          { role: "clensky-vybor", relation: "decides" },
        ],
        srText: "O přihlášce rozhoduje členský výbor. Člen výboru pro posouzení přihlášek ji předem prověří.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "prihlaska-privitani",
      label: "Přihláška, krok 3",
      title: "Prezident zavolá a přivítá",
      story: [
        "Výbor přihlášku schválí. Prezident chapteru tvému účetnímu zavolá a přivítá ho.",
        "Na další schůzce ho uvidíš už jako člena.",
      ],
      chapter: [
        fact("Po schválení výborem prezident přijatým uchazečům zavolá a přivítá je v chapteru.", "M20"),
        fact("Koordinátor mentorů dohlédne, aby nový člen prošel programem mentorů.", "M96"),
        fact("Kdo chce později změnit obor, podává novou přihlášku.", "G5"),
      ],
      sourcesSummary: "General Policy #10, manuál str. 35 a 75",
      visual: {
        roles: [
          { role: "prezident", relation: "acts" },
          { role: "clen", relation: "informed" },
        ],
        srText: "Prezident přijatého uchazeče přivítá. Ty ho na další schůzce uvidíš jako člena.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "stiznost-podani",
      label: "Stížnost, krok 1",
      title: "Podáš stížnost písemně",
      story: [
        "Předal jsi kontakt na klienta jednomu členovi chapteru. Ten se klientovi tři týdny neozval a klient si stěžuje tobě.",
        "Probereš to s členem výboru pro vztahy mezi členy. Když chceš, aby to výbor řešil, sepíšeš stížnost.",
      ],
      chapter: [
        fact("Člen výboru pro vztahy mezi členy přijímá obavy i stížnosti, ústní i písemné.", "M58"),
        fact("Výbor postupuje dál, až když je stížnost napsaná.", "M60"),
        fact(
          "Jakmile písemná stížnost přijde, člen výboru pro vztahy mezi členy dá hned vědět viceprezidentovi a konzultantovi regionu.",
          "M59"
        ),
      ],
      sourcesSummary: "manuál str. 57 a 58",
      visual: {
        roles: [
          { role: "vybor-vztahy", relation: "acts" },
          { role: "viceprezident", relation: "informed" },
          { role: "konzultant-regionu", relation: "informed" },
        ],
        srText:
          "Stížnost přijímá člen výboru pro vztahy mezi členy. Viceprezident a konzultant regionu se o ní hned dozví.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "stiznost-postup",
      label: "Stížnost, krok 2",
      title: "Výbor vyslechne obě strany",
      story: [
        "Viceprezident se nejdřív spojí s konzultantem regionu.",
        "Výbor pak mluví s tebou i se členem, na kterého si stěžuješ. Každý řekne, jak to vidí.",
      ],
      chapter: [
        fact("Viceprezident se před dalším postupem obrátí na konzultanta regionu pro podporu.", "M61"),
        fact("Celý výbor včetně viceprezidenta se sejde a probere, co zaznělo v rozhovorech.", "M64"),
        fact(
          "Když se spor týká člena výboru, ten po dobu sporu svou funkci ve výboru nevykonává. Viceprezident může podle potřeby přizvat další členy chapteru.",
          "M71",
          "M72"
        ),
      ],
      chapterNotes: ["C11"],
      sourcesSummary: "manuál str. 58 až 60",
      comic: ROLE_COMICS.R4,
      visual: {
        roles: [
          { role: "viceprezident", relation: "acts" },
          { role: "konzultant-regionu", relation: "advises" },
          { role: "clensky-vybor", relation: "decides" },
        ],
        srText: "Viceprezident se obrátí na konzultanta regionu, který radí. Rozhodovat bude členský výbor.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "stiznost-rozhodnuti",
      label: "Stížnost, krok 3",
      title: "Výbor rozhodne, konzultant regionu potvrdí postup",
      story: [
        "Výbor hlasuje. Když dá členovi zkušební dobu, konzultant regionu před odesláním dopisu potvrdí, že se dodržel postup.",
        "Kdyby výbor chtěl místo uvolnit bez zkušební doby, musí souhlasit i ředitel regionu.",
      ],
      chapter: [
        fact("O stížnosti rozhoduje většina úplného a proškoleného výboru. Cílem je shoda.", "M63"),
        fact(
          "O zkušební době stačí rozhodnout většinou výboru včetně viceprezidenta. I tady se výbor snaží o shodu a délku zkušební doby určí sám.",
          "M65",
          "M67"
        ),
        fact("Konzultant regionu potvrdí, že se dodržel postup, a dopis předem schválí.", "M66", "M68", "M74"),
        fact(
          "Uvolnit místo bez zkušební doby může výbor se souhlasem konzultanta regionu a ředitele regionu.",
          "M62"
        ),
        fact(
          "Dopisy podepisuje vždy členský výbor, nikdy jednotlivec. Kopie kontrolního listu jde regionální kanceláři BNI.",
          "M75",
          "M73"
        ),
      ],
      chapterNotes: ["C10", "C12"],
      sourcesSummary: "manuál str. 58 až 60",
      comic: ROLE_COMICS.R3,
      // Gate T-006, úprava 6: bez ředitele regionu (schéma neumí podmínku).
      visual: {
        roles: [
          { role: "clensky-vybor", relation: "decides" },
          { role: "konzultant-regionu", relation: "approves" },
        ],
        srText: "Rozhoduje členský výbor. Konzultant regionu musí potvrdit, že se dodržel postup.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "vedeni-vyber",
      label: "Nové vedení, krok 1",
      title: "Vybírá se nové vedení",
      story: [
        // Gate T-006, úprava 3.
        "Blíží se konec března a s ním konec období vedení. Hledá se, kdo převezme role na další půlrok.",
        "Možná dostaneš otázku, jestli bys některou roli nevzal.",
      ],
      chapter: [
        // Gate T-006, úprava 4.
        fact("Výběr nového vedení vede konzultant regionu. Prezident a sekretář/pokladník se ho účastní.", "M23", "M80"),
        fact("Kdo nové vedení vybírá a na jak dlouho, manuál neurčuje.", src("M23", NOT_STATED)),
        fact("Když některá role zůstane neobsazená, vedení ji má obsadit do měsíce.", "M13"),
      ],
      chapterNotes: ["C8"],
      sourcesSummary: "manuál str. 32, 36 a 63",
      comic: ROLE_COMICS.R11,
      visual: {
        roles: [
          { role: "konzultant-regionu", relation: "acts" },
          { role: "prezident", relation: "advises" },
          { role: "sekretar-pokladnik", relation: "advises" },
        ],
        srText: "Výběr nového vedení vede konzultant regionu. Prezident a sekretář/pokladník se ho účastní.",
      },
    },
    {
      type: "scene",
      variant: "main",
      id: "vedeni-nove-obdobi",
      label: "Nové vedení, krok 2",
      title: "Začíná nové období",
      story: [
        // Gate T-006, úprava 5.
        "Prvního dubna převezme role nové vedení. Ve stejný den začíná nové období i členskému výboru.",
        "Hned na začátku se dozvíš, kdo má jakou roli.",
      ],
      chapter: [
        fact("Funkce ve výboru trvá stejně dlouho jako období vedení.", "M34"),
        fact(
          "Výbor má lichý počet členů včetně viceprezidenta. Viceprezident ho vede a hlasuje v něm jako ostatní.",
          "M33",
          "M35"
        ),
        fact("Každou ze čtyř specializací výboru má na starosti jeden člen výboru.", "M37"),
        fact("Výbor chapteru vysvětlí, jaké má role a kdo má co na starosti.", "M39"),
      ],
      chapterNotes: ["C9"],
      sourcesSummary: "manuál str. 41",
      visual: {
        roles: [
          { role: "clensky-vybor", relation: "acts" },
          { role: "viceprezident", relation: "acts" },
          { role: "clen", relation: "informed" },
        ],
        srText:
          "Začíná nové období. Viceprezident a členský výbor převezmou svoje úkoly. Ty se dozvíš, kdo má jakou roli.",
      },
    },
  ],
  reference: {
    title: "Vedení chapteru",
    lead: ["Vedení chapteru tvoří členové chapteru, kteří převzali některou roli."],
    facts: [
      fact(
        "Chapter řídí tým vedení. Jádro tvoří prezident, viceprezident a sekretář/pokladník a tihle tři každý týden mluví s konzultantem regionu.",
        "M21",
        "M22"
      ),
      fact("Ostatní role, včetně členů výboru, tvoří širší tým vedení.", "M42"),
      fact(
        "Kdo nové vedení vybírá a na jak dlouho, manuál neurčuje. Výběr vede konzultant regionu, prezident a sekretář/pokladník se ho účastní.",
        "M23",
        "M80"
      ),
      fact("Neobsazenou roli má vedení obsadit do měsíce.", "M13"),
      // T-010r2 (uživatel): místo „z něj nevyčteš" kde to najdeš, s odkazem na tabulku.
      {
        ...fact(
          "Schéma vedení v manuálu ukazuje, kdo komu v chodu chapteru pomáhá. Kdo o čem rozhoduje, najdeš v tabulce Kdo o čem rozhoduje.",
          "M17"
        ),
        link: { text: "Kdo o čem rozhoduje.", href: "#kdo-rozhoduje" },
      },
    ],
    chapterNotes: ["C8", "C9", "C13"],
    roles: CARDS,
    decisions: [
      {
        id: "situace-volno",
        situation: "Potřebuju volno",
        decides: "Členský výbor",
        approves: "Pravidla neuvádějí",
        advises: "Konzultant regionu provede chapter postupem. Viceprezident zapíše volno do docházky.",
        informed: "Chapter, volno je vidět v docházce",
        sources: refs("G4", "M55", "M56", "M57"),
        link: { href: "/pravidla/absence#volno", label: "Jak funguje volno" },
      },
      {
        id: "situace-prihlaska",
        situation: "Přihláška nového člena",
        decides: "Členský výbor hlasováním",
        approves: "Pravidla neuvádějí",
        advises:
          "Člen výboru pro posouzení přihlášek uchazeče prověří. Hostitelé a regionální tým pomáhají s hosty.",
        informed: "Uchazeč do další schůzky. Po přijetí mu zavolá prezident a přivítá ho.",
        sources: refs("M41", "M31", "M45", "M20", "M08"),
      },
      {
        id: "situace-obor",
        situation: "Spor o obor",
        decides: "Členský výbor. Schvaluje obor a posoudí, jestli se obory nepřekrývají.",
        approves: "Pravidla neuvádějí",
        advises: "Člen výboru pro vztahy mezi členy přijme obavu.",
        informed: "Pravidla neuvádějí",
        sources: refs("G18", "M47", "M46", "M58"),
      },
      {
        id: "situace-ctvrta-absence",
        situation: "Čtvrtá absence",
        decides: "Členský výbor",
        approves:
          "Před telefonátem a dopisem viceprezident a konzultant regionu. Před uvolněním místa konzultant regionu potvrdí postup.",
        advises: "Člen výboru pro růst chapteru volá.",
        informed: "Konzultant regionu a regionální kancelář dostanou kopii dopisu.",
        sources: refs("M51", "M52", "M68", "M76"),
        link: { href: "/pravidla/absence#ctvrta-absence", label: "Co se děje po čtvrté absenci" },
      },
      {
        id: "situace-zkusebni-doba",
        situation: "Zkušební doba",
        decides: "Členský výbor většinou hlasů včetně viceprezidenta. Určí i délku.",
        approves: "Konzultant regionu potvrdí postup a schválí dopis.",
        advises: "Dva členové výboru se členem mluví.",
        informed: "Konzultant regionu a regionální kancelář dostanou kopii dopisu.",
        sources: refs("M65", "M66", "M67", "M74", "M76"),
      },
      {
        id: "situace-stiznost",
        situation: "Stížnost na člena",
        decides: "Úplný a proškolený výbor většinou hlasů",
        approves:
          "Konzultant regionu potvrdí postup. Při uvolnění místa bez zkušební doby souhlasí i ředitel regionu.",
        advises:
          "Člen výboru pro vztahy mezi členy stížnost přijme. Viceprezident se obrátí na konzultanta regionu pro podporu a může přizvat další členy.",
        informed: "Regionální kancelář dostane kopii kontrolního listu.",
        sources: refs("M60", "M61", "M63", "M62", "M66", "M68", "M69", "M72", "M73"),
      },
      {
        id: "situace-prevod",
        situation: "Přesun do jiného chapteru",
        decides: "Členský výbor nového chapteru",
        approves: "Pravidla neuvádějí",
        advises:
          "Konzultant regionu provede chapter postupem. Kvůli přesunu do sousedního chapteru se kredit nevydává.",
        informed: "Pravidla neuvádějí",
        sources: refs("G15", "M48", "M54"),
      },
      {
        id: "situace-vedeni",
        situation: "Výběr nového vedení",
        decides: "Kdo vybírá, manuál neurčuje.",
        approves: "Pravidla neuvádějí",
        advises: "Konzultant regionu výběr vede. Prezident a sekretář/pokladník se ho účastní.",
        informed: "Pravidla neuvádějí",
        sources: refs("M23", "M80", "M13"),
      },
      {
        id: "situace-schuzka",
        situation: "Program a místo schůzky",
        decides:
          "Schůzka jde podle agendy BNI. Téma jednou měsíčně vybírá vedení. Vzdělávací okénko vybírá vzdělávací koordinátor s ohledem na cíle chapteru.",
        approves:
          "Změnu místa regionální nebo oblastní ředitel. Schůzku delší než 90 minut v chapteru s 50 a víc členy ředitel regionu.",
        advises: "Prezident vede schůzku. Konzultant regionu může mít prezentaci.",
        informed: "Pravidla neuvádějí",
        sources: refs("M05", "M18", "M27", "M94", "M26", "M07", "G3"),
      },
      {
        id: "situace-penize",
        situation: "Peníze chapteru",
        decides: "Poplatky za členství zpracovává regionální kancelář. O účtu chapteru rozhodují členové.",
        approves: "Platby z účtu chapteru schvaluje prezident.",
        advises:
          "Sekretář/pokladník platí účty a sestaví rozpočet. Účet podepisují dva lidé, typicky prezident a sekretář/pokladník. Když jeden z nich skončí, náhradu vyberou členové.",
        informed: "Pravidla neuvádějí",
        sources: refs("M85", "M86", "M87", "M83", "M84", "M78", "M79", "M88", "M89"),
      },
    ],
    rights: [
      { id: "r1", text: "Pravidla BNI se můžou měnit. Každý návrh změny nejdřív posoudí mezinárodní poradní rada BNI.", sources: refs("G7") },
      {
        id: "r2",
        text: "Prezentaci na schůzce můžou mít členové, kteří prošli programem pro nové členy, a konzultanti regionu.",
        sources: refs("G3"),
      },
      {
        id: "r3",
        text: "Obchodní nabídky členům jiných chapterů a konzultantům regionu můžeš posílat, jen když s tím souhlasí.",
        sources: refs("G6"),
      },
      { id: "r4", text: "Výši poplatků a pokyny k platbě ti řekne sekretář/pokladník chapteru.", sources: refs("G8") },
      { id: "r5", text: "BNI zakládá chaptery a v jednom městě jich může otevřít víc.", sources: refs("G9") },
      { id: "r6", text: "Když člen nezaplatí poplatky do 15 dnů, BNI ho vyřadí.", sources: refs("G10") },
      {
        id: "r7",
        text: "Poplatky nejde převést na jiného člověka. Výjimkou je převod v rámci stejné firmy.",
        sources: refs("G11"),
      },
      {
        id: "r8",
        text: "Člen, který odchází v dobrém, dostane na požádání kredit za nevyčerpané období.",
        sources: refs("G12"),
      },
      {
        id: "r9",
        text: "Když se platba vrátí, má člen tři pracovní dny, aby to vyřešil s regionální kanceláří BNI.",
        sources: refs("G13"),
      },
      { id: "r10", text: "BNI i každý franšízant si vyhrazují právo ukončit účast člena.", sources: refs("G14") },
      {
        id: "r11",
        text: "Kdo přechází do jiného chapteru, podává novou přihlášku výboru nového chapteru.",
        sources: refs("G15"),
      },
      {
        id: "r12",
        text: "Když pravidla mluví o Directorovi, může jít o konzultanta regionu (Director, Director Consultant, Sr. Director Consultant), oblastního ředitele (Area Director), ředitele regionu (Executive Director) nebo národního ředitele (National Director).",
        sources: refs("M01"),
      },
      {
        id: "r13",
        text: "BNI nepodpoří žádné rozhodnutí chapteru, které porušuje zákaz diskriminace.",
        sources: refs("M02"),
      },
      {
        id: "r14",
        text: "BNI netoleruje obtěžování franšízantů, regionálních týmů, vedení chapterů ani členů.",
        sources: refs("M03"),
      },
      {
        id: "r15",
        text: "Chapter s 50 a víc členy může mít schůzku delší než 90 minut, když to schválí ředitel regionu.",
        sources: refs("M07"),
      },
      { id: "r16", text: "Regionální tým pomáhá, aby se z hostů stávali členové.", sources: refs("M08") },
      {
        id: "r17",
        text: "Konzultant regionu může být na měsíčním setkání vedení, i v části, kde se jedná o členech.",
        sources: refs("M24", "M14"),
      },
      {
        id: "r18",
        text: "Konzultant regionu každý týden mluví s prezidentem, viceprezidentem a sekretářem/pokladníkem.",
        sources: refs("M22"),
      },
      { id: "r19", text: "Výběr nového vedení vede konzultant regionu.", sources: refs("M23", "M80") },
      {
        id: "r20",
        text: "Změnu místa schůzek musí předem schválit regionální nebo oblastní ředitel.",
        sources: refs("M26"),
      },
      { id: "r21", text: "Konzultant regionu může být na poradách členského výboru.", sources: refs("M40") },
      {
        id: "r22",
        text: "U převodu člena a u volna provede konzultant regionu chapter postupem. Kredit vydává konzultant regionu.",
        sources: refs("M48", "M57", "M53"),
      },
      {
        id: "r23",
        text: "Než člen výboru zavolá po čtvrté absenci nebo pošle dopis o uvolnění místa, musí souhlasit viceprezident a konzultant regionu. Když je potřeba něčí místo uvolnit, výbor to konzultantovi regionu vždy oznámí.",
        sources: refs("M51", "M52"),
      },
      {
        id: "r24",
        text: "O písemné stížnosti se konzultant regionu dozví hned. Viceprezident se na něj obrátí pro podporu dřív, než výbor postoupí dál. Kopie kontrolního listu jde regionální kanceláři.",
        sources: refs("M59", "M61", "M73"),
      },
      {
        id: "r25",
        text: "U zkušební doby a uvolnění místa konzultant regionu potvrdí, že se dodržel postup, a předem schválí dopis. Místo bez zkušební doby jde uvolnit se souhlasem konzultanta regionu i ředitele regionu. Kopie dopisů dostane konzultant regionu a regionální kancelář.",
        sources: refs("M66", "M68", "M62", "M69", "M74", "M76"),
      },
      {
        id: "r26",
        text: "Když se něčí členství neprodlouží, musí se to dozvědět regionální kancelář. Viceprezident a konzultant regionu dostávají upozornění k prodloužení.",
        sources: refs("M16", "M102"),
      },
      {
        id: "r27",
        text: "Všechny poplatky za členství jdou regionální kanceláři. BNI chapterům nedovoluje zpracovávat je přes vlastní účty. Účet chapteru pro jiné než BNI činnosti je věcí členů. Konzultant regionu ho nekoordinuje a BNI ani franšízant za něj neručí.",
        sources: refs("M85", "M86", "M82", "M83", "M84"),
      },
    ],
  },
  summary: {
    title: "Ve zkratce",
    points: [
      {
        text: "O přijetí, volnu, zkušební době i konci členství rozhoduje členský výbor. Vede ho viceprezident a hlasuje v něm jako ostatní členové výboru.",
      },
      { text: "Prezident vede schůzky a dává chapteru směr. Přijaté členy přivítá." },
      {
        // Gate T-006, úprava 11.
        text: "Konzultant regionu provází chapter převody, volnem a výběrem vedení. Potvrzuje, že výbor dodržel postup, a předem schvaluje jeho dopisy o zkušební době a uvolnění místa.",
      },
      {
        text: "Kdo vybírá nové vedení a na jak dlouho, pravidla neurčují. U nás má vedení období šest měsíců a mění se 1. 4. a 1. 10.",
      },
      { text: "Peníze za členství jdou vždy regionální kanceláři. O účtu chapteru rozhodují členové." },
      { text: "Když nevíš, kdo o tvé věci rozhoduje, napiš komukoli z vedení." },
    ],
    whereToFind: [
      { doc: "general-policies", page: 1, rule: "General Policies, úvod", labelCs: "pravomoc členského výboru" },
      // Review T-008, S-1: bez vytahování jednoho práva, odkaz na celý seznam.
      {
        doc: "general-policies",
        page: 2,
        labelCs: "Všechna práva BNI, regionu a franšízanta",
        href: "#prava-regionu",
      },
      { doc: "ops-manual-2022", page: 34, labelCs: "schéma vedení chapteru" },
      { doc: "ops-manual-2022", page: 35, labelCs: "prezident" },
      { doc: "ops-manual-2022", page: 41, labelCs: "viceprezident a členský výbor" },
      { doc: "ops-manual-2022", page: 58, labelCs: "stížnost a hlasování výboru" },
      { doc: "ops-manual-2022", page: 59, labelCs: "zkušební doba a uvolnění místa" },
      { doc: "ops-manual-2022", page: 65, labelCs: "peníze za členství a účet chapteru" },
    ],
  },
  contacts: [
    {
      role: "Kdokoli z vedení chapteru",
      when: "Když nevíš, kdo o tvé věci rozhoduje. Předá ji dál a dá ti vědět komu.",
    },
    {
      role: "Viceprezident chapteru, vede členský výbor",
      when: "Když řešíš přihlášku, volno nebo prodloužení členství.",
    },
    {
      role: "Člen výboru pro vztahy mezi členy",
      when: "Když máš s někým z chapteru problém nebo chceš podat stížnost.",
    },
    { role: "Prezident chapteru", when: "Když jde o program schůzky nebo o směr chapteru." },
    { role: "Sekretář/pokladník chapteru", when: "Když se ptáš na poplatky nebo na platby z účtu chapteru." },
  ],
  disclaimer: [
    "Tahle stránka je výklad našeho chapteru. Oficiální česká verze pravidel BNI neexistuje, rozhoduje anglické znění.",
    "Vychází z BNI Chapter Operations Manual 2022-2023, platného od 27. 7. 2022, a z BNI General Policies.",
    "Stav k {updated}.",
  ],
};
