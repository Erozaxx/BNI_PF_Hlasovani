/**
 * „U nás v chapteru": co náš chapter dělá navíc nad pravidla BNI.
 * Sdílí celá série info stránek, scény odkazují id v `chapterNotes`.
 *
 * Texty: content-writer T-005 (schváleno T-006). Všechny položky jsou
 * `approved` (uživatel 28. 9. 2026: štítek „návrh" odebrat, C1 až C7
 * schvaluje sám). `draft` přidá ke štítku slovo „návrh", `enabled: false`
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
];
