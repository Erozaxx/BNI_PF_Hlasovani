interface NoteItem {
  id: string;
  text: string;
  createdAt: Date;
}

interface NoteListProps {
  notes: NoteItem[];
}

/**
 * Server Component: displays a list of anonymous notes.
 * Shows text and date/time only — NEVER shows author.
 */
export function NoteList({ notes }: NoteListProps) {
  if (notes.length === 0) {
    return (
      <p className="text-text-muted text-sm">Zatim zadne poznamky.</p>
    );
  }

  return (
    <ul className="space-y-3">
      {notes.map((note) => (
        <li
          key={note.id}
          className="p-3 bg-background rounded-lg border border-border"
        >
          <p className="text-text-main text-sm whitespace-pre-wrap">
            {note.text}
          </p>
          <p className="text-text-muted text-xs mt-2">
            {new Date(note.createdAt).toLocaleString("cs-CZ", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </li>
      ))}
    </ul>
  );
}
