"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  resendMagicLinkAction,
  resendAllMagicLinksAction,
  resetParticipantTokenAction,
  removeParticipantAction,
} from "@/actions/events";

interface Participant {
  id: string;
  eventId: string;
  memberId: string | null;
  externalName: string | null;
  externalEmail: string | null;
  magicTokenHash: string | null;
  tokenCreatedAt: Date | null;
  createdAt: Date;
  memberName: string | null;
  memberEmail: string | null;
  voteCount: number;
}

interface EventData {
  id: string;
  status: string;
}

interface ParticipantsManagerProps {
  event: EventData;
  participants: Participant[];
  canEdit: boolean;
}

export function ParticipantsManager({
  event,
  participants,
  canEdit,
}: ParticipantsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function clearMessages() {
    setError(null);
    setSuccessMsg(null);
  }

  function getParticipantName(p: Participant) {
    return p.memberName ?? p.externalName ?? "Nezname";
  }

  function getParticipantEmail(p: Participant) {
    return p.memberEmail ?? p.externalEmail ?? null;
  }

  function isMember(p: Participant) {
    return p.memberId !== null;
  }

  function hasToken(p: Participant) {
    return p.magicTokenHash !== null;
  }

  async function handleCopyLink(participantId: string) {
    clearMessages();
    setPendingId(participantId);

    startTransition(async () => {
      // Reset token to get a fresh raw token we can use
      const result = await resetParticipantTokenAction(participantId);
      setPendingId(null);
      if (!result.success) {
        setError(result.error);
        return;
      }

      try {
        await navigator.clipboard.writeText(result.data!.link);
        setCopiedId(participantId);
        setTimeout(() => setCopiedId(null), 2000);
        router.refresh();
      } catch {
        setError("Kopirovani do schranky selhalo. Zkuste to znovu.");
      }
    });
  }

  function handleResend(participantId: string) {
    clearMessages();
    setPendingId(participantId);

    startTransition(async () => {
      const result = await resendMagicLinkAction(participantId);
      setPendingId(null);
      if (!result.success) {
        setError(result.error);
      } else {
        setSuccessMsg("Pozvanka odeslana.");
      }
    });
  }

  function handleResendAll() {
    if (!confirm(`Odeslat pozvánky všem účastníkům s emailem? Každý dostane nový odkaz.`)) return;
    clearMessages();
    startTransition(async () => {
      const result = await resendAllMagicLinksAction(event.id);
      if (!result.success) {
        setError(result.error);
      } else {
        setSuccessMsg(`Odesláno: ${result.data!.sent} emailů${result.data!.skipped > 0 ? `, přeskočeno: ${result.data!.skipped} (bez emailu)` : ""}.`);
      }
    });
  }

  function handleRemove(participantId: string, name: string) {
    if (!confirm(`Odebrat ucastnika „${name}"?`)) return;
    clearMessages();
    setPendingId(participantId);

    startTransition(async () => {
      const result = await removeParticipantAction(event.id, participantId);
      setPendingId(null);
      if (!result.success) {
        setError(result.error);
      } else {
        setSuccessMsg("Ucastnik odebran.");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-text-main">
          Ucastnici ({participants.length})
        </h2>
        {event.status === "active" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResendAll}
            loading={isPending && pendingId === null}
            disabled={isPending}
          >
            Odeslat všem
          </Button>
        )}
      </div>

      {participants.length > 0 ? (
        <div className="space-y-2">
          {participants.map((p) => {
            const name = getParticipantName(p);
            const email = getParticipantEmail(p);
            const member = isMember(p);
            const tokenActive = hasToken(p);
            const isThisPending = isPending && pendingId === p.id;

            return (
              <div
                key={p.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border bg-background"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-main">
                      {name}
                    </span>
                    <Badge variant={member ? "info" : "neutral"}>
                      {member ? "Clen BNI" : "Externi"}
                    </Badge>
                    {tokenActive ? (
                      <Badge variant="success">Token aktivni</Badge>
                    ) : (
                      <Badge variant="neutral">Bez tokenu</Badge>
                    )}
                  </div>
                  {email && (
                    <p className="text-xs text-text-muted mt-1">{email}</p>
                  )}
                  <p className="text-xs text-text-muted mt-0.5">
                    Hlasy: {p.voteCount}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  {/* Copy magic link */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCopyLink(p.id)}
                    loading={isThisPending && pendingId === p.id}
                    disabled={isPending}
                    title="Zkopirovat magic link (vygeneruje novy token)"
                  >
                    {copiedId === p.id ? "Kopirovano!" : "Kopirovat link"}
                  </Button>

                  {/* Resend email — only in active state, only if email exists */}
                  {event.status === "active" && email && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleResend(p.id)}
                      loading={isThisPending}
                      disabled={isPending}
                    >
                      Znovu odeslat
                    </Button>
                  )}

                  {/* Remove — only in draft/active */}
                  {canEdit && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemove(p.id, name)}
                      loading={isThisPending}
                      disabled={isPending}
                    >
                      Odebrat
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          Zatim zadni ucastnici.
          {canEdit && " Pridejte je pomoci formulare vyse."}
        </p>
      )}

      {error && (
        <p className="text-sm text-danger mt-3" role="alert">
          {error}
        </p>
      )}
      {successMsg && (
        <p className="text-sm text-success mt-3" role="status">
          {successMsg}
        </p>
      )}
    </Card>
  );
}
