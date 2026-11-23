"use client";

import { useEffect, useRef, useState } from "react";
import {
  addSituationItemAction,
  removeSituationItemAction,
  updateSituationItemAction,
} from "@/actions/situations";
import {
  type DirtyState,
  canRetry,
  clearsErrorOnEdit,
  columnDirtyState,
  failedCardPatch,
  runSituationAction,
} from "@/lib/situations/card-state";
import {
  MESSAGES,
  SECTION_TEXTS,
  UI_TEXTS,
  cleanText,
  itemLimitFor,
  textMaxFor,
  type ItemKind,
  type ItemRow,
  type SituationErrorCode,
  type Slot,
} from "@/lib/situations/rules";

/**
 * iter-049 (arch 7.3, gate změny 7, 8, 10, 12, 13): sloupec kartiček (Potřeby,
 * Obavy, Touhy, Související potřeby) a žluté lístečky vlastností klienta
 * (`variant = "trait"`). Každá kartička se ukládá zvlášť server action.
 *
 * Uložení: Enter nebo opuštění pole (blur) nebo tlačítko „Uložit“, Shift+Enter
 * je nový řádek, Esc vrátí původní text. Nová kartička má `itemId` z klienta
 * (dvojí odeslání je pro server idempotentní), příznak „ukládám“ druhé odeslání
 * do doběhnutí prvního zahodí. Enter u nové kartičky hned otevře další prázdnou
 * (rychlé zadávání), prázdná se při blur zahodí. Chyba nechá text v poli.
 *
 * Bez `router.refresh()` (LL-017): stav drží komponenta a výsledky akcí.
 */

interface CardState {
  id: string;
  /** Poslední uložený text (u nové kartičky prázdný). */
  text: string;
  importedText: string | null;
  persisted: boolean;
  editing: boolean;
  /** Fokus se přesune do pole jen na pokyn uživatele (ne při návratu z chyby, review m-4). */
  focus: boolean;
  draftText: string;
  status: "idle" | "saving" | "error";
  error: string | null;
  errorCode: SituationErrorCode | null;
  saved: boolean;
  showOriginal: boolean;
}

const CARD_STYLE: Record<Exclude<ItemKind, "trait">, string> = {
  need: "border border-green-200 border-b-[3px] border-b-green-500 bg-green-50",
  fear: "border border-red-200 border-b-[3px] border-b-red-400 bg-red-50",
  desire: "border border-blue-200 border-b-[3px] border-b-blue-500 bg-blue-50",
  related: "border border-border border-b-[3px] border-b-border-strong bg-background",
};

const HEADER_RULE: Record<Exclude<ItemKind, "trait">, string> = {
  need: "border-green-500",
  fear: "border-red-400",
  desire: "border-blue-500",
  related: "border-border-strong",
};

function newItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function fromRow(r: ItemRow): CardState {
  return {
    id: r.id,
    text: r.text,
    importedText: r.importedText,
    persisted: true,
    editing: false,
    focus: false,
    draftText: r.text,
    status: "idle",
    error: null,
    errorCode: null,
    saved: false,
    showOriginal: false,
  };
}

function newDraft(): CardState {
  return {
    id: newItemId(),
    text: "",
    importedText: null,
    persisted: false,
    editing: true,
    focus: true,
    draftText: "",
    status: "idle",
    error: null,
    errorCode: null,
    saved: false,
    showOriginal: false,
  };
}

interface ItemColumnProps {
  memberId: string;
  slot: Slot;
  kind: ItemKind;
  initialItems: ItemRow[];
  canEdit: boolean;
  /** Klíč sloupce pro hlášení rozepsaného textu editoru (`beforeunload`). */
  dirtyKey: string;
  onDirtyChange: (key: string, state: DirtyState) => void;
}

export function ItemColumn({
  memberId,
  slot,
  kind,
  initialItems,
  canEdit,
  dirtyKey,
  onDirtyChange,
}: ItemColumnProps) {
  const isTrait = kind === "trait";
  const multiline = !isTrait;
  const limit = itemLimitFor(kind);
  const [cards, setCardsState] = useState<CardState[]>(() => initialItems.map(fromRow));
  const cardsRef = useRef<CardState[]>(cards);
  const mounted = useRef(true);
  const [limitHit, setLimitHit] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Jediné místo zápisu stavu: drží ref synchronní a rovnou hlásí rozepsaný text editoru. */
  function setCards(fn: (prev: CardState[]) => CardState[]) {
    const next = fn(cardsRef.current);
    cardsRef.current = next;
    setCardsState(next);
    onDirtyChange(dirtyKey, columnDirtyState(next, multiline));
  }

  function patch(id: string, p: Partial<CardState>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }

  function flashSaved(id: string) {
    patch(id, { saved: true });
    window.setTimeout(() => {
      if (mounted.current) patch(id, { saved: false });
    }, 2500);
  }

  function openDraft() {
    const current = cardsRef.current;
    const emptyDraft = current.find((c) => !c.persisted && c.draftText.trim() === "" && c.status === "idle");
    if (emptyDraft) {
      patch(emptyDraft.id, { editing: true, focus: true });
      return;
    }
    if (current.length >= limit) {
      setLimitHit(true);
      return;
    }
    setLimitHit(false);
    setCards((prev) => [...prev, newDraft()]);
  }

  async function commit(id: string, openNext: boolean) {
    const card = cardsRef.current.find((c) => c.id === id);
    if (!card || card.status === "saving") return;
    const value = cleanText(card.draftText, multiline);

    if (!card.persisted) {
      if (value === "") {
        setCards((prev) => prev.filter((c) => c.id !== id));
        return;
      }
      patch(id, { text: "", draftText: value, editing: false, status: "saving", error: null, errorCode: null });
      if (openNext && cardsRef.current.length < limit) {
        setCards((prev) => [...prev, newDraft()]);
      }
      // Výjimka, neplatný výsledek i timeout = selhání se sondou přihlášení (review M-1, QA17).
      const result = await runSituationAction(() =>
        addSituationItemAction({ memberId, slot, itemId: id, kind, text: value })
      );
      if (result.success) {
        const item = result.data.item;
        patch(id, {
          persisted: true,
          text: item.text,
          draftText: item.text,
          importedText: item.importedText,
          status: "idle",
          error: null,
          errorCode: null,
        });
        flashSaved(id);
      } else {
        patch(id, failedCardPatch(result));
      }
      return;
    }

    if (value === "" || value === card.text) {
      patch(id, { editing: false, draftText: card.text, status: "idle", error: null, errorCode: null });
      return;
    }
    patch(id, { draftText: value, editing: false, status: "saving", error: null, errorCode: null });
    const result = await runSituationAction(() => updateSituationItemAction({ memberId, itemId: id, kind, text: value }));
    if (result.success) {
      const item = result.data.item;
      patch(id, { text: item.text, draftText: item.text, status: "idle", error: null, errorCode: null });
      flashSaved(id);
    } else {
      patch(id, failedCardPatch(result));
    }
  }

  /** Text se píše: po chybě validace chyba zmizí a opravený text se uloží sám (review m-2). */
  function change(c: CardState, value: string) {
    if (clearsErrorOnEdit(c.status, c.errorCode)) {
      patch(c.id, { draftText: value, status: "idle", error: null, errorCode: null });
    } else {
      patch(c.id, { draftText: value });
    }
  }

  function cancel(id: string) {
    const card = cardsRef.current.find((c) => c.id === id);
    if (!card) return;
    if (!card.persisted) {
      setCards((prev) => prev.filter((c) => c.id !== id));
      return;
    }
    patch(id, { editing: false, draftText: card.text, status: "idle", error: null, errorCode: null });
  }

  async function remove(id: string) {
    const card = cardsRef.current.find((c) => c.id === id);
    if (!card) return;
    if (!card.persisted) {
      setCards((prev) => prev.filter((c) => c.id !== id));
      return;
    }
    if (!window.confirm(UI_TEXTS.confirmDelete)) return;
    patch(id, { status: "saving", error: null, errorCode: null });
    const result = await runSituationAction(() => removeSituationItemAction({ memberId, itemId: id }));
    if (result.success) {
      setLimitHit(false);
      setCards((prev) => prev.filter((c) => c.id !== id));
    } else {
      patch(id, { status: "idle", error: result.error, errorCode: result.code });
    }
  }

  const persistedCount = cards.filter((c) => c.persisted || c.status === "saving").length;
  const atLimit = cards.length >= limit;

  if (isTrait) {
    return (
      <div>
        <ul className="flex flex-wrap gap-2" aria-label="Vlastnosti klienta">
          {cards.map((c) => (
            <li key={c.id}>
              <Card
                card={c}
                kind={kind}
                variant="trait"
                canEdit={canEdit}
                onChange={(v) => change(c, v)}
                onEdit={() => patch(c.id, { editing: true, focus: true, draftText: c.text })}
                onCommit={(next) => void commit(c.id, next)}
                onCancel={() => cancel(c.id)}
                onRemove={() => void remove(c.id)}
                onToggleOriginal={() => patch(c.id, { showOriginal: !c.showOriginal })}
              />
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="mt-2">
            <button
              type="button"
              onClick={openDraft}
              disabled={atLimit && !cards.some((c) => !c.persisted)}
              className="min-h-[44px] rounded px-2 text-sm font-medium text-navy hover:underline focus:outline-none focus:shadow-focus disabled:text-text-disabled md:min-h-0"
            >
              {UI_TEXTS.traitsAdd}
            </button>
            {(limitHit || atLimit) && (
              <p className="text-xs text-text-muted">{MESSAGES.traitLimit}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  const text = SECTION_TEXTS[kind];
  return (
    <section aria-labelledby={`col-${dirtyKey}`}>
      <h3
        id={`col-${dirtyKey}`}
        className={`flex items-baseline gap-2 border-b-2 pb-1 text-base font-semibold text-text-main ${HEADER_RULE[kind]}`}
      >
        <span>{text.title}</span>
        <span className="text-sm font-normal text-text-muted">| {persistedCount}</span>
      </h3>
      <p className="mt-2 text-sm font-medium text-text-main">{text.question}</p>
      <p className="mb-3 text-xs text-text-muted">{text.hint}</p>
      <ul className="space-y-3">
        {cards.map((c) => (
          <li key={c.id}>
            <Card
              card={c}
              kind={kind}
              variant="card"
              canEdit={canEdit}
              onChange={(v) => change(c, v)}
              onEdit={() => patch(c.id, { editing: true, focus: true, draftText: c.text })}
              onCommit={(next) => void commit(c.id, next)}
              onCancel={() => cancel(c.id)}
              onRemove={() => void remove(c.id)}
              onToggleOriginal={() => patch(c.id, { showOriginal: !c.showOriginal })}
            />
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="mt-3">
          <button
            type="button"
            onClick={openDraft}
            className="min-h-[44px] rounded px-1 text-sm font-medium text-navy hover:underline focus:outline-none focus:shadow-focus md:min-h-0"
          >
            {text.add}
          </button>
          {(limitHit || (atLimit && !cards.some((c) => !c.persisted))) && (
            <p className="text-xs text-text-muted">{MESSAGES.itemLimit}</p>
          )}
        </div>
      )}
    </section>
  );
}

interface CardProps {
  card: CardState;
  kind: ItemKind;
  variant: "card" | "trait";
  canEdit: boolean;
  onChange: (value: string) => void;
  onEdit: () => void;
  /** `true` = po Enteru u nové kartičky se otevře další prázdná. */
  onCommit: (openNext: boolean) => void;
  onCancel: () => void;
  onRemove: () => void;
  onToggleOriginal: () => void;
}

function Card({
  card,
  kind,
  variant,
  canEdit,
  onChange,
  onEdit,
  onCommit,
  onCancel,
  onRemove,
  onToggleOriginal,
}: CardProps) {
  const fieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const max = textMaxFor(kind);

  useEffect(() => {
    if (card.editing && card.focus && fieldRef.current && canEdit) {
      const el = fieldRef.current;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
  }, [card.editing, card.focus, canEdit]);

  // QA7: po chybě se fokus nevrací (m-4), takže Esc nemá komu přijít. Dokud je pole
  // s chybou otevřené, zavře ho Esc kdekoli, pokud ho nezpracovalo jiné pole.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const escapable = canEdit && card.editing && card.status === "error";
  useEffect(() => {
    if (!escapable) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      onCancelRef.current();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [escapable]);

    const edited = card.persisted && card.importedText !== null && card.text !== card.importedText;
  const shown = card.status === "saving" ? card.draftText : card.text;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onCommit(!card.persisted);
    }
  }

  const retry = card.status === "error" && canRetry(card.errorCode) && (
    <button
      type="button"
      onClick={() => onCommit(false)}
      className="min-h-[44px] rounded px-1 text-xs font-medium text-navy underline focus:outline-none focus:shadow-focus md:min-h-0"
    >
      {UI_TEXTS.retry}
    </button>
  );

  const errorLine = card.error && (
    <p role="alert" className="mt-1 text-xs text-danger">
      {card.error} {retry}
    </p>
  );

  if (canEdit && card.editing) {
    const common = {
      value: card.draftText,
      maxLength: max + 20,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => onChange(e.target.value),
      onKeyDown,
      onBlur: () => {
        if (card.status === "error") return;
        onCommit(false);
      },
      "aria-label": variant === "trait" ? UI_TEXTS.traitPlaceholder : SECTION_TEXTS[kind as Exclude<ItemKind, "trait">].title,
    };
    if (variant === "trait") {
      return (
        <div>
          <input
            {...common}
            ref={(el) => {
              fieldRef.current = el;
            }}
            type="text"
            placeholder={UI_TEXTS.traitPlaceholder}
            className="min-h-[44px] w-56 max-w-full rounded border border-yellow-300 bg-yellow-50 px-2 text-sm focus:outline-none focus:shadow-focus md:min-h-0 md:py-1"
          />
          {errorLine}
        </div>
      );
    }
    return (
      <div className={`rounded-lg p-3 ${CARD_STYLE[kind as Exclude<ItemKind, "trait">]}`}>
        <textarea
          {...common}
          ref={(el) => {
            fieldRef.current = el;
          }}
          rows={2}
          className="w-full resize-y rounded border border-border bg-white p-2 text-sm focus:outline-none focus:shadow-focus"
        />
        <div className="mt-1 flex items-center gap-3">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCommit(false)}
            className="min-h-[44px] rounded px-1 text-sm font-medium text-navy hover:underline focus:outline-none focus:shadow-focus md:min-h-0"
          >
            {UI_TEXTS.save}
          </button>
        </div>
        {errorLine}
      </div>
    );
  }

  if (variant === "trait") {
    return (
      <div>
        <span className="inline-flex items-center gap-1 rounded bg-yellow-200 px-2 py-1 text-sm text-text-main shadow-sm">
          {canEdit && card.status !== "saving" ? (
            <button
              type="button"
              onClick={onEdit}
              className="-my-2 min-h-[44px] rounded text-left focus:outline-none focus:shadow-focus"
            >
              {shown}
            </button>
          ) : (
            <span>{shown}</span>
          )}
          {canEdit && card.status !== "saving" && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`${UI_TEXTS.remove}: ${card.text}`}
              className="-my-2 min-h-[44px] min-w-[44px] rounded text-text-muted hover:text-danger focus:outline-none focus:shadow-focus"
            >
              ×
            </button>
          )}
        </span>
        {card.status === "saving" && <span className="ml-1 text-xs text-text-muted">{UI_TEXTS.saving}</span>}
        {errorLine}
      </div>
    );
  }

  return (
    <div className={`rounded-lg p-3 ${CARD_STYLE[kind as Exclude<ItemKind, "trait">]}`}>
      {canEdit && card.status !== "saving" ? (
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-[44px] w-full items-center whitespace-pre-wrap break-words rounded text-left text-sm text-text-main focus:outline-none focus:shadow-focus md:min-h-0"
        >
          {shown}
        </button>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm text-text-main">{shown}</p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
        {edited && (
          <button
            type="button"
            onClick={onToggleOriginal}
            aria-expanded={card.showOriginal}
            className="min-h-[44px] rounded text-text-muted underline focus:outline-none focus:shadow-focus md:min-h-0"
          >
            {UI_TEXTS.edited}
          </button>
        )}
        {canEdit && card.status !== "saving" && (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="min-h-[44px] rounded font-medium text-navy hover:underline focus:outline-none focus:shadow-focus md:min-h-0"
            >
              {UI_TEXTS.edit}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="min-h-[44px] rounded font-medium text-danger hover:underline focus:outline-none focus:shadow-focus md:min-h-0"
            >
              {UI_TEXTS.remove}
            </button>
          </>
        )}
        {card.status === "saving" && <span className="text-text-muted">{UI_TEXTS.saving}</span>}
        {card.saved && card.status === "idle" && <span className="text-success">{UI_TEXTS.saved}</span>}
      </div>
      {edited && card.showOriginal && (
        <p className="mt-1 whitespace-pre-wrap break-words text-xs italic text-text-muted">
          {UI_TEXTS.originalEdited} {card.importedText}
        </p>
      )}
      {errorLine}
    </div>
  );
}
