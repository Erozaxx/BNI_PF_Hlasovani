/**
 * iter-044 (R-04): kód chyby Postgresu z vyhozené chyby. Čistý modul. Driver
 * ho dává do `err.code`, drizzle ho někdy zabalí do `err.cause.code`.
 */
export function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null | undefined;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

/** Tabulka neexistuje (merge před migrací). */
export const PG_UNDEFINED_TABLE = "42P01";
