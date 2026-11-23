/**
 * iter-049 (arch 8.1): kontrola exportu `situace.json` proti `vztahy.json` a
 * `pozice.json` z mapy. Tom ji pustí před `assemble.sh`.
 *
 * Nic nezapisuje, nečte databázi. Všechny tři soubory musí ležet mimo repozitář.
 * Výstup jsou počty, id situací a jména jen s `--show-names`. Chybějící odkaz
 * = exit 1.
 *
 * Použití:
 *   npx tsx scripts/check-iter-049-export.ts --export <situace.json> --vztahy <vztahy.json> --pozice <pozice.json> [--show-names]
 */
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { PalmsError, assertOutsideRepo } from "../lib/attendance/palms";
import { findMissingRefs } from "../lib/situations/export";

const MAX_BYTES = 4 * 1024 * 1024;

interface Args {
  export: string | null;
  vztahy: string | null;
  pozice: string | null;
  showNames: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { export: null, vztahy: null, pozice: null, showNames: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--export") a.export = argv[++i] ?? null;
    else if (k === "--vztahy") a.vztahy = argv[++i] ?? null;
    else if (k === "--pozice") a.pozice = argv[++i] ?? null;
    else if (k === "--show-names") a.showNames = true;
    else if (k === "--help" || k === "-h") a.help = true;
    else throw new Error(`Neznámý argument ${k}.`);
  }
  return a;
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

function readJsonOutsideRepo(file: string, what: string): unknown {
  const roots = repoRoots();
  assertOutsideRepo(file, roots);
  let real: string;
  try {
    real = realpathSync(file);
  } catch {
    throw new Error(`${what} nejde otevřít.`);
  }
  assertOutsideRepo(real, roots);
  const st = statSync(real);
  if (!st.isFile()) throw new Error(`${what} není soubor.`);
  if (st.size > MAX_BYTES) throw new Error(`${what} je příliš velký.`);
  try {
    return JSON.parse(readFileSync(real, "utf-8"));
  } catch {
    throw new Error(`${what} není platný JSON.`);
  }
}

const HELP = `Kontrola exportu klientských situací (iter-049).

  npx tsx scripts/check-iter-049-export.ts --export <situace.json> --vztahy <vztahy.json> --pozice <pozice.json> [--show-names]

  Všechny cesty MUSÍ ležet mimo repozitář. Skript nic nezapisuje.
  --show-names   vypíše i id situací a jména (jen lokálně), jinak jen počty
`;

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.export || !args.vztahy || !args.pozice) throw new Error("Chybí --export, --vztahy nebo --pozice.");

  const exp = readJsonOutsideRepo(args.export, "Export");
  const vztahy = readJsonOutsideRepo(args.vztahy, "vztahy.json");
  const pozice = readJsonOutsideRepo(args.pozice, "pozice.json");
  const missing = findMissingRefs(exp, vztahy, pozice);

  console.log(`Chybějící id situací: ${missing.situationIds.length}`);
  console.log(`Chybějící jména členů: ${missing.memberNames.length}`);
  if (args.showNames) {
    for (const id of missing.situationIds) console.log(`  situace: ${id}`);
    for (const n of missing.memberNames) console.log(`  člen: ${n}`);
  }
  if (missing.situationIds.length + missing.memberNames.length > 0) {
    console.error("Export nepokrývá všechny odkazy z mapy, assemble.sh nespouštět.");
    process.exit(1);
  }
  console.log("Všechny odkazy z vztahy.json a pozice.json mají v exportu cíl.");
}

try {
  main();
} catch (e) {
  console.error(e instanceof PalmsError || e instanceof Error ? e.message : "Neočekávaná chyba.");
  process.exit(1);
}
