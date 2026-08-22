/**
 * iter-027 (T-005) — vrstva 2 proti úniku tokenů do logu (arch iter-027
 * T-001, sekce 9.2). Vrstva 1 (uzavřený `OpsEventInput`, žádné pole pro
 * token) nestačí sama — skutečná úniková cesta jsou volné texty výjimek
 * (`e.message`), které mohou obsahovat celou URL i s tokenem.
 *
 * Čistý modul: žádný import krom stdlib. Bezpečné pro
 * scripts/test-ops-events.ts (tsx bez DATABASE_URL).
 *
 * Volající (event-shape.ts) MUSÍ redigovat PŘED zkrácením, nikdy naopak —
 * zkrácení první by mohlo useknout token uprostřed a nechat fragment kratší
 * než 8 znaků, na který se vzory níže už nechytí.
 *
 * Náhradní řetězce záměrně neobsahují uvozovku ani zpětné lomítko, aby
 * redakce nemohla rozbít platnost JSONu (viz redactDetail v event-shape.ts).
 */

const MAGIC_PATH_PATTERN = /\/m\/[A-Za-z0-9_-]{8,}/g;
const TOKEN_PARAM_PATTERN = /token=[A-Za-z0-9_-]{8,}/gi;
const API_KEY_PATTERN = /re_[A-Za-z0-9]{10,}/g;
const BEARER_PATTERN = /Bearer [A-Za-z0-9._-]{20,}/g;

export function redactSecrets(text: string): string {
  return text
    .replace(MAGIC_PATH_PATTERN, "/m/[token]")
    .replace(TOKEN_PARAM_PATTERN, "token=[redacted]")
    .replace(API_KEY_PATTERN, "[api-key]")
    .replace(BEARER_PATTERN, "Bearer [redacted]");
}
