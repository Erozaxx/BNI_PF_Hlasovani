/**
 * iter-041 C4 (arch T-001 sekce 8): jednorázové doplnění docházky z exportu
 * PALMS. Čistá logika je v `lib/attendance/palms.ts`, tady je jen vstup/výstup
 * a databáze.
 *
 * DŮLEŽITÉ: `.env.local` míří na PRODUKČNÍ DB. Skript se na PROD pouští až po
 * dry-runu, který odsouhlasil Tom (iter-041 T-008). Agenti ho proti síťové DB
 * nespouštějí.
 *
 * Pojistky:
 *   - výchozí režim je dry-run (jen čtení, jeden SELECT s CTE),
 *   - `--apply` vyžaduje `EXPECT_DB_HOST` (povinné), host z `DATABASE_URL` musí
 *     jít zjistit a rovnat se mu celý (nebo jeho první label), ne podřetězec;
 *     host se vypíše bez hesla,
 *   - soubor s exportem i soubor aliasů musí ležet mimo repozitář (veřejné repo),
 *   - zápis je jeden SQL příkaz s CTE a `ON CONFLICT DO NOTHING` (bez
 *     `db.transaction()`, LL-003), vstup jde jako bind parametr,
 *   - výstup bez jmen (`--show-names` jen pro Toma lokálně),
 *   - žádný Resend, žádný `ops_event`, nezakládá členy.
 *
 * Použití: viz `--help`.
 */
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { absenceWindowStart } from "../lib/attendance/rules";
import { pragueToday } from "../lib/members/activity";
import {
  HELP_TEXT,
  MAX_ALIAS_FILE_BYTES,
  MAX_FILE_BYTES,
  PalmsError,
  SQL_PARAM_COUNT,
  assertApplyAllowed,
  assertExpectHostGiven,
  assertOutsideRepo,
  buildBackfillSql,
  buildPlan,
  formatReport,
  hostOfUrl,
  matchRows,
  parseAliasFile,
  parseArgs,
  parseCounts,
  parsePalmsFile,
  planToJson,
  type BackfillCounts,
  type PlanStats,
} from "../lib/attendance/palms";
import { ABSENCE_LIMIT } from "../lib/attendance/rules";

export type QueryFn = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

export interface RunOptions {
  fileBytes: Uint8Array;
  aliasFileText?: string | null;
  apply: boolean;
  showNames: boolean;
  /** Pražské datum dnes (testy ho předávají, skript bere `pragueToday()`). */
  today: string;
}

export interface RunResult {
  lines: string[];
  stats: PlanStats;
  counts: BackfillCounts;
  /** Jen s `showNames`. */
  names: { name: string; before: number; after: number }[];
}

/** Načtení členů a pamětí jmen, párování, plán a jeden příkaz na soubor. */
export async function runBackfill(query: QueryFn, opts: RunOptions): Promise<RunResult> {
  const sheet = parsePalmsFile(opts.fileBytes);
  const fileAliases = opts.aliasFileText ? parseAliasFile(opts.aliasFileText) : new Map<number, string>();

  const memberRows = await query(
    `SELECT id::text AS id, name,
            (deactivated_at IS NULL OR COALESCE(inactive_until < $1::date, false)) AS active
     FROM member`,
    [opts.today]
  );
  const members = memberRows.map((r) => ({ id: String(r.id), name: String(r.name), active: Boolean(r.active) }));
  const aliasRows = await query(`SELECT name_key, member_id::text AS member_id FROM semafor_name_alias`, []);
  const aliases = new Map<string, string>();
  for (const r of aliasRows) aliases.set(String(r.name_key), String(r.member_id));

  const matching = matchRows(sheet, members, aliases, fileAliases);
  const plan = buildPlan(sheet, matching);

  const params: unknown[] = [planToJson(plan.rows), opts.today, absenceWindowStart(opts.today), ABSENCE_LIMIT];
  if (params.length !== SQL_PARAM_COUNT) throw new PalmsError("Chybný počet parametrů příkazu.");
  const result = await query(buildBackfillSql(opts.apply ? "apply" : "dry"), params);
  if (result.length !== 1) throw new PalmsError("Databáze vrátila neočekávaný výsledek.");
  const counts = parseCounts(result[0]);

  const lines = formatReport(plan.stats, counts, opts.apply);
  let names: RunResult["names"] = [];
  if (opts.showNames) {
    const nameRows = await query(buildBackfillSql("names"), params);
    names = nameRows.map((r) => ({ name: String(r.name), before: Number(r.before), after: Number(r.after) }));
    // Jména jen na žádost, tedy `--show-names` (Tom lokálně).
    const unmatched = new Set(plan.stats.unmatchedRowNos);
    const unmatchedNames = sheet.rows.filter((r) => unmatched.has(r.rowNo)).map((r) => `řádek ${r.rowNo}: ${r.name}`);
    if (unmatchedNames.length > 0) lines.push(`Nespárováno (jména): ${unmatchedNames.join("; ")}.`);
    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    const inexact = [...plan.stats.looseRowNos, ...plan.stats.swappedRowNos].sort((a, b) => a - b);
    const kindOf = new Set(plan.stats.looseRowNos);
    for (const no of inexact) {
      const idx = sheet.rows.findIndex((r) => r.rowNo === no);
      const memberName = nameOf.get(matching.memberIds[idx] ?? "") ?? "?";
      lines.push(`Nepřesné párování, řádek ${no} (${kindOf.has(no) ? "bez diakritiky" : "prohozeně"}): ${sheet.rows[idx].name} -> ${memberName}.`);
    }
    for (const n of names) lines.push(`Limit absencí: ${n.name}, před ${n.before}, po ${n.after}.`);
  }
  return { lines, stats: plan.stats, counts, names };
}

function repoRoots(): string[] {
  const roots = new Set<string>([process.cwd()]);
  if (process.argv[1]) roots.add(path.resolve(path.dirname(process.argv[1]), ".."));
  const real: string[] = [];
  for (const r of roots) {
    real.push(r);
    try {
      real.push(realpathSync(r));
    } catch {
      /* neexistující kořen nevadí */
    }
  }
  return real;
}

function readOutsideRepo(file: string, maxBytes: number, what: string): Buffer {
  const roots = repoRoots();
  assertOutsideRepo(file, roots);
  let real: string;
  try {
    real = realpathSync(file);
  } catch {
    throw new PalmsError(`${what} nejde otevřít.`);
  }
  assertOutsideRepo(real, roots);
  const st = statSync(real);
  if (!st.isFile()) throw new PalmsError(`${what} není soubor.`);
  if (st.size > maxBytes) throw new PalmsError(`${what} je příliš velký.`);
  return readFileSync(real);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }
  // Pojistka dřív než cokoli jiného: --apply bez EXPECT_DB_HOST nepokračuje.
  assertExpectHostGiven(args.apply, process.env.EXPECT_DB_HOST);

  const fileBytes = readOutsideRepo(args.path!, MAX_FILE_BYTES, "Soubor s exportem");
  const aliasFileText = args.aliasFile
    ? readOutsideRepo(args.aliasFile, MAX_ALIAS_FILE_BYTES, "Soubor aliasů").toString("utf8")
    : null;

  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });
  const url = process.env.DATABASE_URL;
  if (!url) throw new PalmsError("Chybí DATABASE_URL.");
  const host = hostOfUrl(url);
  assertApplyAllowed(args.apply, process.env.EXPECT_DB_HOST, host);
  console.log(`Databáze: ${host ?? "neznámý host"} (${args.apply ? "apply" : "dry-run"})`);

  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url, { fetchOptions: { cache: "no-store" } });
  const query: QueryFn = async (text, params) => (await sql(text, params as unknown[])) as Record<string, unknown>[];

  const res = await runBackfill(query, {
    fileBytes,
    aliasFileText,
    apply: args.apply,
    showNames: args.showNames,
    today: pragueToday(),
  });
  for (const line of res.lines) console.log(line);
}

// Spuštění jen přímo, import z testů nic nedělá.
if (path.basename(process.argv[1] ?? "") === "backfill-iter-041-palms.ts") {
  main().then(
    () => process.exit(0),
    (err: unknown) => {
      if (err instanceof PalmsError) console.error(`Chyba: ${err.message}`);
      else console.error(`Chyba: ${err instanceof Error ? err.message.slice(0, 300) : "neznámá"}`);
      process.exit(1);
    }
  );
}
