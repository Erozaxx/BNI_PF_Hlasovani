/**
 * Migrace pro iter-044 (vlastní body semaforu, arch_iter-044_T-001 sekce 5.4,
 * gate T-004 Q6, Q10). Aditivní a idempotentní: dvě nové tabulky, žádný
 * existující CHECK ani sloupec se nemění.
 *
 *   - `semafor_activity` (akce chapteru: název, datum konání),
 *   - `semafor_point` (ruční body: školení, poděkování, přivedený host, který
 *     se stal členem, účast na akci, ostatní práce) s devíti CHECK, pěti
 *     částečnými UNIQUE indexy (`uq_sp_work` je výrazový) a třemi indexy;
 *     `semafor_activity` má navíc výrazový UNIQUE `uq_sa_dup` (datum a název).
 *
 * DDL je v `lib/semafor/points-ddl.ts` (čte ho tahle migrace i SQL test nad
 * PGlite, takže test ověřuje přesně stejný SQL tvar, LL-006 bod 2).
 *
 * DŮLEŽITÉ: tenhle soubor coder NAPSAL, NESPUSTIL proti žádné síťové DB.
 * `.env.local` míří na produkční Neon, dev databáze neexistuje. Nejdřív se
 * spustí na dočasné větvi Neonu (LL-010), druhé spuštění musí projít beze
 * změny, teprve potom na PROD PŘED testováním v preview i PŘED mergem (preview
 * i produkce běží nad PROD DB a Vercel deployuje na merge). Nová verze bez
 * migrace nespadne: všechna čtení nových tabulek jdou přes `readPointsTables`
 * (42P01), `/semafor` a `/semafor/body` ukážou větu místo karet. Stará verze
 * s migrací nové tabulky nečte.
 *
 * Zámky: cizí klíče drží krátce SHARE ROW EXCLUSIVE na `member`. `lock_timeout`
 * 5 s hlídá, že migrace nečeká na cizí transakci. Nespouštět ve čtvrtek ráno.
 *
 * lock_timeout (LL-006): DDL běží v `DO $$ … $$` blocích, které nejdřív
 * nastaví transakčně lokální lock_timeout přes `set_config('lock_timeout',
 * '5s', true)`. Hodnota je v textu napsaná DOSLOVNĚ, UVNITŘ `$$ … $$` NENÍ
 * ŽÁDNÁ JS interpolace (text se skládá spojením řetězců v `doBlock`, ne
 * bind parametrem).
 *
 * Kroky:
 *   [0/5] smoke test: stejný DDL na dočasných tabulkách (`smokeDdl()`),
 *   [1/5] host databáze bez hesla; EXPECT_DB_HOST je POVINNÝ (celý host nebo
 *         jeho první label, `assertApplyAllowed` z lib/attendance/palms.ts),
 *   [2/5] semafor_activity, [3/5] semafor_point + indexy,
 *   [4/5] kontrolní dotazy (exit 1 při neshodě) a výpis bez jmen členů:
 *         funkce, které dostanou `semafor.points`; funkce s `area = 'vybor'`
 *         a počet jejich držitelů (kdo smí udělit ostatní práci, varování
 *         při 0 nebo 1 držiteli, gate Q6); počet držitelů každé funkce
 *         (bonus za funkci),
 *   [5/5] souhrn počtů řádků (druhé spuštění beze změny).
 *
 * ROLLBACK: vrátit kód. Tabulky nechat, nebo
 *   DROP TABLE semafor_point, semafor_activity;
 *
 * Spuštění (nejdřív větev Neonu, LL-010; pak PROD PŘED mergem):
 *   EXPECT_DB_HOST=<host nebo první label> npx tsx scripts/migrate-iter-044-vlastni-body.ts
 *   (načítá DATABASE_URL z .env.local)
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { assertApplyAllowed, hostOfUrl } from "../lib/attendance/palms";
import { COMMITTEE_FUNCTION_AREA, DEFAULT_FUNCTION_PERMISSIONS } from "../lib/auth/permissions";
import { ACTIVITY_TABLE_DDL, POINT_INDEXES_DDL, POINT_TABLE_DDL, doBlock, smokeDdl } from "../lib/semafor/points-ddl";
import { verifyPointsSchema } from "../lib/semafor/points-verify";

dotenv.config({ path: ".env.local" });

function fail(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

async function main() {
  console.log("Running iter-044 vlastní body semaforu migration...");
  const url = process.env.DATABASE_URL;
  console.log(`Target DB: ${url?.replace(/:[^@]+@/, ":***@")}`);

  // Host guard (povinný, i pro první spuštění na větvi Neonu): bez EXPECT_DB_HOST se nic nespustí.
  try {
    assertApplyAllowed(true, process.env.EXPECT_DB_HOST, hostOfUrl(url));
  } catch (err) {
    fail(`${(err as Error).message} Migrace se nespustí.`);
  }
  if (!url) fail("DATABASE_URL není nastavená");
  const sql = neon(url);

  // [0/5] smoke test: stejný DDL jako kroky [2/5] a [3/5], dočasné tabulky.
  await sql(doBlock(smokeDdl()));
  console.log(
    "  [0/5] smoke test OK (DO blok: set_config, CREATE TABLE s FK CASCADE a SET NULL, devět CHECK, částečné i výrazové UNIQUE, stejný DDL na dočasných tabulkách)"
  );

  // [1/5] snímek před (bez hesla, jen stav)
  const need = (await sql(
    `SELECT count(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('member', 'chapter_function', 'member_function')`
  )) as { n: number }[];
  if (need[0]?.n !== 3) fail("chybí tabulka member, chapter_function nebo member_function (špatná databáze, chybí iter-037?)");
  const before = (await sql(
    `SELECT count(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('semafor_activity', 'semafor_point')`
  )) as { n: number }[];
  console.log(`  [1/5] host ověřen proti EXPECT_DB_HOST; nových tabulek už existuje ${before[0]?.n} ze 2`);

  // [2/5] a [3/5] tabulky a indexy. Každý krok je jeden DO blok.
  await sql(doBlock(ACTIVITY_TABLE_DDL));
  console.log("  [2/5] semafor_activity ensured");
  await sql(doBlock(POINT_TABLE_DDL));
  await sql(doBlock(POINT_INDEXES_DDL));
  console.log("  [3/5] semafor_point a indexy ensured");

  // [4/5] kontroly (sdílený kód s testem nad PGlite, lib/semafor/points-verify.ts)
  const steps = await verifyPointsSchema(async (text, params) => (await sql(text, params ?? [])) as Record<string, unknown>[]);
  const okText: Record<string, string> = {
    "4a": "sloupce a typy sedí (2 tabulky)",
    "4b": "cizí klíče (CASCADE u member_id, ref_member_id a activity_id, SET NULL u created_by)",
    "4c": "devět CHECK semafor_point a sa_title_len sedí (sp_points má IS NOT NULL a rozsah)",
    "4d": "indexy, pět částečných UNIQUE (uq_sp_work s md5 popisu) a uq_sa_dup sedí",
  };
  for (const st of steps) {
    if (st.errors.length > 0) fail(`[${st.step}] ${st.errors.join("; ")}`);
    console.log(`  [${st.step}] ${okText[st.step]}`);
  }

  // Jen čtení, bez jmen členů: kdo dostane `semafor.points` a kdo smí udělit ostatní práci.
  const withDefault = (await sql(
    `SELECT name FROM chapter_function WHERE permissions IS NULL ORDER BY name`
  )) as { name: string }[];
  const withMarker = (await sql(
    `SELECT name FROM chapter_function WHERE permissions IS NOT NULL AND 'admin-delegable' = ANY(permissions) ORDER BY name`
  )) as { name: string }[];
  const manual = (await sql(
    `SELECT count(*)::int AS n FROM chapter_function
     WHERE permissions IS NOT NULL AND NOT ('admin-delegable' = ANY(permissions)) AND NOT ('semafor.points' = ANY(permissions))`
  )) as { n: number }[];
  const list = (rows: { name: string }[]) => (rows.length === 0 ? "žádné" : rows.map((r) => r.name).join(", "));
  const defaultHasPoints = DEFAULT_FUNCTION_PERMISSIONS.includes("semafor.points");
  console.log(
    `  [4e] funkce, které dostanou semafor.points (výchozí sada${defaultHasPoints ? "" : " NEOBSAHUJE právo, zkontroluj kód"}): ${list(withDefault)}; značkou admin-delegable: ${list(withMarker)}`
  );
  console.log(
    `  [4e] funkcí s ručním seznamem práv bez semafor.points (záložku Body nedostanou, admin je upraví ve správě funkcí): ${manual[0]?.n ?? 0}`
  );

  const committee = (await sql(
    `SELECT cf.name, count(mf.member_id)::int AS holders
     FROM chapter_function cf LEFT JOIN member_function mf ON mf.function_id = cf.id
     WHERE cf.area = $1 GROUP BY cf.name ORDER BY cf.name`,
    [COMMITTEE_FUNCTION_AREA]
  )) as { name: string; holders: number }[];
  const holders = committee.reduce((sum, c) => sum + c.holders, 0);
  console.log(
    `  [4f] funkce s area = '${COMMITTEE_FUNCTION_AREA}' (smí udělit ostatní práci): ${
      committee.length === 0 ? "žádná" : committee.map((c) => `${c.name} (${c.holders})`).join(", ")
    }`
  );
  if (holders === 0) {
    console.warn("  UPOZORNĚNÍ: ostatní práci nemá kdo udělit (žádný držitel funkce Člen výboru).");
  } else if (holders === 1) {
    console.warn("  UPOZORNĚNÍ: jediný člen výboru, jeho vlastní práci nikdo neocení (gate Q6 A, popsáno v doc/semafor.md).");
  }

  const perFunction = (await sql(
    `SELECT cf.name, count(mf.member_id)::int AS holders
     FROM chapter_function cf LEFT JOIN member_function mf ON mf.function_id = cf.id
     GROUP BY cf.name, cf.display_order ORDER BY cf.display_order`
  )) as { name: string; holders: number }[];
  console.log(`  [4g] držitelé funkcí (bonus za funkci): ${perFunction.map((f) => `${f.name} ${f.holders}`).join(", ")}`);

  // [5/5] souhrn (jen počty)
  const summary = (await sql(
    `SELECT (SELECT count(*)::int FROM semafor_activity) AS activities,
            (SELECT count(*)::int FROM semafor_point) AS points`
  )) as { activities: number; points: number }[];
  console.log(`  [5/5] řádků: semafor_activity ${summary[0]?.activities}, semafor_point ${summary[0]?.points}`);
  console.log("\niter-044 vlastní body semaforu migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
