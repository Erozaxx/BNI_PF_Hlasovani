import { Resend } from "resend";
import type { BuiltMail } from "@/lib/attendance/report";

/**
 * iter-038 (T-003c, arch 9, 10, 15.4): odeslání ranního odkazu a reportu
 * docházky přes Resend. Klient se vytváří až při prvním odeslání (líná
 * inicializace), takže import modulu bez `RESEND_API_KEY` nespadne a lokální
 * běh je fail-safe: bez klíče se nic neodešle a vrátí se chyba.
 *
 * Logování: jen `memberId` a třída chyby, nikdy adresa, odkaz ani token. Texty
 * a HTML staví čisté funkce v lib/attendance/report.ts.
 */

export type AttendanceMailResult = { success: boolean; resendId?: string; error?: string };

let client: Resend | null = null;

function getClient(apiKey: string): Resend {
  if (!client) client = new Resend(apiKey);
  return client;
}

async function sendBuiltMail(opts: {
  logTag: string;
  memberId: string;
  to: string;
  mail: BuiltMail;
}): Promise<AttendanceMailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(`[${opts.logTag}] RESEND_API_KEY chybí memberId=${opts.memberId}`);
    return { success: false, error: "RESEND_API_KEY chybí" };
  }
  try {
    const { data, error } = await getClient(apiKey).emails.send({
      from: `BNI Plzeň <${process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev"}>`,
      to: [opts.to],
      subject: opts.mail.subject,
      html: opts.mail.html,
      text: opts.mail.text,
    });
    if (error) {
      console.error(`[${opts.logTag}] resend error memberId=${opts.memberId}: ${error.name}`);
      return { success: false, error: "Mail se nepodařilo odeslat." };
    }
    return { success: true, resendId: data?.id };
  } catch (err) {
    const cls = err instanceof Error ? err.name : typeof err;
    console.error(`[${opts.logTag}] exception memberId=${opts.memberId}: ${cls}`);
    return { success: false, error: "Mail se nepodařilo odeslat." };
  }
}

/** Ranní mail správci s odkazem na zápis dne. */
export function sendAttendanceLinkEmail(opts: {
  memberId: string;
  to: string;
  mail: BuiltMail;
}): Promise<AttendanceMailResult> {
  return sendBuiltMail({ logTag: "sendAttendanceLinkEmail", ...opts });
}

/** Report docházky jednomu příjemci (každý zvlášť, adresy se neodhalují navzájem). */
export function sendAttendanceReportEmail(opts: {
  memberId: string;
  to: string;
  mail: BuiltMail;
}): Promise<AttendanceMailResult> {
  return sendBuiltMail({ logTag: "sendAttendanceReportEmail", ...opts });
}
