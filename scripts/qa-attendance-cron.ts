/**
 * iter-038 (T-003d, arch 11.3): QA obal nad jádrem cronu docházky. Zavolá
 * `runAttendanceCron(now, deps)` se zadaným časem proti QA větvi Neonu. Produkční
 * route čas přepsat nejde, proto tenhle skript existuje.
 *
 * Pojistky (LL-010, LL-012, LL-019), všechny PŘED prvním dotazem:
 *  - načítá VÝHRADNĚ `.env.qa` (nikdy `.env.local`),
 *  - `QA_HOST_FRAGMENT` (tvar `ep-...`, bez `-pooler`) musí být v `DATABASE_URL`
 *    (i `DATABASE_URL_UNPOOLED`), host nesmí obsahovat `raspy-sound` (produkce),
 *  - `RESEND_API_KEY` nesmí být nastavený (druhá pojistka proti ostrému mailu),
 *  - pošta se jen vypíše do konzole (předmět, příjemce podle `memberId`, text s
 *    odkazem pro QA), nic se neodesílá.
 *
 * Spuštění z kořene repa:
 *   npx tsx scripts/qa-attendance-cron.ts --now 2026-10-22T04:10:00Z
 * (léto: 4:10Z = 6:10 ráno, 15:10Z = 17:10 večer; zima: 5:10Z a 16:10Z)
 */
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.qa" });

const FORBIDDEN_HOST_FRAGMENT = "raspy-sound";
const FRAGMENT = (process.env.QA_HOST_FRAGMENT ?? "").trim();

function fatal(msg: string): never {
  console.error(`FATAL: ${msg} STOP, nic se nespustilo.`);
  process.exit(1);
}

function assertQaHost(varName: string): void {
  const value = process.env[varName];
  if (!value) fatal(`${varName} není nastaveno. Byl načten .env.qa? (spouštět z kořene repa)`);
  if (value.includes(FORBIDDEN_HOST_FRAGMENT)) fatal(`${varName} obsahuje '${FORBIDDEN_HOST_FRAGMENT}', to je PRODUKCE.`);
  if (!value.includes(FRAGMENT)) fatal(`${varName} neobsahuje očekávaný QA host '${FRAGMENT}'.`);
}

if (!FRAGMENT) fatal("QA_HOST_FRAGMENT není nastaveno v .env.qa.");
if (!/^ep-[a-z0-9]+(-[a-z0-9]+)+$/.test(FRAGMENT) || FRAGMENT.endsWith("-pooler")) {
  fatal("QA_HOST_FRAGMENT nemá tvar ep-<slovo>-<slovo>-<id> bez přípony -pooler.");
}
if (FRAGMENT.includes(FORBIDDEN_HOST_FRAGMENT)) fatal(`QA_HOST_FRAGMENT obsahuje '${FORBIDDEN_HOST_FRAGMENT}', to je PRODUKCE.`);
assertQaHost("DATABASE_URL");
if (process.env.DATABASE_URL_UNPOOLED) assertQaHost("DATABASE_URL_UNPOOLED");
if (process.env.RESEND_API_KEY) fatal("RESEND_API_KEY je nastavený (LL-010: v QA nesmí být).");

const nowArg = process.argv.indexOf("--now");
const nowRaw = nowArg >= 0 ? process.argv[nowArg + 1] : undefined;
if (!nowRaw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/.test(nowRaw)) {
  fatal("chybí --now <ISO čas v UTC>, např. --now 2026-10-22T04:10:00Z.");
}
const now = new Date(nowRaw);
if (Number.isNaN(now.getTime())) fatal(`neplatný čas ${nowRaw}.`);

async function main() {
  // Dynamický import až po pojistkách: žádný modul s DB se nenačte dřív.
  const { runAttendanceCron } = await import("../lib/attendance/cron");
  const printMail = (kind: string) => async (o: { memberId: string; to: string; mail: { subject: string; text: string } }) => {
    console.log(`\n--- ${kind} (jen výpis, neodesláno) memberId=${o.memberId}\nPředmět: ${o.mail.subject}\n${o.mail.text}\n---`);
    return { success: true, resendId: `qa-${kind}-${Date.now()}` };
  };
  console.log(`[qa-attendance-cron] now=${now.toISOString()} host OK (${FRAGMENT})`);
  const result = await runAttendanceCron(now, {
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100",
    pauseMs: 0,
    sendLink: printMail("odkaz"),
    sendReport: printMail("report"),
  });
  console.log("\n[qa-attendance-cron] výsledek:", JSON.stringify(result, null, 2));
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`FATAL: běh selhal (${err instanceof Error ? err.name : typeof err}).`);
    process.exit(1);
  }
);
