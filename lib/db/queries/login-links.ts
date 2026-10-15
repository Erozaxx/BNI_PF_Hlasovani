import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { memberLoginLink } from "@/lib/db/schema";
import type { LoginLinkPurpose } from "@/lib/auth/login-link-core";

function getDb() {
  return drizzle(getSql());
}

/**
 * iter-032 (arch 6, 5.2, 8.1) — jednorázové odkazy `member_login_link`.
 * Do DB jde jen SHA-256 hash tokenu. Bez transakcí (LL-003).
 */
export async function insertLoginLink(input: {
  memberId: string;
  purpose: LoginLinkPurpose;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await getDb().insert(memberLoginLink).values({
    memberId: input.memberId,
    purpose: input.purpose,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
  });
}

/**
 * Atomické spotřebování (6.2 bod 3, 5.2 bod 4): ze dvou souběžných kliků
 * projde jeden. `purpose` ve WHERE: odkaz pro heslo nepřihlásí jako člen
 * a odkaz člena nenastaví heslo (9.1). Vrací `member_id`, nebo `null`.
 */
export async function consumeLinkByHash(
  tokenHash: string,
  purpose: LoginLinkPurpose
): Promise<string | null> {
  const rows = await getDb()
    .update(memberLoginLink)
    .set({ usedAt: sql`now()` })
    .where(
      and(
        eq(memberLoginLink.tokenHash, tokenHash),
        eq(memberLoginLink.purpose, purpose),
        isNull(memberLoginLink.usedAt),
        sql`${memberLoginLink.expiresAt} > now()`
      )
    )
    .returning({ memberId: memberLoginLink.memberId });
  return rows[0]?.memberId ?? null;
}

/**
 * Levné ověření bez spotřebování (security L-1): existuje nepoužitý a
 * neprošlý odkaz s tímto hashem a účelem? Volá se před bcrypt, aby
 * náhodný token nestál server desetiny sekundy CPU. Rozhoduje až
 * atomické `consumeLinkByHash`, tohle je jen předfiltr.
 */
export async function findActiveLinkMemberId(
  tokenHash: string,
  purpose: LoginLinkPurpose
): Promise<string | null> {
  const rows = await getDb()
    .select({ memberId: memberLoginLink.memberId })
    .from(memberLoginLink)
    .where(
      and(
        eq(memberLoginLink.tokenHash, tokenHash),
        eq(memberLoginLink.purpose, purpose),
        isNull(memberLoginLink.usedAt),
        sql`${memberLoginLink.expiresAt} > now()`
      )
    )
    .limit(1);
  return rows[0]?.memberId ?? null;
}

/**
 * Vystavení odkazu `set-password` jedním příkazem (security L-4, U1 „platí
 * jen nejnovější"). Částečný unikátní index `mll_one_active_set_password`
 * drží nejvýš jeden nepoužitý odkaz na člena. Když už nějaký je, dostane
 * nový token a novou platnost, takže starý token přestane platit v tomtéž
 * příkazu. Dva souběžné požadavky se seřadí na indexu a platí ten
 * pozdější, nikdy oba.
 */
export async function upsertSetPasswordLink(input: {
  memberId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await getDb().execute(sql`
    INSERT INTO member_login_link (member_id, purpose, token_hash, expires_at)
    VALUES (${input.memberId}::uuid, 'set-password', ${input.tokenHash}, ${input.expiresAt.toISOString()}::timestamptz)
    ON CONFLICT (member_id) WHERE purpose = 'set-password' AND used_at IS NULL
    DO UPDATE SET
      token_hash = EXCLUDED.token_hash,
      created_at = now(),
      expires_at = EXCLUDED.expires_at
  `);
}

/**
 * Nový token pro odkaz `set-password`, který člen ještě nepoužil (security
 * M-2, review F-02). Nový řádek nevzniká: když člen odkaz nemá (heslo si
 * už nastavil, odkaz zneplatnila změna e-mailu nebo role, nebo ho smazal
 * úklid), vrátí `false` a nic se nezmění. Nepoužitý odkaz existuje jen po
 * povýšení nebo resetu, takže tudy nejde obejít mail „X ti zrušil heslo"
 * ani zrušit heslo, které si člen už nastavil.
 *
 * `allowExpired`: „Poslat znovu" smí obnovit i prošlý nepoužitý odkaz
 * (člen 24 h nestihl, heslo pořád nemá). Odkaz ke zkopírování ne, ten
 * vyžaduje i neprošlý (M-2 doslova).
 */
export async function rotateSetPasswordLink(input: {
  memberId: string;
  tokenHash: string;
  expiresAt: Date;
  allowExpired: boolean;
}): Promise<boolean> {
  const rows = await getDb()
    .update(memberLoginLink)
    .set({
      tokenHash: input.tokenHash,
      createdAt: sql`now()`,
      expiresAt: input.expiresAt,
    })
    .where(
      and(
        eq(memberLoginLink.memberId, input.memberId),
        eq(memberLoginLink.purpose, "set-password"),
        isNull(memberLoginLink.usedAt),
        input.allowExpired ? undefined : sql`${memberLoginLink.expiresAt} > now()`
      )
    )
    .returning({ id: memberLoginLink.id });
  return rows.length > 0;
}

/** Úklid ve fázi 6 cronu (6.6): odkazy prošlé víc než 1 den. */
export async function cleanupStaleLoginLinks(): Promise<void> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await getDb()
    .delete(memberLoginLink)
    .where(lt(memberLoginLink.expiresAt, oneDayAgo));
}
