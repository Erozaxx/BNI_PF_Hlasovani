"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  issueSetPasswordLinkForCopyAction,
  resendSetPasswordLinkAction,
  resetMemberPasswordAction,
  setMemberRoleAction,
} from "@/actions/member-access";

/**
 * iter-032 (arch 4.2, 5.3; gate U1, U7): role a odkaz pro heslo v řádku
 * člena. Jen pro admina (stránka /admin/members).
 *
 * Odkaz ke zkopírování (U1) žije jen ve stavu komponenty: nikdy
 * localStorage, URL stránky ani console.
 *
 * „Poslat znovu" (T-006r, review F-02) jen vymění token nepoužitého odkazu
 * a heslo nemění. Když si člen heslo už nastavil, okno to řekne a nabídne
 * vědomý reset s potvrzením adresy.
 */

type RoleChoice = "none" | "moderator" | "admin";
type Mode = "idle" | "confirm-role" | "confirm-reset" | "result";

interface MemberAccessControlsProps {
  memberId: string;
  memberName: string;
  email: string | null;
  managementRole: "admin" | "moderator" | null;
  hasPassword: boolean;
  isSelf: boolean;
}

const ROLE_OPTIONS: { value: RoleChoice; label: string }[] = [
  { value: "none", label: "Žádná" },
  { value: "moderator", label: "Moderátor" },
  { value: "admin", label: "Admin" },
];

function toChoice(role: "admin" | "moderator" | null): RoleChoice {
  return role ?? "none";
}

export function MemberAccessControls({
  memberId,
  memberName,
  email,
  managementRole,
  hasPassword,
  isSelf,
}: MemberAccessControlsProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const current = toChoice(managementRole);

  const [selected, setSelected] = useState<RoleChoice>(current);
  const [mode, setMode] = useState<Mode>("idle");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ mailSent: boolean; email: string | null } | null>(null);
  const [copyUrl, setCopyUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resendBlocked, setResendBlocked] = useState(false);

  useEffect(() => {
    setSelected(current);
  }, [current]);

  const isPromote = current === "none" && selected !== "none";
  const isDemote = current !== "none" && selected === "none";
  const needsEmailConfirm = (mode === "confirm-role" && isPromote) || mode === "confirm-reset";
  const canReset = managementRole !== null && hasPassword && !isSelf;

  function resetUi() {
    setMode("idle");
    setEmailConfirmed(false);
    setError("");
    setResult(null);
    setCopyUrl(null);
    setCopied(false);
    setResendBlocked(false);
  }

  async function handleConfirmRole() {
    setLoading(true);
    setError("");
    try {
      const res = await setMemberRoleAction(memberId, selected);
      if (!res.success) {
        setError(res.error);
        showToast("error", res.error);
        return;
      }
      const data = res.data;
      if (data?.kind === "promote") {
        setResult({ mailSent: data.mailSent, email: data.email });
        setMode("result");
      } else {
        resetUi();
        showToast("success", data?.changed ? "Role byla změněna." : "Role je beze změny.");
      }
      router.refresh();
    } catch {
      setError("Roli se nepodařilo změnit.");
      showToast("error", "Roli se nepodařilo změnit.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    setLoading(true);
    setError("");
    setCopyUrl(null);
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
    setCopyUrl(null);
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

  function startConfirmReset() {
    setResult(null);
    setCopyUrl(null);
    setCopied(false);
    setResendBlocked(false);
    setEmailConfirmed(false);
    setError("");
    setMode("confirm-reset");
  }

  async function handleShowCopyLink() {
    setLoading(true);
    setError("");
    try {
      const res = await issueSetPasswordLinkForCopyAction(memberId);
      if (!res.success) {
        setError(res.error);
        showToast("error", res.error);
        return;
      }
      setCopyUrl(res.data?.url ?? null);
      setCopied(false);
    } catch {
      setError("Odkaz se nepodařilo vytvořit.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!copyUrl) return;
    try {
      await navigator.clipboard.writeText(copyUrl);
      setCopied(true);
    } catch {
      // Schránka nedostupná, odkaz jde označit a zkopírovat ručně z pole.
    }
  }

  const resultEmail = result?.email ?? email ?? "";

  return (
    <div className="flex flex-col gap-2 min-w-[12rem]">
      <div>
        {managementRole ? (
          <Badge variant={managementRole === "admin" ? "danger" : "info"}>{managementRole}</Badge>
        ) : (
          <Badge variant="neutral">clen</Badge>
        )}
      </div>

      {mode !== "result" && (
        <div className="flex flex-col gap-2">
          <label className="sr-only" htmlFor={`role-${memberId}`}>
            Role člena {memberName}
          </label>
          <select
            id={`role-${memberId}`}
            value={selected}
            disabled={isSelf || loading}
            onChange={(e) => {
              setSelected(e.target.value as RoleChoice);
              setMode("idle");
              setEmailConfirmed(false);
              setError("");
            }}
            className="h-9 px-2 rounded-lg border border-border bg-white text-sm disabled:bg-background disabled:text-text-disabled"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {isSelf ? (
            <p className="text-xs text-text-muted">Vlastní roli měnit nejde.</p>
          ) : (
            mode === "idle" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={selected === current || loading}
                  onClick={() => {
                    setMode("confirm-role");
                    setEmailConfirmed(false);
                    setError("");
                  }}
                >
                  Uložit roli
                </Button>
                {canReset && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={loading}
                    onClick={() => {
                      setMode("confirm-reset");
                      setEmailConfirmed(false);
                      setError("");
                    }}
                  >
                    Poslat odkaz pro nové heslo
                  </Button>
                )}
              </div>
            )
          )}
        </div>
      )}

      {(mode === "confirm-role" || mode === "confirm-reset") && (
        <div className="rounded-lg border border-border bg-background p-3 text-sm space-y-2">
          {mode === "confirm-role" && isPromote && (
            <p>Člen dostane mailem odkaz pro nastavení hesla na adresu:</p>
          )}
          {mode === "confirm-reset" && (
            <p>
              Současné heslo přestane platit hned a člen se odhlásí. Odkaz pro nové heslo odejde
              na adresu:
            </p>
          )}
          {needsEmailConfirm &&
            (email ? (
              <p className="text-lg font-semibold break-all">{email}</p>
            ) : (
              <p className="text-danger">Člen nemá e-mail. Nejdřív mu ho doplň.</p>
            ))}
          {mode === "confirm-role" && !isPromote && !isDemote && (
            <p>Člen se musí znovu přihlásit.</p>
          )}
          {mode === "confirm-role" && isDemote && (
            <p>Heslo se smaže, člen se bude přihlašovat odkazem z mailu.</p>
          )}
          {needsEmailConfirm && email && (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={emailConfirmed}
                onChange={(e) => setEmailConfirmed(e.target.checked)}
                className="mt-1"
              />
              <span>E-mail jsem si s členem ověřil</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              disabled={needsEmailConfirm && (!email || !emailConfirmed)}
              onClick={mode === "confirm-role" ? handleConfirmRole : handleReset}
            >
              Potvrdit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={loading}
              onClick={() => {
                resetUi();
                setSelected(current);
              }}
            >
              Zrušit
            </Button>
          </div>
        </div>
      )}

      {mode === "result" && result && (
        <div className="rounded-lg border border-border bg-background p-3 text-sm space-y-2" role="status">
          {result.mailSent ? (
            <p>
              Mail s odkazem pro nastavení hesla odešel na <strong className="break-all">{resultEmail}</strong>.
            </p>
          ) : (
            <p className="text-danger">
              Mail na <strong className="break-all">{resultEmail}</strong> se nepodařilo odeslat.
            </p>
          )}
          <p>
            Odkaz platí 24 hodin a jde použít jen jednou. Řekni členovi, že mail může být ve spamu.
          </p>

          {copyUrl ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={copyUrl}
                  aria-label="Odkaz pro nastavení hesla"
                  className="text-xs bg-white border border-border rounded px-2 py-1 flex-1 min-w-0"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button variant="secondary" size="sm" onClick={handleCopy}>
                  {copied ? "Zkopírováno" : "Kopírovat"}
                </Button>
              </div>
              <p>
                Odkaz z mailu tím přestal platit. Pošli členovi tenhle, platí 24 hodin a jen jednou.
              </p>
            </div>
          ) : null}

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
              <Button variant="secondary" size="sm" disabled={loading} onClick={startConfirmReset}>
                Zrušit heslo a poslat nový odkaz
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!resendBlocked && (
              <Button variant="secondary" size="sm" loading={loading} onClick={handleResend}>
                Poslat znovu
              </Button>
            )}
            {!copyUrl && !resendBlocked && (
              <Button variant="secondary" size="sm" disabled={loading} onClick={handleShowCopyLink}>
                Zobrazit odkaz ke zkopírování
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={loading} onClick={resetUi}>
              Zavřít
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
