/**
 * iter-049 (review T-006 M-1, m-1 až m-5): čistá rozhodnutí editoru klientských
 * situací. Žádný import ze serveru ani z Reactu, takže jde testovat bez
 * prohlížeče (test 27). Komponenty v `components/situations/` jen volají tyhle
 * funkce a drží stav.
 */

import { MESSAGES, cleanText, type SituationActionResult, type SituationErrorCode } from "./rules";

/** Route, která bez session vrací 401 JSON (middleware ji nepřesměrovává na /login). */
export const SESSION_PROBE_URL = "/api/situace/session";

export interface ThrownFailure {
  error: string;
  code: Extract<SituationErrorCode, "session_expired" | "failed">;
}

/**
 * Výsledek sondy po výjimce z akce (gate změny 12 a 13): 401 = vypršelé
 * přihlášení, cokoli jiného (síť, 500, přihlášení platí) = obecná chyba uložení.
 */
export function failureFromProbe(status: number | null): ThrownFailure {
  if (status === 401) return { error: MESSAGES.sessionExpired, code: "session_expired" };
  return { error: MESSAGES.saveFailed, code: "failed" };
}

/**
 * Volá se jen v `catch` kolem akce. Nikdy nevyhodí: při výpadku sítě je sonda
 * také neúspěšná a výsledkem je „Nepodařilo se uložit.“ s opakováním.
 */
export const SESSION_PROBE_TIMEOUT_MS = 5000;

export async function resolveThrownFailure(
  fetchFn: (url: string, init?: RequestInit) => Promise<{ status: number }> = (url, init) => fetch(url, init),
  timeoutMs: number = SESSION_PROBE_TIMEOUT_MS
): Promise<ThrownFailure> {
  // Visící sonda by nechala kartičku navždy v „ukládám“: po timeoutu platí obecná
  // chyba uložení s opakováním (gate změna 13).
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });
  try {
    const probe = fetchFn(SESSION_PROBE_URL, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
      signal: controller.signal,
    }).then((res) => res.status);
    probe.catch(() => undefined);
    return failureFromProbe(await Promise.race([probe, timeout]));
  } catch {
    return failureFromProbe(null);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Nejdelší čekání na odpověď server action. Pak platí stejná cesta jako po výjimce (QA17). */
export const ACTION_TIMEOUT_MS = 15000;

/**
 * Očekávaný tvar odpovědi akce. Když přihlášení vyprší, middleware vrátí
 * místo odpovědi akce přesměrování na HTML `/login`. Next 14 to nevyhodí,
 * promise akce se vyřeší na `undefined` (QA17), takže tvar se musí ověřit.
 */
export function isActionResult(value: unknown): value is SituationActionResult<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  if (r.success === true) return typeof r.data === "object" && r.data !== null;
  return r.success === false && typeof r.error === "string" && typeof r.code === "string";
}

/**
 * Zavolá akci a vždy vrátí výsledek. Výjimka, neočekávaný tvar (včetně
 * `undefined`) i vypršený čas jdou stejnou cestou: sonda přihlášení a text
 * gate 12 nebo 13. Nikdy nevyhodí a nikdy nezůstane viset.
 */
export async function runSituationAction<T>(
  call: () => Promise<SituationActionResult<T>>,
  options: {
    timeoutMs?: number;
    fetchFn?: (url: string, init?: RequestInit) => Promise<{ status: number }>;
    probeTimeoutMs?: number;
  } = {}
): Promise<SituationActionResult<T>> {
  const timeoutMs = options.timeoutMs ?? ACTION_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  let outcome: unknown;
  try {
    const pending = call();
    pending.catch(() => undefined);
    outcome = await Promise.race([pending, timeout]);
  } catch {
    outcome = undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (isActionResult(outcome)) return outcome as SituationActionResult<T>;
  const failure = await resolveThrownFailure(options.fetchFn, options.probeTimeoutMs);
  return { success: false, error: failure.error, code: failure.code };
}

/** „Zkusit znovu“ se u vypršelého přihlášení a u chyby validace nezobrazuje (gate změna 12, QA7). */
export function canRetry(code: SituationErrorCode | null): boolean {
  return code !== "session_expired" && code !== "invalid";
}

/** Po chybě validace stačí text opravit: chyba zmizí a blur nebo Enter uloží (m-2). */
export function clearsErrorOnEdit(status: "idle" | "saving" | "error", code: SituationErrorCode | null): boolean {
  return status === "error" && code === "invalid";
}

/** Změna stavu kartičky po neúspěšném uložení: text zůstane v poli, fokus se nekrade (m-4). */
export function failedCardPatch(f: { error: string; code: SituationErrorCode }) {
  return { editing: true, focus: false, status: "error" as const, error: f.error, errorCode: f.code };
}

export type DirtyState = "clean" | "typing" | "saving" | "error";

interface CardLike {
  status: "idle" | "saving" | "error";
  editing: boolean;
  persisted: boolean;
  text: string;
  draftText: string;
}

export function isCardDirty(c: CardLike, multiline: boolean): boolean {
  if (c.status === "saving" || c.status === "error") return true;
  if (!c.editing) return false;
  const t = cleanText(c.draftText, multiline);
  return c.persisted ? t !== c.text : t !== "";
}

/** Nejvážnější stav sloupce: ukládá se, má chybu, je rozepsaný, nebo čistý. */
export function columnDirtyState(cards: readonly CardLike[], multiline: boolean): DirtyState {
  if (cards.some((c) => c.status === "saving")) return "saving";
  if (cards.some((c) => c.status === "error")) return "error";
  if (cards.some((c) => isCardDirty(c, multiline))) return "typing";
  return "clean";
}

export function headDirtyState(status: "idle" | "saving" | "error", value: string, lastSaved: string): DirtyState {
  if (status === "saving") return "saving";
  if (status === "error") return "error";
  return value !== lastSaved ? "typing" : "clean";
}

/**
 * „Zpět na přehled“ (gate změna 11, m-3): dokud se něco ukládá, čekat (do
 * limitu); chyba nebo rozepsaný text, který se sám neopraví, nečeká vůbec,
 * jen řekne proč a nechá člena rozhodnout.
 */
export function backToOverviewDecision(states: Iterable<DirtyState>, timedOut: boolean): "go" | "wait" | "block" {
  let saving = false;
  let other = false;
  for (const s of states) {
    if (s === "saving") saving = true;
    else if (s !== "clean") other = true;
  }
  if (saving) return timedOut ? "block" : "wait";
  return other ? "block" : "go";
}

/** `HeadField`: během ukládání se hodnota změnila, po doběhnutí se uloží znovu (m-1). */
export function headNeedsResave(latest: string, lastSaved: string, multiline: boolean): boolean {
  return cleanText(latest, multiline) !== lastSaved;
}
