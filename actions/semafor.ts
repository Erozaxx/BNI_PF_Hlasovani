"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guards";
import { isValidDateString, pragueToday } from "@/lib/members/activity";
import { logOpsEvent } from "@/lib/ops/event-log";
import type { OpsEventInput } from "@/lib/ops/types";
import type { ActionResult } from "@/lib/types";
import {
  aliasRemovedEvent,
  importedEvent,
  monthDeletedEvent,
  rowDeletedEvent,
} from "@/lib/semafor/events";
import { MAX_FILE_BYTES } from "@/lib/semafor/zip";
import { SemaforFileError, isSemaforFileError } from "@/lib/semafor/errors";
import {
  analyzeFile,
  buildPreviewRows,
  buildSavePlan,
  ensureNotChanged,
  matchFile,
  sha256Hex,
  type PreviewRowDto,
} from "@/lib/semafor/import";
import { validateImportMonth } from "@/lib/semafor/months";
import type { RowDecision } from "@/lib/semafor/names";
import {
  SEMAFOR_TEXTS,
  fileErrorMessage,
  importExistingText,
  importOtherMonthText,
  importSavedText,
  importUnknownColumnText,
} from "@/lib/semafor/texts";
import {
  deleteSemaforMonth,
  deleteSemaforRow,
  getMonthState,
  listAliases,
  listMembersForMatch,
  listMonthsBySha,
  removeSemaforAlias,
  saveSemaforImport,
} from "@/lib/db/queries/semafor";

/**
 * iter-041 (arch 5.1, 5.8, 5.9, gate Z6, sekce 6 security): akce importu a
 * mazání semaforu. První krok KAŽDÉ akce je `requirePermission("semafor.import")`.
 *
 * Dvoukrokový tok: náhled (soubor se zpracuje, nic se neukládá) a uložení
 * (soubor se zpracuje znovu ze surových bajtů, hash musí sedět s náhledem,
 * klientovi se věří jen volba člena). Bez transakcí (LL-003): uložení je jeden
 * SQL příkaz. Chybové hlášky a `console.error` nikdy neobsahují obsah buněk,
 * jen třídu chyby. Soubor se nikam neukládá.
 */

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** LL-011: sestavení vstupu i zápis uvnitř try, nikdy neshodí akci. */
async function safeLog(build: () => OpsEventInput) {
  try {
    await logOpsEvent(build());
  } catch (err) {
    console.error(`[semafor] ops log failed: ${errClass(err)}`);
  }
}

function revalidateSemafor() {
  revalidatePath("/semafor");
  revalidatePath("/semafor/prehled");
  revalidatePath("/semafor/import");
}

const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-01$/)
  .refine(isValidDateString);
const uuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const shaSchema = z.string().regex(/^[0-9a-f]{64}$/);
const decisionsSchema = z.record(z.string().regex(/^\d{1,3}$/), z.string().max(40));

/** Načte soubor z formuláře: velikost se kontroluje PŘED `arrayBuffer()`. */
async function readFile(formData: FormData): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: SEMAFOR_TEXTS.errNoFile };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: SEMAFOR_TEXTS.errTooBig };
  return { ok: true, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export interface PreviewMember {
  id: string;
  name: string;
  active: boolean;
}

export interface PreviewData {
  month: string;
  sha256: string;
  rows: PreviewRowDto[];
  members: PreviewMember[];
  warnings: string[];
  /** Věta o už nahraných členech a jejich id (pro „Z dřívějška zůstanou“). */
  existing: { text: string; members: { id: string; name: string }[] } | null;
  sameFile: boolean;
  otherMonthText: string | null;
}

export async function previewSemaforImportAction(formData: FormData): Promise<ActionResult<PreviewData>> {
  const auth = await requirePermission("semafor.import");
  if (!auth.success) return auth;

  const month = formData.get("month");
  if (!validateImportMonth(month, pragueToday())) return { success: false, error: SEMAFOR_TEXTS.errMonth };

  try {
    const read = await readFile(formData);
    if (!read.ok) return { success: false, error: read.error };

    const file = analyzeFile(read.bytes);
    const [members, aliasRows, state, shaMonths] = await Promise.all([
      listMembersForMatch(),
      listAliases(),
      getMonthState(month),
      listMonthsBySha(file.sha256),
    ]);
    const aliases = new Map(aliasRows.map((a) => [a.nameKey, a.memberId]));
    const matches = matchFile(file.rows, members, aliases);

    const otherMonth = [...shaMonths].reverse().find((m) => m !== month) ?? null;
    return {
      success: true,
      data: {
        month,
        sha256: file.sha256,
        rows: buildPreviewRows(file.rows, matches),
        members: members.map((m) => ({ id: m.id, name: m.name, active: m.active })),
        warnings: file.unknownColumns.map(importUnknownColumnText),
        existing:
          state.rows > 0
            ? {
                text: importExistingText(month, state.rows, state.lastUploadedOn ?? pragueToday()),
                members: state.members,
              }
            : null,
        sameFile: shaMonths.includes(month),
        otherMonthText: otherMonth ? importOtherMonthText(otherMonth, month) : null,
      },
    };
  } catch (err) {
    if (isSemaforFileError(err)) return { success: false, error: fileErrorMessage(err) };
    console.error(`[previewSemaforImportAction] failed: ${errClass(err)}`);
    return { success: false, error: SEMAFOR_TEXTS.errBroken };
  }
}

export interface CommitData {
  message: string;
  inserted: number;
  updated: number;
  unchanged: number;
}

export async function commitSemaforImportAction(formData: FormData): Promise<ActionResult<CommitData>> {
  const auth = await requirePermission("semafor.import");
  if (!auth.success) return auth;
  const actor = auth.session;

  const month = formData.get("month");
  if (!validateImportMonth(month, pragueToday())) return { success: false, error: SEMAFOR_TEXTS.errMonth };
  const previewHash = shaSchema.safeParse(formData.get("sha256"));
  if (!previewHash.success) return { success: false, error: SEMAFOR_TEXTS.errChanged };

  let decisions: Map<number, RowDecision>;
  try {
    const raw = formData.get("decisions");
    const parsed = decisionsSchema.safeParse(JSON.parse(typeof raw === "string" ? raw : "{}"));
    if (!parsed.success) return { success: false, error: SEMAFOR_TEXTS.errChanged };
    decisions = new Map(Object.entries(parsed.data).map(([k, v]) => [Number(k), v]));
  } catch {
    return { success: false, error: SEMAFOR_TEXTS.errChanged };
  }

  try {
    const read = await readFile(formData);
    if (!read.ok) return { success: false, error: read.error };
    // Hash z náhledu musí sedět se souborem, který právě přišel.
    ensureNotChanged(previewHash.data, sha256Hex(read.bytes));

    const file = analyzeFile(read.bytes);
    for (const index of decisions.keys()) {
      if (index >= file.rows.length) throw new SemaforFileError("changed");
    }
    const [members, aliasRows] = await Promise.all([listMembersForMatch(), listAliases()]);
    const aliases = new Map(aliasRows.map((a) => [a.nameKey, a.memberId]));
    const planned = buildSavePlan(file, members, aliases, decisions);
    if (!planned.ok) {
      return { success: false, error: planned.error.code === "changed" ? SEMAFOR_TEXTS.errChanged : planned.error.message };
    }
    const { plan } = planned;

    const res = await saveSemaforImport({
      month,
      actorId: actor.memberId,
      sha256: previewHash.data,
      fileRows: file.rows.length,
      rows: plan.rows,
      aliases: plan.aliases,
    });
    const unchanged = Math.max(0, res.total - res.inserted - res.updated);
    await safeLog(() =>
      importedEvent(
        { runId: randomUUID(), actor: actor.name },
        { month, rows: res.total, inserted: res.inserted, updated: res.updated, unchanged }
      )
    );
    revalidateSemafor();
    return {
      success: true,
      data: {
        message: importSavedText(res.inserted, res.updated, unchanged),
        inserted: res.inserted,
        updated: res.updated,
        unchanged,
      },
    };
  } catch (err) {
    if (isSemaforFileError(err)) return { success: false, error: fileErrorMessage(err) };
    console.error(`[commitSemaforImportAction] failed: ${errClass(err)}`);
    return { success: false, error: SEMAFOR_TEXTS.errSaveFailed };
  }
}

export async function deleteSemaforMonthAction(month: string): Promise<ActionResult<{ rows: number }>> {
  const auth = await requirePermission("semafor.import");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsed = monthSchema.safeParse(month);
  if (!parsed.success) return { success: false, error: SEMAFOR_TEXTS.errMonth };

  try {
    const rows = await deleteSemaforMonth(parsed.data);
    await safeLog(() =>
      monthDeletedEvent({ runId: randomUUID(), actor: actor.name }, { month: parsed.data, rows })
    );
    revalidateSemafor();
    return { success: true, data: { rows } };
  } catch (err) {
    console.error(`[deleteSemaforMonthAction] failed: ${errClass(err)}`);
    return { success: false, error: SEMAFOR_TEXTS.errSaveFailed };
  }
}

export async function deleteSemaforRowAction(month: string, memberId: string): Promise<ActionResult> {
  const auth = await requirePermission("semafor.import");
  if (!auth.success) return auth;
  const actor = auth.session;

  const m = monthSchema.safeParse(month);
  const id = uuidSchema.safeParse(memberId);
  if (!m.success || !id.success) return { success: false, error: SEMAFOR_TEXTS.errSaveFailed };

  try {
    const n = await deleteSemaforRow(m.data, id.data);
    if (n > 0) {
      await safeLog(() => rowDeletedEvent({ runId: randomUUID(), actor: actor.name }, { month: m.data }));
    }
    revalidateSemafor();
    return { success: true };
  } catch (err) {
    console.error(`[deleteSemaforRowAction] failed: ${errClass(err)}`);
    return { success: false, error: SEMAFOR_TEXTS.errSaveFailed };
  }
}

export async function removeSemaforAliasAction(nameKey: string): Promise<ActionResult> {
  const auth = await requirePermission("semafor.import");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsed = z.string().min(2).max(120).safeParse(nameKey);
  if (!parsed.success) return { success: false, error: SEMAFOR_TEXTS.errSaveFailed };

  try {
    const n = await removeSemaforAlias(parsed.data);
    if (n > 0) await safeLog(() => aliasRemovedEvent({ runId: randomUUID(), actor: actor.name }));
    revalidatePath("/semafor/import");
    return { success: true };
  } catch (err) {
    console.error(`[removeSemaforAliasAction] failed: ${errClass(err)}`);
    return { success: false, error: SEMAFOR_TEXTS.errSaveFailed };
  }
}
