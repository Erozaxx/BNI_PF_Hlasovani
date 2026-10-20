"use client";

import { useEffect, useState } from "react";
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
import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { roleLabel } from "@/lib/members/labels";

/**
 * iter-037 (T-003c, arch 8.1): seznam členů jako karty. Tabulka na 390 px
 * přetékala a deaktivace ani funkce se do buňky nevejdou. Údaje člena se
 * upravují na stránce člena (`/admin/members/[id]`), tady jen přehled,
 * štítky a přetahování pořadí.
 */
export interface MemberRow {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  obor: string | null;
  managementRole: string | null;
  /** Název funkce z katalogu (Prezident, Viceprezident, Člen výboru) nebo `null`. */
  functionName: string | null;
  /** „Neaktivní do 30. 11. 2026“ / „Neaktivní do odvolání“, u aktivního `null`. */
  inactiveLabel: string | null;
  /** iter-038: člen má příznak Správce docházky (štítek v seznamu). */
  attendanceManager: boolean;
  /** Number of interview records (any status) that would cascade-delete with this member (R-11). */
  interviewCount: number;
  /** From getInterviewDueList() (arch iter-023 T-001 §3.1), unchanged upstream logic. */
  due5: boolean;
  due10: boolean;
}

/**
 * Chip linking to a pre-filled "founding interview" form (arch iter-023 T-001
 * §3.2). Plain <Link> wrapping a <Badge> (<span>), no interactive descendant,
 * not nested inside another <Link>/<button> (iter-022 lesson, kept even though
 * that regression never actually happened, see decision_iter-023_T-002 §3).
 */
function DueChip({
  type,
  memberId,
}: {
  type: "month_5" | "month_10";
  memberId: string;
}) {
  const label = type === "month_5" ? "5 měsíců" : "10 měsíců";
  const variant: BadgeVariant = type === "month_5" ? "success" : "warning";
  return (
    <Link
      href={`/interviews?memberId=${memberId}&type=${type}`}
      title={`Založit pohovor ${label}`}
      aria-label={`Založit pohovor ${label}`}
      className="inline-flex items-center min-h-[44px] hover:opacity-80"
    >
      <Badge variant={variant}>{label}</Badge>
    </Link>
  );
}

interface SortableMemberListProps {
  members: MemberRow[];
}

/** Drag handle icon (≡), cíl klepnutí 44 px. */
function DragHandle({
  attributes,
  listeners,
}: {
  attributes: React.HTMLAttributes<HTMLButtonElement>;
  listeners: Record<string, unknown> | undefined;
}) {
  return (
    <button
      type="button"
      aria-label="Přetáhnout pro změnu pořadí"
      className="flex h-11 w-11 shrink-0 cursor-grab touch-none select-none items-center justify-center text-text-muted hover:text-text-main active:cursor-grabbing"
      {...attributes}
      {...(listeners as Record<string, unknown>)}
    >
      ≡
    </button>
  );
}

function SortableMemberCard({ m }: { m: MemberRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: m.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : m.inactiveLabel ? 0.7 : 1,
  };

  const role = roleLabel(m.managementRole);
  const secondLine = [m.email, m.company].filter(Boolean).join(" · ");

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-1 rounded-lg border border-border bg-surface p-2 sm:p-3"
    >
      <DragHandle attributes={attributes} listeners={listeners} />
      <div className="min-w-0 flex-1 py-1">
        <div className="font-medium break-words">{m.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {m.functionName && <Badge variant="category">{m.functionName}</Badge>}
          {m.attendanceManager && <Badge variant="info">Správce docházky</Badge>}
          {role && <Badge variant={m.managementRole === "admin" ? "danger" : "info"}>{role}</Badge>}
          {m.inactiveLabel && <Badge variant="neutral">{m.inactiveLabel}</Badge>}
          {m.due5 && <DueChip type="month_5" memberId={m.id} />}
          {m.due10 && <DueChip type="month_10" memberId={m.id} />}
        </div>
        {secondLine && (
          <div className="mt-1 text-sm text-text-muted break-all">{secondLine}</div>
        )}
      </div>
      <Link
        href={`/admin/members/${m.id}`}
        aria-label={`Upravit člena ${m.name}`}
        className="inline-flex min-h-[44px] shrink-0 items-center px-3 text-sm font-medium text-primary hover:underline focus:outline-none focus:shadow-focus"
      >
        Upravit ›
      </Link>
    </li>
  );
}

export function SortableMemberList({ members }: SortableMemberListProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<MemberRow[]>(members);

  // Sync local optimistic state with server props after router.refresh()
  // (e.g. when a member is added/removed/imported), otherwise the new row
  // would not appear until a hard reload (H-1).
  useEffect(() => {
    setItems(members);
  }, [members]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((m) => m.id === active.id);
    const newIndex = items.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = items;
    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered); // optimistic

    try {
      const res = await fetch("/api/members/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((m) => m.id) }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      showToast("success", "Pořadí členů uloženo.");
      router.refresh();
    } catch {
      setItems(previous); // rollback
      showToast("error", "Nepodařilo se uložit pořadí.");
    }
  }

  return (
    // Stabilní `id` (backlog iter-037): bez něj dnd-kit generuje `DndDescribedBy-N`
    // s počítadlem, které se liší na serveru a v klientu (hydratační varování).
    <DndContext
      id="members-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((m) => m.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="space-y-2">
          {items.map((m) => (
            <SortableMemberCard key={m.id} m={m} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
