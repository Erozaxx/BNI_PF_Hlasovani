/**
 * iter-032 (arch T-001, sekce 6, 9.3, 10.1), čisté jádro přihlašovacích
 * odkazů a throttle klíčů.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend, jen
 * node:crypto. Bezpečné pro scripts/test-iter-032-access.ts (tsx bez
 * DATABASE_URL).
 */
import { createHash, randomBytes } from "node:crypto";
import { hasPasswordAccess } from "@/lib/auth/permissions";

// ── Konstanty (jediné místo, změna délky je jeden řádek bez migrace) ──

/** Platnost odkazu člena (6.3, rozhodnutí uživatele 15. 10. 2026). */
export const LOGIN_LINK_TTL_MINUTES = 15;
/** Platnost odkazu „nastav si heslo" pro vedení (5.2, K12 B). */
export const SET_PASSWORD_LINK_TTL_HOURS = 24;
/**
 * iter-043 (gate K6, Z1): odkaz `password-reset` platí 24 h, stejně jako
 * odkaz od admina (maily z aplikace padají do spamu, lidé je najdou později).
 * Jedna hodnota pro oba účely.
 */
export const PASSWORD_RESET_LINK_TTL_HOURS = SET_PASSWORD_LINK_TTL_HOURS;
/** Session z odkazu člena, pevná, neprodlužuje se (6.3, K7 A). */
export const EMAIL_LINK_SESSION_HOURS = 12;
/** Doplnění doby odpovědi na žádost o odkaz (6.1 bod 6). */
export const MIN_RESPONSE_MS = 2500;
/**
 * Okno všech throttle limitů (K11). Jediná definice, lib/auth/throttle.ts
 * ji importuje (review F-07).
 */
export const THROTTLE_WINDOW_MINUTES = 10;

/** Limity za THROTTLE_WINDOW_MINUTES (9.3, K11). */
export const THROTTLE_LIMITS = {
  pwLoginPair: 10,
  pwLoginEmail: 50,
  pwLoginIp: 20,
  linkReqEmail: 3,
  linkReqIp: 10,
  linkUseIp: 20,
  /** Krok 1 přihlášení (T-011, security M-1): dvojice, IP a e-mail, vlastní klíče. */
  loginStartPair: 10,
  loginStartIp: 20,
  loginStartEmail: 50,
  /** iter-043 (gate K8): samoobsluha „Zapomněl(a) jsem heslo", vlastní klíče. */
  pwResetEmail: 3,
  pwResetIp: 10,
  /** iter-043 (security M-1a): denní strop žádostí o reset na e-mail (okno PASSWORD_RESET_DAY_WINDOW_MINUTES). */
  pwResetEmailDay: 5,
} as const;

/** iter-043 (security M-1a): okno denního stropu žádostí o reset, 24 h. */
export const PASSWORD_RESET_DAY_WINDOW_MINUTES = 24 * 60;

/**
 * iter-043 (security M-1b): nepoužitý a neprošlý odkaz `password-reset` mladší
 * než tento počet minut se nenahrazuje a mail neodejde, aby čerstvý odkaz
 * zůstal platný.
 */
export const PASSWORD_RESET_FRESH_LINK_MINUTES = 5;

/** Vždy stejná odpověď na žádost o odkaz (6.1 bod 7), ve všech větvích. */
export const LOGIN_LINK_RESPONSE_TEXT =
  "Pokud je e-mail u nás registrovaný, poslali jsme na něj přihlašovací odkaz. Platí 15 minut. Když nedorazí, mrkni do spamu.";

export const LINK_INVALID_TEXT = "Odkaz už neplatí. Požádej o nový.";
export const THROTTLE_BLOCKED_TEXT = `Příliš mnoho pokusů, zkus to za ${THROTTLE_WINDOW_MINUTES} minut.`;

export type LoginLinkPurpose = "login" | "set-password" | "password-reset";

/**
 * iter-043: účely odkazu, kterým se nastavuje heslo. `/login/heslo` je
 * spotřebuje oba, `login` nikdy. POZOR: nový účel odkazu pro heslo musí být
 * i v revoke v `setOwnPassword` a `resetPasswordGuarded` (members.ts), hlídá
 * to test-iter-043-heslo.
 */
export const PASSWORD_LINK_PURPOSES = ["set-password", "password-reset"] as const;

/**
 * iter-043 (gate K9, Z1): vždy stejná odpověď na „Zapomněl(a) jsem heslo",
 * ve všech větvích včetně blokace a chyby.
 */
export const PASSWORD_RESET_RESPONSE_TEXT =
  "Pokud e-mail patří členovi vedení, poslali jsme na něj odkaz na nové heslo. Platí 24 hodin. Dosavadní heslo platí, dokud si nové nenastavíš. Když mail nedorazí, mrkni do spamu.";

// ── Token ──

/** 32 náhodných bajtů jako base64url = vždy 43 znaků bez paddingu. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isValidLinkTokenFormat(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/** SHA-256 hex. Do DB jde jen hash, nikdy token. */
export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function linkExpiresAt(purpose: LoginLinkPurpose, now: Date): Date {
  const ms =
    purpose === "login"
      ? LOGIN_LINK_TTL_MINUTES * 60 * 1000
      : purpose === "password-reset"
        ? PASSWORD_RESET_LINK_TTL_HOURS * 3600 * 1000
        : SET_PASSWORD_LINK_TTL_HOURS * 3600 * 1000;
  return new Date(now.getTime() + ms);
}

/** `/login/odkaz?t=` pro člena, `/login/heslo?t=` pro nastavení hesla. */
export function buildLinkUrl(
  appUrl: string,
  purpose: LoginLinkPurpose,
  token: string
): string {
  const base = appUrl.replace(/\/+$/, "");
  // `set-password` i `password-reset` vedou na /login/heslo.
  const path = purpose === "login" ? "/login/odkaz" : "/login/heslo";
  return `${base}${path}?t=${encodeURIComponent(token)}`;
}

// ── E-mail (K13) ──

/** Normalizace pro hledání: `trim().toLowerCase()`. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Normalizace pro ukládání (U3): `lower(trim(email))`, prázdný řetězec nebo
 * samé mezery jako `null`, nikdy `''` (jinak by druhý člen bez e-mailu
 * narazil na unikátní index `lower(email)`).
 */
export function normalizeEmailForStorage(
  input: string | null | undefined
): string | null {
  if (input == null) return null;
  const normalized = normalizeEmail(input);
  return normalized === "" ? null : normalized;
}

/** Klíče throttle nesou hash e-mailu, ne e-mail (9.3). */
export function hashEmailForKey(normalizedEmail: string): string {
  return createHash("sha256").update(normalizedEmail).digest("hex");
}

// ── Throttle klíče a rozhodnutí (9.3, F2, N-b) ──

export interface ThrottleRule {
  key: string;
  max: number;
  scope: "pair" | "email" | "ip";
  /** Okno pravidla v minutách; bez pole platí THROTTLE_WINDOW_MINUTES. */
  windowMinutes?: number;
}

export interface ThrottleCount {
  key: string;
  count: number;
}

/** IP `unknown` (chybí x-forwarded-for) se do klíčů nedává (N-b). */
export function isKnownIp(ip: string | null | undefined): ip is string {
  return !!ip && ip !== "unknown";
}

/** Pokus o heslo: dvojice e-mail a IP, celý e-mail, IP. */
export function passwordLoginThrottleRules(
  normalizedEmail: string,
  ip: string
): ThrottleRule[] {
  const emailHash = hashEmailForKey(normalizedEmail);
  const rules: ThrottleRule[] = [
    { key: `pw-login-email:${emailHash}`, max: THROTTLE_LIMITS.pwLoginEmail, scope: "email" },
  ];
  if (isKnownIp(ip)) {
    rules.unshift({
      key: `pw-login-pair:${emailHash}:${ip}`,
      max: THROTTLE_LIMITS.pwLoginPair,
      scope: "pair",
    });
    rules.push({ key: `pw-login-ip:${ip}`, max: THROTTLE_LIMITS.pwLoginIp, scope: "ip" });
  }
  return rules;
}

/** Klíč dvojice, který se po úspěšném přihlášení heslem smaže (9.3). */
export function passwordLoginPairKey(normalizedEmail: string, ip: string): string | null {
  if (!isKnownIp(ip)) return null;
  return `pw-login-pair:${hashEmailForKey(normalizedEmail)}:${ip}`;
}

/** Žádost o odkaz: e-mail a IP. */
export function linkRequestThrottleRules(
  normalizedEmail: string,
  ip: string
): ThrottleRule[] {
  const rules: ThrottleRule[] = [
    {
      key: `link-req-email:${hashEmailForKey(normalizedEmail)}`,
      max: THROTTLE_LIMITS.linkReqEmail,
      scope: "email",
    },
  ];
  if (isKnownIp(ip)) {
    rules.unshift({ key: `link-req-ip:${ip}`, max: THROTTLE_LIMITS.linkReqIp, scope: "ip" });
  }
  return rules;
}

/**
 * Krok 1 dvoukrokového přihlášení: dvojice e-mail a IP, celý e-mail, IP.
 * Stejné limity jako u hesla (10/20/50), klíče `login-start-*` nesdílí nikdo
 * jiný. Samotná IP bez dvojice by nechala jednoho útočníka zablokovat cizí
 * e-mail, proto má e-mail limit 50 a hlídá ho spíš dvojice.
 */
export function loginStartThrottleRules(
  normalizedEmail: string,
  ip: string
): ThrottleRule[] {
  const emailHash = hashEmailForKey(normalizedEmail);
  const rules: ThrottleRule[] = [
    {
      key: `login-start-email:${emailHash}`,
      max: THROTTLE_LIMITS.loginStartEmail,
      scope: "email",
    },
  ];
  if (isKnownIp(ip)) {
    rules.unshift({
      key: `login-start-pair:${emailHash}:${ip}`,
      max: THROTTLE_LIMITS.loginStartPair,
      scope: "pair",
    });
    rules.push({
      key: `login-start-ip:${ip}`,
      max: THROTTLE_LIMITS.loginStartIp,
      scope: "ip",
    });
  }
  return rules;
}

/**
 * iter-043: „Zapomněl(a) jsem heslo", e-mail a IP. Klíče `pw-reset-*` nesdílí
 * žádná jiná cesta (reset nevyčerpá přihlášení a naopak). Počítá se každý
 * pokus, i pro neexistující e-mail.
 */
export function passwordResetThrottleRules(
  normalizedEmail: string,
  ip: string
): ThrottleRule[] {
  const rules: ThrottleRule[] = [
    {
      key: `pw-reset-email:${hashEmailForKey(normalizedEmail)}`,
      max: THROTTLE_LIMITS.pwResetEmail,
      scope: "email",
    },
    {
      // M-1a: vlastní klíč s 24h oknem, nesdílí řádek s 10min klíčem.
      key: `pw-reset-email-day:${hashEmailForKey(normalizedEmail)}`,
      max: THROTTLE_LIMITS.pwResetEmailDay,
      scope: "email",
      windowMinutes: PASSWORD_RESET_DAY_WINDOW_MINUTES,
    },
  ];
  if (isKnownIp(ip)) {
    rules.unshift({ key: `pw-reset-ip:${ip}`, max: THROTTLE_LIMITS.pwResetIp, scope: "ip" });
  }
  return rules;
}

/**
 * Rozdělí pravidla podle okna (každé okno = jedno volání throttleHit).
 * Pořadí oken i pravidel uvnitř zůstává podle prvního výskytu.
 */
export function groupRulesByWindow(
  rules: ThrottleRule[]
): { windowMinutes: number; keys: string[] }[] {
  const groups = new Map<number, string[]>();
  for (const r of rules) {
    const w = r.windowMinutes ?? THROTTLE_WINDOW_MINUTES;
    const keys = groups.get(w) ?? [];
    keys.push(r.key);
    groups.set(w, keys);
  }
  return [...groups].map(([windowMinutes, keys]) => ({ windowMinutes, keys }));
}

/** Neplatné spotřebování odkazu (throttleCheck/throttleFail), `null` bez IP. */
export function linkUseThrottleKey(ip: string): string | null {
  return isKnownIp(ip) ? `link-use-ip:${ip}` : null;
}

/**
 * Blokace je `count > max` pro daný klíč (9.3). Vrací první blokované
 * pravidlo, nebo `null`. Klíč, který v počtech chybí, neblokuje.
 */
export function findBlockedRule(
  rules: ThrottleRule[],
  counts: ThrottleCount[]
): ThrottleRule | null {
  const byKey = new Map(counts.map((c) => [c.key, c.count]));
  for (const rule of rules) {
    const count = byKey.get(rule.key);
    if (count !== undefined && count > rule.max) return rule;
  }
  return null;
}

// ── Plán žádosti o odkaz (6.1) ──

export interface LoginLinkMemberMatch {
  id: string;
  name: string;
  email: string | null;
  managementRole: string | null;
  /** iter-037 (T-003b): člen má funkci (věta o heslu v mailu platí i pro držitele funkce). */
  hasFunction?: boolean;
  /**
   * iter-037 (T-003b): aktivní k dnešku. `false` = deaktivovaný, mail neodejde
   * a odpověď i doba zůstanou stejné jako u ostatních větví. Chybějící pole =
   * aktivní.
   */
  active?: boolean;
}

export type LoginLinkPlan =
  | {
      send: false;
      reason: "ip-blocked" | "email-blocked" | "no-member" | "no-email" | "inactive";
      message: string;
    }
  | {
      send: true;
      reason: "send";
      memberId: string;
      memberName: string;
      email: string;
      isManagement: boolean;
      message: string;
    };

/**
 * Rozhodnutí žádosti o odkaz. Při blokaci se člen nehledá (`member` je
 * `null`). `message` je ve všech větvích tentýž řetězec (9.4).
 */
export function planLoginLinkRequest(input: {
  blocked: ThrottleRule | null;
  member: LoginLinkMemberMatch | null;
}): LoginLinkPlan {
  const message = LOGIN_LINK_RESPONSE_TEXT;
  if (input.blocked) {
    return {
      send: false,
      reason: input.blocked.scope === "email" ? "email-blocked" : "ip-blocked",
      message,
    };
  }
  if (!input.member) return { send: false, reason: "no-member", message };
  if (input.member.active === false) return { send: false, reason: "inactive", message };
  if (!input.member.email) return { send: false, reason: "no-email", message };
  return {
    send: true,
    reason: "send",
    memberId: input.member.id,
    memberName: input.member.name,
    email: input.member.email,
    isManagement: !!input.member.managementRole || !!input.member.hasFunction,
    message,
  };
}

// ── Plán žádosti o nové heslo (iter-043, arch T-001b bod 5) ──

export type PasswordResetPlan =
  | {
      send: false;
      reason:
        | "ip-blocked"
        | "email-blocked"
        | "no-member"
        | "no-access"
        | "inactive"
        | "no-email";
      message: string;
    }
  | {
      send: true;
      reason: "send";
      memberId: string;
      memberName: string;
      email: string;
      message: string;
    };

/**
 * Rozhodnutí žádosti o nové heslo. `message` je ve všech větvích tentýž
 * řetězec. `passwordHash` se nezkoumá: kdo má přístup (role NEBO funkce), smí
 * si heslo nastavit, i když ho ještě nemá (prošlý odkaz od admina).
 */
export function planPasswordResetRequest(input: {
  blocked: ThrottleRule | null;
  member: LoginLinkMemberMatch | null;
}): PasswordResetPlan {
  const message = PASSWORD_RESET_RESPONSE_TEXT;
  if (input.blocked) {
    return {
      send: false,
      reason: input.blocked.scope === "email" ? "email-blocked" : "ip-blocked",
      message,
    };
  }
  const m = input.member;
  if (!m) return { send: false, reason: "no-member", message };
  if (!hasPasswordAccess({ managementRole: m.managementRole, hasFunction: !!m.hasFunction })) {
    return { send: false, reason: "no-access", message };
  }
  if (m.active === false) return { send: false, reason: "inactive", message };
  if (!m.email) return { send: false, reason: "no-email", message };
  return { send: true, reason: "send", memberId: m.id, memberName: m.name, email: m.email, message };
}

/** Kolik ms ještě počkat, aby odpověď trvala aspoň MIN_RESPONSE_MS. */
export function remainingPaddingMs(startedAtMs: number, nowMs: number): number {
  return Math.max(0, MIN_RESPONSE_MS - (nowMs - startedAtMs));
}

// ── Krok 1 přihlášení (T-011) ──

export interface LoginStartMember {
  email: string | null;
  managementRole: string | null;
  passwordHash: string | null;
  /** iter-037 (T-003b): držitel funkce bez role má heslo také. */
  hasFunction?: boolean;
}

export type LoginStartPlan =
  | { next: "blocked"; message: string }
  | { next: "password" }
  | { next: "link" };

/**
 * Rozhodnutí kroku 1 /login. Rozhodnutí uživatele 15. 10. 2026 (po QA):
 * z kroku 1 se smí poznat, že e-mail patří vedení s heslem (kdo je ve vedení,
 * je mezi členy veřejně známé a heslo má throttle). Opouští se tím původní
 * návrh arch 6.4 a 6.7. Naopak člena a neexistující e-mail rozlišit nejde:
 * všechno ostatní jde do větve odkazu se stejnou odpovědí a dobou.
 * Do "password" se jde jen s rolí NEBO funkcí (T-003b, `hasPasswordAccess`) A
 * heslem. Neaktivní člen jde na krok hesla stejně (odpověď se neliší), o
 * pozastavení se dozví až po správném hesle (K18). Povýšený nebo resetovaný člen
 * vedení má v `passwordHash` zámkový hash (ne NULL), takže jde také na krok
 * hesla, i když si heslo ještě nenastavil. Probíhající reset se tím nepozná,
 * proto krok hesla nabízí nápovědu a odkaz. Role s NULL hashem po migraci
 * prakticky není, a kdyby byla, jde na odkaz.
 */
export function planLoginStart(input: {
  blocked: ThrottleRule | null;
  member: LoginStartMember | null;
}): LoginStartPlan {
  if (input.blocked) return { next: "blocked", message: THROTTLE_BLOCKED_TEXT };
  const m = input.member;
  if (m && m.passwordHash && hasPasswordAccess({ managementRole: m.managementRole, hasFunction: !!m.hasFunction })) {
    return { next: "password" };
  }
  return { next: "link" };
}
