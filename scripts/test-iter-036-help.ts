/**
 * Testy iter-036 (T-003): přepis nápovědy podle auditu a diakritika popisků,
 * na které nápověda odkazuje. Bez DATABASE_URL, bez sítě. Statické kontroly
 * čtou zdrojáky z disku.
 *
 * Spuštění: npm run test:iter-036
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

type TestCase = { name: string; run: () => void };

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}
function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const HELP_FILES = [
  "app/(app)/help/page.tsx",
  "components/help/HelpPage.tsx",
  "components/help/HelpTabs.tsx",
  "components/help/HelpParts.tsx",
  "components/help/sections/MemberHelp.tsx",
  "components/help/sections/ModeratorHelp.tsx",
  "components/help/sections/AdminHelp.tsx",
];
const helpText = (files: string[]) => files.map((f) => norm(read(f))).join("\n");
const ALL_HELP = helpText(HELP_FILES);
const MEMBER = norm(read("components/help/sections/MemberHelp.tsx"));
const MODERATOR = norm(read("components/help/sections/ModeratorHelp.tsx"));
const ADMIN = norm(read("components/help/sections/AdminHelp.tsx"));

function titleIndex(src: string, t: string): number {
  const a = src.indexOf(`title="${t}"`);
  if (a >= 0) return a;
  const m = new RegExp(`>\\s*${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*</h2>`).exec(src);
  return m ? m.index : -1;
}

const tests: TestCase[] = [
  {
    name: "1. v souborech nápovědy není em dash",
    run: () => {
      for (const f of HELP_FILES) {
        assert.ok(!read(f).includes(String.fromCharCode(0x2014)), `${f}: em dash`);
      }
    },
  },
  {
    name: "2. nápověda neobsahuje zrušené pojmy",
    run: () => {
      const bad = [
        "Zdržuji se",
        "Ano / Ne",
        "Rychlé hlasování",
        "Výběr hostů",
        "Potvrdit a spustit",
        "Jak se přihlásit",
        "Zobrazit report",
        "Hosté a hlasování (detail hosta)",
        "Omezení role Moderátora",
        "Změna hesla",
        "Správa členů",
        "Revokovat odkaz",
        "Smazat člena",
        "administraci systému",
      ];
      for (const b of bad) {
        assert.ok(!ALL_HELP.includes(b), `zrušený pojem v nápovědě: ${b}`);
      }
    },
  },
  {
    name: "3. člen: sekce v pořadí z auditu, hlasování o hostech první",
    run: () => {
      const titles = [
        "Hlasování o hostech",
        "Přihlášení",
        "Dashboard",
        "Hosté a poznámky",
        "Schůzky a výsledky",
        "Archiv hostů",
        "Hlasování o akci",
        "Pravidla chapteru",
        "Master mind",
        "Burza pomoci",
      ];
      let last = -1;
      for (const t of titles) {
        const i = titleIndex(MEMBER, t);
        assert.ok(i > last, `člen: sekce ${t} chybí nebo je mimo pořadí`);
        last = i;
      }
    },
  },
  {
    name: "4. moderátor: sekce z auditu",
    run: () => {
      for (const t of [
        "Přihlášení vedení",
        "Schůzka a hosté",
        "Spuštění hlasování",
        "Uzavření a report",
        "Úprava hosta",
        "Akce",
        "Časovače",
        "Pohovory s novými členy",
        "Provoz",
        "Co dělá jen admin",
        "Master mind: zařazování",
        "Burza pomoci: zápis za členy",
      ]) {
        assert.ok(titleIndex(MODERATOR, t) >= 0, `moderátor: ${t}`);
      }
    },
  },
  {
    name: "5. admin: sekce včetně deaktivace a funkcí, „Zneplatnit odkaz“ místo „Revokovat“",
    run: () => {
      for (const t of [
        "Členové",
        "Deaktivace člena",
        "Funkce a přístup",
        "Kategorie",
        "Mazání hostů, schůzek a akcí",
      ]) {
        assert.ok(ADMIN.includes(`title="${t}"`), `admin: ${t}`);
      }
      assert.ok(!ADMIN.includes('title="Role a hesla vedení"'), "starý název sekce");
      assert.ok(!/Revokovat/.test(ADMIN), "„Revokovat“ v nápovědě nemá být");
      assert.ok(ADMIN.includes("Zneplatnit odkaz"), "Zneplatnit odkaz");
      assert.ok(ADMIN.includes("Dozví se to člen?"), "FAQ Dozví se to člen?");
    },
  },
  {
    name: "6. hodnoty hlasu Pro / Nevím / Proti, Master mind doplněn, oprava slova Stáhnout",
    run: () => {
      assert.ok(MEMBER.includes("„Pro“, „Nevím“, nebo „Proti“"));
      assert.ok(MEMBER.includes("Co je v sekci Na řadě?"));
      assert.ok(MEMBER.includes("Rozbalte „Proběhlé“ na konci stránky."));
      assert.ok(!MODERATOR.includes("jde jen smazat a zapsat znovu"));
      assert.ok(MODERATOR.includes("jde jen stáhnout a zapsat znovu"));
    },
  },
  {
    name: "7. HelpPage nemá rámeček Jak se přihlásit a tyká se jen v ostatních částech",
    run: () => {
      const page = read("components/help/HelpPage.tsx");
      assert.ok(!page.includes("Jak se přihlásit"));
      assert.ok(page.includes("<HelpTabs"));
      assert.ok(page.includes('label: "Pro vedení"') && !page.includes("Pro moderátora"));
      assert.ok(!/ zadej | mrkni /.test(ALL_HELP.replace(/Mrkněte/g, "")), "nápověda vyká");
    },
  },
  {
    name: "8. menu desktop a mobil mají diakritiku a stejné názvy",
    run: () => {
      const layout = read("app/(app)/layout.tsx");
      const nav = read("components/layout/MobileNav.tsx");
      for (const w of ["Hosté", "Schůzky", "Časovače", "Členové", "Nastavení", "Odhlásit se", "BNI Plzeň"]) {
        assert.ok(layout.includes(w), `layout: ${w}`);
      }
      for (const bad of ["Hoste<", "Schuzky<", "Casovace<", "Clenove<", "Nastaveni<", "Odhlasit", "BNI Plzen"]) {
        assert.ok(!layout.includes(bad), `layout bez diakritiky: ${bad}`);
      }
      for (const w of ["Hosté", "Schůzky", "Časovače", "Členové", "Nastavení", "Odhlásit se"]) {
        assert.ok(nav.includes(w), `mobilní menu: ${w}`);
      }
    },
  },
  {
    name: "9. popisky, které nápověda jmenuje, existují v UI se stejným zněním",
    run: () => {
      const map: Array<[string, string]> = [
        ["+ Přidat hosta", "app/(app)/guests/page.tsx"],
        ["Filtrovat podle činnosti", "components/guests/CategoryFilter.tsx"],
        ["Přidat poznámku", "components/notes/NoteForm.tsx"],
        ["+ Přidat poznámku", "app/m/[token]/_components/MeetingNoteForm.tsx"],
        ["Zrušit filtry", "components/archive/ArchiveFilters.tsx"],
        ["Archiv hostů", "app/(app)/archive/page.tsx"],
        ["Nová schůzka", "app/(app)/meetings/page.tsx"],
        ["Vytvořit", "app/(app)/meetings/CreateMeetingForm.tsx"],
        ["Spustit hlasování", "components/meetings/StartVotingPanel.tsx"],
        ["Rozeslat hned", "components/meetings/StartVotingPanel.tsx"],
        ["Magic linky členů", "app/(app)/meetings/[id]/MemberLinksManager.tsx"],
        ["Uzavřít hlasování", "components/meetings/MeetingControls.tsx"],
        ["Generovat report", "components/meetings/ReportButton.tsx"],
        ["Smazat schůzku", "components/meetings/DeleteMeetingButton.tsx"],
        ["Výsledky hlasování", "app/(app)/meetings/[id]/SortableMeetingGuestList.tsx"],
        ["Změna kategorie", "app/(app)/guests/[id]/page.tsx"],
        ["Změnit", "app/(app)/guests/[id]/GuestCategoryChanger.tsx"],
        ["Povýšit na člena", "components/guests/PromoteGuestButton.tsx"],
        ["Smazat hosta", "components/guests/DeleteGuestButton.tsx"],
        ["+ Nová akce", "app/(app)/events/page.tsx"],
        ["Vytvořit akci", "app/(app)/events/new/_components/EventForm.tsx"],
        ["Uzavřít akci", "app/(app)/events/[eventId]/_components/EventDetail.tsx"],
        ["Označit vítěze", "app/(app)/events/[eventId]/_components/EventOptionsManager.tsx"],
        ["Přidat externího účastníka", "app/(app)/events/[eventId]/_components/AddParticipantForm.tsx"],
        ["Účastníci", "app/(app)/events/[eventId]/_components/ParticipantsManager.tsx"],
        ["Report výsledků", "app/(app)/events/[eventId]/_components/EventReport.tsx"],
        ["Uložit hlasy", "app/e/[eventId]/_components/VotingView.tsx"],
        ["Vytvořit časovač", "app/(app)/timers/CreateTimerForm.tsx"],
        ["Neověřené datum vstupu", "components/interviews/InterviewDueSection.tsx"],
        ["Správa otázek", "app/(app)/interviews/page.tsx"],
        ["Doručeno", "lib/ops/resend-status.ts"],
        ["Odmítnuto", "lib/ops/resend-status.ts"],
        ["Nový člen", "app/(app)/admin/members/page.tsx"],
        ["Import členů z XLSX", "app/(app)/admin/members/page.tsx"],
        ["Přidat člena", "app/(app)/admin/members/CreateMemberForm.tsx"],
        ["Nahrát a zobrazit preview", "app/(app)/admin/members/ImportMembersForm.tsx"],
        ["Importovat vybrané", "app/(app)/admin/members/ImportMembersForm.tsx"],
        ["Název kategorie", "app/(app)/admin/categories/CreateCategoryForm.tsx"],
        ["Přejmenovat", "app/(app)/admin/categories/RenameCategoryForm.tsx"],
        ["Změnit heslo", "app/(app)/settings/ChangePasswordForm.tsx"],
        ["Nevím", "app/m/[token]/_components/MeetingVoteButtons.tsx"],
        ["Neutrální", "components/votes/VoteResults.tsx"],
      ];
      for (const [label, file] of map) {
        assert.ok(read(file).includes(label), `${file}: chybí popisek „${label}“`);
      }
      const members = read("app/(app)/admin/members/SortableMemberList.tsx");
      assert.ok(members.includes("5 měsíců") && members.includes("10 měsíců") && members.includes("Založit pohovor"));
    },
  },
  {
    name: "11. předměty mailů v nápovědě sedí na skutečné předměty a tlačítko v mailu",
    run: () => {
      const resend = read("lib/email/resend.ts");
      const events = read("lib/events/magic-link.ts");
      assert.ok(resend.includes("BNI Hlasovani - Odkaz pro hlasovani"));
      assert.ok(resend.includes("Prejit na hlasovani"));
      assert.ok(events.includes("BNI Hlasovani - Pozvanka:"));
      assert.ok(MEMBER.includes("„BNI Hlasovani - Odkaz pro hlasovani“"));
      assert.ok(MEMBER.includes("„Prejit na hlasovani“"));
      assert.ok(MEMBER.includes("„BNI Hlasovani - Pozvanka: {název akce}“"));
      assert.ok(!ALL_HELP.includes("„Odkaz pro hlasování“") && !ALL_HELP.includes("„Pozvánka:"));
    },
  },
  {
    name: "10. hláška po povýšení hosta už nemluví o odkazu od admina",
    run: () => {
      const src = read("components/guests/PromoteGuestButton.tsx");
      assert.ok(!src.includes("prihlasovaci odkaz"));
      assert.ok(!src.includes("vygeneruje ho admin"));
      assert.ok(src.includes("se přihlásí sám na přihlašovací stránce"));
    },
  },
];

let failed = 0;
for (const t of tests) {
  try {
    t.run();
    console.log(`ok   ${t.name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${t.name}\n     ${(e as Error).message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} testů prošlo`);
process.exit(failed ? 1 : 0);
