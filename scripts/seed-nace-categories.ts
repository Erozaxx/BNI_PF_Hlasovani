/**
 * Seed CZ-NACE categories into the category table.
 * Skips categories that already exist (by name).
 *
 * Run: npx tsx scripts/seed-nace-categories.ts
 */

import * as dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(databaseUrl);

const NACE_CATEGORIES = [
  "Rostlinná a živočišná výroba, myslivost a související činnosti",
  "Lesnictví a těžba dřeva",
  "Rybolov a akvakultura",
  "Těžba černého a hnědého uhlí",
  "Těžba ropy a zemního plynu",
  "Těžba a úprava rud",
  "Ostatní těžba a dobývání",
  "Podpůrné činnosti při těžbě",
  "Výroba potravinářských výrobků",
  "Výroba nápojů",
  "Výroba tabákových výrobků",
  "Výroba textilií",
  "Výroba oděvů",
  "Výroba usní a souvisejících výrobků",
  "Zpracování dřeva a výroba dřevěných a korkových výrobků kromě nábytku",
  "Výroba papíru a výrobků z papíru",
  "Tisk a rozmnožování nahraných nosičů",
  "Výroba koksu a rafinovaných ropných produktů",
  "Výroba chemických látek a přípravků",
  "Výroba základních farmaceutických výrobků a přípravků",
  "Výroba pryžových a plastových výrobků",
  "Výroba ostatních nekovových minerálních výrobků",
  "Výroba základních kovů",
  "Výroba kovových konstrukcí a kovodělných výrobků kromě strojů a zařízení",
  "Výroba počítačů elektronických a optických přístrojů a zařízení",
  "Výroba elektrických zařízení",
  "Výroba strojů a zařízení",
  "Výroba motorových vozidel přívěsů a návěsů",
  "Výroba ostatních dopravních prostředků a zařízení",
  "Výroba nábytku",
  "Ostatní zpracovatelský průmysl",
  "Opravy a instalace strojů a zařízení",
  "Výroba a rozvod elektřiny plynu tepla a klimatizovaného vzduchu",
  "Shromažďování úprava a rozvod vody",
  "Odvádění a čištění odpadních vod",
  "Shromažďování sběr a odstraňování odpadů a úprava odpadů k dalšímu využití",
  "Sanace a jiné činnosti v oblasti nakládání s odpady",
  "Výstavba budov",
  "Inženýrské stavitelství",
  "Specializované stavební činnosti",
  "Velkoobchod a maloobchod s motorovými vozidly a jejich opravy",
  "Velkoobchod kromě motorových vozidel",
  "Maloobchod kromě motorových vozidel",
  "Pozemní doprava a potrubní doprava",
  "Vodní doprava",
  "Letecká doprava",
  "Skladování a vedlejší činnosti v dopravě",
  "Poštovní a kurýrní činnosti",
  "Ubytování",
  "Stravování a pohostinství",
  "Vydavatelské činnosti",
  "Výroba filmů videozáznamů a televizních programů a pořizování zvukových nahrávek",
  "Tvorba programů a vysílání",
  "Telekomunikační činnosti",
  "Činnosti v oblasti informačních technologií",
  "Informační činnosti",
  "Finanční zprostředkování kromě pojišťovnictví a penzijního financování",
  "Pojišťovnictví zajišťovnictví a penzijní financování",
  "Pomocné činnosti související s finančními službami a pojišťovnictvím",
  "Činnosti v oblasti nemovitostí",
  "Právní a účetnické činnosti",
  "Činnosti vedení podniků a poradenství v oblasti řízení",
  "Architektonické a inženýrské činnosti a technické zkoušení a analýzy",
  "Výzkum a vývoj",
  "Reklama a průzkum trhu",
  "Ostatní profesní vědecké a technické činnosti",
  "Veterinární činnosti",
  "Činnosti v oblasti pronájmu a operativního leasingu",
  "Činnosti související se zaměstnáváním",
  "Činnosti cestovních agentur a kanceláří",
  "Bezpečnostní a pátrací činnosti",
  "Činnosti související se stavbami a úpravou krajiny",
  "Administrativní kancelářské a jiné podpůrné činnosti pro podnikání",
  "Veřejná správa a obrana a povinné sociální zabezpečení",
  "Vzdělávání",
  "Zdravotní péče",
  "Pobytové služby sociální péče",
  "Ambulantní nebo terénní sociální služby",
  "Tvůrčí umělecké a zábavní činnosti",
  "Činnosti knihoven archivů muzeí a jiných kulturních zařízení",
  "Činnosti heren a sázkových kanceláří",
  "Sportovní zábavní a rekreační činnosti",
  "Činnosti organizací sdružujících osoby za účelem prosazování společných zájmů",
  "Opravy počítačů a výrobků pro osobní potřebu a převážně pro domácnost",
  "Ostatní osobní činnosti",
  "Činnosti domácností jako zaměstnavatelů domácího personálu",
  "Činnosti domácností produkujících blíže neurčené výrobky a služby pro vlastní potřebu",
  "Činnosti exteritoriálních organizací a orgánů",
];

async function seed() {
  console.log(`Seeding ${NACE_CATEGORIES.length} CZ-NACE categories...`);

  let inserted = 0;
  let skipped = 0;

  for (const name of NACE_CATEGORIES) {
    const existing = await sql`SELECT id FROM category WHERE name = ${name} LIMIT 1`;
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    await sql`INSERT INTO category (id, name, created_at) VALUES (gen_random_uuid(), ${name}, NOW())`;
    inserted++;
  }

  console.log(`Done: ${inserted} inserted, ${skipped} skipped (already existed).`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
