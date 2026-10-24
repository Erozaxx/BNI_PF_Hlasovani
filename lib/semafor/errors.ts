/**
 * iter-041 (arch 5.3): chyby souboru. Čistý modul bez závislostí.
 *
 * `SemaforFileError` nese jen kód a malé parametry (číslo řádku, názvy
 * sloupců a listů). Nikdy obsah buněk mimo jméno a číslo řádku: zprávy se
 * skládají v `lib/semafor/texts.ts` (`fileErrorMessage`) a `console.error` v
 * akci loguje jen třídu chyby.
 */

export type SemaforFileErrorCode =
  | "tooBig"
  | "notXlsx"
  | "broken"
  | "noSheet"
  | "columns"
  | "dupColumn"
  | "allOtherChapter"
  | "changed"
  | "month";

export interface SemaforFileErrorParams {
  /** Názvy listů (`noSheet`), sloupců (`columns`, `dupColumn`). */
  list?: string[];
  /** Kolik dalších názvů listů se nevypsalo (`noSheet`). */
  more?: number;
}

export class SemaforFileError extends Error {
  readonly code: SemaforFileErrorCode;
  readonly params: SemaforFileErrorParams;

  constructor(code: SemaforFileErrorCode, params: SemaforFileErrorParams = {}) {
    super(code);
    this.name = "SemaforFileError";
    this.code = code;
    this.params = params;
  }
}

export function isSemaforFileError(err: unknown): err is SemaforFileError {
  return err instanceof SemaforFileError;
}
