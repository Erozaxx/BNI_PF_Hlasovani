/**
 * Info stránka „Semafor" (/pravidla/semafor, iter-044, arch_iter-044_T-001
 * sekce 9, gate T-004 sekce 3 a 5).
 *
 * Návod celého semaforu, veřejně a staticky (rozhodl Tom 31. 10. 2026): oficiální
 * semafor BNI jako kroky s citacemi manuálu a interní semafor našeho chapteru
 * jako sekce `kind: "chapter"` (bez zdroje v manuálu, štítek „U nás v chapteru").
 * Žádná data členů, jen pravidla a body. Čísla v interních sekcích se skládají
 * z konstant v `lib/semafor/bonus.ts` a `lib/semafor/color.ts`, ne natvrdo.
 *
 * Texty: vedení chapteru (nic o výboru z manuálu, podmět „vedení chapteru"),
 * „člen výboru" je funkce v aplikaci, ne role BNI. Setkání z manuálu se
 * nejmenuje a frekvence se neuvádí (paměť praxe chapteru, LL-015). Bez slov
 * závazné / doporučené (LL-014). Na stránce se role neodkazují (`glossary: false`),
 * protože „člen výboru" by jinak vedl na kartu role BNI.
 *
 * Kotvy: `barvy`, `novacek`, `vedeni`, `interni`, `body`, `kdo-zapisuje`.
 */
import type { InfoPage, InfoListSection } from "@/lib/info-pages/types";
import { BONUS_CAP, BONUS_POINTS, CATEGORY_CAPS, WORK_POINTS } from "@/lib/semafor/bonus";
import { COLOR_THRESHOLDS } from "@/lib/semafor/color";
import { pointsText } from "@/lib/text/plural";
import { fact } from "./fakta";

const t = COLOR_THRESHOLDS;

const INTERNI: InfoListSection = {
  kind: "chapter",
  id: "interni",
  title: "Interní semafor u nás v chapteru",
  items: [
    {
      id: "interni-bonus",
      text: "K oficiálnímu skóre z BNI přičítáme bonus za to, co pro chapter děláš navíc. Skóre s bonusem dá interní barvu.",
      sources: [],
    },
    {
      id: "interni-barva",
      text: "Oficiální barvu podle BNI vidíš vedle interní barvy. Bonus ji nemění.",
      sources: [],
    },
    {
      id: "interni-hranice",
      text: `Barvy mají stejné hranice jako u BNI: zelená od ${t.green} bodů, žlutá od ${t.yellow}, červená od ${t.red}, šedá pod ${t.red}.`,
      sources: [],
    },
    {
      id: "interni-strop",
      text: `Bonus je nejvýš ${BONUS_CAP} bodů za šest měsíců. Posune tě tak nejvýš o jednu barvu. Body se nikdy neodečítají.`,
      sources: [],
    },
    {
      id: "interni-mesic",
      text: "Bonus se počítá k měsíci, za který máš data z BNI. Co uděláš později, se započte až s dalšími daty.",
      sources: [],
    },
    {
      id: "interni-kdo-vidi",
      text: "Data z BNI nahrává vedení jednou měsíčně. Svůj semafor vidíš po přihlášení v aplikaci v menu Semafor. Ostatní členové vidí jen počty členů v každé barvě. Jména vidí vedení a členové výboru.",
      sources: [],
    },
  ],
};

const BODY: InfoListSection = {
  kind: "chapter",
  id: "body",
  title: "Za co jsou body navíc",
  items: [
    {
      id: "body-mastermind",
      text: `Master mind, který proběhl: ${pointsText(BONUS_POINTS.mastermind)} pro člena, který téma přinesl. Že proběhl, potvrdí někdo z vedení, vlastní téma nepotvrzuje.`,
      sources: [],
    },
    {
      id: "body-burza",
      text: `Pomoc nebo kontakt v Burze pomoci: ${pointsText(BONUS_POINTS.burza)} pro toho, kdo pomohl, když ten, komu pomohl, klikne na Využil(a) jsem.`,
      sources: [],
    },
    {
      id: "body-funkce",
      text: `Funkce v chapteru: ${pointsText(BONUS_POINTS.function)}, dokud ji máš. Platí pro prezidenta, viceprezidenta a člena výboru.`,
      sources: [],
    },
    {
      id: "body-skoleni",
      text: `Školení nebo workshop pro členy chapteru: ${pointsText(BONUS_POINTS.training)} pro toho, kdo ho vedl. Pravidelné vzdělávací okénko na schůzce se nepočítá.`,
      sources: [],
    },
    {
      id: "body-host",
      text: `Přivedený host, který se stal členem: ${pointsText(BONUS_POINTS.host_member)} pro toho, kdo ho přivedl.`,
      sources: [],
    },
    {
      id: "body-akce",
      text: `Účast na akci chapteru: ${pointsText(BONUS_POINTS.activity)} za akci. Akce je společná událost mimo pravidelnou schůzku. Za šest měsíců se počítá nejvýš ${pointsText(CATEGORY_CAPS.activity)}.`,
      sources: [],
    },
    {
      id: "body-podekovani",
      text: `Poděkování od jiného člena: ${pointsText(BONUS_POINTS.thanks)}. Za šest měsíců se počítá nejvýš ${pointsText(CATEGORY_CAPS.thanks)}.`,
      sources: [],
    },
    {
      id: "body-prace",
      text: `Ostatní práce pro chapter: ${WORK_POINTS.min} až ${pointsText(WORK_POINTS.max)} podle rozsahu. Uděluje je držitel funkce Člen výboru a vždy napíše, za jakou práci jsou.`,
      sources: [],
    },
  ],
};

const KDO_ZAPISUJE: InfoListSection = {
  kind: "chapter",
  id: "kdo-zapisuje",
  title: "Kdo body zapisuje",
  items: [
    {
      id: "zapisuje-podekovani",
      text: "Poděkovat může každý člen komukoli kromě sebe, jednomu členovi jednou za kalendářní měsíc. Poděkovaný uvidí tvoje jméno i text.",
      sources: [],
    },
    {
      id: "zapisuje-vedeni",
      text: "Školení, přivedeného hosta a účast na akcích zapisuje vedení nebo člen výboru.",
      sources: [],
    },
    { id: "zapisuje-prace", text: "Ostatní práci uděluje jen držitel funkce Člen výboru.", sources: [] },
    {
      id: "zapisuje-nikdo-sam",
      text: "Nikdo si body nezapisuje sám, ani vedení. Tvoje body vždycky zapíše někdo jiný.",
      sources: [],
    },
    {
      id: "zapisuje-samy",
      text: "Master mind, Burza pomoci a funkce se počítají samy.",
      sources: [],
    },
    { id: "zapisuje-nesedi", text: "Když ti body nesedí, ozvi se vedení.", sources: [] },
  ],
};

export const SEMAFOR_PAGE: InfoPage<"none"> = {
  slug: "semafor",
  title: "Semafor",
  description: "Jak BNI hodnotí aktivitu člena barvou, co k tomu u nás přičítáme a kdo body zapisuje.",
  updated: "2026-10-31",
  visual: "none",
  glossary: false,
  situations: [
    { label: "Co znamená moje barva", anchor: "barvy" },
    { label: "Jsem nový člen a mám šedou", anchor: "novacek" },
    { label: "Kdo se na semafor dívá", anchor: "vedeni" },
    { label: "Jak funguje interní semafor", anchor: "interni" },
    { label: "Za co dostanu body navíc", anchor: "body" },
    { label: "Kdo body zapisuje", anchor: "kdo-zapisuje" },
  ],
  toc: [
    { label: "Barvy", anchor: "barvy" },
    { label: "Nový člen", anchor: "novacek" },
    { label: "Vedení", anchor: "vedeni" },
    { label: "Interní semafor", anchor: "interni" },
    { label: "Body navíc", anchor: "body" },
    { label: "Kdo zapisuje", anchor: "kdo-zapisuje" },
  ],
  intro: {
    question: "Co ti říká barva v semaforu?",
    lead: ["BNI spočítá z tvé aktivity za posledních šest měsíců skóre ze 100. Podle skóre dostaneš barvu."],
    visual: {},
  },
  steps: [
    {
      type: "scene",
      variant: "main",
      id: "barvy",
      label: "Barvy",
      title: "Čtyři barvy",
      story: [
        "Docházka, 1-2-1, doporučení, hosté, vzdělávání a obchody z doporučení dávají dohromady skóre.",
        "Podle skóre jsi v zelené, žluté, červené, nebo šedé.",
      ],
      chapter: [
        fact("Cílem chapteru je mít co nejvíc členů v zelené.", "TM2"),
        fact("Když se docházka a ostatní údaje nezapíšou do BNI včas, ukáže semafor horší čísla.", "TM1"),
      ],
      sourcesSummary: "manuál str. 32 a 40",
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "novacek",
      label: "Nový člen",
      title: "Nový člen nemusí být v šedé",
      story: ["Do chapteru jsi přišel před dvěma měsíci a v semaforu máš šedou."],
      chapter: [
        fact("Že nový člen může být v šedé bez obav, je omyl.", "TM4"),
        fact(
          "Nový člen, který chodí pravidelně, dělá vstupní školení a má jednu až dvě 1-2-1 týdně, má kolem 60 bodů, tedy žlutou.",
          "TM5"
        ),
      ],
      sourcesSummary: "manuál str. 33",
      visual: {},
    },
    {
      type: "scene",
      variant: "main",
      id: "vedeni",
      label: "Vedení",
      title: "Na semafor se dívá vedení chapteru",
      story: ["Vedení chapteru sleduje, kolik členů je v jaké barvě."],
      chapter: [
        fact("Vedení hledá, co pomůže členům posunout se o barvu výš.", "TM3"),
        fact("Před rozhovorem o členství dostaneš přehled své aktivity v chapteru.", "H80"),
      ],
      sourcesSummary: "manuál str. 32 a 53",
      visual: {},
    },
  ],
  sections: [INTERNI, BODY, KDO_ZAPISUJE],
  summary: {
    title: "Ve zkratce",
    points: [
      { text: "Barvu dává skóre z BNI za šest měsíců." },
      { text: "Nový člen, který se zapojí, bývá ve žluté." },
      { text: `U nás k tomu přičítáme bonus nejvýš ${BONUS_CAP} bodů, posune tě nejvýš o jednu barvu.` },
      { text: "Body ti vždycky zapíše někdo jiný." },
    ],
    whereToFind: [
      { doc: "ops-manual-2022", page: 32, labelCs: "jak vedení čte semafor" },
      { doc: "ops-manual-2022", page: 33, labelCs: "nový člen a semafor" },
      { doc: "ops-manual-2022", page: 40, labelCs: "zápis údajů do BNI včas" },
      { doc: "ops-manual-2022", page: 53, labelCs: "přehled aktivity před rozhovorem o členství" },
    ],
  },
  contacts: [
    { role: "Viceprezident", when: "Skóre z BNI a nahrání dat" },
    { role: "Člen výboru", when: "Body za ostatní práci" },
  ],
  disclaimer: [
    "Tahle stránka je výklad našeho chapteru.",
    "Oficiální část vychází z BNI Chapter Operations Manual 2022-2023, platného od 27. 7. 2022. Interní semafor je pravidlo našeho chapteru a v manuálu BNI není.",
    "Stav k {updated}.",
  ],
};
