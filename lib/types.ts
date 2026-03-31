/**
 * Unified return type for all mutating Server Actions.
 *
 * - Never throw for expected errors (validation, unauthorized) — return { success: false, error }.
 * - throw / Next.js redirect() only for unexpected system errors (Neon down, etc.).
 * - On the frontend always check result.success before displaying a UI message.
 */
export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };
