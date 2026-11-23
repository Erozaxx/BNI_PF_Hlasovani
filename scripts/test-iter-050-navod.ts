/**
 * Test iter-050: Evin průvodce na /situace/navod. Očekávané řetězce jsou
 * zapsané přímo tady (`.aiworkflow` je gitignored). Bez DB a bez sítě.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { GUIDE, GUIDE_LINK_TEXT, GUIDE_PATH } from "../lib/situations/guide";

const ROOT = path.join(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n += 1;
  console.log(`ok ${n} ${name}`);
}

/** Odstavce zdroje v pořadí. Tučná návěští („Příklad:“, „Cíl:“, „Pomocné otázky:“) jsou v řádku celá. */
const PARAGRAPHS: string[] = [
  "**Jak poznat skutečné potřeby svého klienta**",
  "**Krátký průvodce pro členy BNI Pilsner Fountains**",
  "Každý zákazník přichází s nějakou situací. Něco potřebuje vyřešit, něčeho se obává a k něčemu směřuje.",
  "Čím lépe tomuto příběhu rozumíme, tím lépe dokážeme klientovi pomoci, nabídnout mu své služby a rozpoznat příležitosti pro další členy chapter.",
  "**1. Začni konkrétní situací**",
  "Představ si jednoho skutečného klienta nebo typickou opakující se situaci.",
  "**Příklad:** Majiteli rostoucí firmy odcházejí kvalifikovaní zaměstnanci. Nedaří se mu obsazovat volná místa a provoz začíná být ohrožený.",
  "**2. POTŘEBY – Co potřebuje zvládnout?**",
  "Přemýšlej o úkolech, problémech a povinnostech, které má klient před sebou.",
  "Pomocné otázky:",
  "**Příklad:** Obsazení klíčových pozic, stabilizace týmu, nastavení odměňování, zajištění provozu.",
  "**3. OBAVY – Co ho trápí?**",
  "Představ si, co klientovi komplikuje život, čeho se bojí a co může ztratit.",
  "Pomocné otázky:",
  "**Příklad:** Odejdou další klíčoví lidé. Firma nebude zvládat zakázky. Zvýší se náklady. Změna odměňování vyvolá nespokojenost.",
  "**4. TOUHY – Čeho chce dosáhnout?**",
  "Představ si situaci, kdy je problém vyřešený. Co klient získal? Jak chce, aby jeho život nebo podnikání vypadaly?",
  "Pomocné otázky:",
  "**Příklad:** Stabilní a motivovaný tým, který zvládá zakázky. Spravedlivé odměňování. Více času na rozvoj firmy. Klidnější fungování.",
  "**5. Co dalšího klient potřebuje?**",
  "Teď se podívej na celý klientův příběh.",
  "**Příklad:** Firma hledá nové zaměstnance. Současně však může potřebovat upravit vedení lidí, organizační strukturu, interní komunikaci, procesy a systém odměňování.",
  "Právě tady vznikají příležitosti k propojení jednotlivých členů BNI.",
  "**Co si při vyplňování pohlídat**",
  "**Cíl:** Aby si každý člen chapter dokázal při čtení tvých situací představit klienta, poznat jeho problém a rozpoznat, kdy ti ho může doporučit.",
];

const BULLETS: string[] = [
  "Kdo je klient? Například majitel firmy, HR manažer, rodič, investor.",
  "Co se v jeho životě nebo podnikání děje?",
  "Co ho přimělo začít hledat řešení právě teď?",
  "Co musí vyřešit, aby jeho situace začala fungovat lépe?",
  "Co potřebuje změnit, zajistit nebo rozhodnout?",
  "Co je pro něj v této chvíli nejdůležitější?",
  "Co se stane, když problém nevyřeší?",
  "Co ho stojí čas, peníze nebo energii?",
  "Čeho se obává při rozhodování nebo při zavádění změny?",
  "Co už nechce znovu zažít?",
  "Co by považoval za ideální výsledek?",
  "Jak se chce cítit?",
  "Co mu vyřešení situace umožní?",
  "Po čem touží i nad rámec samotného odstranění problému?",
  "Co potřeboval vyřešit ještě předtím, než přišel za tebou?",
  "Co musí řešit současně s tvojí službou?",
  "Co bude potřebovat potom?",
  "Které z těchto potřeb ty sám neposkytuješ?",
  "Popisuj situaci očima konkrétního zákazníka.",
  "Přemýšlej v širším kontextu jeho života nebo podnikání.",
  "Každou potřebu, obavu nebo touhu zapiš jako samostatnou položku.",
  "Buď konkrétní. „Chce mít klid“ může znamenat méně reklamací, jistotu dodávek, fungující zaměstnance nebo finanční stabilitu.",
  "Využij své zkušenosti z obchodních rozhovorů a skutečných zakázek.",
];

const guideText = JSON.stringify(GUIDE);
const flat: string[] = [
  GUIDE.title,
  GUIDE.subtitle,
  ...GUIDE.intro,
  ...GUIDE.steps.flatMap((s) => [
    s.heading,
    ...s.lead,
    ...(s.bulletsLabel ? [s.bulletsLabel] : []),
    `Příklad: ${s.example}`,
    ...(s.after ?? []),
  ]),
  GUIDE.closing.heading,
  `${GUIDE.closing.goalLabel} ${GUIDE.closing.goal}`,
];
const flatBullets = [...GUIDE.steps.flatMap((s) => s.bullets), ...GUIDE.closing.bullets];

t("1 každý odstavec zdroje je v modulu doslova", () => {
  // Nadpis a podtitul zdroje jsou v docx tučně, v řádku jsou bez hvězdiček.
  const expected = PARAGRAPHS.map((p) => p.replace(/\*\*/g, ""));
  for (const p of expected) assert.ok(flat.includes(p), `chybí odstavec: ${p}`);
});

t("2 každá odrážka zdroje je v modulu doslova", () => {
  for (const b of BULLETS) assert.ok(flatBullets.includes(b), `chybí odrážka: ${b}`);
});

t("3 modul neobsahuje nic navíc ani v jiném pořadí", () => {
  const expected = PARAGRAPHS.map((p) => p.replace(/\*\*/g, ""));
  assert.deepEqual(flat, expected);
  assert.deepEqual(flatBullets, BULLETS);
});

t("4 pět kroků, tóny kroků 2 až 4 podle sloupců editoru", () => {
  assert.equal(GUIDE.steps.length, 5);
  assert.deepEqual(
    GUIDE.steps.map((s) => s.tone),
    ["neutral", "need", "fear", "desire", "neutral"]
  );
});

t("5 žádný em dash v modulu, stránce, odkazech ani testu", () => {
  const dash = String.fromCharCode(0x2014);
  for (const f of [
    "lib/situations/guide.ts",
    "app/(app)/situace/navod/page.tsx",
    "components/situations/SituationsOverview.tsx",
    "app/(app)/situace/[memberId]/page.tsx",
    "scripts/test-iter-050-navod.ts",
  ]) {
    assert.ok(!read(f).includes(dash), `em dash v ${f}`);
  }
  assert.ok(!guideText.includes(dash));
});

t("6 stránka průvodce volá requirePageSession a vykresluje modul", () => {
  const page = read("app/(app)/situace/navod/page.tsx");
  assert.ok(page.includes("requirePageSession("));
  assert.ok(page.includes('from "@/lib/situations/guide"'));
  assert.ok(page.includes("GUIDE.steps"));
  assert.ok(page.includes('href="/situace"'), "zpětný odkaz");
  assert.ok(page.includes("UI_TEXTS.backToOverview"));
});

t("7 odkaz „Jak na to“ je v přehledu i v editoru a míří na /situace/navod", () => {
  assert.equal(GUIDE_LINK_TEXT, "Jak na to");
  assert.equal(GUIDE_PATH, "/situace/navod");
  for (const f of ["components/situations/SituationsOverview.tsx", "app/(app)/situace/[memberId]/page.tsx"]) {
    const src = read(f);
    assert.ok(src.includes("href={GUIDE_PATH}"), `odkaz v ${f}`);
    assert.ok(src.includes("{GUIDE_LINK_TEXT}"), `text v ${f}`);
  }
});

t("8 statický segment navod vedle [memberId], bez loading.tsx", () => {
  assert.ok(existsSync(path.join(ROOT, "app/(app)/situace/navod/page.tsx")));
  assert.ok(existsSync(path.join(ROOT, "app/(app)/situace/[memberId]/page.tsx")));
  assert.ok(!existsSync(path.join(ROOT, "app/(app)/situace/navod/loading.tsx")));
});

t("9 klikací cíle odkazů mají min-h 44 px", () => {
  const page = read("app/(app)/situace/navod/page.tsx");
  for (const m of page.match(/<Link[\s\S]*?>/g) ?? []) assert.ok(m.includes("min-h-[44px]"), m);
});

console.log(`\n${n}/${n} OK`);
