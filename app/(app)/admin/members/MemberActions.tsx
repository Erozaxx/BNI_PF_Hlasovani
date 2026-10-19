"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  generateMagicLinkAction,
  revokeTokenAction,
  sendMagicLinkEmailAction,
} from "@/actions/members";

/**
 * iter-037 (T-003c, arch 8.2): osobní odkaz na stránce člena. Stav z
 * `personalLinkState` („Platný do 24. 10.“, „Zneplatněný“, „Žádný“),
 * u neaktivního člena je generování a odeslání nedostupné.
 */
interface MemberActionsProps {
  memberId: string;
  hasToken: boolean;
  stateLabel: string;
  isInactive: boolean;
}

const storageKey = (id: string) => `magic_link_${id}`;

export function MemberActions({ memberId, hasToken, stateLabel, isInactive }: MemberActionsProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [magicLink, setMagicLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Restore previously generated link from localStorage
  useEffect(() => {
    if (hasToken) {
      const stored = localStorage.getItem(storageKey(memberId));
      if (stored) setMagicLink(stored);
    } else {
      localStorage.removeItem(storageKey(memberId));
      setMagicLink("");
    }
  }, [memberId, hasToken]);

  async function handleGenerateLink() {
    setLoading(true);
    setError("");
    setMagicLink("");

    try {
      const result = await generateMagicLinkAction(memberId);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else if (result.data) {
        setMagicLink(result.data.magicLink);
        localStorage.setItem(storageKey(memberId), result.data.magicLink);
        showToast("success", "Odkaz byl vygenerován.");
        router.refresh();
      }
    } catch {
      setError("Nepodařilo se vygenerovat odkaz.");
      showToast("error", "Nepodařilo se vygenerovat odkaz.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    if (
      !confirm(
        "Osobní odkaz přestane platit hned a člen se odhlásí ze všech zařízení. Přihlásit se může dál, nový odkaz si vyžádá na přihlašovací stránce. Když ho chceš zablokovat, deaktivuj ho."
      )
    )
      return;
    setLoading(true);
    setError("");

    try {
      const result = await revokeTokenAction(memberId);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setMagicLink("");
        localStorage.removeItem(storageKey(memberId));
        showToast("success", "Odkaz už neplatí.");
        router.refresh();
      }
    } catch {
      setError("Odkaz se nepodařilo zneplatnit.");
      showToast("error", "Odkaz se nepodařilo zneplatnit.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(magicLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  async function handleSendEmail() {
    setSendingEmail(true);
    setError("");

    try {
      const result = await sendMagicLinkEmailAction(memberId);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else if (result.data) {
        setMagicLink(result.data.magicLink);
        localStorage.setItem(storageKey(memberId), result.data.magicLink);
        showToast("success", "E-mail s odkazem byl odeslán.");
        router.refresh();
      }
    } catch {
      setError("Nepodařilo se odeslat e-mail.");
      showToast("error", "Nepodařilo se odeslat e-mail.");
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span className="text-text-muted">Stav: </span>
        <span className="font-medium">{stateLabel}</span>
      </p>

      {isInactive && (
        <p className="text-sm text-text-muted">Neaktivnímu členovi odkaz neposíláme.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="min-h-[44px]"
          onClick={handleGenerateLink}
          loading={loading}
          disabled={isInactive}
        >
          Vygenerovat odkaz
        </Button>
        {hasToken && (
          <Button
            variant="danger"
            size="sm"
            className="min-h-[44px]"
            onClick={handleRevoke}
            loading={loading}
          >
            Zneplatnit odkaz
          </Button>
        )}
      </div>

      {magicLink && !isInactive && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={magicLink}
            aria-label="Osobní odkaz"
            className="h-11 min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
          />
          <Button variant="secondary" size="sm" className="min-h-[44px]" onClick={handleCopy}>
            {copied ? "Zkopírováno" : "Kopírovat"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[44px]"
            onClick={handleSendEmail}
            loading={sendingEmail}
          >
            Poslat e-mailem
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
