"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { resendSetPasswordLinkAction, resetMemberPasswordAction } from "@/actions/member-access";
import { PASSWORD_TEXTS } from "@/lib/auth/password-texts";

/**
 * iter-043 (gate K13 A, K15 A): reset hesla člena vedení pro každého s právem
 * `access.password_reset` (moderátor, Člen výboru, Prezident, Viceprezident).
 * Převzatá část z `MemberAccessControls`, jen heslo: „Poslat odkaz pro nové
 * heslo“, potvrzení adresy, výsledek s „Poslat znovu“. Odkaz ke zkopírování
 * tu NENÍ, ten smí jen admin (zkopírovaný odkaz by si volající otevřel sám).
 *
 * iter-046 (gate změna 3): `email` je `null` v zúženém seznamu (moderátor bez
 * funkce e-maily členů nevidí, do klienta nejdou), pak se potvrzuje jménem
 * a `hasEmail` rozhoduje, jestli reset jde. Plný pohled s `members.manage`
 * dál dostane `email` a ověřuje adresu zaškrtnutím.
 *
 * Stav drží komponenta, ne stránka: po `router.refresh()` výsledkové okno
 * nesmí zmizet (LL-017).
 */

type Mode = "idle" | "confirm" | "result";

interface PasswordResetControlsProps {
  memberId: string;
  memberName: string;
  email: string | null;
  /** Člen má e-mail (i když ho klient nedostal). */
  hasEmail: boolean;
  isInactive: boolean;
}

export function PasswordResetControls({
  memberId,
  memberName,
  email,
  hasEmail,
  isInactive,
}: PasswordResetControlsProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>("idle");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ mailSent: boolean; email: string | null } | null>(null);
  const [resendBlocked, setResendBlocked] = useState(false);

  function resetUi() {
    setMode("idle");
    setEmailConfirmed(false);
    setError("");
    setResult(null);
    setResendBlocked(false);
  }

  async function handleReset() {
    setLoading(true);
    setError("");
    setResendBlocked(false);
    try {
      const res = await resetMemberPasswordAction(memberId);
      if (!res.success) {
        setError(res.error);
        showToast("error", res.error);
        return;
      }
      setResult({ mailSent: res.data?.mailSent ?? false, email: res.data?.email ?? email });
      setMode("result");
      router.refresh();
    } catch {
      setError("Odkaz se nepodařilo poslat.");
      showToast("error", "Odkaz se nepodařilo poslat.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    setError("");
    try {
      const res = await resendSetPasswordLinkAction(memberId);
      if (!res.success) {
        setError(res.error);
        showToast("error", res.error);
        return;
      }
      if (res.data?.outcome === "sent") {
        setResult({ mailSent: res.data.mailSent, email: res.data.email ?? email });
        setResendBlocked(false);
      } else {
        setResendBlocked(true);
      }
    } catch {
      setError("Odkaz se nepodařilo poslat.");
      showToast("error", "Odkaz se nepodařilo poslat.");
    } finally {
      setLoading(false);
    }
  }

  function startConfirm() {
    setResult(null);
    setResendBlocked(false);
    setEmailConfirmed(false);
    setError("");
    setMode("confirm");
  }

  const resultEmail = result?.email ?? email ?? "";
  // Bez adresy v klientu se potvrzuje jménem, adresu člen ověřovat nemůže.
  const showEmail = email !== null;

  return (
    <div className="flex flex-col gap-3">
      {mode === "idle" && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[44px]"
            disabled={loading || !hasEmail}
            onClick={startConfirm}
          >
            Poslat odkaz pro nové heslo
            <span className="sr-only"> členovi {memberName}</span>
          </Button>
        </div>
      )}

      {mode === "confirm" && (
        <div className="rounded-lg border border-border bg-background p-3 text-sm space-y-2">
          {isInactive ? (
            <p>
              Současné heslo přestane platit hned a člen se odhlásí. Člen je neaktivní, odkaz
              pro heslo se mu neposílá.
            </p>
          ) : (
            <p>
              {showEmail
                ? "Současné heslo přestane platit hned a člen se odhlásí. Odkaz pro nové heslo odejde na adresu:"
                : "Současné heslo přestane platit hned a člen se odhlásí."}
            </p>
          )}
          {isInactive ? null : !showEmail ? (
            <p className="text-lg font-semibold break-words">
              {PASSWORD_TEXTS.confirmReset(memberName)}
            </p>
          ) : email ? (
            <p className="text-lg font-semibold break-all">{email}</p>
          ) : (
            <p className="text-danger">{PASSWORD_TEXTS.noEmailError}</p>
          )}
          {showEmail && email && !isInactive && (
            <label className="flex min-h-[44px] items-start gap-2">
              <input
                type="checkbox"
                checked={emailConfirmed}
                onChange={(e) => setEmailConfirmed(e.target.checked)}
                className="mt-1 h-5 w-5"
              />
              <span>E-mail jsem si s členem ověřil</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              className="min-h-[44px]"
              loading={loading}
              disabled={!isInactive && (!hasEmail || (showEmail && !emailConfirmed))}
              onClick={handleReset}
            >
              Potvrdit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              disabled={loading}
              onClick={resetUi}
            >
              Zrušit
            </Button>
          </div>
        </div>
      )}

      {mode === "result" && result && (
        <div
          className="rounded-lg border border-border bg-background p-3 text-sm space-y-2"
          role="status"
        >
          {isInactive ? (
            <p>Odkaz pro heslo pošli, až bude zase aktivní.</p>
          ) : result.mailSent ? (
            <p>
              Mail s odkazem pro nastavení hesla odešel{" "}
              {resultEmail ? (
                <>
                  na <strong className="break-all">{resultEmail}</strong>
                </>
              ) : (
                <>
                  členovi <strong className="break-words">{memberName}</strong>
                </>
              )}
              .
            </p>
          ) : (
            <p className="text-danger">
              Mail{" "}
              {resultEmail ? (
                <>
                  na <strong className="break-all">{resultEmail}</strong>
                </>
              ) : (
                <>
                  pro <strong className="break-words">{memberName}</strong>
                </>
              )}{" "}
              se nepodařilo odeslat.
            </p>
          )}
          {!isInactive && (
            <p>
              Odkaz platí 24 hodin a jde použít jen jednou. Řekni členovi, že mail může být ve
              spamu.
            </p>
          )}

          {resendBlocked && (
            <div className="space-y-2">
              <p className="text-danger">
                Člen už odkaz použil a heslo si nastavil, nebo odkaz přestal platit. Poslat znovu
                nejde.
              </p>
              <p>
                Pokud mu heslo opravdu chceš zrušit, dej „Zrušit heslo a poslat nový odkaz“. Člen
                se tím odhlásí.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="min-h-[44px]"
                disabled={loading}
                onClick={startConfirm}
              >
                Zrušit heslo a poslat nový odkaz
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!resendBlocked && !isInactive && (
              <Button
                variant="secondary"
                size="sm"
                className="min-h-[44px]"
                loading={loading}
                onClick={handleResend}
              >
                Poslat znovu
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px]"
              disabled={loading}
              onClick={resetUi}
            >
              Zavřít
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
