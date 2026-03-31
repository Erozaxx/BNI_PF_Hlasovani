"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { generateMagicLinkAction, revokeTokenAction } from "@/actions/members";

interface MemberActionsProps {
  memberId: string;
  hasToken: boolean;
}

export function MemberActions({ memberId, hasToken }: MemberActionsProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [magicLink, setMagicLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

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
        showToast("success", "Odkaz byl vygenerovan.");
        router.refresh();
      }
    } catch {
      setError("Nepodarilo se vygenerovat odkaz.");
      showToast("error", "Nepodarilo se vygenerovat odkaz.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    if (!confirm("Opravdu chcete revokovat pristupovy odkaz?")) return;
    setLoading(true);
    setError("");

    try {
      const result = await revokeTokenAction(memberId);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setMagicLink("");
        showToast("success", "Odkaz byl revokovany.");
        router.refresh();
      }
    } catch {
      setError("Nepodarilo se revokovat odkaz.");
      showToast("error", "Nepodarilo se revokovat odkaz.");
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleGenerateLink}
          loading={loading}
        >
          Generovat odkaz
        </Button>
        {hasToken && (
          <Button
            variant="danger"
            size="sm"
            onClick={handleRevoke}
            loading={loading}
          >
            Revokovat
          </Button>
        )}
      </div>

      {magicLink && (
        <div className="flex items-center gap-2 mt-1">
          <input
            readOnly
            value={magicLink}
            className="text-xs bg-background border border-border rounded px-2 py-1 flex-1 min-w-0"
          />
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? "Zkopirovano!" : "Kopirovat"}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
