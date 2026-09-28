/**
 * Rámeček „U nás v chapteru" (arch 7.2, 10). Štítek je text, ne jen barva.
 * `draft` přidá „· návrh", `enabled: false` se nevykreslí nikde.
 */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import type { ChapterNote } from "@/lib/info-pages/types";

const T = TEMPLATE_TEXTS.chapterNote;

export function chapterNoteLabel(note: ChapterNote): string {
  return note.status === "draft" ? `${T.label} · ${T.draftSuffix}` : T.label;
}

export function ChapterNoteBox({ note }: { note: ChapterNote }) {
  if (!note.enabled) return null;
  return (
    <aside className="info-note mt-5 rounded-card border-l-4 border-gold bg-gold-light px-4 py-3">
      <p className="info-note-label text-xs font-semibold uppercase tracking-wide text-text-main">
        {chapterNoteLabel(note)}
      </p>
      <p className="mt-1 text-base leading-relaxed text-text-main">{note.text}</p>
    </aside>
  );
}

/** Vykreslí položky podle id v pořadí z dat, neexistující a vypnuté vynechá. */
export function ChapterNotes({ ids, notes }: { ids?: string[]; notes: ChapterNote[] }) {
  if (!ids || ids.length === 0) return null;
  const byId = new Map(notes.map((n) => [n.id, n]));
  return (
    <>
      {ids.map((id) => {
        const note = byId.get(id);
        return note ? <ChapterNoteBox key={id} note={note} /> : null;
      })}
    </>
  );
}
