/**
 * iter-038 (T-003c, arch 10.4, 15.4, gate sekce 5): texty ranního mailu správci
 * a reportu docházky v 17:00. Čisté funkce, žádné I/O. Znění je doslova z gate;
 * kde gate dává vzor a ne větu (prázdné kategorie, souběh záchrany a „nezapsáno“),
 * je to uvedeno u funkce.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend.
 * Jména náhradníků píše člen, proto se v HTML escapují včetně apostrofu.
 */

import { formatCzDate } from "@/lib/members/activity";
import { formatPragueTime } from "@/lib/attendance/sheet";
import { ABSENCE_LIMIT, formatWeekdayDM, formatWeekdayFull, weekdayIndex } from "@/lib/attendance/rules";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

const WEEKDAY_LOCATIVE = [
  "v neděli",
  "v pondělí",
  "v úterý",
  "ve středu",
  "ve čtvrtek",
  "v pátek",
  "v sobotu",
] as const;

const WEEKDAY_NOMINATIVE = [
  "neděle",
  "pondělí",
  "úterý",
  "středa",
  "čtvrtek",
  "pátek",
  "sobota",
] as const;

const ORANGE = "#c2410c";

// ── Ranní mail správci ───────────────────────────────────────

export interface MorningMailInput {
  name: string;
  /** Den schůzky (`YYYY-MM-DD`), vždy dnešek. */
  date: string;
  /** Konec platnosti odkazu. */
  expiresAt: Date;
  /** Kolik členů se předem omluvilo a kolik z nich s náhradníkem. */
  excused: number;
  withSubstitute: number;
  url: string;
}

export interface BuiltMail {
  subject: string;
  text: string;
  html: string;
}

/** Třetí řádek ranního mailu: „Předem se omluvili: 3, z toho 1 s náhradníkem.“ */
export function morningExcusedLine(excused: number, withSubstitute: number): string {
  if (excused <= 0) return "Předem se nikdo neomluvil.";
  if (withSubstitute <= 0) return `Předem se omluvili: ${excused}.`;
  return `Předem se omluvili: ${excused}, z toho ${withSubstitute} s náhradníkem.`;
}

export function morningSubject(date: string): string {
  return `BNI Plzeň: docházka dnes, ${formatWeekdayDM(date)}`;
}

export const MORNING_BUTTON = "Otevřít docházku";
export const MORNING_FOOTER = "Odkaz nikomu nepřeposílej. Kdo ho má, může dnešní docházku měnit.";

export function buildMorningMail(input: MorningMailInput): BuiltMail {
  const until = formatPragueTime(input.expiresAt.toISOString());
  const lines = [
    `Ahoj ${input.name},`,
    "dnes je schůzka. Docházku odškrtáš přes tenhle odkaz, bez přihlašování.",
    `Odkaz platí do ${until} a jen pro dnešní docházku.`,
    morningExcusedLine(input.excused, input.withSubstitute),
  ];
  const text = [...lines, "", `${MORNING_BUTTON}: ${input.url}`, "", MORNING_FOOTER].join("\n");
  const html = mailShell({
    blocks: lines.map((l) => `<p style="margin:0 0 12px;">${escapeHtml(l)}</p>`),
    buttonLabel: MORNING_BUTTON,
    url: input.url,
    footer: [MORNING_FOOTER],
  });
  return { subject: morningSubject(input.date), text, html };
}

// ── Report v 17:00 ───────────────────────────────────────────

export type ReportStatus = "present" | "substitute" | "absent";

export interface ReportMember {
  name: string;
  status: ReportStatus;
  substituteName: string | null;
  /** Člen měl na den ohlášenou nepřítomnost. */
  excused: boolean;
  /** Ohlášení bylo s náhradníkem (jméno v `announcedName`). */
  announcedSubstitute: boolean;
  /** Pořadí absence v okně 6 měsíců včetně tohoto dne, `null` když to není absence. */
  ordinal: number | null;
}

export interface ReportData {
  date: string;
  /** Schůzka v aplikaci na ten den existuje. */
  hasMeeting: boolean;
  mode: "recorded" | "unrecorded";
  /** Záchrana další den ráno. */
  late: boolean;
  /** Všechny řádky dne po doplnění uzávěrky. */
  members: ReportMember[];
  /** Jména správců, kteří zapisovali (bez duplicit). */
  writers: string[];
  /** ISO čas poslední změny zapsané správcem, `null` bez zápisu. */
  lastChange: string | null;
}

export interface ReportInput {
  data: ReportData;
  recipientName: string;
  url: string;
}

export interface ReportCounts {
  total: number;
  present: number;
  viaSubstitute: number;
  missing: number;
  excused: number;
  unexcused: number;
}

export function reportCounts(members: readonly ReportMember[]): ReportCounts {
  let present = 0;
  let viaSubstitute = 0;
  let excused = 0;
  let unexcused = 0;
  for (const m of members) {
    if (m.status === "present") present++;
    else if (m.status === "substitute") {
      present++;
      viaSubstitute++;
    } else if (m.excused) excused++;
    else unexcused++;
  }
  return {
    total: members.length,
    present,
    viaSubstitute,
    missing: excused + unexcused,
    excused,
    unexcused,
  };
}

export function reportSubject(data: ReportData): string {
  const base = `BNI Plzeň: docházka ${formatWeekdayFull(data.date)}`;
  const tail =
    data.mode === "unrecorded"
      ? " (nezapsáno)"
      : (() => {
          const c = reportCounts(data.members);
          return ` (přítomno ${c.present} z ${c.total})`;
        })();
  return `${base}${tail}${data.late ? " (opožděně)" : ""}`;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, "cs");
}

/** „(3. absence za 6 měsíců)“, prázdný řetězec bez pořadí. */
export function ordinalText(ordinal: number | null): string {
  return ordinal === null ? "" : `${ordinal}. absence za 6 měsíců`;
}

interface ReportLine {
  text: string;
  html: string;
}

function plainLine(text: string): ReportLine {
  return { text, html: escapeHtml(text) };
}

/** Jméno a pořadí absence: od 3 oranžově (K9), v textové části beze změny barvy. */
function absenceLine(m: ReportMember, suffix = ""): ReportLine {
  const ord = ordinalText(m.ordinal);
  const text = `${m.name}${ord ? ` (${ord})` : ""}${suffix}`;
  const warn = m.ordinal !== null && m.ordinal >= ABSENCE_LIMIT;
  const ordHtml = ord
    ? warn
      ? ` <span style="color:${ORANGE};font-weight:600;">(${escapeHtml(ord)})</span>`
      : ` (${escapeHtml(ord)})`
    : "";
  return { text, html: `${escapeHtml(m.name)}${ordHtml}${escapeHtml(suffix)}` };
}

interface ReportSection {
  title: string;
  lines: ReportLine[];
}

function sectionsOf(members: readonly ReportMember[]): ReportSection[] {
  const sorted = [...members].sort(byName);
  const present = sorted.filter((m) => m.status === "present");
  const subs = sorted.filter((m) => m.status === "substitute");
  const excusedAbsent = sorted.filter((m) => m.status === "absent" && m.excused);
  const unexcused = sorted.filter((m) => m.status === "absent" && !m.excused);
  const all: ReportSection[] = [
    { title: "Přítomní", lines: present.map((m) => plainLine(m.name)) },
    {
      title: "Přišel náhradník",
      lines: subs.map((m) => plainLine(`${m.name}: náhradník ${m.substituteName ?? ""}`.trim())),
    },
    {
      title: "Omluvení",
      lines: excusedAbsent.map((m) =>
        m.announcedSubstitute ? plainLine(`${m.name}, ohlášený náhradník nepřišel`) : absenceLine(m)
      ),
    },
    { title: "Bez omluvy", lines: unexcused.map((m) => absenceLine(m)) },
  ];
  // Prázdná kategorie se v reportu vynechá (gate).
  return all.filter((s) => s.lines.length > 0);
}

export const REPORT_BUTTON = "Otevřít docházku";
export const REPORT_FOOTER_NOTE =
  "Pozdější opravy se do reportu nedostanou. Aktuální stav je v aplikaci v menu Docházka.";

/** Tvar „omluvený“ podle počtu: 1 omluvený, 2 až 4 omluvení, 5 a víc omluvených. */
export function excusedWord(n: number): string {
  if (n === 1) return "omluvený";
  if (n >= 2 && n <= 4) return "omluvení";
  return "omluvených";
}

/** Úvodní věty reportu (bez pozdravu), pro oba režimy. */
function introLines(data: ReportData): string[] {
  const where = data.hasMeeting
    ? `docházka ze schůzky ${WEEKDAY_LOCATIVE[weekdayIndex(data.date)]} ${formatCzDate(data.date)}.`
    : `docházka ze dne ${WEEKDAY_NOMINATIVE[weekdayIndex(data.date)]} ${formatCzDate(data.date)}.`;
  if (data.mode === "unrecorded") {
    const when = data.late ? formatCzDate(data.date) : "dnes";
    const excusedCount = data.members.length;
    return [
      where,
      excusedCount > 0
        ? `Docházku ${when} nikdo nezapsal. Předem se omluvili:`
        : `Docházku ${when} nikdo nezapsal. Předem se nikdo neomluvil.`,
    ];
  }
  const c = reportCounts(data.members);
  const viaPart = c.viaSubstitute > 0 ? `, z toho ${c.viaSubstitute} přes náhradníka` : "";
  const missPart = (() => {
    if (c.missing <= 0) return "";
    const parts: string[] = [];
    if (c.excused > 0) parts.push(`${c.excused} ${excusedWord(c.excused)}`);
    if (c.unexcused > 0) parts.push(`${c.unexcused} bez omluvy`);
    return ` Chybí ${c.missing}: ${parts.join(", ")}.`;
  })();
  return [where, `Přítomno ${c.present} z ${c.total}${viaPart}.${missPart}`];
}

/** Řádek „Zapisovali: …“ nebo `null`, když nikdo nezapisoval. */
export function writersLine(data: ReportData): string | null {
  if (data.writers.length === 0) return null;
  const names = [...data.writers].sort((a, b) => a.localeCompare(b, "cs")).join(", ");
  const last = data.lastChange ? ` Poslední změna v ${formatPragueTime(data.lastChange)}.` : "";
  return `Zapisovali: ${names}.${last}`;
}

export function buildAttendanceReport(input: ReportInput): BuiltMail {
  const { data } = input;
  const intro = introLines(data);

  // V režimu „nezapsáno“ jsou řádky jen omluvení a náhradníci, bez nadpisů kategorií.
  const sections: ReportSection[] =
    data.mode === "unrecorded"
      ? [
          {
            title: "",
            lines: [...data.members].sort(byName).map((m) =>
              m.status === "substitute"
                ? plainLine(`${m.name}: náhradník ${m.substituteName ?? ""}`.trim())
                : absenceLine(m)
            ),
          },
        ].filter((s) => s.lines.length > 0)
      : sectionsOf(data.members);

  const writers = data.mode === "recorded" ? writersLine(data) : null;

  const textParts: string[] = [`Ahoj ${input.recipientName},`, ...intro];
  for (const s of sections) {
    textParts.push("");
    if (s.title) textParts.push(`${s.title} (${s.lines.length})`);
    for (const l of s.lines) textParts.push(`  ${l.text}`);
  }
  if (data.mode === "unrecorded") {
    textParts.push("", "Ostatní se počítají jako přítomní.");
  }
  textParts.push("");
  if (writers) textParts.push(writers);
  textParts.push(REPORT_FOOTER_NOTE, "", `${REPORT_BUTTON}: ${input.url}`);

  const blocks: string[] = [`<p style="margin:0 0 12px;">${escapeHtml(`Ahoj ${input.recipientName},`)}</p>`];
  for (const l of intro) blocks.push(`<p style="margin:0 0 12px;">${escapeHtml(l)}</p>`);
  for (const s of sections) {
    if (s.title) {
      blocks.push(
        `<h3 style="margin:16px 0 6px;font-size:14px;color:#1a1a1a;">${escapeHtml(s.title)} (${s.lines.length})</h3>`
      );
    }
    blocks.push(
      `<ul style="margin:0 0 8px;padding-left:20px;font-size:14px;">${s.lines
        .map((l) => `<li style="margin-bottom:2px;">${l.html}</li>`)
        .join("")}</ul>`
    );
  }
  if (data.mode === "unrecorded") {
    blocks.push(`<p style="margin:12px 0;">${escapeHtml("Ostatní se počítají jako přítomní.")}</p>`);
  }
  const footer: string[] = [];
  if (writers) footer.push(writers);
  footer.push(REPORT_FOOTER_NOTE);

  return {
    subject: reportSubject(data),
    text: textParts.join("\n"),
    html: mailShell({ blocks, buttonLabel: REPORT_BUTTON, url: input.url, footer }),
  };
}

// ── Společný obal ────────────────────────────────────────────

/** HTML obal ve stylu ostatních mailů aplikace (`accessEmailHtml`), `blocks` jsou už escapované. */
export function mailShell(opts: {
  blocks: string[];
  buttonLabel: string;
  url: string;
  footer: string[];
}): string {
  const footer = opts.footer
    .map((p) => `<p style="color:#666;font-size:13px;margin:0 0 8px;">${escapeHtml(p)}</p>`)
    .join("\n  ");
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1a1a1a;">
  <div style="text-align:center;padding:16px 0;border-bottom:3px solid #cf2e2e;margin-bottom:24px;">
    <h1 style="margin:0;color:#cf2e2e;font-size:20px;">BNI Plzeň</h1>
  </div>
  ${opts.blocks.join("\n  ")}
  <div style="text-align:center;margin:24px 0;">
    <a href="${escapeHtml(opts.url)}" style="display:inline-block;padding:12px 32px;background:#cf2e2e;color:#fff;text-decoration:none;border-radius:30px;font-weight:600;">${escapeHtml(opts.buttonLabel)}</a>
  </div>
  <p style="color:#666;font-size:13px;margin:0 0 16px;word-break:break-all;">Když tlačítko nefunguje, zkopíruj si do prohlížeče tenhle odkaz:<br>${escapeHtml(opts.url)}</p>
  ${footer}
</body>
</html>`;
}
