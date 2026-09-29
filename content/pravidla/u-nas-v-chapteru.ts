/**
 * „U nás v chapteru": co náš chapter dělá navíc nad pravidla BNI.
 * Sdílí celá série info stránek, scény odkazují id v `chapterNotes`.
 *
 * Texty: content-writer T-005 (schváleno T-006). Všechny položky jsou
 * `approved` (uživatel 28. 9. 2026: štítek „návrh" odebrat, C1 až C7
 * schvaluje sám, C8 až C13 29. 9. 2026). `draft` přidá ke štítku slovo „návrh", `enabled: false`
 * položku skryje všude včetně tisku.
 */
import type { ChapterNote } from "@/lib/info-pages/types";

export const CHAPTER_NOTES: ChapterNote[] = [
  {
    id: "C1",
    text: "Když výbor zvažuje konec něčího členství, nejdřív to ohlásí na svém zasedání. Hlasuje až na dalším zasedání, takže o konci členství se nerozhoduje ze čtvrtka na čtvrtek.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C2",
    text: "O konci členství hlasují všichni členové členského výboru. Nestačí ti, kdo zrovna přišli na zasedání.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C3",
    text: "Než výbor o tvém členství rozhodne, vždycky si tě vyslechne.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C4",
    text: "Telefonát po druhé absenci, telefonát po třetí absenci a rozhovor před hlasováním vede pokaždé jiný člen výboru. Stejnou informaci tak slyšíš od víc lidí a nic nestojí na vztahu s jedním člověkem.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C5",
    text: "Když se místo v chapteru uvolní, chapter se dozví i proč. Osobní podrobnosti se neříkají.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C6",
    text: "Při telefonátu po druhé absenci ti člen výboru připomene obě možnosti: náhradníka i volno.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C7",
    text: "Nejpozději při telefonátu po třetí absenci se dozvíš, jak je to s kreditem. Když odejdeš sám a v dobrém, dostaneš kredit na požádání. Při vyloučení kvůli docházce ne.",
    status: "approved",
    enabled: true,
  },
  // C8 až C13: stránka rolí (iter-030, content-writer T-005, schváleno uživatelem
  // 29. 9. a gate T-006). C10 v upraveném znění, C14 neexistuje.
  {
    id: "C8",
    text: "Vedení chapteru má období šest měsíců a mění se 1. 4. a 1. 10. Výběr nového vedení vede konzultant regionu spolu s odcházejícím vedením.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C9",
    text: "Na začátku každého období a při každé změně zveřejníme, kdo má jakou roli ve vedení a ve členském výboru.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C10",
    text: "O uvolnění místa hlasuje členský výbor v plném složení. Platí to i po stížnosti a po zkušební době. Plné složení se týká jen uvolnění místa. U zkušební doby a u neprodloužení členství se nevyžaduje.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C11",
    text: "Porad členského výboru se účastní viceprezident a členové výboru. Konzultant regionu může přijít. Hlasují členové výboru včetně viceprezidenta. Konzultant regionu radí a potvrzuje, že se dodržel postup.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C12",
    text: "Ke každému rozhodnutí výboru o členovi vznikne krátký zápis: datum, co se rozhodlo a jak dopadlo hlasování. Zápis vidí výbor a konzultant regionu.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C13",
    text: "Když nevíš, kdo o tvé věci rozhoduje, napiš komukoli z vedení. Když to nepatří jemu, předá to dál a dá ti vědět komu.",
    status: "approved",
    enabled: true,
  },
];
