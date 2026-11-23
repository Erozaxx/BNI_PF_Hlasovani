/**
 * iter-049 (arch 5.2): jednorázový import klientských situací ze `situace.json`
 * z workshopu 22. 10. Čistá logika je v `lib/situations/import.ts`, SQL v
 * `lib/situations/import-sql.ts` (stejný text čte PGlite test), tady je jen
 * vstup/výstup a databáze.
 *
 * DŮLEŽITÉ: `.env.local` míří na PRODUKČNÍ Neon. Tenhle skript coder NAPSAL,
 * NESPUSTIL proti žádné DB. Pořadí: větev Neonu (LL-010), migrace 2x, dry-run,
 * `--apply`, `--apply` znovu (0 nových), teprve potom PROD před mergem.
 *
 * Pojistky:
 *   - výchozí režim je dry-run (jen SELECT členů),
 *   - `--apply` vyžaduje `EXPECT_DB_HOST` (celý host, nebo jeho první label),
 *     host se vypíše bez hesla,
 *   - `--apply` jen s nulou nespárovaných členů (žádné vynechání, M1), žádný
 *     přepínač na přeskočení nespárovaných neexistuje,
 *   - `--file` i `--alias` musí ležet mimo repozitář (veřejné repo),
 *   - zápis jsou tři příkazy bez `db.transaction()` (LL-003), vstup jako bind parametr,
 *   - výstup bez jmen (`--show-names` jen pro Toma lokálně),
 *   - žádný Resend, žádný `ops_event`.
 *
 * Použití:
 *   npx tsx scripts/import-iter-049-situace.ts --file <cesta mimo repo> [--alias <json mimo repo>] [--apply] [--show-names]
 *   alias soubor: {"jméno ze souboru": "uuid člena"}
 */
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import {
  PalmsError,
  assertApplyAllowed,
  assertOutsideRepo,
  hostOfUrl,
} from "../lib/attendance/palms";
import {
  ImportError,
  MAX_FILE_BYTES,
  buildImportPlan,
  canApply,
  parseAliasJson,
  parseSituaceJson,
  planToParams,
} from "../lib/situations/import";
import {
  IMPORT_EMPTY_SLOTS_SQL,
  IMPORT_SITUATIONS_SQL,
  IMPORT_SOURCES_SQL,
  IMPORT_VERIFY_SQL,
} from "../lib/situations/import-sql";
import { isUuid } from "../lib/situations/rules";

dotenv.config({ path: ".env.local" });

interface Args {
  file: string | null;
  alias: string | null;
  apply: boolean;
  showNames: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { file: null, alias: null, apply: false, showNames: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") args.file = argv[++i] ?? null;
    else if (a === "--alias") args.alias = argv[++i] ?? null;
    else if (a === "--apply") args.apply = true;
    else if (a === "--show-names") args.showNames = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new ImportError(`Neznámý argument ${a}.`);
  }
  return args;
}

function repoRoots(): string[] {
  const roots = new Set<string>([process.cwd()]);
  if (process.argv[1]) roots.add(path.resolve(path.dirname(process.argv[1]), ".."));
  const all: string[] = [];
  for (const r of roots) {
    all.push(r);
    try {
      all.push(realpathSync(r));
    } catch {
      /* neexistující kořen nevadí */
    }
  }
  return all;
}

function readOutsideRepo(file: string, maxBytes: number, what: string): string {
  const roots = repoRoots();
  assertOutsideRepo(file, roots);
  let real: string;
  try {
    real = realpathSync(file);
  } catch {
    throw new ImportError(`${what} nejde otevřít.`);
  }
  assertOutsideRepo(real, roots);
  const st = statSync(real);
  if (!st.isFile()) throw new ImportError(`${what} není soubor.`);
  if (st.size > maxBytes) throw new ImportError(`${what} je příliš velký.`);
  return readFileSync(real, "utf-8");
}

const HELP = `Import klientských situací ze situace.json (iter-049).

  npx tsx scripts/import-iter-049-situace.ts --file <cesta mimo repo> [--alias <json mimo repo>] [--apply] [--show-names]

  --file         situace.json, MUSÍ ležet mimo repozitář
  --alias        {"jméno ze souboru": "uuid člena"}, MUSÍ ležet mimo repozitář
  --apply        zapíše do databáze (výchozí je dry-run); vyžaduje EXPECT_DB_HOST a nulu nespárovaných členů
  --show-names   vypíše jména nespárovaných členů (jen lokálně)
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.file) throw new ImportError("Chybí --file.");

  const file = parseSituaceJson(readOutsideRepo(args.file, MAX_FILE_BYTES, "Soubor"));
  const aliases = args.alias
    ? parseAliasJson(readOutsideRepo(args.alias, 64 * 1024, "Alias soubor"), isUuid)
    : new Map<string, string>();

  const url = process.env.DATABASE_URL;
  if (!url) throw new ImportError("DATABASE_URL není nastavená.");
  const host = hostOfUrl(url);
  assertApplyAllowed(args.apply, process.env.EXPECT_DB_HOST, host);
  console.log(`Cíl: ${host ?? "neznámý host"} (${args.apply ? "APPLY" : "dry-run"})`);

  const sql = neon(url);
  const query = (text: string, params: unknown[] = []) =>
    sql(text, params) as Promise<Record<string, unknown>[]>;

  const memberRows = await query(
    `SELECT id, name,
            (deactivated_at IS NULL OR COALESCE(inactive_until < (now() AT TIME ZONE 'Europe/Prague')::date, false)) AS active
       FROM member`
  );
  const members = memberRows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    active: Boolean(r.active),
  }));

  const plan = buildImportPlan(file, members, aliases);
  const st = plan.stats;
  console.log(
    `Situace v souboru: ${st.fileSituations}, v plánu: ${st.plannedSituations}, kontrola úplnosti id: ${plan.complete ? "OK" : "CHYBÍ"}`
  );
  console.log(
    `Kartičky: obavy ${st.items.fear}, touhy ${st.items.desire}, související potřeby ${st.items.related}; potřeby a lístečky prázdné`
  );
  console.log(
    `Členové v souboru: ${st.members}, spárovaní: ${st.matchedMembers}, nespárovaní: ${st.unmatchedMembers}, oříznuté texty: ${st.truncated}`
  );
  if (args.showNames && plan.unmatched.length > 0) {
    for (const u of plan.unmatched) console.log(`  nespárovaný: ${u.name} (${u.kind})`);
  }
  for (const e of plan.errors) console.log(`  CHYBA: ${e}`);

  const verdict = canApply(plan);
  if (!args.apply) {
    console.log(verdict.ok ? "Dry-run v pořádku, --apply je možný." : `Dry-run: --apply by skončil. ${verdict.reason}`);
    if (!verdict.ok) process.exitCode = 1;
    return;
  }
  if (!verdict.ok) {
    console.error(`--apply končí: ${verdict.reason}`);
    process.exit(1);
  }

  const params = planToParams(plan);
  const now = new Date().toISOString();
  const a = await query(IMPORT_SITUATIONS_SQL, [params.situations, params.items, now]);
  const b = await query(IMPORT_SOURCES_SQL, [params.sources]);
  const c = await query(IMPORT_EMPTY_SLOTS_SQL);
  console.log(
    `Zapsáno: situace ${a[0]?.situations ?? 0}, kartičky ${a[0]?.items ?? 0}, zdroje členů ${b.length}, prázdné sloty ${c.length}`
  );

  const ids = plan.situations.map((s) => s.sourceId);
  const v = await query(IMPORT_VERIFY_SQL, [ids]);
  const dbSituations = Number(v[0]?.situations ?? 0);
  const dbItems = Number(v[0]?.items ?? 0);
  const planItems = st.items.fear + st.items.desire + st.items.related;
  if (dbSituations !== ids.length || dbItems < planItems) {
    console.error(
      `Kontrola po zápisu selhala: situace v DB ${dbSituations} z ${ids.length}, kartičky z importu ${dbItems} z ${planItems}.`
    );
    process.exit(1);
  }
  console.log(`Kontrola po zápisu OK: situace ${dbSituations}, kartičky z importu ${dbItems}.`);
}

main().catch((err) => {
  if (err instanceof ImportError || err instanceof PalmsError) {
    console.error(`FATAL: ${err.message}`);
  } else {
    console.error(`FATAL: ${err instanceof Error ? err.name : "chyba"}`);
  }
  process.exit(1);
});
