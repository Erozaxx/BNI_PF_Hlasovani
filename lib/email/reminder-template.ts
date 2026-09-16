/**
 * Text připomínkového mailu (iter-028, T-006, arch iter-028 T-001, sekce
 * 4.6, 8.1, D5 A). Doslovné znění varianty C (s odkazem — D4 C, doporučeno):
 * tykání, diakritika, bez vykřičníků a dlouhých pomlček. Liší se od mailu
 * s odkazem (`sendMeetingMagicLinkEmail`), který vyká a je bez diakritiky —
 * to je vědomý rozdíl podle D5, ne nesrovnalost.
 *
 * Čistý modul bez DB: žádný import next/server, next/cache, drizzle-orm,
 * @/lib/db/* ani resend. Odesílání dělá `lib/email/resend.ts`
 * (`sendVotingReminderEmail`), tenhle modul jen skládá `subject`/`html`. Jde
 * spustit v holém Node (tsx) bez DATABASE_URL — viz
 * scripts/test-reminder-template.ts. `./voting-window` a
 * `../meetings/reminder-plan` jsou taky čisté moduly.
 */
import { todayInPrague, weekdayInPrague } from "../meetings/voting-window";
import { reminderRoundFor, type ReminderRound } from "../meetings/reminder-plan";

function formatDMFromIso(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}.`;
}

function formatPragueTime(date: Date): string {
  return date.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Prague",
  });
}

/** Den v týdnu s předložkou, dative (4.6: "ve středu", "v pondělí", ...). */
const CLOSES_DAY_PREPOSITION: Record<string, string> = {
  Sunday: "v neděli",
  Monday: "v pondělí",
  Tuesday: "v úterý",
  Wednesday: "ve středu",
  Thursday: "ve čtvrtek",
  Friday: "v pátek",
  Saturday: "v sobotu",
};

function closesDayLabel(votingClosesAt: Date): string {
  const weekday = weekdayInPrague(votingClosesAt);
  const preposition = CLOSES_DAY_PREPOSITION[weekday] ?? `v ${weekday}`;
  return `${preposition} ${formatDMFromIso(todayInPrague(votingClosesAt))}`;
}

/**
 * Věta o uzávěrce (4.6): kolo 3 (den uzávěrky) nahrazuje třetí odstavec
 * "Hlasování končí dnes ve {čas}.", ostatní kola "Hlasování končí {den
 * s předložkou} {D. M.} ve {čas}." Čas vždy Europe/Prague, i přes DST hranici
 * (T2).
 */
function closingLine(round: ReminderRound, votingClosesAt: Date): string {
  const time = formatPragueTime(votingClosesAt);
  if (round === 3) {
    return `Hlasování končí dnes ve ${time}.`;
  }
  return `Hlasování končí ${closesDayLabel(votingClosesAt)} ve ${time}.`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export interface ReminderEmailInput {
  meetingDate: string; // "YYYY-MM-DD" — datum schůzky, ne uzávěrky
  votingClosesAt: Date;
  now: Date;
  /**
   * Odkaz z připomínky (D4 C — vlastní, nerotující alias). `null` je jen
   * defenzivní/variant-B fallback (4.6 "Tělo, varianta B") — v provozu D4 C
   * vždy generuje token PŘED voláním týhle funkce (arch 4.4 krok b), takže
   * tahle větev se v provozu prakticky nepoužije.
   */
  magicUrl: string | null;
  /** Datum schůzky ve tvaru, v jakém ho nese předmět PŮVODNÍHO mailu s odkazem (ISO, sendMeetingMagicLinkEmail). Použije se jen ve variantě B. */
  originalSubjectDate: string;
}

/**
 * Sestaví předmět a HTML tělo připomínky. Round se odvozuje interně ze
 * stejné dvojice `votingClosesAt`/`now`, kterou používá `reminderRoundFor`
 * (`planReminders` volá tutéž funkci se stejnými vstupy) — žádný zvláštní
 * `round` parametr navíc, jedno místo pravdy. Fallback na kolo 3, kdyby
 * volající (chybou) zavolal mimo den kola, je jen obranný — v provozu
 * `reminder-run.ts` volá tuhle funkci jen pro řádky z `planReminders`
 * s `run:true`, tedy se stejným `now` a platným kolem.
 */
export function buildReminderEmail(i: ReminderEmailInput): { subject: string; html: string } {
  const { meetingDate, votingClosesAt, now, magicUrl, originalSubjectDate } = i;
  const round = reminderRoundFor(votingClosesAt, now) ?? 3;

  const meetingDateLabel = formatDMFromIso(meetingDate);
  const subject = `BNI Hlasovani - Nezapomeň prosím odhlasovat (schůzka ${meetingDateLabel})`;

  const linkBlock = magicUrl
    ? `<div style="text-align:center;margin:24px 0;">
    <a href="${escapeHtml(magicUrl)}" style="display:inline-block;padding:12px 32px;background:#cf2e2e;color:#fff;text-decoration:none;border-radius:30px;font-weight:600;">Přejít na hlasování</a>
  </div>
  <p style="color:#666;font-size:13px;">Odkaz je osobní, nepřeposílej ho prosím. Funguje stejně jako ten z původního mailu.</p>`
    : `<p>Odkaz najdeš v mailu s předmětem „BNI Hlasovani - Odkaz pro hlasovani (${escapeHtml(originalSubjectDate)})". Když ho ve schránce nevidíš, podívej se prosím i do spamu.</p>`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#1a1a1a;">
  <div style="text-align:center;padding:16px 0;border-bottom:3px solid #cf2e2e;margin-bottom:24px;">
    <h1 style="margin:0;color:#cf2e2e;font-size:20px;">BNI Hlasovani</h1>
  </div>
  <p>Ahoj,</p>
  <p>k hostům ze schůzky ${meetingDateLabel} od tebe zatím nemáme žádný hlas. Nezapomeň prosím odhlasovat.</p>
  <p>${closingLine(round, votingClosesAt)}</p>
  ${linkBlock}
  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #E8E8E8;">
    <p style="color:#999;font-size:12px;">Připomínku posíláme jen těm, kdo zatím nehlasovali. Jakmile dáš aspoň jeden hlas, další už nepřijde.</p>
  </div>
</body>
</html>`;

  return { subject, html };
}
