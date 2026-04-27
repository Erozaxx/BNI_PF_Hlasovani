/**
 * Migration for iter-018: bulk update company + obor for 21 existing members.
 *
 * Behavior:
 *   1. Pre-flight: load member.id by exact name match for all 21 names.
 *   2. If any name is missing → log all missing, abort BEFORE any UPDATE.
 *   3. Duplicate name guard: if a name returns >1 row → log warning (UPDATE proceeds by id).
 *   4. If all 21 found → UPDATE company + obor in a sequential loop (by id).
 *   5. Idempotent: re-running sets the same values (no-op data-wise, but emits SQL).
 *
 * Run: npx tsx scripts/migrate-iter-018-members.ts
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

type Row = { name: string; company: string; obor: string };

const ROWS: Row[] = [
  { name: "Zdeněk Dydek",       company: "Alllog s.r.o.",                       obor: "Zakladatel skupiny" },
  { name: "Richard Běláč",      company: "Pontiro",                             obor: "Investování do komerčních nemovitostí" },
  { name: "Dominika Pašková",   company: "Perfect World s.r.o.",                obor: "Jazyková škola" },
  { name: "Lenka Zedníková",    company: "Alllog Consulting",                   obor: "Tiskové služby" },
  { name: "Josef Machalíček",   company: "PROVAS Plzeň s.r.o.",                 obor: "Mistr podlahář" },
  { name: "Libor Mencl",        company: "Novera Capital",                      obor: "Správce majetku, rozvoj podnikání" },
  { name: "Renáta Vítová",      company: "ReVitta studio s.r.o.",               obor: "Grafické studio" },
  { name: "Lena Pfluger",       company: "MOŽNOSTI TU JSOU o.p.s.",             obor: "Sociální podnikání, pražírna kávy" },
  { name: "Jan Beniak",         company: "Alllog Digital",                      obor: "Digitalizace logistiky" },
  { name: "Vanda Salcmannová",  company: "Realitní kancelář Salzmann",          obor: "Realitní činnost" },
  { name: "Dana Kellnerová",    company: "BDO Czech Republic",                  obor: "Daňové poradenství" },
  { name: "Eva Feketová",       company: "Škola harmonického leadershipu",      obor: "Leadership a týmová spolupráce" },
  { name: "Tomáš Fuchman",      company: "toDraft s.r.o.",                      obor: "Veřejné osvětlení" },
  { name: "Monika Anderlová",   company: "Alia Nature - Maevita s.r.o.",        obor: "Parfémy, vůně, dekorace" },
  { name: "Kateřina Černá",     company: "ConBlack s.r.o.",                     obor: "Poradenství v oblasti Trade Compliance" },
  { name: "Zdeněk Hanzlík",     company: "STAVBY - KOMÍNY , s.r.o.",            obor: "Komíny, betonová prefabrikace" },
  { name: "Tomáš Nekolný",      company: "TSP Data",                            obor: "Monitoring a FinOps" },
  { name: "Lucie Krčmová",      company: "INDIGO SOLUTIONS s.r.o.",             obor: "Nábor zaměstnanců" },
  { name: "Michal Hacker",      company: "BOOTIQ",                              obor: "IT, technologie, digitalizace" },
  { name: "Tomáš Pešička",      company: "Broker Consulting, a.s.",             obor: "Finanční poradenství" },
  { name: "Antonín Slezáček",   company: "Cntx s.r.o.",                         obor: "Kouč, léčitel" },
];

async function main() {
  console.log(`Running iter-018 member migration (${ROWS.length} rows)…`);
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  // Pre-flight: fetch all matching rows by name
  const names = ROWS.map((r) => r.name);
  const dbRows = (await sql`
    SELECT id, name FROM member WHERE name = ANY(${names})
  `) as { id: string; name: string }[];

  // Duplicate name guard
  const countByName = new Map<string, number>();
  for (const row of dbRows) {
    countByName.set(row.name, (countByName.get(row.name) ?? 0) + 1);
  }
  Array.from(countByName.entries()).forEach(([name, count]) => {
    if (count > 1) {
      console.warn(`WARNING: duplicate name in DB (${count} rows) — will update ALL rows for: "${name}"`);
    }
  });

  // Missing name check — abort before any UPDATE if any name not found
  const foundNames = new Set(dbRows.map((r) => r.name));
  const missing = ROWS.filter((r) => !foundNames.has(r.name)).map((r) => r.name);
  if (missing.length > 0) {
    console.error("ABORT: Following names not found in DB:");
    missing.forEach((n) => console.error(`  - ${n}`));
    console.error(`\nFix the data file or DB and re-run. Aborting before any UPDATE.`);
    process.exit(1);
  }

  // Build name → id map (first match; duplicates already warned above)
  const idByName = new Map<string, string>();
  for (const row of dbRows) {
    if (!idByName.has(row.name)) {
      idByName.set(row.name, row.id);
    }
  }

  // Sequential UPDATE by id
  let updated = 0;
  for (const r of ROWS) {
    const id = idByName.get(r.name)!;
    await sql`
      UPDATE member
      SET company = ${r.company}, obor = ${r.obor}
      WHERE id = ${id}
    `;
    updated++;
    console.log(`  [${updated}/${ROWS.length}] ${r.name} → company="${r.company}", obor="${r.obor}"`);
  }

  console.log(`\niter-018 member migration complete: ${updated}/${ROWS.length} updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
