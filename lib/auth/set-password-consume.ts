/**
 * iter-032 (arch 5.2, security L-1): pořadí kroků při nastavení hesla
 * odkazem. Čistý modul bez DB, next a bcrypt, závislosti přicházejí zvenku
 * (lib/auth/login-link.ts), aby šlo pořadí otestovat bez databáze
 * (scripts/test-iter-032-access.ts).
 *
 * Pořadí:
 *   1. blokace IP, formát tokenu,
 *   2. levné ověření, že odkaz existuje a platí (SELECT, nic nespotřebuje),
 *   3. validace hesla (nevalidní heslo odkaz nespálí),
 *   4. bcrypt, až teď (L-1: náhodný token nestojí CPU),
 *   5. atomické spotřebování (ze dvou souběžných kliků projde jeden),
 *   6. uložení hesla jen členovi, který roli v DB pořád má.
 */
import {
  LINK_INVALID_TEXT,
  THROTTLE_BLOCKED_TEXT,
  hashLinkToken,
  isValidLinkTokenFormat,
} from "./login-link-core";

export const SET_PASSWORD_MIN_LENGTH = 8;

export interface SetPasswordConsumeDeps {
  isBlocked(): Promise<boolean>;
  recordFailure(): Promise<void>;
  findActiveLink(tokenHash: string): Promise<string | null>;
  hashPassword(password: string): Promise<string>;
  consumeLink(tokenHash: string): Promise<string | null>;
  setPassword(
    memberId: string,
    passwordHash: string
  ): Promise<{ sessionVersion: number; managementRole: string; name: string } | null>;
}

export type SetPasswordConsumeResult =
  | {
      ok: true;
      memberId: string;
      name: string;
      managementRole: string;
      sessionVersion: number;
    }
  | { ok: false; error: string };

export async function runSetPasswordConsume(
  deps: SetPasswordConsumeDeps,
  input: { token: unknown; password: unknown; confirm: unknown }
): Promise<SetPasswordConsumeResult> {
  if (await deps.isBlocked()) {
    return { ok: false, error: THROTTLE_BLOCKED_TEXT };
  }
  if (!isValidLinkTokenFormat(input.token)) {
    await deps.recordFailure();
    return { ok: false, error: LINK_INVALID_TEXT };
  }
  const tokenHash = hashLinkToken(input.token);

  if (!(await deps.findActiveLink(tokenHash))) {
    await deps.recordFailure();
    return { ok: false, error: LINK_INVALID_TEXT };
  }

  const { password, confirm } = input;
  if (typeof password !== "string" || typeof confirm !== "string" || !password) {
    return { ok: false, error: "Zadej nové heslo dvakrát." };
  }
  if (password !== confirm) {
    return { ok: false, error: "Hesla se neshodují." };
  }
  if (password.length < SET_PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Heslo musí mít aspoň ${SET_PASSWORD_MIN_LENGTH} znaků.` };
  }

  const passwordHash = await deps.hashPassword(password);

  const memberId = await deps.consumeLink(tokenHash);
  if (!memberId) {
    // Mezi kroky 2 a 5 odkaz spotřeboval souběžný klik nebo ho admin zneplatnil.
    await deps.recordFailure();
    return { ok: false, error: LINK_INVALID_TEXT };
  }

  const updated = await deps.setPassword(memberId, passwordHash);
  if (!updated) {
    // Roli mezitím odebral admin. Odkaz je spotřebovaný, admin pošle nový.
    return { ok: false, error: LINK_INVALID_TEXT };
  }

  return {
    ok: true,
    memberId,
    name: updated.name,
    managementRole: updated.managementRole,
    sessionVersion: updated.sessionVersion,
  };
}
