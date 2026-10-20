"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AuditList } from "@/components/attendance/AuditList";
import { validateSubstituteName } from "@/lib/attendance/rules";
import {
  SHEET_TEXTS,
  TARGET_ABSENT,
  announcedText,
  enqueueTarget,
  conflictText,
  formatPragueTime,
  newRowSync,
  nextRequest,
  rowChecked,
  summarizeSheet,
  summaryText,
  targetOnCheck,
  type DayPayload,
  type PresenceTarget,
  type RowSync,
  type SendPlan,
  type SheetRow,
  type SyncResponse,
} from "@/lib/attendance/sheet";

/**
 * iter-038 (T-003b, arch 6.2, 6.4, 6.5, 8, gate Z2): zápis docházky dne.
 * Každé kliknutí se hned ukládá jako cílový stav řádku s verzí. Požadavky
 * jednoho řádku jdou za sebe (fronta, `nextRequest`), konflikt přepíše řádek
 * serverovým stavem a ukáže hlášku. Polling každých 10 s, jen když je stránka
 * vidět a jde o dnešek. Žádné `router.refresh()` (LL-017): stav drží komponenta.
 *
 * `endpoint` je adresa API dne (`/api/attendance/YYYY-MM-DD`). T-003c použije
 * stejnou komponentu pro ranní odkaz s jinou adresou.
 */

const POLL_MS = 10_000;

interface RowUi {
  saving: boolean;
  message: string | null;
  flash: boolean;
}

const EMPTY_UI: RowUi = { saving: false, message: null, flash: false };

interface ApiResponse {
  status: number;
  data: {
    result?: string;
    row?: SheetRow | null;
    message?: string;
    error?: string;
  } | null;
}

async function postJson(endpoint: string, body: unknown): Promise<ApiResponse> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let data: ApiResponse["data"] = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function rowTarget(row: SheetRow | null | undefined): PresenceTarget | null {
  if (!row || !row.status) return null;
  return { status: row.status, substituteName: row.substituteName };
}

function blankRow(row: SheetRow): SheetRow {
  return { ...row, status: null, substituteName: null, version: 0 };
}

function SubstituteInput({
  row,
  disabled,
  onSubmit,
}: {
  row: SheetRow;
  disabled: boolean;
  onSubmit: (name: string) => void;
}) {
  const saved = row.substituteName ?? "";
  const [value, setValue] = useState(saved || row.announcedName || "");
  const listId = `names-${row.memberId}`;

  function commit() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === saved) return;
    onSubmit(trimmed);
  }

  return (
    <div className="mt-1 pl-1">
      <label className="sr-only" htmlFor={`sub-${row.memberId}`}>
        {SHEET_TEXTS.nameLabel}
      </label>
      <input
        id={`sub-${row.memberId}`}
        type="text"
        list={listId}
        value={value}
        placeholder={SHEET_TEXTS.nameLabel}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className="min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 text-base text-text-main focus:outline-none focus:shadow-focus disabled:opacity-50"
      />
      <datalist id={listId}>
        {row.names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  );
}

export interface AttendanceSheetProps {
  endpoint: string;
  initial: DayPayload;
}

export function AttendanceSheet({ endpoint, initial }: AttendanceSheetProps) {
  const [payload, setPayload] = useState<DayPayload>(initial);
  const [rows, setRows] = useState<SheetRow[]>(initial.rows);
  const [ui, setUi] = useState<Record<string, RowUi>>({});
  const [subOpen, setSubOpen] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "open">("all");
  const [unlocked, setUnlocked] = useState(false);

  const syncRef = useRef<Record<string, RowSync>>({});
  const serverRows = useRef<Record<string, SheetRow>>({});
  const rowsRef = useRef<SheetRow[]>(initial.rows);
  const uiRef = useRef<Record<string, RowUi>>({});
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Počáteční verze a poslední potvrzený stav řádků.
  useEffect(() => {
    for (const r of initial.rows) {
      syncRef.current[r.memberId] = newRowSync(r.version);
      serverRows.current[r.memberId] = r;
    }
    const timers = flashTimers.current;
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t);
    };
    // jen při prvním vykreslení
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitRows = useCallback((next: SheetRow[]) => {
    rowsRef.current = next;
    setRows(next);
  }, []);

  const patchUi = useCallback((id: string, patch: Partial<RowUi>) => {
    const next = { ...uiRef.current, [id]: { ...(uiRef.current[id] ?? EMPTY_UI), ...patch } };
    uiRef.current = next;
    setUi(next);
  }, []);

  const flash = useCallback(
    (id: string) => {
      patchUi(id, { flash: true });
      clearTimeout(flashTimers.current[id]);
      flashTimers.current[id] = setTimeout(() => patchUi(id, { flash: false }), 2000);
    },
    [patchUi]
  );

  const setRow = useCallback(
    (id: string, row: SheetRow) => {
      commitRows(rowsRef.current.map((r) => (r.memberId === id ? row : r)));
    },
    [commitRows]
  );

  // ── Polling (arch 6.4) ─────────────────────────────────────

  const poll = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as DayPayload;
      if (!Array.isArray(data.rows)) return;
      setPayload(data);
      const merged = data.rows.map((server) => {
        const id = server.memberId;
        const sync = syncRef.current[id];
        const local = rowsRef.current.find((r) => r.memberId === id);
        const busy = !!sync && (sync.inFlight !== null || sync.queued !== null);
        // Starší odpověď než to, co už klient ví, se zahodí (poll vyšel před zápisem).
        if (busy || (sync && server.version < sync.version) || uiRef.current[id]?.saving) {
          return local ?? server;
        }
        if (local && local.version !== server.version && server.updatedById !== data.viewerId) {
          flash(id);
        }
        syncRef.current[id] = newRowSync(server.version);
        serverRows.current[id] = server;
        return server;
      });
      commitRows(merged);
    } catch {
      // síťová chyba: příští tik to zkusí znovu
    }
  }, [endpoint, commitRows, flash]);

  const pollable = payload.date === payload.today;

  useEffect(() => {
    if (!pollable) return;
    const tick = () => {
      if (document.visibilityState === "visible") void poll();
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [pollable, poll]);

  // ── Zápis přítomnosti ──────────────────────────────────────

  const dispatchPresence = useCallback(
    async (memberId: string, first: SendPlan) => {
      let plan: SendPlan | null = first;
      while (plan) {
        let response: SyncResponse = { kind: "error" };
        let data: ApiResponse["data"] = null;
        try {
          const res = await postJson(endpoint, {
            op: "presence",
            memberId,
            status: plan.target.status,
            substituteName: plan.target.substituteName,
            expectedVersion: plan.expectedVersion,
          });
          data = res.data;
          if (res.status === 200 && data?.result === "ok" && data.row) {
            response = { kind: "ok", version: data.row.version };
          } else if (res.status === 409 && data?.result === "conflict") {
            response = {
              kind: "conflict",
              version: data.row?.version ?? 0,
              target: rowTarget(data.row),
            };
          }
        } catch {
          response = { kind: "error" };
        }

        const step = nextRequest(syncRef.current[memberId] ?? newRowSync(0), response);
        syncRef.current[memberId] = step.sync;

        if (response.kind === "ok" && data?.row) {
          serverRows.current[memberId] = data.row;
          if (!step.send) {
            setRow(memberId, data.row);
            patchUi(memberId, { saving: false, message: null });
            if (payload.mode === "history") void poll();
          }
        } else if (response.kind === "conflict") {
          const server = data?.row ?? null;
          const current = rowsRef.current.find((r) => r.memberId === memberId);
          const adopted = server ?? (current ? blankRow(current) : null);
          if (adopted) {
            serverRows.current[memberId] = adopted;
            setRow(memberId, adopted);
          }
          patchUi(memberId, {
            saving: false,
            message: step.showConflict
              ? conflictText(server?.updatedByName ?? null)
              : null,
          });
          flash(memberId);
        } else {
          // finalized, inactive, denied, chyba sítě: vrátit poslední potvrzený stav
          const back = data?.row ?? serverRows.current[memberId];
          if (back) {
            serverRows.current[memberId] = back;
            setRow(memberId, back);
            syncRef.current[memberId] = newRowSync(back.version);
          }
          patchUi(memberId, {
            saving: false,
            message: data?.message ?? SHEET_TEXTS.errSave,
          });
          if (data?.result === "finalized") void poll();
        }
        plan = step.send;
      }
    },
    [endpoint, payload.mode, patchUi, poll, setRow, flash]
  );

  const issueTarget = useCallback(
    (row: SheetRow, target: PresenceTarget) => {
      const id = row.memberId;
      const sync = syncRef.current[id] ?? newRowSync(row.version);
      const { sync: next, send } = enqueueTarget(sync, target);
      syncRef.current[id] = next;
      // Okamžitá odezva: řádek ukazuje cíl, dokud server neodpoví.
      setRow(id, { ...row, status: target.status, substituteName: target.substituteName });
      patchUi(id, { saving: true, message: null });
      if (send) void dispatchPresence(id, send);
    },
    [dispatchPresence, patchUi, setRow]
  );

  function onTogglePresent(row: SheetRow) {
    setSubOpen((s) => ({ ...s, [row.memberId]: false }));
    issueTarget(row, rowChecked(row) ? TARGET_ABSENT : targetOnCheck(row));
  }

  function onToggleSub(row: SheetRow, checked: boolean) {
    if (checked) {
      setSubOpen((s) => ({ ...s, [row.memberId]: true }));
      return;
    }
    setSubOpen((s) => ({ ...s, [row.memberId]: false }));
    if (row.status === "substitute") {
      issueTarget(row, { status: "present", substituteName: null });
    }
  }

  function onSubmitName(row: SheetRow, raw: string) {
    const v = validateSubstituteName(raw);
    if (!v.ok) {
      patchUi(row.memberId, { message: v.error });
      return;
    }
    setSubOpen((s) => ({ ...s, [row.memberId]: false }));
    issueTarget(row, { status: "substitute", substituteName: v.value });
  }

  // ── „Omluven(a)“ (bez verze, poslední zápis vyhrává) ───────

  async function onToggleExcuse(row: SheetRow, excused: boolean) {
    const id = row.memberId;
    const before = rowsRef.current.find((r) => r.memberId === id) ?? row;
    setRow(id, { ...before, excused, announcedName: excused ? before.announcedName : null });
    patchUi(id, { saving: true, message: null });
    try {
      const res = await postJson(endpoint, { op: "excuse", memberId: id, excused });
      const fresh = res.data?.row;
      if (res.status === 200 && res.data?.result === "ok" && fresh) {
        const current = rowsRef.current.find((r) => r.memberId === id) ?? fresh;
        setRow(id, { ...current, excused: fresh.excused, announcedName: fresh.announcedName });
        serverRows.current[id] = { ...serverRows.current[id], excused: fresh.excused, announcedName: fresh.announcedName };
        patchUi(id, { saving: false, message: null });
        if (payload.mode === "history" || payload.excuseMode === "history") void poll();
      } else {
        setRow(id, before);
        patchUi(id, { saving: false, message: res.data?.message ?? SHEET_TEXTS.errSave });
        if (res.data?.result === "finalized") void poll();
      }
    } catch {
      setRow(id, before);
      patchUi(id, { saving: false, message: SHEET_TEXTS.errSave });
    }
  }

  // ── Vykreslení ─────────────────────────────────────────────

  const summary = summaryText(summarizeSheet(rows));
  const locked = payload.guardUnrecordedDay && !unlocked;
  const presenceDisabled = payload.mode === "denied" || locked;
  const excuseDisabled = payload.excuseMode === "denied" || locked;
  const visible = filter === "open" ? rows.filter((r) => !rowChecked(r)) : rows;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 space-y-2 border-b border-border bg-background px-1 py-2">
        <p className="text-sm font-medium text-text-main" aria-live="polite">
          {summary}
        </p>
        <div className="flex gap-2" role="group" aria-label="Filtr">
          {(
            [
              ["all", SHEET_TEXTS.filterAll],
              ["open", SHEET_TEXTS.filterOpen],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`min-h-[44px] rounded-lg border px-4 text-sm focus:outline-none focus:shadow-focus ${
                filter === id
                  ? "border-primary bg-primary-light text-primary"
                  : "border-border bg-surface text-text-main hover:bg-background"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {payload.banner && (
        <p className="rounded-card border border-border bg-surface px-4 py-3 text-sm text-text-main">
          {payload.banner}
        </p>
      )}
      {payload.unrecorded && (
        <p className="rounded-card border border-border bg-surface px-4 py-3 text-sm text-text-main">
          {SHEET_TEXTS.unrecordedBanner}
        </p>
      )}
      {locked && (
        <div className="space-y-2 rounded-card border border-warning bg-warning-light px-4 py-3">
          <p className="text-sm text-text-main">{SHEET_TEXTS.noMeeting}</p>
          <Button type="button" size="sm" className="min-h-[44px]" onClick={() => setUnlocked(true)}>
            {SHEET_TEXTS.writeAnyway}
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {visible.map((row) => {
          const state = ui[row.memberId] ?? EMPTY_UI;
          const checked = rowChecked(row);
          const subChecked = row.status === "substitute" || (checked && subOpen[row.memberId]);
          const showSubInput = checked && subChecked;
          const announced = announcedText(row);
          const byOther =
            row.updatedByName && row.updatedById !== payload.viewerId && row.updatedAt
              ? `změnil(a) ${row.updatedByName} ${formatPragueTime(row.updatedAt)}`
              : null;
          return (
            <li
              key={row.memberId}
              className={`rounded-card border px-3 py-2 ${
                state.flash ? "border-info bg-info-light" : "border-border bg-surface"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-text-main">{row.name}</p>
                  {announced && <p className="text-xs text-text-muted">{announced}</p>}
                </div>
                {state.saving && (
                  <span className="shrink-0 text-xs text-text-muted" role="status">
                    ⟳ {SHEET_TEXTS.saving}
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-4">
                <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-text-main">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-primary"
                    checked={checked}
                    disabled={presenceDisabled}
                    onChange={() => onTogglePresent(row)}
                  />
                  {SHEET_TEXTS.present}
                </label>
                {checked ? (
                  <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-text-main">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-primary"
                      checked={!!subChecked}
                      disabled={presenceDisabled}
                      onChange={(e) => onToggleSub(row, e.target.checked)}
                    />
                    {SHEET_TEXTS.withSubstitute}
                  </label>
                ) : (
                  <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-text-main">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-primary"
                      checked={row.excused}
                      disabled={excuseDisabled || state.saving}
                      onChange={(e) => void onToggleExcuse(row, e.target.checked)}
                    />
                    {SHEET_TEXTS.excused}
                  </label>
                )}
              </div>

              {showSubInput && (
                <SubstituteInput
                  key={`${row.memberId}-${row.version}-${row.substituteName ?? ""}`}
                  row={row}
                  disabled={presenceDisabled}
                  onSubmit={(name) => onSubmitName(row, name)}
                />
              )}

              {byOther && <p className="text-xs text-text-muted">{byOther}</p>}
              {state.message && (
                <p role="alert" className="mt-1 text-sm text-danger">
                  {state.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {payload.audit && <AuditList rows={payload.audit} />}
    </div>
  );
}
