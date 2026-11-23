"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HeadField } from "@/components/situations/HeadField";
import { ItemColumn } from "@/components/situations/ItemColumn";
import { OriginalText } from "@/components/situations/OriginalText";
import { backToOverviewDecision, type DirtyState } from "@/lib/situations/card-state";
import {
  SECTION_TEXTS,
  SLOTS,
  UI_TEXTS,
  type ItemRow,
  type OriginalSnapshot,
  type Slot,
} from "@/lib/situations/rules";

/**
 * iter-049 (arch 7.3, gate změny 8, 10, 11): tři obrazovky jednoho člena
 * (Situace 1 ze 3 až 3 ze 3). Přepínání je klientské, všechny tři situace
 * zůstanou v DOM (skryté), takže rozepsaná a ukládaná kartička přežije
 * přepnutí. Data z props se čtou jen při prvním vykreslení (`useState`),
 * dál platí výsledky akcí (LL-017: žádné `router.refresh()`).
 *
 * Ochrana proti ztrátě textu: dokud je něco rozepsané nebo se ukládá,
 * `beforeunload` varuje, „Zpět na přehled“ nejdřív počká na uložení.
 */

export interface EditorSituation {
  slot: Slot;
  client: string;
  title: string;
  description: string;
  original: OriginalSnapshot | null;
  items: ItemRow[];
}

const KIND_COLUMNS = ["need", "fear", "desire"] as const;

export function SituationEditor({
  memberId,
  situations,
  canEdit,
  isOwn,
  initialSlot,
}: {
  memberId: string;
  situations: EditorSituation[];
  canEdit: boolean;
  isOwn: boolean;
  initialSlot: Slot;
}) {
  const router = useRouter();
  const [slot, setSlot] = useState<Slot>(initialSlot);
  const [blocked, setBlocked] = useState(false);
  const dirty = useRef(new Map<string, DirtyState>());

  const onDirtyChange = useCallback((key: string, state: DirtyState) => {
    if (state === "clean") dirty.current.delete(key);
    else dirty.current.set(key, state);
  }, []);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty.current.size === 0) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  function goTo(next: Slot) {
    // Rozepsané pole se uloží při blur, kliknutí na tlačítko ho opustí.
    setSlot(next);
    try {
      window.history.replaceState(null, "", `?s=${next}`);
    } catch {
      /* adresa je jen pohodlí */
    }
  }

  async function backToOverview() {
    setBlocked(false);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    // Čeká se jen na běžící uložení. Chyba nebo rozepsaný text se sám nespraví,
    // takže se nečeká, jen se řekne proč a člen rozhodne (review m-3).
    const deadline = Date.now() + 8000;
    for (;;) {
      const decision = backToOverviewDecision(dirty.current.values(), Date.now() >= deadline);
      if (decision === "wait") {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      if (decision === "block") {
        setBlocked(true);
        return;
      }
      router.push("/situace");
      return;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-text-main" aria-live="polite">
          {UI_TEXTS.stepOf(slot)}
        </h2>
        <nav aria-label="Situace" className="flex items-center gap-1">
          {SLOTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => goTo(n)}
              aria-current={n === slot ? "step" : undefined}
              aria-label={UI_TEXTS.stepOf(n)}
              className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-medium focus:outline-none focus:shadow-focus ${
                n === slot
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-text-main hover:bg-background"
              }`}
            >
              {n}
            </button>
          ))}
        </nav>
      </div>

      {SLOTS.map((n) => {
        const s = situations.find((x) => x.slot === n) ?? {
          slot: n,
          client: "",
          title: "",
          description: "",
          original: null,
          items: [],
        };
        const traits = s.items.filter((i) => i.kind === "trait");
        const byKind = (k: (typeof KIND_COLUMNS)[number] | "related") => s.items.filter((i) => i.kind === k);
        return (
          <div key={n} hidden={n !== slot} className="space-y-6">
            <OriginalText original={s.original} defaultOpen={isOwn} />

            <section aria-label={SECTION_TEXTS.head.title} className="grid gap-4 md:grid-cols-[1fr_20rem]">
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-main">{SECTION_TEXTS.head.question}</p>
                <p className="text-xs text-text-muted">{SECTION_TEXTS.head.hint}</p>
                <HeadField
                  memberId={memberId}
                  slot={n}
                  field="client"
                  initial={s.client}
                  canEdit={canEdit}
                  multiline={false}
                  placeholder={UI_TEXTS.clientPlaceholder}
                  ariaLabel={SECTION_TEXTS.head.question}
                  className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-2xl font-bold text-text-main placeholder:text-text-disabled hover:border-border focus:border-border focus:outline-none focus:shadow-focus"
                  dirtyKey={`s${n}-client`}
                  onDirtyChange={onDirtyChange}
                />
                <p className="text-xs font-medium text-text-muted">{UI_TEXTS.titleLabel}</p>
                <HeadField
                  memberId={memberId}
                  slot={n}
                  field="title"
                  initial={s.title}
                  canEdit={canEdit}
                  multiline={false}
                  ariaLabel={UI_TEXTS.titleLabel}
                  className="w-full rounded border border-border bg-white px-2 py-2 text-sm focus:outline-none focus:shadow-focus"
                  dirtyKey={`s${n}-title`}
                  onDirtyChange={onDirtyChange}
                />
                <p className="text-xs font-medium text-text-muted">{UI_TEXTS.descriptionLabel}</p>
                <HeadField
                  memberId={memberId}
                  slot={n}
                  field="description"
                  initial={s.description}
                  canEdit={canEdit}
                  multiline
                  ariaLabel={UI_TEXTS.descriptionLabel}
                  className="w-full rounded border border-border bg-white px-2 py-2 text-sm focus:outline-none focus:shadow-focus"
                  dirtyKey={`s${n}-description`}
                  onDirtyChange={onDirtyChange}
                />
              </div>
              <div>
                <ItemColumn
                  memberId={memberId}
                  slot={n}
                  kind="trait"
                  initialItems={traits}
                  canEdit={canEdit}
                  dirtyKey={`s${n}-trait`}
                  onDirtyChange={onDirtyChange}
                />
              </div>
            </section>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {KIND_COLUMNS.map((k) => (
                <ItemColumn
                  key={k}
                  memberId={memberId}
                  slot={n}
                  kind={k}
                  initialItems={byKind(k)}
                  canEdit={canEdit}
                  dirtyKey={`s${n}-${k}`}
                  onDirtyChange={onDirtyChange}
                />
              ))}
            </div>

            <ItemColumn
              memberId={memberId}
              slot={n}
              kind="related"
              initialItems={byKind("related")}
              canEdit={canEdit}
              dirtyKey={`s${n}-related`}
              onDirtyChange={onDirtyChange}
            />
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => goTo((slot - 1) as Slot)}
          disabled={slot === 1}
          className="min-h-[44px] rounded-lg border border-border bg-white px-4 text-sm font-medium text-text-main hover:bg-background focus:outline-none focus:shadow-focus disabled:text-text-disabled"
        >
          {UI_TEXTS.previous}
        </button>
        {slot < 3 ? (
          <button
            type="button"
            onClick={() => goTo((slot + 1) as Slot)}
            className="min-h-[44px] rounded-btn bg-primary px-6 text-sm font-semibold text-white hover:bg-primary-hover focus:outline-none focus:shadow-focus"
          >
            {UI_TEXTS.next}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void backToOverview()}
            className="min-h-[44px] rounded-btn bg-primary px-6 text-sm font-semibold text-white hover:bg-primary-hover focus:outline-none focus:shadow-focus"
          >
            {UI_TEXTS.backToOverview}
          </button>
        )}
      </div>
      {blocked && (
        <p role="alert" className="text-sm text-danger">
          {UI_TEXTS.unsavedBlock}
        </p>
      )}
    </div>
  );
}
