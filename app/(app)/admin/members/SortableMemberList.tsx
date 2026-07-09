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
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { MemberActions } from "./MemberActions";
import { DeleteMemberButton } from "./DeleteMemberButton";
import { EditMemberCompanyForm } from "./EditMemberCompanyForm";
import { EditMemberEmailForm } from "./EditMemberEmailForm";
import { EditMemberJoinedAtForm } from "./EditMemberJoinedAtForm";

export interface MemberRow {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  obor: string | null;
  managementRole: string | null;
  magicTokenHash: string | null;
  tokenUsed: boolean;
  /** "YYYY-MM-DD" (arch 7.1, iter-020) — BNI entry date, admin-editable. */
  joinedAt: string;
  /** Number of interview records (any status) that would cascade-delete with this member (R-11). */
  interviewCount: number;
}

interface SortableMemberListProps {
  members: MemberRow[];
}

/** Drag handle icon (≡). */
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
      className="cursor-grab touch-none select-none px-1 text-text-muted hover:text-text-main active:cursor-grabbing"
      {...attributes}
      {...(listeners as Record<string, unknown>)}
    >
      ≡
    </button>
  );
}

function SortableMemberRow({ m, index }: { m: MemberRow; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: m.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-border ${index % 2 === 1 ? "bg-background" : ""} ${
        isDragging ? "bg-background" : ""
      }`}
    >
      <td className="px-2 py-3 align-top">
        <DragHandle attributes={attributes} listeners={listeners} />
      </td>
      <td className="px-4 py-3 font-medium">{m.name}</td>
      <td className="px-4 py-3 text-text-muted">
        <div>{m.email || "—"}</div>
        <EditMemberEmailForm memberId={m.id} initialEmail={m.email ?? null} />
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-text-muted">{m.company || "—"}</div>
        <EditMemberCompanyForm
          memberId={m.id}
          initialCompany={m.company ?? null}
          initialObor={m.obor ?? null}
        />
      </td>
      <td className="px-4 py-3 text-text-muted">{m.obor || "—"}</td>
      <td className="px-4 py-3 text-text-muted">
        <div>{new Date(`${m.joinedAt}T00:00:00Z`).toLocaleDateString("cs-CZ")}</div>
        <EditMemberJoinedAtForm memberId={m.id} initialJoinedAt={m.joinedAt} />
      </td>
      <td className="px-4 py-3">
        {m.managementRole ? (
          <Badge variant={m.managementRole === "admin" ? "danger" : "info"}>
            {m.managementRole}
          </Badge>
        ) : (
          <Badge variant="neutral">clen</Badge>
        )}
      </td>
      <td className="px-4 py-3">
        {m.tokenUsed ? (
          <Badge variant="neutral">Pouzit</Badge>
        ) : m.magicTokenHash ? (
          <Badge variant="success">Aktivni</Badge>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-2">
          <MemberActions memberId={m.id} hasToken={Boolean(m.magicTokenHash)} />
          <DeleteMemberButton
            memberId={m.id}
            memberName={m.name}
            interviewCount={m.interviewCount}
          />
        </div>
      </td>
    </tr>
  );
}

export function SortableMemberList({ members }: SortableMemberListProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<MemberRow[]>(members);

  // Sync local optimistic state with server props after router.refresh()
  // (e.g. when a member is added/removed/imported) — otherwise the new row
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
      showToast("success", "Poradi clenu ulozeno.");
      router.refresh();
    } catch {
      setItems(previous); // rollback
      showToast("error", "Nepodarilo se ulozit poradi.");
    }
  }

  return (
    <div className="overflow-x-auto">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-primary text-left">
              <th className="px-2 py-3 font-semibold" aria-label="Poradi"></th>
              <th className="px-4 py-3 font-semibold">Jmeno</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Firma</th>
              <th className="px-4 py-3 font-semibold">Obor</th>
              <th className="px-4 py-3 font-semibold">Datum vstupu</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Token</th>
              <th className="px-4 py-3 font-semibold">Akce</th>
            </tr>
          </thead>
          <tbody>
            <SortableContext
              items={items.map((m) => m.id)}
              strategy={verticalListSortingStrategy}
            >
              {items.map((m, i) => (
                <SortableMemberRow key={m.id} m={m} index={i} />
              ))}
            </SortableContext>
          </tbody>
        </table>
      </DndContext>
    </div>
  );
}
