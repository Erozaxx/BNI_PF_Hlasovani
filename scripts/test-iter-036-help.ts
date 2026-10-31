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
import {
  HELP_ATTENDANCE_MANAGER_UNEXCUSED,
  HELP_ATTENDANCE_MEMBER_UNEXCUSED,
  HELP_SEMAFOR_LEADERSHIP,
  HELP_SEMAFOR_MEMBER,
} from "../lib/semafor/texts";
import {
  HELP_ATTENDANCE_TERMS,
  HELP_BUTTON_GO_VOTE,
  HELP_CALENDAR_LEGEND,
  HELP_SUBJECT_EVENT_INVITE,
  HELP_SUBJECT_REMINDER,
  HELP_SUBJECT_VOTING_LINK,
  HELP_VOTING_END,
  memberDeadlineHelp,
} from "../components/help/help-texts";
import { MEMBER_TEXTS } from "../lib/attendance/rules";

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
    name: "6. hodnoty hlasu Pro / Nevím / Proti, Master mind doplněn, Smazat případ místo Stáhnout (iter-042 K6)",
    run: () => {
      assert.ok(MEMBER.includes("„Pro“, „Nevím“, nebo „Proti“"));
      assert.ok(MEMBER.includes("Co je v sekci Na řadě?"));
      assert.ok(MEMBER.includes("Rozbalte „Proběhlé“ na konci stránky."));
      assert.ok(MODERATOR.includes("jde jen smazat a zapsat znovu"));
      assert.ok(!MODERATOR.includes("jde jen stáhnout a zapsat znovu"));
      assert.ok(MEMBER.includes("Jak případ smažu?") && MEMBER.includes("<strong>Smazat případ</strong>"));
      assert.ok(MEMBER.includes("Zařazený případ smaže vedení."));
      assert.ok(!/Stáhnout|stáhnu|stáhne vedení/.test(MEMBER), "slovo Stáhnout u případu");
      assert.ok(read("components/mastermind/RemoveCaseButton.tsx").includes("UI_TEXTS.removeButton"));
      assert.equal(read("lib/mastermind/rules.ts").includes('removeButton: "Smazat případ"'), true);
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
        ["Osobní odkazy členů", "app/(app)/meetings/[id]/MemberLinksManager.tsx"],
        ["Zkopírovat odkaz", "app/(app)/meetings/[id]/MemberLinksManager.tsx"],
        ["Poslat e-mailem", "app/(app)/meetings/[id]/MemberLinksManager.tsx"],
        ["Nový odkaz", "app/(app)/meetings/[id]/MemberLinksManager.tsx"],
        ["Zneplatnit", "app/(app)/meetings/[id]/MemberLinksManager.tsx"],
        ["Hromadný import hostů", "app/(app)/meetings/[id]/page.tsx"],
        ["Importovat hosty (.xlsx)", "app/(app)/meetings/[id]/ImportGuestsButton.tsx"],
        ["Exportovat seznam (.xlsx)", "app/(app)/meetings/[id]/ExportListButton.tsx"],
        ["Omluvit se", "lib/attendance/rules.ts"],
        ["Zápis", "lib/attendance/sheet.ts"],
        ["Bez zápisu", "lib/attendance/sheet.ts"],
        ["Odkaz pro publikum", "app/(app)/timers/CreateTimerForm.tsx"],
        ["Odkaz pro moderátora", "app/(app)/timers/CreateTimerForm.tsx"],
        ["Nejvýš N možností", "app/(app)/events/new/_components/EventForm.tsx"],
        ["Odeslat odkaz", "app/(app)/interviews/[id]/SendInterviewLinkForm.tsx"],
        ["Smazat případ", "lib/mastermind/rules.ts"],
        ["Uložená jména náhradníků", "lib/attendance/rules.ts"],
        ["Nastavení chapteru", "lib/chapter/texts.ts"],
        ["Části aplikace", "lib/chapter/texts.ts"],
        ["Pravidelná schůzka", "lib/chapter/texts.ts"],
        ["Heslo", "app/(app)/settings/page.tsx"],
        ["Uzavřít hlasování", "components/meetings/MeetingControls.tsx"],
        ["Poslat report vedení", "components/meetings/ReportButton.tsx"],
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
        ["Nahrát a zobrazit náhled", "app/(app)/admin/members/ImportMembersForm.tsx"],
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
      // iter-042 (K2): maily mají diakritiku a nápověda cituje skutečné předměty.
      const resend = read("lib/email/resend.ts");
      const events = read("lib/events/magic-link.ts");
      const reminder = read("lib/email/reminder-template.ts");
      assert.ok(resend.includes("BNI Hlasování: odkaz pro hlasování"));
      assert.ok(resend.includes("Přejít na hlasování"));
      assert.ok(events.includes("BNI Hlasování: pozvánka:"));
      assert.ok(reminder.includes("BNI Hlasování: nezapomeň prosím odhlasovat (schůzka"));
      assert.equal(HELP_SUBJECT_VOTING_LINK, "BNI Hlasování: odkaz pro hlasování");
      assert.equal(HELP_SUBJECT_EVENT_INVITE, "BNI Hlasování: pozvánka: {název akce}");
      assert.equal(HELP_SUBJECT_REMINDER, "BNI Hlasování: nezapomeň prosím odhlasovat (schůzka {datum})");
      assert.equal(HELP_BUTTON_GO_VOTE, "Přejít na hlasování");
      assert.ok(MEMBER.includes("HELP_SUBJECT_VOTING_LINK") && MEMBER.includes("HELP_BUTTON_GO_VOTE"));
      assert.ok(MEMBER.includes("HELP_SUBJECT_EVENT_INVITE") && MEMBER.includes("HELP_SUBJECT_REMINDER"));
      assert.ok(!ALL_HELP.includes("„Odkaz pro hlasování“") && !ALL_HELP.includes("„Pozvánka:"));
      assert.ok(!/Hlasovani|Pozvanka|Prejit/.test(ALL_HELP), "předměty bez diakritiky v nápovědě");
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
  {
    name: "12. iter-038: nápověda člena má sekci Docházka za Burzou pomoci a odkazuje na popisky z UI",
    run: () => {
      const iBurza = titleIndex(MEMBER, "Burza pomoci");
      const iAtt = titleIndex(MEMBER, "Docházka");
      assert.ok(iBurza >= 0 && iAtt > iBurza, "sekce Docházka má být za Burzou pomoci");
      assert.ok(MEMBER.includes("V menu Docházka klepněte na den."));
      assert.ok(memberDeadlineHelp().includes("do 7:30 v den schůzky"), "výchozí čas z nastavení");
      assert.ok(memberDeadlineHelp({ meetingTime: "08:15" }).includes("do 8:15 v den schůzky"));
      assert.ok(MEMBER.includes("memberDeadlineHelp(settings)"), "čas z nastavení, ne natvrdo");
      const rules = read("lib/attendance/rules.ts");
      assert.ok(rules.includes("Nepřijdu, bez náhradníka") && rules.includes("Nepřijdu, pošlu náhradníka"));
      assert.ok(read("app/(app)/layout.tsx").includes(">Docházka<"));
      assert.ok(read("components/layout/MobileNav.tsx").includes("Docházka"));
    },
  },
  {
    name: "13. iter-038: nápověda vedení má sekce Docházka pro správce a Opravy po uzávěrce, jen s právem (T-003b)",
    run: () => {
      assert.ok(titleIndex(MODERATOR, "Docházka pro správce") >= 0);
      assert.ok(titleIndex(MODERATOR, "Opravy po uzávěrce") > titleIndex(MODERATOR, "Docházka pro správce"));
      assert.ok(MODERATOR.includes("V den schůzky vám ráno před 7:00 přijde mail s odkazem na zápis."));
      assert.ok(MODERATOR.includes("Report se znovu neposílá."));
      assert.ok(MODERATOR.includes("{attendance && (") && MODERATOR.includes("{attendanceHistory && ("));
      assert.ok(read("app/(app)/help/page.tsx").includes('can(session, "attendance.view_all")'));
    },
  },
  {
    name: "14. iter-038: nápověda admina má sekci Správce docházky mezi Funkce a přístup a Kategorie, ráno před 7:00 (T-003c)",
    run: () => {
      const a = titleIndex(ADMIN, "Funkce a přístup");
      const b = titleIndex(ADMIN, "Správce docházky");
      const c = titleIndex(ADMIN, "Kategorie");
      assert.ok(a >= 0 && b > a && c > b);
      assert.ok(ADMIN.includes("zapněte Správce docházky"));
      assert.ok(ADMIN.includes("ráno před 7:00 mail s odkazem na zápis a v 17:00 report"));
      assert.ok(ADMIN.includes("Ranní mail chodí jen v den, kdy je v aplikaci založená schůzka."));
      // popisek přepínače, na který nápověda odkazuje, existuje v UI
      assert.ok(read("app/(app)/admin/members/AttendanceManagerToggle.tsx").includes("Správce docházky"));
    },
  },
  {
    name: "15. iter-040: nápověda k interní schůzce (člen, vedení jen s právem, věta o Master mind), konečné znění z gate",
    run: () => {
      assert.ok(MEMBER.includes("HELP_CALENDAR_LEGEND") && MEMBER.includes("Interní schůzka se počítá do docházky jako běžná a omlouváte se stejně."));
      assert.equal(HELP_CALENDAR_LEGEND, "Světle modrý den je pravidelná schůzka, tmavě modrý schůzka s hosty, zelený interní schůzka.");
      assert.ok(MEMBER_TEXTS.legend.startsWith(HELP_CALENDAR_LEGEND), "nápověda a kalendář mají stejnou legendu");
      assert.ok(MEMBER.includes("HELP_ATTENDANCE_TERMS") && HELP_ATTENDANCE_TERMS.startsWith("Omluva = dáte vědět předem, že nepřijdete. Absence = výsledek po schůzce:"));
      assert.ok(MEMBER.includes("Co se stane s mou omluvou, když se interní schůzka zruší?"));
      assert.ok(MEMBER.includes("Omluva na ten den se smaže a den se do docházky nepočítá. Když na ten den později vznikne běžná schůzka, omluvte se znovu."));
      assert.ok(titleIndex(MODERATOR, "Interní schůzka") >= 0);
      assert.ok(MODERATOR.includes("{internalMeetings && ("));
      assert.ok(MODERATOR.includes("V menu Docházka klepněte na den a zvolte Založit interní schůzku. Den se počítá do docházky: správci docházky dostanou ráno před 7:00 odkaz na zápis a v 17:00 report. Hosté ani hlasování se nezakládají."));
      assert.ok(MODERATOR.includes("Zrušit ji můžete do 17:00 v den schůzky, dokud správce docházky nic nezapsal. Zrušením se smažou všechny omluvy členů na ten den. Členům o tom mail nepřijde."));
      assert.ok(MODERATOR.includes("Když má být místo interní běžná schůzka, založte ji ve Schůzkách a interní nerušte. Platí běžná a omluvy zůstanou. Když běžnou schůzku potom smažete, platí zase interní."));
      assert.ok(!MODERATOR.includes("Interní schůzky se v aplikaci nezakládají."), "stará věta musí zmizet");
      assert.ok(MODERATOR.includes("Interní schůzku založíte v menu Docházka. Případ ze zásobníku zařadíte na {day}"), "den schůzky z nastavení, ne čtvrtek natvrdo");
      assert.ok(read("app/(app)/help/page.tsx").includes('can(session, "attendance.internal_manage")'));
    },
  },
  {
    name: "16. iter-041: nápověda semaforu a „Chyběl(a) bez omluvy“ doslova podle gate sekce 5, bez U+2014",
    run: () => {
      // Nápověda se skládá z konstant bonusu, proto se kontroluje výsledný text, ne zdroják.
      const texts = [
        read("lib/semafor/texts.ts"),
        HELP_SEMAFOR_MEMBER.join("\n"),
        HELP_SEMAFOR_LEADERSHIP.map((h) => h.text).join("\n"),
        read("lib/attendance/texts.ts"),
        HELP_ATTENDANCE_MEMBER_UNEXCUSED,
        HELP_ATTENDANCE_MANAGER_UNEXCUSED,
      ].join("\n");
      const must = [
        "Semafor ukazuje vaše skóre podle BNI za posledních 6 měsíců a k němu bonus za to, co děláte pro chapter. Vedení nahrává data BNI jednou měsíčně.",
        // iter-044: odpověď „Za co je bonus?“ se skládá ze zdrojů a konstant, bez „odprezentovaný“.
        "Master mind, který proběhl, 7 bodů. Pomoc nebo kontakt, které někdo v Burze pomoci označí jako využité, 5 bodů. Funkce v chapteru 5 bodů.",
        "Za 6 měsíců nejvýš 20 bodů.",
        "Barvu určuje skóre s bonusem: zelená od 70 bodů, žlutá od 50, červená od 30, šedá pod 30. Vedle vidíte i barvu podle BNI bez bonusu.",
        "Své hodnoty vidíte jen vy, vedení a členové výboru. Ostatní členové vidí jen počty členů v každé barvě, bez jmen.",
        "Když vám hodnoty nesedí, ozvěte se vedení.",
        "Když nepřijdete, do 7:30 se neomluvíte a nepošlete náhradníka, zapíše vás správce docházky jako Chyběl(a) bez omluvy. Do absencí se to počítá stejně jako omluvená absence.",
        "Chyběl(a) bez omluvy zaškrtněte u člena, který nepřišel, neomluvil se a neposlal náhradníka. Jde to od 7:30, do té doby se člen může omluvit. U omluveného člena volba není, nejdřív zrušte omluvu.",
        "Vlastní případ v Master mindu nepotvrzujte, potvrdí ho jiný člen vedení. Master mind, který proběhl, dává bonus 7 bodů do semaforu.",
      ];
      for (const m of must) assert.ok(texts.includes(m), m.slice(0, 40));
      assert.ok(!texts.includes(String.fromCharCode(0x2014)));
      // iter-042: nápověda bere texty z funkcí s nastavením, konstanty jsou výchozí stav.
      assert.ok(MEMBER.includes("semaforMemberFaq(bonus)") && MEMBER.includes('title="Semafor"'));
      assert.ok(MEMBER.includes("helpAttendanceMemberUnexcused(settings.meetingTime)"));
      assert.ok(MODERATOR.includes('title="Semafor pro vedení"') && MODERATOR.includes("helpSemaforLeadership(sources)") && MODERATOR.includes("semaforImport || !h.importOnly"));
      assert.ok(MODERATOR.includes("helpAttendanceManagerUnexcused(settings.meetingTime)"));
      const page = read("app/(app)/help/page.tsx");
      assert.ok(page.includes('showSemaforHelp={can(session, "semafor.view_all")}'));
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
