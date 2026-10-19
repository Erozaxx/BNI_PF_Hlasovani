/**
 * Testy iter-035 doplnění (T-013): kontakty v Burze pomoci a přepínač
 * „Využil(a) jsem“ (arch iter-035 T-011 sekce 13.2, gate T-012 Z8 až Z13).
 * Bez DATABASE_URL, bez sítě, bez Resendu. Testované moduly jsou čisté (rules,
 * events). Statické kontroly čtou zdrojáky z disku. SQL pojistky (UNIQUE,
 * limit, zákaz „sám sobě“) bez DB ověřit nejde, test hlídá jen jejich tvar,
 * chování ověří QA na větvi Neonu.
 *
 * Repo je veřejné: žádná skutečná jména ani položky kontaktů (Člen A, Kontakt 1).
 *
 * Spuštění: npm run test:iter-035b-burza (součást npm run test:iter-035)
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  contactItemEvent,
  contactUseRemovedEvent,
  type BurzaEventCtx,
} from "../lib/burza/events";
import {
  CONTACT_ITEMS_LIMIT,
  CONTACT_LABEL_MAX,
  MESSAGES,
  TEXTS,
  canEditContacts,
  canRecordHelp,
  matchesContactQuery,
  mergeUseRecords,
  sortContactItems,
  recordKindLabel,
  validateBoolean,
  validateContactLabel,
  type Actor,
} from "../lib/burza/rules";

const ROOT = join(__dirname, "..");

type TestCase = { name: string; run: () => void | Promise<void> };

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}
function readRaw(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}
function readSrc(rel: string): string {
  return stripComments(readRaw(rel));
}
function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `funkce ${name} chybí`);
  const rest = src.slice(start + 10);
  const next = rest.search(/export (async )?(function|interface|type)/);
  return next < 0 ? src.slice(start) : src.slice(start, start + 10 + next);
}

const A: Actor = { memberId: "m-a", isManagement: false };
const B: Actor = { memberId: "m-b", isManagement: false };
const M: Actor = { memberId: "m-mgmt", isManagement: true };

const ctxOf = (actor: Actor): BurzaEventCtx => ({
  runId: "run-1",
  actor: "Člen X",
  actorId: actor.memberId,
  isManagement: actor.isManagement,
});

const cases: TestCase[] = [
  {
    name: "1. validateContactLabel: prázdné a mezery = contactEmpty, 150 projde, 151 ne, víc řádků na jednu mezeru, jiný typ = invalidInput",
    run: () => {
      assert.deepEqual(validateContactLabel(""), { ok: false, error: MESSAGES.contactEmpty });
      assert.deepEqual(validateContactLabel("   \n\t "), { ok: false, error: MESSAGES.contactEmpty });
      assert.equal(CONTACT_LABEL_MAX, 150);
      assert.deepEqual(validateContactLabel("a".repeat(150)), { ok: true, value: "a".repeat(150) });
      assert.deepEqual(validateContactLabel("a".repeat(151)), { ok: false, error: MESSAGES.invalidInput });
      assert.deepEqual(validateContactLabel("  Kontakt 1 \n\n  ve firmě X  "), {
        ok: true,
        value: "Kontakt 1 ve firmě X",
      });
      for (const v of [null, undefined, 5, {}, []]) {
        assert.deepEqual(validateContactLabel(v), { ok: false, error: MESSAGES.invalidInput }, String(v));
      }
      assert.equal(MESSAGES.contactEmpty, "Napiš, na koho máš kontakt.");
    },
  },
  {
    name: "2. validateBoolean: true a false ano, „true“, 1, null, undefined ne",
    run: () => {
      assert.equal(validateBoolean(true), true);
      assert.equal(validateBoolean(false), true);
      for (const v of ["true", "false", 1, 0, null, undefined]) assert.equal(validateBoolean(v), false, String(v));
    },
  },
  {
    name: "3. canEditContacts: vlastník ano, cizí člen bez role ne, vedení kohokoli; canRecordHelp pro vlastní položku ne",
    run: () => {
      assert.equal(canEditContacts(A, A.memberId), true);
      assert.equal(canEditContacts(A, B.memberId), false);
      assert.equal(canEditContacts(M, B.memberId), true);
      assert.equal(canRecordHelp(A.memberId, B.memberId), true);
      assert.equal(canRecordHelp(A.memberId, A.memberId), false);
    },
  },
  {
    name: "4. sortContactItems: česká kolace podle jména, v rámci člena podle createdAt, shoda podle id, vstup se nemění",
    run: () => {
      const rows = [
        { id: "5", memberId: "m-h", name: "Hana", createdAt: "2026-10-01" },
        { id: "4", memberId: "m-ch", name: "Chytrý", createdAt: "2026-10-01" },
        { id: "3", memberId: "m-c2", name: "Čeněk", createdAt: "2026-10-01" },
        { id: "2", memberId: "m-c1", name: "Cecílie", createdAt: "2026-10-01" },
        { id: "9", memberId: "m-a", name: "Adam", createdAt: "2026-10-03" },
        { id: "8", memberId: "m-a", name: "Adam", createdAt: "2026-10-02" },
        { id: "7", memberId: "m-a", name: "Adam", createdAt: "2026-10-02" },
      ];
      const copy = JSON.parse(JSON.stringify(rows));
      const sorted = sortContactItems(rows);
      assert.deepEqual(rows, copy, "vstup se nemění");
      assert.deepEqual(
        sorted.map((r) => r.id),
        ["7", "8", "9", "2", "3", "5", "4"]
      );
    },
  },
  {
    name: "5. matchesContactQuery: bez diakritiky, víc slov, hledá v textu položky, jménu, firmě i oboru",
    run: () => {
      const row = { name: "Člen A", company: "Firma Y", obor: "Účetnictví", label: "Ředitel logistiky ve firmě X" };
      assert.equal(matchesContactQuery(row, ""), true);
      assert.equal(matchesContactQuery(row, "reditel"), true);
      assert.equal(matchesContactQuery(row, "LOGISTIKY firme"), true);
      assert.equal(matchesContactQuery(row, "clen"), true);
      assert.equal(matchesContactQuery(row, "firma y"), true);
      assert.equal(matchesContactQuery(row, "ucetnictvi"), true);
      assert.equal(matchesContactQuery(row, "reditel notar"), false);
      assert.equal(matchesContactQuery({ ...row, company: null, obor: null }, "ucetnictvi"), false);
    },
  },
  {
    name: "6. mergeUseRecords: řazení přes oba druhy podle dne a createdAt, ořez na limit, druh se zachová",
    run: () => {
      const help = [
        { id: "h1", kind: "help", usedOn: "2026-10-10", createdAt: "2026-10-10 09:00" },
        { id: "h2", kind: "help", usedOn: "2026-09-01", createdAt: "2026-09-01 09:00" },
      ];
      const contacts = [
        { id: "c1", kind: "contact", usedOn: "2026-10-10", createdAt: "2026-10-10 10:00" },
        { id: "c2", kind: "contact", usedOn: "2026-10-12", createdAt: "2026-10-12 08:00" },
      ];
      const merged = mergeUseRecords(help, contacts, 10);
      assert.deepEqual(merged.map((r) => r.id), ["c2", "c1", "h1", "h2"]);
      assert.deepEqual(merged.map((r) => r.kind), ["contact", "contact", "help", "help"]);
      assert.deepEqual(mergeUseRecords(help, contacts, 2).map((r) => r.id), ["c2", "c1"]);
      assert.deepEqual(mergeUseRecords(help, contacts, 0), []);
    },
  },
  {
    name: "7. recordKindLabel: pomoc, kontakt s textem, kontakt s null = „Kontakt, který už v burze není“",
    run: () => {
      assert.equal(recordKindLabel("help", null), "Pomoc");
      assert.equal(recordKindLabel("contact", "Kontakt 1"), "Kontakt: Kontakt 1");
      assert.equal(recordKindLabel("contact", null), "Kontakt, který už v burze není");
    },
  },
  {
    name: "8. events: contactItemEvent null pro vlastní položku i vedoucího, událost pro vedení a cizí položku; contactUseRemovedEvent warn; bez textu v detail a message",
    run: () => {
      const owner = { memberId: B.memberId, memberName: "Člen B" };
      assert.equal(contactItemEvent(ctxOf(A), { memberId: A.memberId, memberName: "Člen A" }, "update"), null);
      assert.equal(contactItemEvent(ctxOf(A), owner, "create"), null, "člen bez role");
      assert.equal(contactItemEvent(ctxOf(M), { memberId: M.memberId, memberName: "Člen M" }, "create"), null);
      for (const action of ["create", "update", "remove"] as const) {
        const ev = contactItemEvent(ctxOf(M), owner, action);
        assert.ok(ev);
        assert.equal(ev.kind, "burza.contact-by-management");
        assert.equal(ev.severity, "info");
        assert.equal(ev.memberId, B.memberId);
        assert.deepEqual(ev.detail, { action });
      }
      const removed = { useId: "u-1", helperId: B.memberId, helperName: "Člen B", recipientId: A.memberId };
      const ev = contactUseRemovedEvent(ctxOf(M), removed);
      assert.ok(ev);
      assert.equal(ev.kind, "burza.contact-use-removed");
      assert.equal(ev.severity, "warn");
      assert.equal(ev.memberName, "Člen B");
      assert.deepEqual(ev.detail, { useId: "u-1" });
      assert.equal(contactUseRemovedEvent(ctxOf(M), { ...removed, recipientId: M.memberId }), null);
      assert.equal(contactUseRemovedEvent(ctxOf(M), { ...removed, recipientId: null })?.severity, "warn");
      assert.equal(contactUseRemovedEvent(ctxOf(A), removed), null);

      const src = readSrc("lib/burza/events.ts");
      const fns = src.slice(src.indexOf("export function contactItemEvent"));
      assert.ok(!/\b(label|email|note)\b/i.test(fns.replace(/contactLabel/g, "")), "bez label, email, note v událostech kontaktů");
    },
  },
  {
    name: "9. SQL v queries: unset pomoci podle id, recipient a helper bez měsíce; set kontaktu čte FROM burza_contact, member_id <>, ON CONFLICT; limit z konstanty",
    run: () => {
      const src = readSrc("lib/db/queries/burza.ts");
      const unsetHelp = norm(fnBody(src, "unsetHelpUsedGuarded"));
      assert.ok(unsetHelp.includes("id = ${args.helpId}::uuid"));
      assert.ok(unsetHelp.includes("recipient_id = ${args.recipientId}::uuid"));
      assert.ok(unsetHelp.includes("helper_id = ${args.helperId}::uuid"));
      assert.ok(!unsetHelp.includes("used_month"));

      const setUse = norm(fnBody(src, "setContactUsedGuarded"));
      assert.ok(setUse.includes("FROM burza_contact c"));
      assert.ok(setUse.includes("c.member_id <> ${args.recipientId}::uuid"));
      assert.ok(setUse.includes("ON CONFLICT (contact_id, recipient_id) DO NOTHING"));
      assert.ok(!setUse.includes("created_by"), "Z9: bez created_by");

      const unsetUse = norm(fnBody(src, "unsetContactUsedGuarded"));
      assert.ok(unsetUse.includes("contact_id = ${args.contactId}::uuid"));
      assert.ok(unsetUse.includes("recipient_id = ${args.recipientId}::uuid"));

      const create = norm(fnBody(src, "createContactItemWithLimit"));
      assert.ok(create.includes("count(*)"));
      assert.ok(create.includes("${CONTACT_ITEMS_LIMIT}::int"));
      assert.ok(!/< \d+/.test(create), "limit není doslovné číslo");
      assert.ok(create.includes("OR ${args.isManagement}::boolean"));
      assert.equal(CONTACT_ITEMS_LIMIT, 10);

      const update = norm(fnBody(src, "updateContactItemGuarded"));
      assert.ok(update.includes("OR ${args.isManagement}::boolean"));
      const remove = norm(fnBody(src, "removeContactItemGuarded"));
      assert.ok(remove.includes("member_id = ${args.actorId}::uuid OR ${args.isManagement}::boolean"));

      const uses = norm(fnBody(src, "getContactUsesForManagement"));
      assert.ok(uses.includes("LEFT JOIN burza_contact c"));
      assert.ok(!uses.includes("created_by"));
      assert.ok(!/\bgetMemberContactCounts\b/.test(src), "Z8: seznam Kontakty za člena se nedělá");

      // removeContactUseGuarded volá jen akce s requireManagementRole
      const actions = readSrc("actions/burza.ts");
      const calls = actions.match(/removeContactUseGuarded\(/g) ?? [];
      assert.equal(calls.length, 1);
      const fn = actions.slice(actions.indexOf("export async function removeContactUseAction"));
      assert.ok(fn.indexOf("requireManagementRole") > 0 && fn.indexOf("requireManagementRole") < fn.indexOf("removeContactUseGuarded("));
    },
  },
  {
    name: "10. akce: přepínače berou příjemce ze session (bez recipientId ve vstupu), komponenty bez window.confirm a Textarea",
    run: () => {
      const src = readSrc("actions/burza.ts");
      for (const name of ["setHelpUsedAction", "setContactUsedAction"]) {
        const start = src.indexOf(`export async function ${name}`);
        assert.ok(start >= 0, name);
        const rest = src.slice(start + 10);
        const next = rest.search(/export async function/);
        const body = next < 0 ? src.slice(start) : src.slice(start, start + 10 + next);
        assert.ok(body.includes("actor.memberId"), `${name}: aktér ze session`);
        assert.ok(!body.includes("recipientId:") || body.includes("recipientId: actor.memberId"), `${name}: příjemce jen ze session`);
        assert.ok(body.includes("validateBoolean(input.used)"), `${name}: cílový stav`);
      }
      assert.ok(!/(type|interface) (SetHelpUsedInput|SetContactUsedInput)[^}]*recipientId/.test(src));
      for (const rel of ["components/burza/HelpUsedToggle.tsx", "components/burza/ContactUsedToggle.tsx"]) {
        const c = readSrc(rel);
        assert.ok(!c.includes("window.confirm"), rel);
        assert.ok(!c.includes("Textarea"), rel);
      }
      assert.ok(!(readSrc("actions/burza.ts").includes("recordHelpAction")), "recordHelpAction odpadl");
    },
  },
  {
    name: "11. stránky: /burza/kontakty/[memberId] má pořadí requirePageSession, isUuid, canEditContacts, getContactItemsForEdit; BurzaTabs na obou stránkách s aria-current",
    run: () => {
      const page = readSrc("app/(app)/burza/kontakty/[memberId]/page.tsx");
      const sess = page.indexOf("await requirePageSession(");
      const uuid = page.indexOf("isUuid(memberId)");
      const can = page.indexOf("canEditContacts(");
      const load = page.indexOf("getContactItemsForEdit(");
      assert.ok(sess > 0 && sess < uuid && uuid < can && can < load, `pořadí: ${sess}, ${uuid}, ${can}, ${load}`);
      assert.ok(page.includes("notFound()"));
      assert.ok(page.includes('redirect("/burza/kontakty")'));
      const list = readSrc("app/(app)/burza/kontakty/page.tsx");
      assert.ok(/await requirePageSession\(/.test(list));
      assert.ok(list.includes('<BurzaTabs active="contacts"'));
      assert.ok(readSrc("app/(app)/burza/page.tsx").includes('<BurzaTabs active="help"'));
      const tabs = readSrc("components/burza/BurzaTabs.tsx");
      assert.ok(tabs.includes("aria-current"));
      assert.ok(tabs.includes('"/burza/kontakty"'));
      // Z8: záložka Kontakty bez bloku „Pro vedení“ a bez „Kontakty za člena“
      assert.ok(!list.includes("Pro vedení"));
      assert.ok(!list.includes("Kontakty za člena"));
      assert.ok(!/<details/.test(list));
    },
  },
  {
    name: "12. migrace migrate-iter-035b-burza-kontakty.ts: 4 DO bloky, žádné ${, lock_timeout doslova, žádný ALTER/DROP/UPDATE/DELETE; smoke odpovídá skutečným tabulkám; kontrola ověřuje burza_offer a burza_help; exit 1 přes fail",
    run: () => {
      const raw = readRaw("scripts/migrate-iter-035b-burza-kontakty.ts");
      const blocks = [...raw.matchAll(/DO \$\$ BEGIN([\s\S]*?)END \$\$/g)].map((m) => m[1]);
      assert.equal(blocks.length, 4);
      for (const b of blocks) {
        assert.ok(!b.includes("${"), "LL-006: žádná interpolace v DO bloku");
        assert.ok(b.includes("PERFORM set_config('lock_timeout', '5s', true);"));
      }
      const code = stripComments(raw);
      for (const bad of [/ALTER TABLE/, /DROP TABLE/, /DROP CONSTRAINT/, /\bUPDATE /, /\bDELETE FROM\b/]) {
        assert.ok(!bad.test(code), String(bad));
      }
      const [smokeC, smokeU, realC, realU] = blocks;
      for (const b of [smokeC, smokeU]) {
        assert.ok(b.includes("CREATE TEMPORARY TABLE"));
        assert.ok(b.includes("ON COMMIT DROP"));
        assert.ok(!b.includes("REFERENCES"));
      }
      for (const b of [realC, realU]) assert.ok(b.includes("CREATE TABLE IF NOT EXISTS"));
      const constraintsOf = (b: string) => [...b.matchAll(/CONSTRAINT (\w+) (CHECK|UNIQUE)/g)].map((m) => m[1] + m[2]);
      assert.deepEqual(constraintsOf(smokeC), constraintsOf(realC));
      assert.deepEqual(constraintsOf(smokeU), constraintsOf(realU));
      assert.ok(!realU.includes("created_by"), "Z9");
      assert.ok(realU.includes("CONSTRAINT bcu_once UNIQUE (contact_id, recipient_id)"));
      assert.ok(realU.includes("contact_id   UUID        REFERENCES burza_contact(id) ON DELETE SET NULL"));
      assert.ok(code.includes("CREATE INDEX IF NOT EXISTS idx_bc_member"));
      assert.ok(code.includes("idx_bcu_helper_used") && code.includes("idx_bcu_recipient"));
      assert.ok(code.includes('checkColumns("4e burza_offer"') && code.includes('checkColumns("4e burza_help"'));
      assert.ok(code.includes('checkIndexNames("4e burza_help"'));
      assert.ok(/process\.exit\(1\)/.test(code));
      assert.ok(/function fail\(message: string\): never/.test(code));
    },
  },
  {
    name: "13. schema.ts: burzaContact a burzaContactUse (bez created_by), burzaHelp beze změny (8 sloupců, bh_once_per_month)",
    run: () => {
      const schema = readSrc("lib/db/schema.ts");
      assert.ok(schema.includes('export const burzaContact = pgTable('));
      assert.ok(schema.includes('export const burzaContactUse = pgTable('));
      const useDef = schema.slice(schema.indexOf("export const burzaContactUse"));
      assert.ok(!useDef.includes("created_by"));
      assert.ok(useDef.includes('"bcu_once"'));
      const help = schema.slice(schema.indexOf("export const burzaHelp ="), schema.indexOf("export const burzaContact ="));
      assert.equal((help.match(/: (uuid|date|text|timestamp)\(/g) ?? []).length, 8);
      assert.ok(help.includes('"bh_once_per_month"'));
    },
  },
  {
    name: "14. mobil: každý Link/Button v nových komponentách má min-h-[44px], žádné tlačítko v Link",
    run: () => {
      const files = [
        "components/burza/BurzaTabs.tsx",
        "components/burza/UsedToggleButton.tsx",
        "components/burza/ContactCard.tsx",
        "components/burza/MyContactsBox.tsx",
        "components/burza/ContactItemsEditor.tsx",
        "components/burza/ContactItemForm.tsx",
        "app/(app)/burza/kontakty/page.tsx",
        "app/(app)/burza/kontakty/[memberId]/page.tsx",
      ];
      for (const rel of files) {
        const src = readSrc(rel);
        const re = /<Link\b[^>]*>([\s\S]*?)<\/Link>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          assert.ok(!/<Button\b|<button\b/.test(m[1]), `${rel}: tlačítko uvnitř Link`);
        }
        const interactive = (src.match(/<(Link|Button)\b/g) ?? []).length;
        const tall = (src.match(/min-h-\[44px\]/g) ?? []).length;
        assert.ok(tall >= interactive, `${rel}: ${interactive} Link/Button, ${tall} x min-h-[44px]`);
      }
    },
  },
  {
    name: "15. texty z gate T-012 sekce 5 doslova a diakritika",
    run: () => {
      assert.equal(TEXTS.usedToggle, "Využil(a) jsem");
      assert.equal(TEXTS.usedThisMonth, "tento měsíc");
      assert.equal(TEXTS.tabHelp, "Pomoc");
      assert.equal(TEXTS.tabContacts, "Kontakty");
      assert.equal(TEXTS.contactsIntro, "Kontakt tu přímo není. Když ho chceš, řekni si tomu, kdo ho nabízí.");
      assert.equal(TEXTS.myContactsTitle, "Tvoje kontakty");
      assert.equal(TEXTS.noContacts, "Ještě tu nemáš žádný kontakt.");
      assert.equal(TEXTS.addContact, "Přidat kontakt");
      assert.equal(TEXTS.editContacts, "Upravit kontakty");
      assert.equal(TEXTS.myContactsCount(3), "Zapsané kontakty: 3 z 10");
      assert.equal(TEXTS.contactsUsedByOthers(2), "Tvoje kontakty využili ostatní za posledních 6 měsíců: 2");
      assert.equal(TEXTS.contactsSearch, "Hledat (jméno, obor, kontakt)");
      assert.equal(TEXTS.contactLabel, "Na koho mám kontakt");
      assert.equal(TEXTS.offeredBy("Člen A · Firma · obor"), "Nabízí: Člen A · Firma · obor");
      assert.equal(TEXTS.emptyContacts, "Od ostatních tu zatím žádný kontakt není.");
      assert.equal(TEXTS.manageOwnTitle, "Tvoje kontakty v burze");
      assert.equal(TEXTS.manageOtherTitle("Člen A"), "Kontakty v burze: Člen A");
      assert.equal(TEXTS.backToContacts, "Zpět na Kontakty");
      assert.equal(
        TEXTS.contactHint,
        "Třeba ředitel logistiky ve firmě X. Jméno ani telefon toho člověka sem nepiš, kdo kontakt chce, řekne si tobě."
      );
      assert.equal(TEXTS.contactDeleteConfirm, "Opravdu smazat tento kontakt?");
      assert.equal(
        TEXTS.contactLimitFull,
        "Víc než 10 kontaktů tu mít nejde. Když chceš přidat další, nějaký smaž."
      );
      assert.equal(TEXTS.contactAdded, "Kontakt přidán.");
      assert.equal(TEXTS.contactSaved, "Kontakt uložen.");
      assert.equal(TEXTS.contactDeleted, "Kontakt smazán.");
      assert.equal(TEXTS.contactUseDeleteConfirm, "Opravdu smazat záznam o využití kontaktu?");
      assert.equal(TEXTS.helpDeleteConfirm, "Opravdu smazat záznam pomoci?");
      assert.equal(MESSAGES.contactGone, "Kontakt už v burze není.");
      assert.equal(MESSAGES.contactSelf, "Vlastní kontakt si zaškrtnout nejde.");
      assert.equal(MESSAGES.contactDeletedMeanwhile, "Kontakt mezitím někdo smazal. Načti stránku znovu.");
      assert.equal(MESSAGES.contactLimit, "Víc než 10 kontaktů tu mít nejde.");
      assert.equal(MESSAGES.helpGone, "Záznam už neexistuje.");

      const ui = [
        ...walk(join(ROOT, "components", "burza")),
        ...walk(join(ROOT, "app", "(app)", "burza")),
      ]
        .filter((f) => f.endsWith(".tsx"))
        .map((f) => stripComments(readFileSync(f, "utf8")))
        .join("\n");
      for (const bad of ["Pridat", "Smazat kontakt", "Upravit kontakt ", "Vyuzil", "Zapsal(a) vedeni"]) {
        assert.ok(!ui.includes(bad), `bez diakritiky: ${bad}`);
      }
      assert.ok(!ui.includes("Využil/a"), "lomítko nikde");
      // Z8/Z10: bez výpisu položek v boxu
      assert.ok(!readSrc("components/burza/MyContactsBox.tsx").includes("line-clamp"));
    },
  },
  {
    name: "16. nápověda: MemberHelp a ModeratorHelp mají nové odrážky z gate, staré texty pryč, bez štítků povinné/doporučené",
    run: () => {
      const member = readSrc("components/help/sections/MemberHelp.tsx");
      const mod = readSrc("components/help/sections/ModeratorHelp.tsx");
      const burza = member.slice(member.indexOf("Burza pomoci"));
      for (const t of ["Pomoc a Kontakty.", "Jak přidám kontakt?", "Kdy použít Využil(a) jsem?", "Kdo záznam uvidí?", "Kontaktů můžete mít až 10."]) {
        assert.ok(burza.includes(t), t);
      }
      assert.ok(!burza.includes("Pomohl(a) mi"));
      assert.ok(!burza.includes("Zapsal(a) jsem to omylem"));
      assert.ok(mod.includes("Kontakty člena."));
      assert.ok(mod.includes("Využití"));
      assert.ok(mod.includes("Když se smaže položka kontaktu"));
      assert.ok(mod.includes("Akce vedení fungují jen po přihlášení heslem"));
      for (const bad of ["povinné", "doporučené"]) assert.ok(!burza.includes(bad), bad);
    },
  },
  {
    name: "17. e-mail člena se v nových souborech nečte, bez db.transaction a dangerouslySetInnerHTML",
    run: () => {
      const files = [
        "lib/db/queries/burza.ts",
        "actions/burza.ts",
        "lib/burza/rules.ts",
        "lib/burza/events.ts",
        ...walk(join(ROOT, "components", "burza")).map((f) => relative(ROOT, f)),
        ...walk(join(ROOT, "app", "(app)", "burza")).map((f) => relative(ROOT, f)),
      ];
      for (const rel of files) {
        const src = readSrc(rel);
        assert.ok(!/\bemail\b/i.test(src.replace(/placeholder\s*=\s*\{[^}]*\}/g, "")), `${rel}: email`);
        assert.ok(!/\.transaction\(/.test(src), `${rel}: transaction`);
        assert.ok(!/dangerouslySetInnerHTML/.test(src), `${rel}: dangerouslySetInnerHTML`);
      }
    },
  },
  {
    name: "18. package.json: test:iter-035b-burza a zařazení do test:iter-035 jako první",
    run: () => {
      const pkg = JSON.parse(readRaw("package.json")) as { scripts: Record<string, string> };
      assert.equal(pkg.scripts["test:iter-035b-burza"], "tsx scripts/test-iter-035b-burza.ts");
      assert.ok(pkg.scripts["test:iter-035"].startsWith("npm run test:iter-035b-burza"));
    },
  },
];

let passed = 0;
let failed = 0;

async function main() {
  for (const testCase of cases) {
    try {
      await testCase.run();
      console.log(`OK   ${testCase.name}`);
      passed++;
    } catch (error) {
      failed++;
      console.error(`FAIL ${testCase.name}`);
      console.error(`     ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed (of ${cases.length})`);
  if (failed > 0) process.exitCode = 1;
}

void main();
