/**
 * Testy iter-042 (T-003g, arch sekce 6, gate Z5 a Z7): srozumitelnost rozhraní.
 * Bez DATABASE_URL, bez sítě. Statické kontroly čtou zdrojáky z disku, texty
 * se kontrolují jen v řetězcích a v JSX textu (komentáře a identifikátory se
 * vynechávají, stejný postup jako U7 v test-iter-037-members.ts).
 *
 * Spuštění: npx tsx scripts/test-iter-042-srozumitelnost.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CHAPTER_SETTINGS, type ChapterSettings } from "../lib/chapter/settings";
import { validateCreateEventInput } from "../lib/events/create-input";
import { memberIntroText } from "../lib/attendance/rules";
import { BONUS_POINTS } from "../lib/semafor/bonus";
import {
  AREAS_LEGEND_TEXT,
  HELP_BURZA_USED_BONUS,
  HELP_SEMAFOR_ABBREVIATIONS,
  areaValueText,
  helpAttendanceManagerUnexcused,
  helpAttendanceMemberUnexcused,
  helpSemaforLeadership,
  helpSemaforMember,
} from "../lib/semafor/texts";
import {
  autostartHelp,
  closeVotingHelp,
  deleteMemberScopeText,
  inactiveHidesText,
  memberDeadlineHelp,
  semaforMemberFaq,
  warningMailHelp,
} from "../components/help/help-texts";

const ROOT = join(__dirname, "..");

type TestCase = { name: string; run: () => void };

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const EM_DASH = String.fromCharCode(0x2014);

/** Zdrojové soubory `.ts` a `.tsx` pod složkou (rekurzivně), relativní cesty. */
function sourceFiles(dirRel: string): string[] {
  const out: string[] = [];
  if (!existsSync(join(ROOT, dirRel))) return out;
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(ROOT, rel))) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const child = `${rel}/${entry}`;
      if (statSync(join(ROOT, child)).isDirectory()) walk(child);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(child);
    }
  };
  walk(dirRel);
  return out;
}

/** Odstraní komentáře (blokové i řádkové mimo URL a řetězce). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/**
 * Texty, které uživatel vidí: obsah řetězců a šablonových řetězců plus text
 * mezi značkami JSX. Přibližné, ale komentáře, identifikátory a importy v něm nejsou.
 */
function uiTexts(src: string): string[] {
  const code = stripComments(src)
    .replace(/^\s*import\s[^;]*;/gm, "")
    // logy do konzole nejsou text pro uživatele
    .replace(/console\.\w+\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\);?/g, "");
  const out: string[] = [];
  const re = /"((?:\\.|[^"\\\n])*)"|'((?:\\.|[^'\\\n])*)'|`((?:\\.|[^`\\])*)`|>([^<>{}]*)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    // Výrazy ve ${…} jsou kód, ne text.
    const text = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").replace(/\$\{[^}]*\}/g, " ");
    // Text mezi > a < může být i kus TypeScriptu (generika, podmínky), ten text pro uživatele není.
    if (m[4] !== undefined && /[;=]|\bconst\b|\bfunction\b|\breturn\b/.test(text)) continue;
    // Jednoslovné klíče malými písmeny ("clen", "pick_one") jsou kódy, ne text.
    if (/^[a-z_]+$/.test(text.trim())) continue;
    if (/\p{L}/u.test(text)) out.push(text);
  }
  return out;
}

function allUiTexts(files: string[]): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  for (const file of files) for (const text of uiTexts(read(file))) out.push({ file, text });
  return out;
}

/** Soubory s texty pro uživatele: stránky za loginem, komponenty, akce, veřejné stránky. */
const UI_DIRS = ["app/(app)", "app/m", "app/e", "app/i", "app/t", "components", "actions"];
const UI_FILES = UI_DIRS.flatMap(sourceFiles);
const DIACRITIC_FILES = [
  ...sourceFiles("app").filter((f) => !f.startsWith("app/pravidla/")),
  ...sourceFiles("components"),
  ...sourceFiles("actions"),
  "lib/meetings/token-error-text.ts",
  "lib/events/voting.ts",
  ...sourceFiles("lib/ops"),
  ...sourceFiles("lib/email"),
];

/** Soubory změněné v iter-042 (proti `main`, včetně nových). Mimo git repozitář prázdné. */
function changedFiles(): string[] | null {
  const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    let base = "";
    for (const ref of ["main", "origin/main"]) {
      try {
        git(["rev-parse", "--verify", ref]);
        base = ref;
        break;
      } catch {
        /* zkusit další */
      }
    }
    if (!base) return null;
    const tracked = git(["diff", "--name-only", base]).split("\n");
    const untracked = git(["ls-files", "--others", "--exclude-standard"]).split("\n");
    return [...tracked, ...untracked].filter((f) => f && /\.(ts|tsx|sql)$/.test(f) && existsSync(join(ROOT, f)));
  } catch {
    return null;
  }
}

/** Celá slova včetně české diakritiky (`\b` v JS háčky nezná). */
function words(list: string): RegExp {
  return new RegExp(`(?<![\\p{L}])(${list})(?![\\p{L}])`, "u");
}

const tests: TestCase[] = [
  {
    name: "1. diakritika: v řetězcích a JSX textu UI, mailů a provozu nejsou podoby bez háčků (K1, K2)",
    run: () => {
      // Typické podoby bez háčků, odvozené z nálezů BFU a z kontroly kódu.
      const bad = [
        /\bZatim\b/, /\bzadn(e|i|y|ych)\b/i, /\bHlasovani\b/, /\bhlasovani\b/, /\bNepodarilo\b/, /\bnepodarilo\b/,
        /\bUlozit\b/, /\bZrusit\b/, /\bPridat\b/, /\bZavrit\b/, /\bschuzk/i, /\bclen(u|um|a|ove)?\b/,
        /\bClen(u|um|a|ove)?\b/, /\bDuvod\b/, /\bpovinny\b/, /\bNacitani\b/, /\bVas hlas\b/, /\bVase\b/,
        /\bodpoved\b/, /\bUzavreno\b/, /\bAktivni\b/, /\bZprava\b/, /\bBeh dokoncen/, /\bVarovani\b/,
        /\bZavaznost\b/, /\bOverit\b/, /\bOdeslano\b/, /\bKopirovat\b/, /\bZkopirovano\b/, /\bSpusteno\b/,
        /\bprejmenovan/, /\bvytvoren\b/, /\bNeulozilo\b/, /\bNepodařilo se ulozit/, /\bodkaz(u|y)? neplati\b/,
        /\bPrejit\b/, /\bPozvanka\b/, /\bpozvanka\b/, /\bpresne\b/i, /\bkazde\b/i, /\bnasledujici\b/i,
        /\bNeco\b/, /\bDoslo\b/, /\bneocekavane\b/, /\bprosim\b/, /\bhlavni stranku\b/, /\bUcastnik\b/, /\bClenstvi\b/,
        /\bPorovnani\b/, /\bmesicu\b/,
      ];
      const offenders: string[] = [];
      for (const { file, text } of allUiTexts(DIACRITIC_FILES)) {
        for (const re of bad) if (re.test(text)) offenders.push(`${file}: ${re} v „${text.slice(0, 70)}“`);
      }
      assert.deepEqual(offenders, []);
      assert.ok(read("app/layout.tsx").includes("BNI · PF Hlasování"), "titulek okna");
    },
  },
  {
    name: "2. dlouhá pomlčka: ve všech souborech změněných v iter-042 a v každém textu UI",
    run: () => {
      // Pevný seznam: soubory nové v iter-042 plus schema.sql a voting.ts. Drží i po merge do
      // main, kdy `changedFiles()` vrátí prázdno (diff proti main už nic neukazuje).
      const FIXED_CLEAN = [
        "actions/chapter-settings.ts",
        "app/(app)/admin/nastaveni/ChapterSettingsForm.tsx",
        "app/(app)/admin/nastaveni/page.tsx",
        "components/chapter/FeatureOff.tsx",
        "components/help/help-texts.ts",
        "lib/chapter/events.ts",
        "lib/chapter/feature-guard.ts",
        "lib/chapter/settings.ts",
        "lib/chapter/texts.ts",
        "lib/db/queries/chapter-settings.ts",
        "lib/db/schema.sql",
        "lib/events/voting.ts",
        "scripts/migrate-iter-042-nastaveni.ts",
      ];
      for (const f of FIXED_CLEAN) {
        assert.ok(existsSync(join(ROOT, f)), `pevný soubor chybí: ${f}`);
        assert.ok(!read(f).includes(EM_DASH), `dlouhá pomlčka v ${f}`);
      }
      const changed = changedFiles();
      if (changed) {
        // Kontrola změněných souborů chrání jen otevřenou větev, po merge je prázdná; trvale drží FIXED_CLEAN.
        // Testy v scripts/ smí mít literál v assertu (kontrola, že tam pomlčka není).
        const bad = changed.filter((f) => !f.startsWith("scripts/") && read(f).includes(EM_DASH));
        assert.deepEqual(bad, [], "dlouhá pomlčka v souborech změněných v iter-042");
      } else {
        console.log("     (git není k dispozici, kontrola změněných souborů přeskočena)");
      }
      const inTexts = allUiTexts(UI_FILES).filter((t) => t.text.includes(EM_DASH));
      assert.deepEqual(inTexts.map((t) => `${t.file}: ${t.text.slice(0, 60)}`), []);
    },
  },
  {
    name: "3. potvrzení: confirm je první příkaz handleru (před stavem, fetch a akcí) a nese text z gate",
    run: () => {
      // Pořadí: confirm( se objeví dřív než první volání, které něco mění.
      const before = (rel: string, anchor: string, confirmText: string, mutation: RegExp) => {
        const src = read(rel);
        const start = src.indexOf(anchor);
        assert.ok(start >= 0, `${rel}: ${anchor}`);
        const body = src.slice(start);
        const c = body.search(/confirm\(/);
        assert.ok(c >= 0, `${rel}: confirm( po ${anchor}`);
        const m = body.search(mutation);
        assert.ok(m < 0 || c < m, `${rel}: confirm( musí být před ${mutation}`);
        assert.ok(norm(src).includes(confirmText), `${rel}: text „${confirmText.slice(0, 40)}“`);
      };
      before("components/attendance/AttendanceSheet.tsx", "async function onToggleExcuse", "confirmExcuseOffSubstituteText", /setRow\(|patchUi\(|postJson\(/);
      assert.ok(read("lib/attendance/sheet.ts").includes("Smazat omluvu i s náhradníkem ${name}? Vrátit to nepůjde. Když náhradník přišel, dej Zrušit a zaškrtni Přítomen."));
      assert.ok(read("lib/attendance/sheet.ts").includes("Smazat omluvu člena? Vrátit to nepůjde."));
      before("components/meetings/ReportButton.tsx", "async function handleClick", "Poslat report e-mailem celému vedení? Každé kliknutí pošle nový mail.", /setPending\(|triggerReportAction\(/);
      const confirmPresented = read("components/mastermind/ConfirmPresentedButtons.tsx");
      assert.ok(confirmPresented.includes("UI_TEXTS.confirmPresented(bonusOn)") && confirmPresented.includes("UI_TEXTS.confirmUnschedule"));
      assert.ok(confirmPresented.includes("Vrátit potvrzení, že proběhlo?"));
      for (const [call, mutation] of [
        ["UI_TEXTS.confirmPresented(bonusOn)", "confirmPresentedAction("],
        ["UI_TEXTS.confirmUnschedule", "unscheduleCaseAction("],
        ["Vrátit potvrzení, že proběhlo?", "undoPresentedAction("],
      ] as const) {
        assert.ok(confirmPresented.indexOf(call) < confirmPresented.indexOf(mutation), `${call} před ${mutation}`);
      }
      const links = "app/(app)/meetings/[id]/MemberLinksManager.tsx";
      before(links, "async function handleCopy", "Zkopírováním vznikne nový odkaz. Dosavadní odkaz člena ${memberName} přestane platit. Pokračovat?", /setMemberBusy\(|fetch\(/);
      before(links, "async function handleRegenerate", "Vytvořit nový odkaz pro ${memberName}? Dosavadní odkaz přestane platit.", /setMemberBusy\(|fetch\(/);
      before(links, "async function handleRevoke", "Zneplatnit odkaz člena ${memberName}? Hlasovat s ním už nepůjde.", /setMemberBusy\(|fetch\(/);
      before("app/(app)/events/[eventId]/_components/ParticipantsManager.tsx", "async function handleCopyLink", "Zkopírováním vznikne nový odkaz. Ten z e-mailu přestane platit. Pokračovat?", /clearMessages\(|setPendingId\(|getParticipantLinkAction\(/);
      // texty Master mindu z gate
      const mm = read("lib/mastermind/rules.ts");
      assert.ok(mm.includes("Potvrdit, že případ proběhl? Autor za něj dostane bonus do interního semaforu."));
      assert.ok(mm.includes("Smazat zařazený případ? Přihlášení účastníci o něj přijdou."));
      assert.ok(mm.includes("Smazat případ? Smaže se i zájem ostatních."));
    },
  },
  {
    name: "4. Burza: přepínače Využil(a) jsem zůstávají bez confirm, mají větu pod tlačítkem, bonus jen při zapnutém zdroji",
    run: () => {
      for (const f of ["components/burza/HelpUsedToggle.tsx", "components/burza/ContactUsedToggle.tsx", "components/burza/UsedToggleButton.tsx"]) {
        assert.ok(!/confirm\(/.test(stripComments(read(f))), `${f}: bez confirm`);
      }
      const hints = ["components/burza/OfferCard.tsx", "components/burza/ContactCard.tsx"].map(read).join("\n");
      assert.ok(hints.includes("usedHelpHint") && hints.includes("usedContactHint"));
      const rules = read("lib/burza/rules.ts");
      assert.ok(rules.includes("Zaškrtni, když ti tenhle člen pomohl. Připíše mu to bonus do interního semaforu. Odškrtnout můžeš kdykoli."));
      assert.ok(rules.includes("Zaškrtni, když ti kontakt pomohl. Členovi, který ho nabízí, se připíše bonus do interního semaforu."));
    },
  },
  {
    name: "5. žargon: v textech UI není magic link, token, run_id, preview, snapshot, Revokovat, Generovat report, Stáhnout u případu",
    run: () => {
      const jargon = [
        /magic link/i, /\bmagic linky\b/i, /\btoken\b/i, /\bToken\b/, /run_id/, /ops_event/, /iter-0\d\d/,
        /pick_one/, /max_x/, /\(multiple\)/, /\bpreview\b/i, /\bsnapshot\b/i, /\bsubmitted\b/, /\bRevokovat\b/,
        /\bRegenerovat\b/, /\bGenerovat report\b/, /\bStáhnout\b/, /\bCron\b/, /\bGuard\b/,
      ];
      const offenders: string[] = [];
      for (const { file, text } of allUiTexts(UI_FILES)) {
        // hodnoty bez mezery jsou klíče a kódy (value="pick_one"), ne text pro uživatele
        if (!/\s/.test(text.trim())) continue;
        for (const re of jargon) if (re.test(text)) offenders.push(`${file}: ${re} v „${text.slice(0, 70)}“`);
      }
      assert.deepEqual(offenders, []);
    },
  },
  {
    name: "6. 44 px: nová a upravená tlačítka mají min-h-[44px]",
    run: () => {
      for (const f of [
        "components/meetings/ReportButton.tsx",
        "components/mastermind/ConfirmPresentedButtons.tsx",
        "app/(app)/meetings/[id]/MemberLinksManager.tsx",
        "components/burza/UsedToggleButton.tsx",
        "components/mastermind/RemoveCaseButton.tsx",
        "components/meetings/StartVotingPanel.tsx",
        "components/attendance/AttendanceSheet.tsx",
        "app/(app)/admin/nastaveni/ChapterSettingsForm.tsx",
      ]) {
        assert.ok(read(f).includes("min-h-[44px]"), `${f}: min-h-[44px]`);
      }
      // každé <Button v těchto souborech má min-h-[44px] v téže značce
      for (const f of ["components/meetings/ReportButton.tsx", "components/mastermind/ConfirmPresentedButtons.tsx", "components/mastermind/RemoveCaseButton.tsx"]) {
        const tags = read(f).match(/<Button\b[\s\S]*?>/g) ?? [];
        assert.ok(tags.length > 0, f);
        for (const t of tags) assert.ok(t.includes("min-h-[44px]"), `${f}: ${t.slice(0, 50)}`);
      }
    },
  },
  {
    name: "7. legendy a zkratky: Semafor (CEU, 1-2-1, TYFCB, prahy z COLOR_THRESHOLDS), Archiv (+ pro, ~ nevím, - proti)",
    run: () => {
      for (const w of ["CEU", "1-2-1", "TYFCB"]) {
        assert.ok(AREAS_LEGEND_TEXT.includes(w), `legenda oblastí: ${w}`);
        assert.ok(HELP_SEMAFOR_ABBREVIATIONS.includes(w), `nápověda: ${w}`);
      }
      assert.ok(read("components/semafor/MyScoreCard.tsx").includes("AREAS_LEGEND_TEXT"));
      assert.ok(read("components/semafor/MyScoreCard.tsx").includes("scoreLegendText"));
      const texts = read("lib/semafor/texts.ts");
      assert.ok(texts.includes("COLOR_THRESHOLDS"), "prahy z COLOR_THRESHOLDS");
      assert.ok(!/body ze 100|ze 100 je jedna/i.test(AREAS_LEGEND_TEXT), "Z6: oblast nemá body ze 100");
      const area = (key: string, value: number | null) => areaValueText({ key, value } as unknown as Parameters<typeof areaValueText>[0]);
      assert.equal(area("visitors", 3), "3 za 6 měsíců");
      assert.equal(area("sponsors", 1), "1 za 6 měsíců");
      assert.equal(area("visitors", null), null);
      assert.ok(read("app/(app)/semafor/prehled/page.tsx").includes("overviewLegendText"));
      assert.ok(read("components/archive/ArchiveGuestCard.tsx").includes("+ pro, ~ nevím, - proti"));
      assert.ok(read("components/guests/GuestCardInteractive.tsx").length > 0);
    },
  },
  {
    name: "8. prázdné stavy říkají další krok (Přehled semaforu podle canImport, Schůzky, Časovače, Kategorie, Účastníci)",
    run: () => {
      const prehled = read("app/(app)/semafor/prehled/page.tsx");
      assert.ok(prehled.includes("canImport") && prehled.includes("myNoneImport") && prehled.includes("myNone"));
      const texts = read("lib/semafor/texts.ts");
      assert.ok(texts.includes("Data nahrává vedení z BNI."));
      assert.ok(read("app/(app)/meetings/page.tsx").includes("Zatím žádné schůzky."));
      for (const [file, step] of [
        ["app/(app)/meetings/page.tsx", /Vytvoř|Zatím žádné schůzky/],
        ["app/(app)/timers/page.tsx", /Vytvoř|Zatím/],
        ["app/(app)/admin/categories/page.tsx", /Přidej|Zatím|Vytvoř|kategori/],
        ["app/(app)/events/[eventId]/_components/ParticipantsManager.tsx", /Přidej|Zatím|účastník/],
      ] as const) {
        const hit = allUiTexts([file]).some((t) => step.test(t.text));
        assert.ok(hit, `${file}: prázdný stav`);
      }
    },
  },
  {
    name: "9. datum přes formatWeekdayFull: dashboard, seznam a detail schůzky",
    run: () => {
      for (const f of ["app/(app)/dashboard/page.tsx", "app/(app)/meetings/page.tsx", "app/(app)/meetings/[id]/page.tsx"]) {
        assert.ok(/formatWeekdayFull\(/.test(read(f)), `${f}: formatWeekdayFull(`);
      }
      // veřejné /m: konec hlasování ze skutečného data, čas výslovně v pražském pásmu (Z1)
      assert.ok(read("app/api/m/[token]/meeting/route.ts").includes("votingClosesAt"));
      const mPage = read("app/m/[token]/page.tsx");
      assert.ok(mPage.includes("formatWeekdayFull(") && mPage.includes('timeZone: "Europe/Prague"'));
      assert.ok(norm(mPage).includes("Hlasování běží do") && norm(mPage).includes("Hlas můžeš do konce hlasování změnit tlačítkem Změnit."));
      // Uzavírá se na detailu schůzky (Z11)
      assert.ok(read("app/(app)/meetings/[id]/page.tsx").includes('timeZone: "Europe/Prague"'));
    },
  },
  {
    name: "10. tón (K1, Z7): UI za loginem, /m a /i tykají, nápověda a /e vykají",
    run: () => {
      const familiarOnly = words("Zkuste|Vyberte|Přidejte|Vytvořte|Kontaktujte|Otevřete|Zadejte|nemáte|vidíte|Klikněte");
      const tykani = [
        ...sourceFiles("app/(app)"),
        ...sourceFiles("app/m"),
        ...sourceFiles("app/i"),
        // /t/[token]/control (ovládání časovače, vedení) tyká; samotná projekce /t textů skoro nemá
        ...sourceFiles("app/t/[token]/control"),
        ...sourceFiles("components").filter((f) => !f.startsWith("components/help/")),
        ...sourceFiles("actions"),
      ];
      const offenders: string[] = [];
      for (const { file, text } of allUiTexts(tykani)) {
        if (file.endsWith("/help/page.tsx")) continue;
        if (familiarOnly.test(text)) offenders.push(`${file}: „${text.slice(0, 70)}“`);
      }
      assert.deepEqual(offenders, [], "vykání v UI, které má tykat");
      // nápověda vyká: nemá tykací tvary mimo citace popisků ve značkách <strong> a „…“
      const helpFiles = sourceFiles("components/help").filter((f) => !f.endsWith("help-texts.ts"));
      const helpOffenders: string[] = [];
      for (const f of helpFiles) {
        const src = norm(stripComments(read(f)))
          .replace(/<strong>[^<]*<\/strong>/g, "")
          .replace(/„[^“]*“/g, "");
        const m = words("Klikni|Zadej|Vyber|Zkus|nemáš|máš|tvůj|tvoje|tobě|můžeš|vidíš").exec(src);
        if (m) helpOffenders.push(`${f}: ${m[0]}`);
      }
      assert.deepEqual(helpOffenders, [], "tykání v nápovědě");
      // /e vyká (externí účastníci akcí)
      const eTexts = allUiTexts(sourceFiles("app/e")).map((t) => t.text).join("\n");
      assert.ok(words("Vyberte|můžete|Váš|Vaše|Vás|vám").test(eTexts), "/e vyká");
      assert.ok(!words("Vyber|Zkus|nemáš|Klikni|tvůj|tvoje|tobě").test(eTexts), "/e netyká");
      assert.ok(words("nemáš").test("ty nemáš") && !words("nemáš").test("nemášek"), "pomocná funkce words");
    },
  },
  {
    name: "11. Z5: žádný čtvrtek ani 7:30 natvrdo v textech částí A (výjimky: DEFAULT_CHAPTER_SETTINGS, WEEKDAY_LOCATIVE, content/pravidla, PALMS)",
    run: () => {
      // „čtvrtá absence“ ani „čtvrt hodiny“ to nejsou, jde o den v týdnu.
      const hard = /(?<![\p{L}\d:])(0?7:30|[čČ]tvrt(ek|ku|kem|ka|eční|ečn\p{L}*))(?![\p{L}\d])/u;
      const scope = [
        ...sourceFiles("components/help"),
        ...sourceFiles("components/semafor"),
        ...sourceFiles("components/burza"),
        ...sourceFiles("components/mastermind"),
        ...sourceFiles("components/attendance"),
        ...sourceFiles("lib/semafor"),
        ...sourceFiles("lib/burza"),
        ...sourceFiles("lib/mastermind"),
        "lib/attendance/texts.ts",
        "lib/attendance/sheet.ts",
        "lib/attendance/rules.ts",
        "lib/attendance/plan.ts",
        "lib/attendance/plan-view.ts",
        "lib/attendance/day-view.ts",
        ...sourceFiles("app/(app)/semafor"),
        ...sourceFiles("app/(app)/burza"),
        ...sourceFiles("app/(app)/mastermind"),
        ...sourceFiles("app/(app)/dochazka"),
        ...sourceFiles("app/(app)/help"),
        "app/(app)/dashboard/page.tsx",
      ];
      assert.ok(scope.length > 40 && scope.every((f) => existsSync(join(ROOT, f))), "rozsah kontroly není prázdný");
      assert.ok(hard.test("ve čtvrtek v 7:30") && hard.test("čtvrteční schůzka") && !hard.test("čtvrtá absence"));
      const offenders: string[] = [];
      for (const { file, text } of allUiTexts(scope)) {
        // Výjimka: názvy dnů v týdnu pro formát data (WEEKDAY_LONG), den schůzky z nich nevychází.
        if (file === "lib/attendance/rules.ts" && text === "čtvrtek") continue;
        if (hard.test(text)) offenders.push(`${file}: „${text.slice(0, 80)}“`);
      }
      assert.deepEqual(offenders, []);
      // Funkce nápovědy s jiným dnem a časem nesmí vrátit výchozí hodnoty.
      const other: ChapterSettings = { ...DEFAULT_CHAPTER_SETTINGS, meetingWeekday: 2, meetingTime: "08:15" };
      const produced = [
        memberDeadlineHelp(other),
        autostartHelp(other),
        closeVotingHelp(other),
        warningMailHelp(other),
        helpAttendanceMemberUnexcused(other.meetingTime),
        helpAttendanceManagerUnexcused(other.meetingTime),
        memberIntroText(other.meetingTime),
      ].join("\n");
      assert.ok(!/7:30|čtvrt/i.test(produced), "texty pro úterý a 8:15 nesmí zmínit čtvrtek ani 7:30");
      assert.ok(produced.includes("v úterý") && produced.includes("8:15"));
      assert.ok(warningMailHelp(other).startsWith("V úterý ráno"));
      // výchozí stav = dnešní chování
      assert.ok(memberDeadlineHelp().includes("do 7:30 v den schůzky"));
      assert.ok(autostartHelp(DEFAULT_CHAPTER_SETTINGS).includes("ve čtvrtek ráno"));
      assert.ok(closeVotingHelp(DEFAULT_CHAPTER_SETTINGS).includes("ve čtvrtek ráno"));
    },
  },
  {
    name: "12. nápověda podle nastavení: texty bonusu, zdroje, Nastavení chapteru, smazání člena, neaktivní člen",
    run: () => {
      const on = { mastermind: true, burza: true };
      const off = { mastermind: false, burza: false };
      // Semafor: každá odpověď má otázku, bez bonusu odpadá otázka o bonusu
      const faqOn = semaforMemberFaq(on);
      assert.equal(faqOn.length, helpSemaforMember(on).length);
      assert.ok(faqOn.every((x) => x.q.length > 0 && x.a.length > 0), "otázky ke všem položkám");
      assert.deepEqual(
        faqOn.map((x) => x.q),
        ["Co je skóre a odkud jsou data?", "Co je bonus?", "Jak se určuje barva?", "Kdo vidí přehled?", "Hodnoty mi nesedí."]
      );
      const faqOff = semaforMemberFaq(off);
      assert.ok(faqOff.every((x) => x.q.length > 0));
      assert.ok(!faqOff.some((x) => /bonus/i.test(x.q + x.a)));
      assert.equal(helpSemaforLeadership(on).length, 5);
      // zkratky a bonus u Burzy
      assert.ok(HELP_SEMAFOR_ABBREVIATIONS.includes("Hosté a Sponzoři jsou počty za posledních 6 měsíců"));
      assert.ok(HELP_BURZA_USED_BONUS.startsWith("Využil(a) jsem připíše členovi, který pomohl, bonus do interního semaforu."));
      assert.ok(read("components/help/sections/MemberHelp.tsx").includes("bonus.burza && "), "věta o bonusu Burzy jen při zdroji");
      assert.ok(helpSemaforMember(on).join(" ").includes(`${BONUS_POINTS.burza} bodů`));
      // smazání člena a neaktivní člen jmenují jen zapnuté části
      const all = DEFAULT_CHAPTER_SETTINGS;
      assert.equal(
        deleteMemberScopeText(all),
        "docházku, omluvy, semafor, hlasy u hostů, pohovory, Burzu i případy v Master mindu"
      );
      const minimal = { ...all, burzaEnabled: false, mastermindEnabled: false, semaforEnabled: false };
      assert.equal(deleteMemberScopeText(minimal), "docházku, omluvy, hlasy u hostů i pohovory");
      assert.equal(inactiveHidesText(all), " a jeho karty v Burze a témata v Master mindu nejsou vidět");
      assert.equal(inactiveHidesText(minimal), "");
      assert.equal(inactiveHidesText({ ...all, burzaEnabled: false }), " a témata v Master mindu nejsou vidět");
      // Nastavení chapteru v nápovědě admina, jen s právem
      const admin = read("components/help/sections/AdminHelp.tsx");
      assert.ok(admin.includes('title="Nastavení chapteru"') && admin.includes("{canManageSettings && ("));
      assert.ok(read("app/(app)/help/page.tsx").includes('can(session, "chapter.settings")'));
      // menu a nápověda sedí: Heslo místo Nastavení v bloku Účet
      assert.ok(read("app/(app)/layout.tsx").includes(">Heslo<"));
      assert.ok(read("components/layout/MobileNav.tsx").includes("Heslo"));
      assert.ok(!norm(read("components/help/sections/ModeratorHelp.tsx")).includes("V Nastavení, „Změnit heslo“"));
    },
  },
  {
    name: "13. dorovnání: předvyplněné datum nové schůzky a konec hlasování podle dne z nastavení",
    run: () => {
      const page = read("app/(app)/meetings/page.tsx");
      assert.ok(page.includes("defaultDate") && page.includes("nextRegularDay(") && page.includes("getChapterSettings()"));
      assert.ok(page.includes("<CreateMeetingForm defaultDate={defaultDate} />"));
      const panel = read("components/meetings/StartVotingPanel.tsx");
      assert.ok(panel.includes("regularWeekday?: number"));
      assert.ok(panel.includes("votingClosesAtFor(meetingDate, new Date(), regularWeekday)"));
      const detail = read("app/(app)/meetings/[id]/page.tsx");
      assert.ok(detail.includes("regularWeekday={regularWeekday}") && detail.includes("chapterSettings.meetingWeekday"));
    },
  },
  {
    name: "14. T-005c: cíl 44 px u Zobrazit vše a Zpět na schůzky, validace vstupů createEventAction",
    run: () => {
      // Button je inline-flex items-center už ze základu, min-h dodá cíl 44 px.
      const dash = norm(read("app/(app)/dashboard/page.tsx"));
      assert.ok(dash.includes('<Button variant="link" size="sm" className="min-h-[44px]"> Zobrazit vše'));
      const detail = norm(read("app/(app)/meetings/[id]/page.tsx"));
      assert.ok(detail.includes('<Button variant="link" size="sm" className="min-h-[44px]">'));
      assert.ok(detail.includes("&larr; Zpět na schůzky"));
      assert.ok(read("components/ui/button.tsx").includes("inline-flex items-center"));

      assert.ok(read("actions/events.ts").includes("validateCreateEventInput(title, config, description)"));
      const ok = { votingType: "pick_one" as const };
      assert.equal(validateCreateEventInput("Akce", ok, undefined), null);
      assert.equal(validateCreateEventInput("Akce", ok, "Popis"), null);
      assert.equal(validateCreateEventInput("Akce", { expiresAt: new Date() }, null), null);
      for (const bad of [42, {}, ["x"], true]) {
        const msg = validateCreateEventInput("Akce", ok, bad);
        assert.equal(msg, "Popis akce musí být text.");
      }
      assert.equal(validateCreateEventInput(undefined, ok, "x"), "Název akce je povinný.");
      assert.equal(validateCreateEventInput("  ", ok, "x"), "Název akce je povinný.");
      assert.ok(validateCreateEventInput("Akce", undefined, "x"));
      assert.ok(validateCreateEventInput("Akce", { votingType: "jine" }, "x"));
      assert.ok(validateCreateEventInput("Akce", { votingMaxX: "3" }, "x"));
      assert.ok(validateCreateEventInput("Akce", { expiresAt: new Date("nope") }, "x"));
      for (const f of ["lib/events/create-input.ts", "actions/events.ts"]) {
        assert.ok(!read(f).includes(EM_DASH.repeat(1) + " "), `em dash v ${f}`);
      }
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
