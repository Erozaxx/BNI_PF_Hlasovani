"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { VoteResults } from "@/components/votes/VoteResults";
import type { getVotingResults } from "@/lib/db/queries/votes";

type VotingResult = Awaited<ReturnType<typeof getVotingResults>>[number];

export interface MeetingGuestRow {
  guestId: string;
  guestName: string;
  categoryName: string | null;
}

interface SortableMeetingGuestListProps {
  meetingId: string;
  meetingStatus: string;
  guests: MeetingGuestRow[];
  /** Serialized results keyed by guestId (empty when results are hidden). */
  resultsByGuest: Record<string, VotingResult[]>;
  /** Whether drag&drop reorder is enabled (management + draft/active). */
  reorderable: boolean;
}

/** Card body for a single guest — clickable Link to guest detail. */
function GuestCard({
  meetingId,
  g,
  results,
  meetingStatus,
}: {
  meetingId: string;
  g: MeetingGuestRow;
  results: VotingResult[] | undefined;
  meetingStatus: string;
}) {
  return (
    <>
      <Link href={`/guests/${g.guestId}?from=/meetings/${meetingId}`}>
        <Card variant="interactive">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-main">{g.guestName}</p>
              <Badge variant="category" className="mt-1">
                {g.categoryName ?? "[bez kategorie]"}
              </Badge>
            </div>
            <Button variant="link" size="sm">
              Detail &rarr;
            </Button>
          </div>
        </Card>
      </Link>
      {results && results.length > 0 && (
        <Card className="mt-2 ml-4">
          <h3 className="text-sm font-semibold text-text-muted mb-2">
            Vysledky hlasovani
          </h3>
          <VoteResults results={results} meetingStatus={meetingStatus} />
        </Card>
      )}
    </>
  );
}

function SortableGuestItem({
  meetingId,
  g,
  results,
  meetingStatus,
}: {
  meetingId: string;
  g: MeetingGuestRow;
  results: VotingResult[] | undefined;
  meetingStatus: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: g.guestId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="mb-3">
      <div className="flex items-start gap-2">
        {/* Dedicated drag handle — keeps the rest of the row clickable (Link). */}
        <button
          type="button"
          aria-label="Přetáhnout pro změnu pořadí"
          className="mt-3 cursor-grab touch-none select-none px-1 text-lg text-text-muted hover:text-text-main active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          ≡
        </button>
        <div className="flex-1 min-w-0">
          <GuestCard
            meetingId={meetingId}
            g={g}
            results={results}
            meetingStatus={meetingStatus}
          />
        </div>
      </div>
    </div>
  );
}

export function SortableMeetingGuestList({
  meetingId,
  meetingStatus,
  guests,
  resultsByGuest,
  reorderable,
}: SortableMeetingGuestListProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<MeetingGuestRow[]>(guests);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Non-reorderable (member view, or voting/closed): plain list, full row clickable.
  if (!reorderable) {
    return (
      <div className="space-y-3">
        {guests.map((g) => (
          <div key={g.guestId} className="mb-3">
            <GuestCard
              meetingId={meetingId}
              g={g}
              results={resultsByGuest[g.guestId]}
              meetingStatus={meetingStatus}
            />
          </div>
        ))}
      </div>
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((g) => g.guestId === active.id);
    const newIndex = items.findIndex((g) => g.guestId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = items;
    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered); // optimistic

    try {
      const res = await fetch(
        `/api/meetings/${meetingId}/guests/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderedGuestIds: reordered.map((g) => g.guestId),
          }),
        }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      showToast("success", "Poradi hostu ulozeno.");
      router.refresh();
    } catch {
      setItems(previous); // rollback
      showToast("error", "Nepodarilo se ulozit poradi.");
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((g) => g.guestId)}
        strategy={verticalListSortingStrategy}
      >
        <div>
          {items.map((g) => (
            <SortableGuestItem
              key={g.guestId}
              meetingId={meetingId}
              g={g}
              results={resultsByGuest[g.guestId]}
              meetingStatus={meetingStatus}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
