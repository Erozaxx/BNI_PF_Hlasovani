"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { resendSetPasswordLinkAction, resetMemberPasswordAction } from "@/actions/member-access";

/**
 * iter-043 (gate K13 A, K15 A): reset hesla člena vedení pro každého s právem
 * `access.password_reset` (moderátor, Člen výboru, Prezident, Viceprezident).
 * Převzatá část z `MemberAccessControls`, jen heslo: „Poslat odkaz pro nové
 * heslo“, potvrzení adresy, výsledek s „Poslat znovu“. Odkaz ke zkopírování
 * tu NENÍ, ten smí jen admin (zkopírovaný odkaz by si volající otevřel sám).
 *
 * Stav drží komponenta, ne stránka: po `router.refresh()` výsledkové okno
 * nesmí zmizet (LL-017).
 */

type Mode = "idle" | "confirm" | "result";

interface PasswordResetControlsProps {
  memberId: string;
  memberName: string;
  email: string | null;
  isInactive: boolean;
}

export function PasswordResetControls({
  memberId,
  memberName,
  email,
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

  return (
    <div className="flex flex-col gap-3">
      {mode === "idle" && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[44px]"
            disabled={loading}
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
              Současné heslo přestane platit hned a člen se odhlásí. Odkaz pro nové heslo odejde
              na adresu:
            </p>
          )}
          {isInactive ? null : email ? (
            <p className="text-lg font-semibold break-all">{email}</p>
          ) : (
            <p className="text-danger">
              Člen nemá e-mail. Nejdřív mu ho doplňte ve správě členů, odkaz pro heslo jde na e-mail.
            </p>
          )}
          {email && !isInactive && (
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
              disabled={!isInactive && (!email || !emailConfirmed)}
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
              Mail s odkazem pro nastavení hesla odešel na{" "}
              <strong className="break-all">{resultEmail}</strong>.
            </p>
          ) : (
            <p className="text-danger">
              Mail na <strong className="break-all">{resultEmail}</strong> se nepodařilo odeslat.
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
