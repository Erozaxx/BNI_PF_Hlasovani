import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ADMIN_ONLY_MESSAGE } from "@/lib/auth/permissions";
import { PASSWORD_TEXTS } from "@/lib/auth/password-texts";
import { PasswordResetControls } from "./PasswordResetControls";

/**
 * iter-043 (gate K16 A): zúžený pohled na `/admin/members` pro volajícího jen
 * s právem `access.password_reset` (moderátor, Člen výboru). Jméno, štítek,
 * stav hesla a tlačítko pro reset. Žádný odkaz na detail člena, žádná firma,
 * obor, datum vstupu, osobní odkaz ani pohovory.
 *
 * iter-046 (P1, gate změna 3): seznam obsahuje všechny členy, heslo smí mít
 * každý. Řádek nemá e-mail (`hasEmail` místo něj), moderátor bez funkce
 * e-maily členů nevidí, do klienta nejdou. Potvrzení resetu je se jménem.
 */

export interface LeadershipRow {
  id: string;
  name: string;
  /** Člen má e-mail. Samotná adresa do klienta nejde. */
  hasEmail: boolean;
  functionName: string | null;
  /** Štítek role (Admin, Moderátor) nebo `null`. */
  roleLabel: string | null;
  isAdmin: boolean;
  /** Skutečné heslo, ne zámkový hash čekající na odkaz „nastav si heslo“. */
  hasPassword: boolean;
  isInactive: boolean;
  isSelf: boolean;
}

export function LeadershipPasswordList({ rows }: { rows: LeadershipRow[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">{PASSWORD_TEXTS.listTitle}</h1>
        <p className="mt-2 text-sm text-text-muted">
          {PASSWORD_TEXTS.listIntro}
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Zatím tu nikdo není"
            description="Seznam obsahuje všechny členy."
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-col gap-3">
                  <div>
                    <h2 className="text-base font-semibold break-words">{r.name}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {r.functionName && <Badge variant="category">{r.functionName}</Badge>}
                      {r.roleLabel && (
                        <Badge variant={r.isAdmin ? "danger" : "info"}>{r.roleLabel}</Badge>
                      )}
                      {r.isInactive && <Badge variant="warning">Neaktivní</Badge>}
                      {!r.hasEmail && <Badge variant="warning">{PASSWORD_TEXTS.noEmailBadge}</Badge>}
                      {!r.isAdmin && (
                        <Badge variant={r.hasPassword ? "success" : "neutral"}>
                          {r.hasPassword ? "Heslo nastavené" : "Čeká na nastavení hesla"}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {r.isAdmin ? (
                    <p className="text-sm text-text-muted">{ADMIN_ONLY_MESSAGE}</p>
                  ) : r.isSelf ? (
                    <p className="text-sm text-text-muted">
                      Vlastní heslo změníš v menu{" "}
                      <Link href="/settings" className="text-primary hover:underline">
                        {PASSWORD_TEXTS.menuChange}
                      </Link>
                      .
                    </p>
                  ) : (
                    <PasswordResetControls
                      memberId={r.id}
                      memberName={r.name}
                      email={null}
                      hasEmail={r.hasEmail}
                      isInactive={r.isInactive}
                    />
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
