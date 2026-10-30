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
  setMemberFunctionAction,
  setMemberRoleAction,
} from "@/actions/member-access";
import { roleLabel } from "@/lib/members/labels";

/**
 * iter-032 (arch 4.2, 5.3; gate U1, U7), iter-037 (T-003c): funkce, role a
 * heslo člena na stránce člena. Jen s právem `access.manage`.
 *
 * Funkce (Člen výboru, Viceprezident, Prezident) a role (Moderátor, Admin)
 * jsou dvě nezávislé volby, práva se sčítají. Člen má nejvýš jednu funkci.
 * Heslo má držitel funkce i bez role (T-003b).
 *
 * Odkaz ke zkopírování (U1) žije jen ve stavu komponenty: nikdy
 * localStorage, URL stránky ani console.
 *
 * „Poslat znovu" (T-006r, review F-02) jen vymění token nepoužitého odkazu
 * a heslo nemění. Když si člen heslo už nastavil, okno to řekne a nabídne
 * vědomý reset s potvrzením adresy.
 */

type RoleChoice = "none" | "moderator" | "admin";
type Mode = "idle" | "confirm-role" | "confirm-function" | "confirm-reset" | "result";

export interface FunctionChoice {
  id: string;
  name: string;
}

interface MemberAccessControlsProps {
  memberId: string;
  memberName: string;
  email: string | null;
  managementRole: "admin" | "moderator" | null;
  /** Skutečné heslo (zámkový hash a čekající odkaz „nastav si heslo“ se nepočítá). */
  hasPassword: boolean;
  /** Přihlášený admin nesmí měnit vlastní roli ani heslo. */
  isSelf: boolean;
  /** Funkce smí sobě měnit jen admin (server to hlídá znovu). */
  canChangeFunction: boolean;
  functions: FunctionChoice[];
  currentFunctionId: string | null;
  isInactive: boolean;
}

const ROLE_OPTIONS: { value: RoleChoice; label: string }[] = [
  { value: "none", label: "Žádná" },
  { value: "moderator", label: "Moderátor" },
  { value: "admin", label: "Admin" },
];

const NO_FUNCTION = "";
const INACTIVE_LINK_TEXT = "Odkaz pro heslo pošli, až bude zase aktivní.";

function toChoice(role: "admin" | "moderator" | null): RoleChoice {
  return role ?? "none";
}

const selectClass =
  "h-11 w-full max-w-xs px-2 rounded-lg border border-border bg-white text-base disabled:bg-background disabled:text-text-disabled";

export function MemberAccessControls({
  memberId,
  memberName,
  email,
  managementRole,
  hasPassword,
  isSelf,
  canChangeFunction,
  functions,
  currentFunctionId,
  isInactive,
}: MemberAccessControlsProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const current = toChoice(managementRole);
  const currentFn = currentFunctionId ?? NO_FUNCTION;

  const [selected, setSelected] = useState<RoleChoice>(current);
  const [selectedFn, setSelectedFn] = useState<string>(currentFn);
  const [mode, setMode] = useState<Mode>("idle");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    mailSent: boolean;
    email: string | null;
    skippedInactive: boolean;
  } | null>(null);
  const [copyUrl, setCopyUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resendBlocked, setResendBlocked] = useState(false);

  useEffect(() => {
    setSelected(current);
  }, [current]);
  useEffect(() => {
    setSelectedFn(currentFn);
  }, [currentFn]);

  const hasFunction = currentFunctionId !== null;
  const isPromote = current === "none" && selected !== "none";
  const isDemote = current !== "none" && selected === "none";
  // Funkce: první funkce člena bez skutečného hesla = odkaz pro nastavení hesla
  // mailem (server posílá jen k první funkci, ne při změně funkce).
  const fnFirstAccess = selectedFn !== NO_FUNCTION && !hasFunction && !hasPassword;
  const fnRemovesPassword =
    selectedFn === NO_FUNCTION && hasFunction && managementRole === null;
  const needsEmailConfirm =
    (mode === "confirm-role" && isPromote && !hasPassword) ||
    mode === "confirm-reset" ||
    (mode === "confirm-function" && fnFirstAccess && !isInactive);
  // Reset jde i členovi, který čeká na odkaz (zámkový hash není heslo, MIN-1):
  // jen tudy se po zavření okna dá odkaz poslat znovu.
  const canReset = (managementRole !== null || hasFunction) && !isSelf;

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
      // Povýšení člena, který už heslo má (držitel funkce), mail neposílá.
      if (data?.kind === "promote" && (data.mailSent || !hasPassword)) {
        setResult({ mailSent: data.mailSent, email: data.email, skippedInactive: false });
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

  async function handleConfirmFunction() {
    setLoading(true);
    setError("");
    try {
      const res = await setMemberFunctionAction(
        memberId,
        selectedFn === NO_FUNCTION ? null : selectedFn,
        currentFunctionId
      );
      if (!res.success) {
        setError(res.error);
        showToast("error", res.error);
        return;
      }
      const data = res.data;
      if (data && data.kind === "assign" && (data.mailSent || data.linkSkippedInactive || fnFirstAccess)) {
        setResult({
          mailSent: data.mailSent,
          email: data.email,
          skippedInactive: data.linkSkippedInactive,
        });
        setMode("result");
      } else {
        resetUi();
        showToast(
          "success",
          data?.passwordCleared
            ? "Funkce byla odebrána. Heslo se smazalo, člen se bude přihlašovat odkazem z mailu."
            : data?.changed
              ? "Funkce byla změněna."
              : "Funkce je beze změny."
        );
      }
      router.refresh();
    } catch {
      setError("Funkci se nepodařilo změnit.");
      showToast("error", "Funkci se nepodařilo změnit.");
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
      setResult({
        mailSent: res.data?.mailSent ?? false,
        email: res.data?.email ?? email,
        skippedInactive: false,
      });
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
        setResult({
          mailSent: res.data.mailSent,
          email: res.data.email ?? email,
          skippedInactive: false,
        });
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
  const confirming = mode === "confirm-role" || mode === "confirm-function" || mode === "confirm-reset";
  const functionName = functions.find((f) => f.id === currentFunctionId)?.name ?? null;
  const role = roleLabel(managementRole);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1">
        {functionName && <Badge variant="category">{functionName}</Badge>}
        {role && <Badge variant={managementRole === "admin" ? "danger" : "info"}>{role}</Badge>}
        {!functionName && !role && <Badge variant="neutral">Běžný člen</Badge>}
      </div>

      {mode !== "result" && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-text-muted">
            Funkce je pozice ve vedení chapteru. Člen výboru má práva moderátora, Prezident a
            Viceprezident práva admina, jen nepřidělují admina a funkce. Role Moderátor a
            Admin se nastavují zvlášť a práva se sčítají. Odkaz z mailu dává vždy jen práva
            člena, vedení se přihlašuje heslem.
          </p>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor={`function-${memberId}`}>
              Funkce
              <span className="sr-only"> člena {memberName}</span>
            </label>
            <select
              id={`function-${memberId}`}
              value={selectedFn}
              disabled={!canChangeFunction || loading || confirming}
              onChange={(e) => {
                setSelectedFn(e.target.value);
                setMode("idle");
                setEmailConfirmed(false);
                setError("");
              }}
              className={selectClass}
            >
              <option value={NO_FUNCTION}>Běžný člen</option>
              {functions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {!canChangeFunction ? (
              <p className="text-xs text-text-muted">Vlastní funkci měnit nejde.</p>
            ) : (
              mode === "idle" && (
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-[44px]"
                    disabled={selectedFn === currentFn || loading}
                    onClick={() => {
                      setMode("confirm-function");
                      setEmailConfirmed(false);
                      setError("");
                    }}
                  >
                    Uložit funkci
                  </Button>
                </div>
              )
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor={`role-${memberId}`}>
              Role
              <span className="sr-only"> člena {memberName}</span>
            </label>
            <select
              id={`role-${memberId}`}
              value={selected}
              disabled={isSelf || loading || confirming}
              onChange={(e) => {
                setSelected(e.target.value as RoleChoice);
                setMode("idle");
                setEmailConfirmed(false);
                setError("");
              }}
              className={selectClass}
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
                    className="min-h-[44px]"
                    disabled={selected === current || loading}
                    onClick={() => {
                      setMode("confirm-role");
                      setEmailConfirmed(false);
                      setError("");
                    }}
                  >
                    Uložit roli
                  </Button>
                </div>
              )
            )}
          </div>

          {mode === "idle" && canReset && (
            <div>
              <Button
                variant="secondary"
                size="sm"
                className="min-h-[44px]"
                disabled={loading}
                onClick={() => {
                  setMode("confirm-reset");
                  setEmailConfirmed(false);
                  setError("");
                }}
              >
                Poslat odkaz pro nové heslo
              </Button>
            </div>
          )}
        </div>
      )}

      {confirming && (
        <div className="rounded-lg border border-border bg-background p-3 text-sm space-y-2">
          {mode === "confirm-role" && isPromote && !hasPassword && (
            <p>Člen dostane mailem odkaz pro nastavení hesla na adresu:</p>
          )}
          {mode === "confirm-role" && isPromote && hasPassword && (
            <p>Člen už heslo má, mail se neposílá. Člen se musí znovu přihlásit.</p>
          )}
          {mode === "confirm-function" && fnFirstAccess && !isInactive && (
            <p>Člen dostane mailem odkaz pro nastavení hesla na adresu:</p>
          )}
          {mode === "confirm-function" && fnFirstAccess && isInactive && (
            <p>{INACTIVE_LINK_TEXT}</p>
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
              <p className="text-danger">
                Člen nemá e-mail. Nejdřív mu ho doplň, odkaz pro heslo jde na e-mail.
              </p>
            ))}
          {mode === "confirm-role" && !isPromote && !isDemote && (
            <p>Člen se musí znovu přihlásit.</p>
          )}
          {mode === "confirm-role" && isDemote && (
            <p>
              {hasFunction
                ? "Člen se musí znovu přihlásit. Heslo mu zůstane, protože má funkci."
                : "Heslo se smaže, člen se bude přihlašovat odkazem z mailu."}
            </p>
          )}
          {mode === "confirm-function" && fnRemovesPassword && (
            <p>Heslo se smaže, člen se bude přihlašovat odkazem z mailu.</p>
          )}
          {mode === "confirm-function" && !fnFirstAccess && !fnRemovesPassword && (
            <p>
              Práva se změní hned. Člen se nemusí znovu přihlašovat, nové funkce se projeví při
              dalším kliknutí.
            </p>
          )}
          {needsEmailConfirm && email && (
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
              disabled={needsEmailConfirm && (!email || !emailConfirmed)}
              onClick={
                mode === "confirm-role"
                  ? handleConfirmRole
                  : mode === "confirm-function"
                    ? handleConfirmFunction
                    : handleReset
              }
            >
              Potvrdit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              disabled={loading}
              onClick={() => {
                resetUi();
                setSelected(current);
                setSelectedFn(currentFn);
              }}
            >
              Zrušit
            </Button>
          </div>
        </div>
      )}

      {mode === "result" && result && (
        <div className="rounded-lg border border-border bg-background p-3 text-sm space-y-2" role="status">
          {result.skippedInactive ? (
            <p>{INACTIVE_LINK_TEXT}</p>
          ) : result.mailSent ? (
            <p>
              Mail s odkazem pro nastavení hesla odešel na <strong className="break-all">{resultEmail}</strong>.
            </p>
          ) : (
            <p className="text-danger">
              Mail na <strong className="break-all">{resultEmail}</strong> se nepodařilo odeslat.
            </p>
          )}
          {!result.skippedInactive && (
            <p>
              Odkaz platí 24 hodin a jde použít jen jednou. Řekni členovi, že mail může být ve spamu.
            </p>
          )}

          {copyUrl ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={copyUrl}
                  aria-label="Odkaz pro nastavení hesla"
                  className="text-xs bg-white border border-border rounded px-2 py-1 flex-1 min-w-0 h-11"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button variant="secondary" size="sm" className="min-h-[44px]" onClick={handleCopy}>
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
              <Button
                variant="secondary"
                size="sm"
                className="min-h-[44px]"
                disabled={loading}
                onClick={startConfirmReset}
              >
                Zrušit heslo a poslat nový odkaz
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!resendBlocked && !result.skippedInactive && (
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
            {!copyUrl && !resendBlocked && !result.skippedInactive && (
              <Button
                variant="secondary"
                size="sm"
                className="min-h-[44px]"
                disabled={loading}
                onClick={handleShowCopyLink}
              >
                Zobrazit odkaz ke zkopírování
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
