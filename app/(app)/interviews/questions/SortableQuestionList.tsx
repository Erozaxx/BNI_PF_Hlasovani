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
import { reorderQuestionsAction } from "@/actions/interview-questions";
import { EditQuestionForm } from "./EditQuestionForm";
import { ArchiveQuestionButton } from "./ArchiveQuestionButton";

export interface QuestionRow {
  id: string;
  text: string;
  active: boolean;
}

interface SortableQuestionListProps {
  questions: QuestionRow[];
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

function SortableQuestionRow({ q }: { q: QuestionRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : q.active ? 1 : 0.6,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 border-b border-border py-3 last:border-b-0 ${
        isDragging ? "bg-background" : ""
      }`}
    >
      <DragHandle attributes={attributes} listeners={listeners} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-text-main whitespace-pre-wrap break-words">
            {q.text}
          </p>
          {!q.active && <Badge variant="neutral">Archivovano</Badge>}
        </div>
        <EditQuestionForm questionId={q.id} currentText={q.text} />
      </div>
      <ArchiveQuestionButton questionId={q.id} active={q.active} />
    </li>
  );
}

export function SortableQuestionList({ questions }: SortableQuestionListProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<QuestionRow[]>(questions);

  // Sync local optimistic state with server props after router.refresh()
  // (add/edit/archive changes the list) — same pattern as SortableMemberList.
  useEffect(() => {
    setItems(questions);
  }, [questions]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((q) => q.id === active.id);
    const newIndex = items.findIndex((q) => q.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = items;
    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered); // optimistic

    try {
      const result = await reorderQuestionsAction(reordered.map((q) => q.id));
      if (!result.success) {
        throw new Error(result.error);
      }
      showToast("success", "Poradi otazek ulozeno.");
      router.refresh();
    } catch {
      setItems(previous); // rollback
      showToast("error", "Nepodarilo se ulozit poradi otazek.");
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <ul className="bg-surface border border-border rounded-card px-4">
        <SortableContext
          items={items.map((q) => q.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((q) => (
            <SortableQuestionRow key={q.id} q={q} />
          ))}
        </SortableContext>
      </ul>
    </DndContext>
  );
}
