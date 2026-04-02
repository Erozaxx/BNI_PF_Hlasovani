"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  activateEventAction,
  closeEventAction,
  deleteEventAction,
  updateEventAction,
} from "@/actions/events";

type EventStatus = "draft" | "active" | "closed" | "done";

interface EventData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  votingType: string;
  votingMaxX: number | null;
  whoCanVote: string;
  customOptionsAllowed: boolean;
  whoCanAddOptions: string;
  createdAt: Date;
  activatedAt: Date | null;
  closedAt: Date | null;
}

interface EventDetailProps {
  event: EventData;
  isAdmin: boolean;
}

const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Priprava",
  active: "Aktivni",
  closed: "Uzavrena",
  done: "Konana",
};

const VOTING_TYPE_LABELS: Record<string, string> = {
  pick_one: "Vyberte jednu moznost",
  multiple: "Vyberte vice moznosti",
  max_x: "Max. N moznosti",
};

const WHO_CAN_LABELS: Record<string, string> = {
  members_only: "Pouze členové BNI",
  anyone_with_link: "Kdokoliv s odkazem",
};

function getStatusBadge(status: string) {
  switch (status) {
    case "draft":
      return <Badge variant="neutral">{STATUS_LABELS.draft}</Badge>;
    case "active":
      return <Badge variant="danger">{STATUS_LABELS.active}</Badge>;
    case "closed":
      return <Badge variant="warning">{STATUS_LABELS.closed}</Badge>;
    case "done":
      return <Badge variant="success">{STATUS_LABELS.done}</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}

export function EventDetail({ event, isAdmin }: EventDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(event.title);
  const [editDescription, setEditDescription] = useState(event.description ?? "");

  const canEdit = event.status === "draft" || event.status === "active";

  function clearMessages() {
    setError(null);
    setSuccessMsg(null);
  }

  function handleActivate() {
    if (!confirm("Spustit akci? Ucastnici ziskaji pristup k hlasovani.")) return;
    clearMessages();
    startTransition(async () => {
      const result = await activateEventAction(event.id);
      if (!result.success) {
        setError(result.error);
      } else {
        setSuccessMsg("Akce byla spustena.");
        router.refresh();
      }
    });
  }

  function handleClose() {
    if (!confirm("Uzavrit akci? Tato akce je nevratna.")) return;
    clearMessages();
    startTransition(async () => {
      const result = await closeEventAction(event.id);
      if (!result.success) {
        setError(result.error);
      } else {
        setSuccessMsg("Akce byla uzavrena.");
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (
      !confirm(
        `Opravdu smazat akci „${event.title}"? Tato akce je nevratna.`
      )
    )
      return;
    clearMessages();
    startTransition(async () => {
      const result = await deleteEventAction(event.id);
      if (!result.success) {
        setError(result.error);
      } else {
        router.push("/events");
      }
    });
  }

  function handleEditSave() {
    if (!editTitle.trim()) {
      setError("Nazev akce je povinny.");
      return;
    }
    clearMessages();
    startTransition(async () => {
      const result = await updateEventAction(
        event.id,
        editTitle,
        editDescription || undefined
      );
      if (!result.success) {
        setError(result.error);
      } else {
        setSuccessMsg("Zmeny ulozeny.");
        setEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <div className="space-y-4">
        {/* Title & status */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-2">
            {editing ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={isPending}
                className="text-xl font-bold"
              />
            ) : (
              <h1 className="text-2xl font-bold text-text-main">{event.title}</h1>
            )}
            <div>{getStatusBadge(event.status)}</div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {canEdit && !editing && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditTitle(event.title);
                  setEditDescription(event.description ?? "");
                  setEditing(true);
                  clearMessages();
                }}
                disabled={isPending}
              >
                Upravit
              </Button>
            )}

            {event.status === "draft" && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleActivate}
                loading={isPending}
              >
                Spustit akci
              </Button>
            )}

            {event.status === "active" && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleClose}
                  loading={isPending}
                >
                  Uzavrit akci
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled
                  title="Nejdrive uzavri akci"
                >
                  Smazat
                </Button>
              </>
            )}

            {(event.status === "draft" ||
              event.status === "closed" ||
              event.status === "done") &&
              isAdmin && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  loading={isPending}
                >
                  Smazat akci
                </Button>
              )}
          </div>
        </div>

        {/* Inline edit form */}
        {editing && (
          <div className="space-y-3 pt-2 border-t border-border">
            <Textarea
              label="Popis"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              disabled={isPending}
              placeholder="Popis akce..."
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleEditSave}
                loading={isPending}
              >
                Ulozit
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  clearMessages();
                }}
                disabled={isPending}
              >
                Zrusit
              </Button>
            </div>
          </div>
        )}

        {/* Description (when not editing) */}
        {!editing && event.description && (
          <p className="text-sm text-text-muted">{event.description}</p>
        )}

        {/* Config info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border text-sm text-text-muted">
          <div>
            <span className="font-medium text-text-main">Typ hlasovani:</span>{" "}
            {VOTING_TYPE_LABELS[event.votingType] ?? event.votingType}
            {event.votingType === "max_x" && event.votingMaxX !== null && (
              <span> (max {event.votingMaxX})</span>
            )}
          </div>
          <div>
            <span className="font-medium text-text-main">Kdo hlasuje:</span>{" "}
            {WHO_CAN_LABELS[event.whoCanVote] ?? event.whoCanVote}
          </div>
          <div>
            <span className="font-medium text-text-main">Vlastni moznosti:</span>{" "}
            {event.customOptionsAllowed ? "Povoleno" : "Zakazano"}
          </div>
          {event.customOptionsAllowed && (
            <div>
              <span className="font-medium text-text-main">
                Kdo prida moznosti:
              </span>{" "}
              {WHO_CAN_LABELS[event.whoCanAddOptions] ?? event.whoCanAddOptions}
            </div>
          )}
          {event.activatedAt && (
            <div>
              <span className="font-medium text-text-main">Spustena:</span>{" "}
              {new Date(event.activatedAt).toLocaleDateString("cs-CZ")}
            </div>
          )}
          {event.closedAt && (
            <div>
              <span className="font-medium text-text-main">Uzavrena:</span>{" "}
              {new Date(event.closedAt).toLocaleDateString("cs-CZ")}
            </div>
          )}
        </div>

        {/* Messages */}
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {successMsg && (
          <p className="text-sm text-success" role="status">
            {successMsg}
          </p>
        )}
      </div>
    </Card>
  );
}
