"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { sendInterviewLinkAction } from "@/actions/interviews";

interface LinkStatus {
  expiresAt: string | Date;
  revokedAt: string | Date | null;
  lastSentAt: string | Date | null;
}

interface SendInterviewLinkFormProps {
  interviewId: string;
  interviewStatus: string;
  leaderName: string | null;
  leaderHasEmail: boolean;
  linkStatus: LinkStatus | null;
}

/**
 * Detail-page card for sending / (re)generating the interview leader's scoped
 * magic link (arch 8c, T-008). Generation and regeneration are the exact same
 * server action (generateOrRegenerateInterviewToken is UPSERT-only, H-9) - the
 * button label just reflects whether a link has ever been sent yet.
 */
export function SendInterviewLinkForm({
  interviewId,
  interviewStatus,
  leaderName,
  leaderHasEmail,
  linkStatus,
}: SendInterviewLinkFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    setLoading(true);
    try {
      const result = await sendInterviewLinkAction(interviewId);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast("success", "Odkaz je odeslaný.");
        router.refresh();
      }
    } catch {
      showToast("error", "Odkaz se nepodařilo odeslat.");
    } finally {
      setLoading(false);
    }
  }

  if (interviewStatus !== "open") {
    return (
      <p className="text-sm text-text-muted">
        Odkaz jde odeslat jen u otevřeného pohovoru.
      </p>
    );
  }

  if (!leaderName) {
    return (
      <p className="text-sm text-text-muted">
        Nejdřív výše přiřaď vedoucího pohovoru.
      </p>
    );
  }

  const revoked = linkStatus?.revokedAt != null;
  const expired = linkStatus && new Date(linkStatus.expiresAt) < new Date();

  return (
    <div className="space-y-3">
      {!leaderHasEmail && (
        <p className="text-sm text-warning">
          Vedoucí ({leaderName}) nemá e-mail. Doplň ho v sekci Členové, pak půjde odkaz odeslat.
        </p>
      )}

      {linkStatus && (
        <div className="text-sm text-text-muted space-y-1">
          {linkStatus.lastSentAt && (
            <p>
              Naposledy odesláno:{" "}
              {new Date(linkStatus.lastSentAt).toLocaleString("cs-CZ")}
            </p>
          )}
          <p>
            Platnost do: {new Date(linkStatus.expiresAt).toLocaleString("cs-CZ")}
            {revoked && " (zneplatněný)"}
            {!revoked && expired && " (vypršel)"}
          </p>
        </div>
      )}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="min-h-[44px]"
        loading={loading}
        disabled={!leaderHasEmail}
        onClick={handleSend}
      >
        {linkStatus ? "Nový odkaz a odeslat" : "Odeslat odkaz"}
      </Button>
    </div>
  );
}
