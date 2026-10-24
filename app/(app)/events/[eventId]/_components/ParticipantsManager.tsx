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
  getParticipantLinkAction,
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
  /** iter-037: členové deaktivovaní k dnešku jsou `false`, externí vždy `true`. */
  memberActive: boolean;
  /** iter-042: účastník má uložený odkaz, Zkopírovat ho jen přečte a nic nezneplatní. */
  hasStoredLink: boolean;
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
    return p.memberName ?? p.externalName ?? "Neznámý";
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

  async function handleCopyLink(participantId: string, hasStoredLink: boolean) {
    // Potvrzení jen když vznikne nový odkaz (účastník žádný uložený nemá).
    if (
      !hasStoredLink &&
      !window.confirm(
        "Zkopírováním vznikne nový odkaz. Ten z e-mailu přestane platit. Pokračovat?"
      )
    )
      return;
    clearMessages();
    setPendingId(participantId);

    startTransition(async () => {
      // Read encrypted token and decrypt - does NOT invalidate the emailed token
      const result = await getParticipantLinkAction(participantId);
      setPendingId(null);
      if (!result.success) {
        setError(result.error);
        return;
      }

      try {
        await navigator.clipboard.writeText(result.data!.link);
        setCopiedId(participantId);
        setTimeout(() => setCopiedId(null), 2000);
        setSuccessMsg(
          result.data!.regenerated
            ? "Odkaz je zkopírovaný. Vznikl nový odkaz, ten z e-mailu už neplatí."
            : "Odkaz je zkopírovaný."
        );
        router.refresh();
      } catch {
        setError("Kopírování do schránky se nepodařilo. Zkus to znovu.");
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
        setSuccessMsg("Pozvánka je odeslaná.");
      }
    });
  }

  function handleResendAll() {
    if (!confirm(`Odeslat pozvánky všem účastníkům s e-mailem? Každý dostane nový odkaz.`)) return;
    clearMessages();
    startTransition(async () => {
      const result = await resendAllMagicLinksAction(event.id);
      if (!result.success) {
        setError(result.error);
      } else {
        const inactive = result.data!.skippedInactive;
        setSuccessMsg(
          `Odesláno: ${result.data!.sent} e-mailů${result.data!.skipped > 0 ? `, přeskočeno: ${result.data!.skipped} (bez e-mailu)` : ""}.` +
            (inactive > 0 ? ` Přeskočeno, neaktivní: ${inactive}` : "")
        );
      }
    });
  }

  function handleRemove(participantId: string, name: string) {
    if (!confirm(`Odebrat účastníka „${name}“?`)) return;
    clearMessages();
    setPendingId(participantId);

    startTransition(async () => {
      const result = await removeParticipantAction(event.id, participantId);
      setPendingId(null);
      if (!result.success) {
        setError(result.error);
      } else {
        setSuccessMsg("Účastník je odebraný.");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-text-main">
          Účastníci ({participants.length})
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
                      {member ? "Člen BNI" : "Externí"}
                    </Badge>
                    {!p.memberActive && <Badge variant="warning">Neaktivní</Badge>}
                    {tokenActive ? (
                      <Badge variant="success">Odkaz platí</Badge>
                    ) : (
                      <Badge variant="neutral">Bez odkazu</Badge>
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
                  {/* Copy magic link (neaktivnímu členovi se odkaz nezobrazuje) */}
                  {p.memberActive && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-[44px]"
                      onClick={() => handleCopyLink(p.id, p.hasStoredLink)}
                      loading={isThisPending && pendingId === p.id}
                      disabled={isPending}
                      title="Zkopíruje odkaz pro účastníka"
                    >
                      {copiedId === p.id ? "Zkopírováno!" : "Zkopírovat odkaz"}
                    </Button>
                  )}

                  {/* Resend email - only in active state, only if email exists */}
                  {event.status === "active" && email && p.memberActive && (
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

                  {/* Remove - only in draft/active */}
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
          Zatím žádní účastníci.
          {canEdit && " Přidej je ve formuláři výše."}
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
