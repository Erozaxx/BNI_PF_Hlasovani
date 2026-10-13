/**
 * „U nás v chapteru": co náš chapter dělá navíc nad pravidla BNI.
 * Sdílí celá série info stránek, scény odkazují id v `chapterNotes`.
 *
 * Texty: content-writer T-005 (schváleno T-006). Všechny položky jsou
 * `approved` (uživatel 28. 9. 2026: štítek „návrh" odebrat, C1 až C7
 * schvaluje sám, C8 až C13 29. 9. 2026, C15 a C16 12. 10. 2026, C17 13. 10. 2026, C18 a C19 13. 10. 2026, C20 až C23 13. 10. 2026). `draft` přidá ke štítku slovo „návrh", `enabled: false`
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
  // C14 se nepoužívá (v iter-030 ji uživatel zrušil). C15 a C16: rytmus schůzek
  // podle rozhodnutí uživatele 12. 10. 2026 (iter-031, content-writer T-005d,
  // schváleno gate T-006d). C15 i na stránce clenstvi v kroku `host`.
  // C15 upraveno 12. 10. po BFU (gate T-012p úprava 23).
  {
    id: "C15",
    text: "Každá druhá čtvrteční schůzka je u nás interní, bez hostů. Na otevřené schůzce se věnujeme hostům. Na interní pracujeme na vlastním růstu, víc se propojujeme mezi sebou a probíráme, jak dopadla schůzka s hosty. Na jejím konci se schází členský výbor a rozhoduje o přihláškách.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C16",
    text: "Střídání otevřených a interních schůzek je u nás výjimka, kterou schválil franšízant. Ostatní chaptery se jím inspirují.",
    status: "approved",
    enabled: true,
  },
  // C17: rozhodnutí uživatele 13. 10. 2026 (iter-031, T-012r), nahrazuje
  // úpravu 4 z gate T-012p. Na stránce clenstvi u možnosti `odmitnuti`.
  {
    id: "C17",
    text: "Výsledek přihlášky hostovi oznámí vybraný člen chapteru.",
    status: "approved",
    enabled: true,
  },
  // C18, C19: rozhodnutí uživatele 13. 10. 2026 (iter-031 T-012v).
  {
    id: "C18",
    text: "Kolikrát za tebe přijde náhradník, u nás neřešíme. Chceme hlavně kvalitního náhradníka, který tě zastoupí, kdykoli je potřeba.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C19",
    text: "Hlavní prezentaci za tebe u nás může mít i náhradník.",
    status: "approved",
    enabled: true,
  },
  // C20 až C23: rozhodnutí uživatele 13. 10. 2026 (iter-031 T-012w, gate T-012w2).
  // C22 i na stránce clenstvi v kroku `prijeti` a na stránce kodex v kroku `slib`.
  {
    id: "C20",
    text: "Průběh otevřené schůzky je u nás trochu jiný než v manuálu BNI. Prezident představí BNI a jeho hodnoty. Tým hostitelů uvede seznam hostů a případné změny. Pak se představí členové a po nich hosté. Následuje vzdělávací okénko, hlavní prezentace, zpráva viceprezidenta s čísly chapteru a doporučení a reference. Na konci je volný networking.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C21",
    text: "Na představení má u nás člen 30 sekund a host 60 sekund.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C22",
    text: "Nové členy uvádí prezident na konci své části, jen na otevřené schůzce. Když nový člen přijde poprvé na interní schůzku, i tam ho představíme a přivítáme. Oficiální uvedení je až na příští otevřené schůzce.",
    status: "approved",
    enabled: true,
  },
  {
    id: "C23",
    text: "Vzdělávací okénko i hlavní prezentace mají u nás každé 5 minut.",
    status: "approved",
    enabled: true,
  },
];
