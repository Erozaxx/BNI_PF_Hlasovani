/**
 * Info stránka „Absence a konec členství" (/pravidla/absence).
 *
 * Texty: content-writer T-005 (texty_absence_iter-029_T-005.md), schválené
 * uživatelem v T-006. Neměnit bez content-writera. Anglické citace jsou
 * doslovné z PDF (apostrofy a uvozovky jako v PDF). Čísla stran: u manuálu
 * PDF strana = vytištěné číslo, u General Policies strana PDF.
 */
import type { AbsenceTimelineState, InfoPage, SourceRef } from "@/lib/info-pages/types";
import { ABSENCE_COMICS, ABSENCE_HERO } from "./absence-komiksy";

const OPS = "ops-manual-2022" as const;
const GP = "general-policies" as const;

// Citace použité u víc faktů („citace jako výše" v textech T-005).
const GP5: SourceRef = {
  doc: GP,
  page: 1,
  rule: "General Policy #5",
  quoteEn:
    "A BNI Member is allowed three absences within a continuous six-month period. If a Member cannot attend, they may send a substitute; this will not count as an absence. Additionally, a member is allowed three substitutes in a six-month period.",
};

const GP9: SourceRef = {
  doc: GP,
  page: 1,
  rule: "General Policy #9",
  quoteEn:
    "Leaves of absence are possible for certain extenuating circumstances (e.g., extended medical issue that prevents members from working) at the discretion of the Membership Committee. Members are allowed up to eight weeks of medical leave.",
};

const OPS55_SUBSTITUTE: SourceRef = {
  doc: OPS,
  page: 55,
  quoteEn:
    "Keep in mind the absences are for the last-minute situation. Substitutes are for planned absences. It is a best practice to alert the Chapter of a substitute so that the Visitor Host can be there to greet them.",
};

const OPS55_CALL: SourceRef = {
  doc: OPS,
  page: 55,
  quoteEn:
    "it is recommended the Community Building Specialists make a phone call after the second and third absence and before the fourth absence in which the Member’s seat is opened. Each call should include: “We missed you today! Is everything okay? What can we do to help? We value your participation in the Chapter!”",
};

const OPS56_LEAVE: SourceRef = {
  doc: OPS,
  page: 56,
  quoteEn:
    "Generally, leaves of absence have an 8-week limit, although longer leave may be granted at the discretion of the Membership Committee. A Member may take a medical leave of absence with the Membership Committee’s prior approval if their participation fees are pre-paid for the period of time, since their membership will continue to run.",
};

const OPS56_CREDIT: SourceRef = {
  doc: OPS,
  page: 56,
  quoteEn:
    "The credit is for the unused portion of a Member’s membership, providing that Member is leaving the Chapter in good standing, e.g. he/she has not been asked to leave the Chapter for breach of any of BNI’s policies, such as attendance, etc.",
};

const OPS59_PROBATION_VOTE: SourceRef = {
  doc: OPS,
  page: 59,
  quoteEn:
    "Only a majority vote is needed from the Membership Committee (including the Vice President) to pursue probation; however, attempt to seek consensus.",
};

// Stavy osy (každý stav je celý, ne rozdíl proti předchozímu).
const THIRD_ABSENCE_VISUAL: AbsenceTimelineState = {
  marks: [
    { week: 3, mark: "S" },
    { week: 6, mark: "A" },
    { week: 11, mark: "A" },
    { week: 15, mark: "A" },
  ],
  status: "watch",
  statusLabel: "Limit vyčerpaný",
  counters: { absences: 3, substitutes: 1 },
  srText: "Máš tři absence ze tří, limit je vyčerpaný. Náhradníka jsi použil jednou.",
};

const FOURTH_ABSENCE_MARKS: AbsenceTimelineState["marks"] = [
  { week: 3, mark: "S" },
  { week: 6, mark: "A" },
  { week: 11, mark: "A" },
  { week: 15, mark: "A" },
  { week: 18, mark: "A" },
];

const FOURTH_ABSENCE_COUNTERS = { absences: 4, substitutes: 1 };

export const ABSENCE_PAGE: InfoPage<"absence-timeline"> = {
  slug: "absence",
  title: "Absence a konec členství",
  description:
    "Co se děje, když chybíš na schůzkách. Náhradník, volno, telefonáty, dopisy a kdo rozhoduje o tvém členství.",
  updated: "2026-09-28",
  visual: "absence-timeline",
  hero: ABSENCE_HERO,

  situations: [
    { label: "Nemůžu přijít na schůzku", anchor: "nahradnik" },
    { label: "Potřebuju si vzít volno", anchor: "volno" },
    { label: "Mám třetí absenci", anchor: "treti-absence" },
    { label: "Výbor jedná o mém členství", anchor: "slyseni" },
    { label: "Chci odejít. Co s penězi?", anchor: "odchod-s-kreditem" },
  ],

  intro: {
    question: "Každý čtvrtek v 7:30. Co když to jednou nevyjde?",
    lead: [
      "Na téhle stránce projdeš půl roku v chapteru. Uvidíš, co se stane, když na schůzku nemůžeš, kdo se ti ozve a kdo o čem rozhoduje.",
      "Vedle textu (na mobilu nahoře) je osa šesti měsíců. Ukazuje, jak na tom v každém kroku jsi.",
      "Pravidla jsou stejná pro každého.",
    ],
    visual: {
      marks: [],
      status: "ok",
      statusLabel: "V pořádku",
      counters: { absences: 0, substitutes: 0 },
      srText: "Osa šesti měsíců je prázdná. Nemáš žádnou absenci ani náhradníka.",
    },
  },

  steps: [
    {
      type: "scene",
      variant: "main",
      id: "uvod",
      comic: ABSENCE_COMICS["uvod"],
      label: "Úvod",
      title: "Proč na docházce záleží",
      story: [
        "Chapter se schází každý čtvrtek v 7:30. Za půl roku je to 26 schůzek.",
        "Zakázku můžeš doporučit jen někomu, koho znáš a o kom víš, koho hledá. Tohle se dozvíš na schůzkách. Když tam nejsi, ostatní zase nevědí, co potřebuješ ty.",
      ],
      chapter: [
        {
          text: "Docházka je podle BNI jedna z nejdůležitějších věcí. Kdo chybí, nedozví se, co ostatní potřebují, a nemůže jim říct, co potřebuje on.",
          sources: [
            {
              doc: OPS,
              page: 55,
              quoteEn:
                "Attendance is one of the most critical aspects of BNI. If a Member is not in attendance at your meeting, how can they learn what it is you need to build your business? And how will you be able to help them build their business if they are not there to educate and train you?",
            },
          ],
        },
        {
          text: "Absence a pozdní příchody znamenají méně byznysu pro všechny.",
          sources: [
            {
              doc: GP,
              page: 3,
              rule: "Program Guidelines, Absences and Tardiness",
              quoteEn: "Absences and tardiness mean less business for Members",
            },
          ],
        },
      ],
      sourcesSummary: "manuál str. 55, General Policies (Program Guidelines)",
      visual: {
        marks: [],
        status: "ok",
        statusLabel: "V pořádku",
        counters: { absences: 0, substitutes: 0 },
        srText: "Začínáš nový půlrok. Zatím nemáš žádnou absenci ani náhradníka.",
      },
    },

    {
      type: "scene",
      variant: "main",
      id: "nahradnik",
      comic: ABSENCE_COMICS["nahradnik"],
      label: "Krok 1",
      title: "Nemůžeš přijít, pošleš náhradníka",
      story: [
        "Ve třetím týdnu máš ve čtvrtek ráno schůzku u zákazníka a víš to týden dopředu. Na schůzku chapteru za sebe pošleš kolegu.",
        "Kolega za tebe představí tvoji firmu. Na ose je to náhradník, absenci nemáš.",
      ],
      chapter: [
        {
          text: "Náhradník se jako absence nepočítá.",
          obligation: "must",
          sources: [GP5],
        },
        {
          text: "Náhradníka můžeš poslat nejvýš třikrát za šest měsíců.",
          obligation: "must",
          sources: [
            GP5,
            {
              doc: GP,
              page: 4,
              rule: "Substitute Program 3",
              quoteEn:
                "The primary purpose for a substitute is to represent a BNI Member. BNI recommends minimal use of a substitute. However, a Member is allowed to use substitutes up to three times in a six-month period.",
            },
          ],
        },
        {
          text: "Náhradník je na nepřítomnost, o které víš předem. Absence je pro situace, které přijdou na poslední chvíli.",
          obligation: "recommended",
          sources: [OPS55_SUBSTITUTE],
        },
        {
          text: "Dej chapteru předem vědět, kdo za tebe přijde, ať může být řádně přivítán a jmenován při představení členů.",
          obligation: "recommended",
          sources: [OPS55_SUBSTITUTE],
        },
        {
          text: "Náhradníkem může být zákazník, kamarád, někdo z rodiny, zaměstnanec nebo člen jiného chapteru.",
          sources: [
            {
              doc: GP,
              page: 3,
              rule: "Substitute Program 1",
              quoteEn:
                "Potential substitutes include customers, friends, family, BNI Members from other chapters and/or employees.",
            },
          ],
        },
      ],
      sourcesSummary: "General Policy #5, manuál str. 55, General Policies (Substitute Program)",
      visual: {
        marks: [{ week: 3, mark: "S" }],
        status: "ok",
        statusLabel: "V pořádku",
        counters: { absences: 0, substitutes: 1 },
        srText:
          "Ve třetím týdnu za tebe přišel náhradník. Absenci nemáš, náhradníka jsi použil jednou ze tří.",
      },
    },

    {
      type: "scene",
      variant: "main",
      id: "prvni-absence",
      comic: ABSENCE_COMICS["prvni-absence"],
      label: "Krok 2",
      title: "První absence",
      story: [
        "V šestém týdnu ti ráno nenastartuje auto. Na schůzku nedorazíš a náhradníka už neseženeš.",
        "Do dvou dnů ti přijde automatický mail o absenci. Ozve se ti i někdo z členského výboru. To je skupina členů chapteru, kterou vede viceprezident a která má na starosti docházku a dodržování pravidel.",
      ],
      chapter: [
        {
          text: "Viceprezident zapíše docházku nejpozději do 48 hodin po schůzce.",
          obligation: "must",
          sources: [
            {
              doc: OPS,
              page: 61,
              quoteEn:
                "It is imperative the Vice President submits the PALMS report within 48 hours (or fewer) from the conclusion of each weekly meeting.",
            },
          ],
        },
        {
          text: "Podle zápisu ti odejde automatický mail. Je to jen zdvořilostní upozornění.",
          sources: [
            {
              doc: OPS,
              page: 55,
              quoteEn:
                "When a Member misses a meeting, an automated email is sent (based on PALMS submission) as a courtesy.",
            },
          ],
        },
        {
          text: "Členové členského výboru každý týden volají těm, kdo chyběli.",
          obligation: "recommended",
          sources: [
            {
              doc: OPS,
              page: 54,
              quoteEn:
                "Uphold the attendance policy by making phone calls to Members who were absent each week.",
            },
          ],
        },
        {
          text: "Kdo z výboru komu volá, rozděluje viceprezident.",
          sources: [
            {
              doc: OPS,
              page: 39,
              quoteEn: "assigning Membership Committee Members to make follow-up phone calls",
            },
          ],
        },
      ],
      sourcesSummary: "manuál str. 39, 54, 55 a 61",
      visual: {
        marks: [
          { week: 3, mark: "S" },
          { week: 6, mark: "A" },
        ],
        status: "ok",
        statusLabel: "V pořádku",
        counters: { absences: 1, substitutes: 1 },
        srText: "Máš jednu absenci ze tří. Náhradníka jsi použil jednou.",
      },
    },

    {
      type: "scene",
      variant: "main",
      id: "druha-absence",
      comic: ABSENCE_COMICS["druha-absence"],
      label: "Krok 3",
      title: "Druhá absence",
      story: [
        "V jedenáctém týdnu chybíš podruhé. Znovu ti zavolá někdo z výboru a přijde dopis.",
        "Dopis je upozornění a dostává ho stejně každý, kdo má za půl roku dvě absence. Text se pro nikoho neupravuje.",
      ],
      chapter: [
        {
          text: "Člen výboru ti zavolá. Zeptá se, jestli je všechno v pořádku a jak ti chapter může pomoct.",
          obligation: "recommended",
          sources: [OPS55_CALL],
        },
        {
          text: "Přijde varovný dopis. Dostává ho každý stejně, bez výjimek, jeho text se neupravuje a podepisuje ho členský výbor.",
          obligation: "must",
          sources: [
            {
              doc: OPS,
              page: 60,
              quoteEn:
                "These letters must be sent out fairly and consistently to all Members, without exceptions.",
            },
            {
              doc: OPS,
              page: 60,
              quoteEn:
                "Do not alter the BNI Accountability Letters. They have been approved by BNI attorneys.",
            },
            {
              doc: OPS,
              page: 61,
              quoteEn: "Accountability Letter #03 Attendance Warning Letter/Second Absence",
            },
          ],
        },
        {
          text: "Při telefonátu ti připomene, že za sebe můžeš poslat náhradníka.",
          obligation: "recommended",
          sources: [
            {
              doc: OPS,
              page: 55,
              quoteEn:
                "Remind the Members that a substitute is a great solution to staying within the attendance policy.",
            },
          ],
        },
      ],
      chapterNotes: ["C4", "C6"],
      sourcesSummary: "manuál str. 55, 60 a 61",
      visual: {
        marks: [
          { week: 3, mark: "S" },
          { week: 6, mark: "A" },
          { week: 11, mark: "A" },
        ],
        status: "watch",
        statusLabel: "Blížíš se limitu",
        counters: { absences: 2, substitutes: 1 },
        srText: "Máš dvě absence ze tří. Náhradníka jsi použil jednou.",
      },
    },

    {
      type: "scene",
      variant: "main",
      id: "treti-absence",
      comic: ABSENCE_COMICS["treti-absence"],
      label: "Krok 4",
      title: "Třetí absence",
      story: [
        "V patnáctém týdnu chybíš potřetí. Tři absence za šest měsíců pravidla povolují, takže jsi pořád v limitu. Čtvrtá by ale dala výboru možnost tvoje členství ukončit.",
        "Telefonát je tentokrát delší. Člen výboru s tebou probere, co by čtvrtá absence znamenala, jestli se doma něco neděje a jak je to s penězi, kdybys chtěl odejít.",
      ],
      chapter: [
        {
          text: "Po třetí absenci ti člen výboru znovu zavolá.",
          obligation: "recommended",
          sources: [OPS55_CALL],
        },
        {
          text: "Přijde druhý varovný dopis.",
          obligation: "must",
          sources: [
            {
              doc: OPS,
              page: 61,
              quoteEn: "Accountability Letter #04 Attendance Warning Letter/Third Absence",
            },
          ],
        },
        {
          text: "Když máš za šest měsíců čtyři absence, výbor tě může požádat, abys chapter opustil.",
          sources: [
            {
              doc: OPS,
              page: 46,
              quoteEn:
                "You are allowed up to three absences within a rolling six-month period. If you have four absences during that time, you may be asked to leave the Chapter.",
            },
          ],
        },
      ],
      chapterNotes: ["C4", "C7"],
      sourcesSummary: "manuál str. 46, 55 a 61",
      visual: THIRD_ABSENCE_VISUAL,
    },

    {
      type: "branch",
      id: "co-ted",
      question: "Co teď?",
      options: [
        {
          tone: "good",
          id: "chodis-dal",
          comic: ABSENCE_COMICS["chodis-dal"],
          label: "Možnost 1",
          title: "Chodíš dál",
          story: [
            "Další měsíce na schůzky chodíš, nebo za sebe posíláš náhradníka.",
            "Absence se počítají vždy za posledních šest měsíců. Ta ze šestého týdne z počítání po půl roce vypadne a přijde ti o tom mail.",
          ],
          chapter: [
            {
              text: "Když ti absence vyprší, přijde ti o tom mail.",
              sources: [
                {
                  doc: OPS,
                  page: 55,
                  quoteEn:
                    "In addition, when a Member loses an absence over time, a congratulatory email is sent.",
                },
              ],
            },
            {
              text: "Počítá se vždy posledních šest měsíců. Období se s každým týdnem posouvá.",
              obligation: "must",
              sources: [GP5],
            },
          ],
          sourcesSummary: "manuál str. 55, General Policy #5",
          visual: {
            marks: [
              { week: 3, mark: "S" },
              { week: 6, mark: "A-expired" },
              { week: 11, mark: "A" },
              { week: 15, mark: "A" },
            ],
            status: "ok",
            statusLabel: "V pořádku",
            counters: { absences: 2, substitutes: 1 },
            srText: "Nejstarší absence vypršela. Počítají se ti dvě absence ze tří.",
          },
        },
        {
          tone: "neutral",
          id: "potrebujes-volno",
          comic: ABSENCE_COMICS["potrebujes-volno"],
          label: "Možnost 2",
          title: "Potřebuješ volno",
          story: [
            "Když se doma něco děje, můžeš požádat o volno. Jak to funguje, najdeš v odbočce níž.",
          ],
          chapter: [],
          next: "volno",
          nextLabel: "Jak funguje volno",
          visual: THIRD_ABSENCE_VISUAL,
        },
        {
          tone: "neutral",
          id: "odchod-s-kreditem",
          comic: ABSENCE_COMICS["odchod-s-kreditem"],
          label: "Možnost 3",
          title: "Rozhodneš se odejít",
          story: [
            "Na čtvrteční schůzky teď nemáš čas a brzy se to nezmění. Rozhodneš se z chapteru odejít.",
            "Se třemi absencemi jsi pořád v limitu, takže odcházíš v dobrém.",
          ],
          chapter: [
            {
              text: "Zaplacené poplatky se nevracejí. Kdo odchází v dobrém, dostane na požádání kredit za nevyčerpané období. Kredit platí dva roky.",
              obligation: "must",
              sources: [
                {
                  doc: GP,
                  page: 2,
                  rule: "Administrative Policy #5",
                  quoteEn:
                    "Fees are non-refundable. A Certificate of Credit will be given, upon request, to Members in good standing for the unused portion of their time. This certificate of credit will be valid for a duration of 2 years from the issue date.",
                  noteCs: "V manuálu na str. 9 je stejné pravidlo vedené pod číslem 4.",
                },
                OPS56_CREDIT,
              ],
            },
            {
              text: "Kredit vydává konzultant regionu. V pravidlech se ta role jmenuje Director nebo Director Consultant a je to člověk z regionální kanceláře BNI, který má náš chapter na starosti. S kreditem můžeš vstoupit i do jiného chapteru.",
              sources: [
                {
                  doc: OPS,
                  page: 56,
                  quoteEn:
                    "If a Member is unable to continue attending their Chapter meetings for an extended period of time, a credit will be issued by the local BNI Director/Director Consultant.",
                },
                {
                  doc: OPS,
                  page: 56,
                  quoteEn:
                    "the credit will be accepted as payment to join any other Chapter where there is an opening and the Membership Committee has accepted the Membership Application.",
                },
              ],
            },
            {
              text: "Chapter ti dá najevo, že tě rád vezme zpátky.",
              obligation: "recommended",
              sources: [
                {
                  doc: OPS,
                  page: 56,
                  quoteEn:
                    "Let the Member know you really want them back in the Chapter when the time is right.",
                },
              ],
            },
          ],
          sourcesSummary: "Administrative Policy #5, manuál str. 56",
          visual: {
            marks: [
              { week: 3, mark: "S" },
              { week: 6, mark: "A" },
              { week: 11, mark: "A" },
              { week: 15, mark: "A" },
            ],
            status: "left",
            statusLabel: "Odcházíš v dobrém",
            counters: { absences: 3, substitutes: 1 },
            srText: "Odcházíš se třemi absencemi, tedy v limitu a v dobrém.",
          },
        },
        {
          tone: "serious",
          id: "prijde-ctvrta-absence",
          label: "Možnost 4",
          title: "Přijde čtvrtá absence",
          story: ["Jak to pokračuje, ukazuje další krok."],
          chapter: [],
          next: "ctvrta-absence",
          nextLabel: "Když přijde čtvrtá absence",
          visual: THIRD_ABSENCE_VISUAL,
        },
      ],
    },

    {
      type: "scene",
      variant: "detour",
      id: "volno",
      comic: ABSENCE_COMICS["volno"],
      label: "Odbočka",
      title: "Když se doma něco děje",
      story: [
        "Po operaci ti lékař nařídí dva měsíce klidu. Nebo se staráš o nemocného rodiče. Na schůzky teď chodit nemůžeš.",
        "Pro takové situace je volno. Požádáš o něj členský výbor, a to předem.",
        "Když jednou chybíš kvůli chřipce, je to absence, nebo pošleš náhradníka. Volno je na delší dobu, kdy víš, že několik schůzek po sobě nepřijdeš.",
      ],
      chapter: [
        {
          text: "O volnu rozhoduje členský výbor.",
          obligation: "must",
          sources: [GP9],
        },
        {
          text: "Volno jde vzít kvůli vlastnímu zdraví, kvůli péči o člena rodiny, o kterého se staráš hlavně ty, i kvůli jiným mimořádným okolnostem.",
          sources: [
            {
              doc: OPS,
              page: 56,
              quoteEn:
                "Leave can be used for personal health and family members if the Member is the primary caregiver.",
            },
            GP9,
          ],
        },
        {
          text: "Volno trvá obvykle nejvýš 8 týdnů. Delší může výbor povolit podle situace.",
          obligation: "must",
          sources: [GP9, OPS56_LEAVE],
        },
        {
          text: "Výbor musí volno schválit předem. Poplatky musíš mít zaplacené na celou dobu volna, protože členství běží dál.",
          obligation: "must",
          sources: [OPS56_LEAVE],
        },
        {
          text: "Týdny volna se jako absence nepočítají. Platí to i tehdy, když za tebe chodí náhradník.",
          sources: [
            {
              doc: OPS,
              page: 56,
              quoteEn:
                "If they provide a substitute, list the attendance as ‘M” for Medical/Leave not as an “S” for Substitute.",
            },
          ],
        },
        {
          text: "Výbor k tvé situaci přistupuje ohleduplně a hledá řešení, které je dobré pro tebe i pro chapter.",
          obligation: "recommended",
          sources: [
            {
              doc: OPS,
              page: 57,
              quoteEn: "Compassion should be used in any medical situation impacting Members.",
            },
          ],
        },
        {
          text: "Když podnikání zavíráš, můžeš místo volna požádat o kredit (Možnost 3 výš).",
          sources: [
            {
              doc: OPS,
              page: 56,
              quoteEn:
                "Are you keeping your business open? If the answer is no, and it is the best option under the circumstances for the Member and the Chapter, then a Certificate of Credit may be issued for the unused time.",
            },
          ],
        },
      ],
      sourcesSummary: "General Policy #9, manuál str. 56 a 57",
      visual: {
        marks: [
          { week: 3, mark: "S" },
          { week: 6, mark: "A" },
          { week: 11, mark: "A" },
          { week: 15, mark: "A" },
          { week: 16, mark: "M" },
          { week: 17, mark: "M" },
          { week: 18, mark: "M" },
          { week: 19, mark: "M" },
          { week: 20, mark: "M" },
          { week: 21, mark: "M" },
          { week: 22, mark: "M" },
          { week: 23, mark: "M" },
        ],
        status: "leave",
        statusLabel: "Volno",
        counters: { absences: 3, substitutes: 1 },
        srText:
          "Máš tři absence a od 16. do 23. týdne schválené volno. Týdny volna se jako absence nepočítají.",
      },
    },

    {
      type: "scene",
      variant: "main",
      id: "ctvrta-absence",
      comic: ABSENCE_COMICS["ctvrta-absence"],
      label: "Krok 5",
      title: "Čtvrtá absence",
      story: [
        "V osmnáctém týdnu chybíš počtvrté za půl roku. Ze dne na den se nic nestane.",
        "Čtvrtá absence dává výboru možnost tvoje členství ukončit. Automatické to není. Než výbor udělá cokoli dalšího, musí souhlasit viceprezident a konzultant regionu, tedy člověk z regionální kanceláře BNI, který má náš chapter na starosti.",
      ],
      chapter: [
        {
          text: "Po čtvrté absenci během šesti měsíců může výbor členství ukončit. Nemusí.",
          sources: [
            {
              doc: OPS,
              page: 55,
              quoteEn:
                "A Member may be terminated by letter after their fourth absence within any six-month period.",
            },
          ],
        },
        {
          text: "Než ti po čtvrté absenci někdo zavolá nebo pošle dopis o uvolnění místa, musí s tím souhlasit viceprezident i konzultant regionu.",
          obligation: "must",
          sources: [
            {
              doc: OPS,
              page: 54,
              quoteEn:
                "Get approval from Vice President and Director/Director Consultant prior to sending the Open Classification Letter and making the fourth absence phone call – timing is very important!",
            },
          ],
        },
        {
          text: "Viceprezident se s konzultantem regionu spojí dřív, než výbor cokoli udělá.",
          obligation: "recommended",
          sources: [
            {
              doc: OPS,
              page: 58,
              quoteEn:
                "Vice President contacts the Director/Director Consultant for support PRIOR to proceeding.",
            },
          ],
        },
      ],
      chapterNotes: ["C1"],
      sourcesSummary: "manuál str. 54, 55 a 58",
      visual: {
        marks: FOURTH_ABSENCE_MARKS,
        status: "committee",
        statusLabel: "Výbor jedná",
        counters: FOURTH_ABSENCE_COUNTERS,
        srText: "Máš čtyři absence za šest měsíců. Věc teď řeší členský výbor.",
      },
    },

    {
      type: "scene",
      variant: "main",
      id: "slyseni",
      comic: ABSENCE_COMICS["slyseni"],
      label: "Krok 6",
      title: "Řekneš, jak to vidíš ty",
      story: [
        "Výbor tě pozve na rozhovor. Jeden nebo dva jeho členové se tě zeptají, co se dělo a jak to vidíš ty.",
        "Z rozhovoru vznikne zápis. Kdo z výboru s tebou má spor, u toho není.",
      ],
      chapter: [
        {
          text: "Jeden nebo dva členové výboru s tebou mluví, abys mohl říct svou verzi.",
          obligation: "recommended",
          sources: [
            {
              doc: OPS,
              page: 58,
              quoteEn: "Interview the Member at issue to allow them to give their version of the story",
              noteCs:
                "Manuál tenhle postup popisuje u stížností. Chapter ho používá stejně i u docházky.",
            },
          ],
        },
        {
          text: "Z rozhovoru je zápis s datem, hlavními body a tvými reakcemi.",
          obligation: "recommended",
          sources: [
            {
              doc: OPS,
              page: 58,
              quoteEn:
                "Take notes and document the conversations (date, key points, Member’s reactions)",
            },
          ],
        },
        {
          text: "Člen výboru, který s tebou má spor, se postupu neúčastní. Viceprezident může přizvat někoho jiného.",
          obligation: "must",
          sources: [
            {
              doc: OPS,
              page: 59,
              quoteEn:
                "In the event a dispute arises involving a Membership Committee member, the Member will be removed from their duties during the dispute processing and the vacancy filled as described earlier in this Membership Committee section. The Vice President may call on other Members as deemed necessary.",
            },
          ],
        },
      ],
      chapterNotes: ["C3", "C4"],
      sourcesSummary: "manuál str. 58 až 60",
      visual: {
        marks: FOURTH_ABSENCE_MARKS,
        status: "committee",
        statusLabel: "Výbor jedná: slyšení",
        counters: FOURTH_ABSENCE_COUNTERS,
        srText: "Máš čtyři absence. Výbor tě pozval na rozhovor.",
      },
    },

    {
      type: "scene",
      variant: "main",
      id: "hlasovani",
      comic: ABSENCE_COMICS["hlasovani"],
      label: "Krok 7",
      title: "Výbor hlasuje",
      story: [
        "O tom, co bude dál, rozhoduje členský výbor hlasováním. Jeden člověk o tom nikdy nerozhoduje.",
        "Výbor posuzuje, jestli jde o porušení pravidel a jak vážné je. Bere v úvahu i to, co jsi řekl na rozhovoru, třeba jestli nešlo spíš o situaci pro volno.",
      ],
      chapter: [
        {
          text: "O pravidlech BNI má v chapteru konečné slovo členský výbor.",
          obligation: "must",
          sources: [
            {
              doc: GP,
              page: 1,
              rule: "General Policies, úvod",
              quoteEn:
                "Membership Committees of each chapter have final authority related to BNI Policies.",
            },
            {
              doc: GP,
              page: 2,
              rule: "Administrative Policy #7",
              quoteEn:
                "BNI is a marketing service provided by BNI Global, LLC. BNI or any of its franchisees reserve the right to discontinue a Member’s participation in this program.",
              noteCs:
                "Mimo chapter si právo ukončit účast člena vyhrazuje i BNI a jeho regionální zastoupení.",
            },
          ],
        },
        {
          text: "Rozhoduje většina kompletního a proškoleného výboru. Cílem je shoda na řešení, které je nejlepší pro chapter.",
          obligation: "must",
          sources: [
            {
              doc: OPS,
              page: 58,
              quoteEn:
                "Decision is made by majority vote of a complete and fully trained Membership Committee. The goal is to seek consensus of a resolution that is in the best interest of the Chapter.",
            },
          ],
        },
        {
          text: "Výbor má lichý počet členů včetně viceprezidenta. Viceprezident hlasuje jako ostatní.",
          sources: [
            {
              doc: OPS,
              page: 41,
              quoteEn:
                "There should always be an odd number of members on this committee, including the Vice President.",
            },
            OPS59_PROBATION_VOTE,
          ],
        },
        {
          text: "Výbor posoudí, jestli jde o porušení pravidel a jak je vážné, i to, jestli nejde spíš o důvod k volnu.",
          sources: [
            {
              doc: OPS,
              page: 58,
              quoteEn: "Determine if there is a violation in a BNI Policy or Code of Ethics",
            },
            {
              doc: OPS,
              page: 58,
              quoteEn: "Determine severity of the violation",
              noteCs:
                "Manuál tady mluví o porušení a jeho závažnosti. Propojení s volnem je výklad chapteru.",
            },
          ],
        },
      ],
      chapterNotes: ["C2", "C1"],
      sourcesSummary: "General Policies (úvod), Administrative Policy #7, manuál str. 41, 58 a 59",
      visual: {
        marks: FOURTH_ABSENCE_MARKS,
        status: "committee",
        statusLabel: "Výbor rozhoduje",
        counters: FOURTH_ABSENCE_COUNTERS,
        srText: "Máš čtyři absence. Členský výbor hlasuje o dalším postupu.",
      },
    },

    {
      type: "branch",
      id: "vysledek-vyboru",
      question: "Jak může výbor rozhodnout?",
      options: [
        {
          tone: "good",
          id: "koucink",
          label: "Možnost 1",
          title: "Pokračuješ a výbor ti pomůže",
          story: [
            "Výbor se tě zeptá, jak ti může pomoct, aby se absence neopakovaly. Dostaneš třeba schůzku s mentorem nebo kurz a na schůzky chodíš dál.",
          ],
          chapter: [
            {
              text: "Výbor se ptá, jak ti pomoct, a řešení hledá s tebou.",
              obligation: "recommended",
              sources: [
                {
                  doc: OPS,
                  page: 58,
                  quoteEn:
                    "Ask, “How can we help you resolve this issue?” and get the parties involved in coming to a resolution.",
                },
              ],
            },
            {
              text: "Výbor ti může domluvit schůzku jeden na jednoho s tvým mentorem nebo kurz v BNI Business Builderu, vzdělávacím portálu BNI.",
              obligation: "recommended",
              sources: [
                {
                  doc: OPS,
                  page: 59,
                  rule: "Coaching 3",
                  quoteEn:
                    "Encourage the Member’s Mentor to have a One-to-One and work with them on a specific area.",
                },
                {
                  doc: OPS,
                  page: 59,
                  rule: "Coaching 4",
                  quoteEn: "Assign appropriate BNI Business Builder coursework for completion by Member.",
                },
              ],
            },
          ],
          sourcesSummary: "manuál str. 58 a 59",
          visual: {
            marks: FOURTH_ABSENCE_MARKS,
            status: "ok",
            statusLabel: "Pokračuješ",
            counters: FOURTH_ABSENCE_COUNTERS,
            srText: "Výbor rozhodl, že pokračuješ, a nabídl ti pomoc.",
          },
        },
        {
          tone: "neutral",
          id: "zkusebni-doba",
          label: "Možnost 2",
          title: "Zkušební doba",
          story: [
            "Výbor rozhodne o zkušební době. Na schůzky chodíš dál a s výborem se domluvíš, co konkrétně má být jinak.",
            "Na konci zkušební doby výbor vyhodnotí, jestli se to podařilo.",
          ],
          chapter: [
            {
              text: "O zkušební době stačí rozhodnout většinou výboru. Výbor se ale snaží o shodu.",
              obligation: "must",
              sources: [OPS59_PROBATION_VOTE],
            },
            {
              text: "Konzultant regionu potvrdí, že se dodržel postup.",
              obligation: "must",
              sources: [
                {
                  doc: OPS,
                  page: 59,
                  quoteEn:
                    "Confirmation from the Director/Director Consultant that the process was followed is required.",
                },
              ],
            },
            {
              text: "Délku zkušební doby určí výbor.",
              obligation: "must",
              sources: [
                {
                  doc: OPS,
                  page: 59,
                  quoteEn: "Length of probation time is determined by the Membership Committee.",
                },
              ],
            },
            {
              text: "V dopise je jen tvoje jméno, datum, porušené pravidlo a délka zkušební doby. Nic dalšího se do něj nepíše.",
              obligation: "must",
              sources: [
                {
                  doc: OPS,
                  page: 59,
                  quoteEn:
                    "Add Member’s name, date, Code of Ethics or Policy violation reference, and length of probation / No other details are to be added",
                },
              ],
            },
            {
              text: "Ideálně dva členové výboru s tebou domluví měřitelné kroky. Viceprezident rozhovor zapíše.",
              obligation: "recommended",
              sources: [
                {
                  doc: OPS,
                  page: 59,
                  quoteEn: "Ideally two Membership Committee members meet(s) with the challenged Member.",
                },
                {
                  doc: OPS,
                  page: 59,
                  quoteEn: "Vice President documents this conversation for Chapter records",
                },
              ],
            },
            {
              text: "Na konci zkušební doby výbor vyhodnotí, jestli se problém vyřešil.",
              obligation: "recommended",
              sources: [
                {
                  doc: OPS,
                  page: 59,
                  quoteEn:
                    "If, at the end of the probation, the problem has not been rectified, the Membership Committee meet to consider opening the classification.",
                },
              ],
            },
          ],
          sourcesSummary: "manuál str. 59",
          visual: {
            marks: FOURTH_ABSENCE_MARKS,
            status: "probation",
            statusLabel: "Zkušební doba",
            counters: FOURTH_ABSENCE_COUNTERS,
            srText: "Výbor rozhodl o zkušební době. Na schůzky chodíš dál.",
          },
        },
        {
          tone: "serious",
          id: "uvolneni-mista",
          label: "Možnost 3",
          title: "Uvolnění místa",
          story: [
            "Výbor rozhodne, že tvoje místo v chapteru uvolní. Tvoje členství tím končí a tvůj obor může v chapteru zastupovat někdo jiný.",
          ],
          chapter: [
            {
              text: "Místo se smí uvolnit až poté, co konzultant regionu potvrdí, že se dodržel postup.",
              obligation: "must",
              sources: [
                {
                  doc: OPS,
                  page: 59,
                  quoteEn:
                    "Always involve and get approval from your Director/Director Consultant that the process was followed PRIOR to opening a Member’s classification.",
                },
              ],
            },
            {
              text: "Když výbor uvolňuje místo bez předchozí zkušební doby, musí souhlasit i ředitel regionu. V pravidlech je to Executive Director nebo Regional Director, tedy ten, kdo odpovídá za celý region BNI.",
              obligation: "must",
              sources: [
                {
                  doc: OPS,
                  page: 58,
                  quoteEn:
                    "The Membership Committee may, however, open a Member’s classification without probation, if warranted, with Director/Director Consultant and Executive Director/Regional Director approval.",
                },
              ],
            },
            {
              text: "Kredit za nevyčerpané období se v tomhle případě nevydává.",
              sources: [OPS56_CREDIT],
            },
          ],
          sourcesSummary: "manuál str. 56, 58 a 59",
          visual: {
            marks: FOURTH_ABSENCE_MARKS,
            status: "open",
            statusLabel: "Místo uvolněno",
            counters: FOURTH_ABSENCE_COUNTERS,
            srText: "Výbor rozhodl o uvolnění místa. Členství končí.",
          },
        },
      ],
    },

    {
      type: "scene",
      variant: "main",
      id: "vysledek",
      comic: ABSENCE_COMICS["vysledek"],
      label: "Krok 8",
      title: "Výsledek se dozvíš osobně",
      story: [
        "Ať výbor rozhodne jakkoli, zavolá ti jeden z jeho členů a rozhodnutí ti krátce vysvětlí.",
        "Potom přijde dopis. Je napsaný podle stejné šablony pro všechny a podepisuje ho členský výbor.",
      ],
      chapter: [
        {
          text: "Jeden člen výboru ti zavolá a rozhodnutí krátce vysvětlí.",
          obligation: "recommended",
          sources: [
            {
              doc: OPS,
              page: 59,
              quoteEn:
                "One Membership Committee Member calls challenged Member to notify them and briefly explain the decision.",
            },
          ],
        },
        {
          text: "Dopis se píše podle schválené šablony a podepisuje ho členský výbor. Jméno jednotlivce na něm nikdy není.",
          obligation: "must",
          sources: [
            {
              doc: OPS,
              page: 60,
              quoteEn:
                "Always sign the letters from “The Membership Committee”; never use an individual name.",
            },
          ],
        },
        {
          text: "Dopis o zkušební době i o uvolnění místa musí předem schválit konzultant regionu.",
          obligation: "must",
          sources: [
            {
              doc: OPS,
              page: 60,
              quoteEn:
                "Always get your Director/Director Consultant’s approval prior to sending an Open Classification or Probation letter.",
            },
          ],
        },
        {
          text: "Kopie dopisu jde konzultantovi regionu a regionální kanceláři BNI.",
          obligation: "must",
          sources: [
            {
              doc: OPS,
              page: 60,
              quoteEn:
                "In all cases, these letters should be emailed to your Director/Director Consultant and the BNI Regional Office at the time it is sent to the applicant/Member.",
            },
          ],
        },
        {
          text: "Když se místo uvolní, chapter se dozví, že je volné.",
          obligation: "recommended",
          sources: [
            {
              doc: OPS,
              page: 41,
              quoteEn:
                "Notify the Chapter when an individual is no longer a Member and when the category is opened.",
            },
          ],
        },
      ],
      chapterNotes: ["C5"],
      sourcesSummary: "manuál str. 41, 59 a 60",
      // Brief T-007, rozhodnutí 2: neutrální stav, aby po B3 nezůstalo „Místo uvolněno".
      visual: {
        marks: FOURTH_ABSENCE_MARKS,
        status: "none",
        statusLabel: "Rozhodnuto",
        counters: FOURTH_ABSENCE_COUNTERS,
        srText: "Výbor rozhodl. Výsledek ti řekne člen výboru a pak přijde dopis.",
      },
    },
  ],

  summary: {
    title: "Pravidla jsou stejná pro všechny",
    subtitle: "A jsou napsaná tady.",
    // Šest cílů stránky (arch_iter-029_T-001 sekce 11), body níž je pokrývají.
    goals: [1, 2, 3, 4, 5, 6],
    points: [
      {
        goal: 1,
        text: "Za šest měsíců můžeš mít tři absence. Čtvrtá dává výboru možnost tvoje členství ukončit, automaticky ale nekončí.",
      },
      {
        goal: 2,
        text: "Náhradník ani schválené volno se jako absence nepočítají. Když se doma něco děje, řekni si o volno předem.",
      },
      {
        goal: 3,
        text: "O konci členství nikdy nerozhoduje jeden člověk. Hlasuje členský výbor, předtím tě vyslechne a konzultant regionu předem potvrdí, že se dodržel postup.",
      },
      {
        goal: 4,
        text: "Po absencích se ti ozve člen výboru a řekne ti, jak na tom jsi. Automatický mail je jen upozornění navíc.",
      },
      {
        goal: 5,
        text: "Když odejdeš sám a v dobrém, můžeš dostat kredit za nevyčerpané období. Při vyloučení kvůli docházce kredit nedostaneš. Proto se o kreditu mluví nejpozději po třetí absenci.",
      },
      {
        goal: 6,
        text: "U každého kroku je zdroj s číslem strany manuálu nebo s číslem pravidla. Hlavní zdroje jsou hned pod tímhle shrnutím.",
      },
    ],
    whereToFind: [
      {
        doc: GP,
        page: 1,
        rule: "General Policy #5",
        labelCs: "tři absence a tři náhradníci za šest měsíců",
      },
      { doc: GP, page: 1, rule: "General Policy #9", labelCs: "volno" },
      { doc: GP, page: 2, rule: "Administrative Policy #5", labelCs: "poplatky a kredit" },
      { doc: OPS, page: 55, labelCs: "docházka, telefonáty a dopisy" },
      { doc: OPS, page: 56, labelCs: "kredit a volno" },
      { doc: OPS, page: 58, labelCs: "jak výbor postupuje a hlasuje" },
      { doc: OPS, page: 59, labelCs: "zkušební doba a uvolnění místa" },
      { doc: OPS, page: 60, labelCs: "dopisy výboru" },
    ],
  },

  contacts: [
    {
      role: "Viceprezident chapteru, vede členský výbor",
      when: "Když nevíš, kolik máš absencí, chceš požádat o volno nebo řešíš odchod a kredit.",
    },
    {
      role: "Kterýkoli člen členského výboru",
      when: "Když chceš něco probrat dřív, než z toho bude absence, nebo ti není jasné, co ti výbor poslal.",
    },
  ],

  disclaimer: [
    "Tahle stránka je výklad našeho chapteru. Oficiální česká verze pravidel BNI neexistuje, rozhoduje anglické znění.",
    "Vychází z BNI Chapter Operations Manual 2022-2023, platného od 27. 7. 2022, a z BNI General Policies.",
    "Stav k {updated}.",
  ],
};
