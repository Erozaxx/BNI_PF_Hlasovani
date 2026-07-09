"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { parseXlsxFileWithDuplicates } from "@/lib/import/parse-xlsx";
import {
  getMembersForImport,
  createMember,
  updateMemberObor,
  updateMemberJoinedAt,
  getMemberById,
} from "@/lib/db/queries/members";
import type { ActionResult } from "@/lib/types";
import type {
  ImportPreview,
  ImportPreviewRow,
  ImportResult,
} from "@/lib/types/import";

/**
 * Parse an uploaded XLSX file and return a preview of what would be imported.
 * Does NOT write to the database.
 */
export async function parseXlsxAction(
  formData: FormData
): Promise<ActionResult<ImportPreview>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "Soubor nebyl prilo'zen." };
  }

  if (!file.name.endsWith(".xlsx")) {
    return { success: false, error: "Pouze soubory .xlsx jsou podporovany." };
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { success: false, error: "Nepodarilo se precist soubor." };
  }

  const parseResult = parseXlsxFileWithDuplicates(buffer);
  if (!parseResult.success) {
    return { success: false, error: parseResult.error };
  }

  // Load existing members from DB for comparison
  let dbMembers: { id: string; name: string; obor: string | null }[];
  try {
    dbMembers = await getMembersForImport();
  } catch {
    return { success: false, error: "Nepodarilo se nacist cleny z databaze." };
  }

  // Build a lookup map: normalized name → member
  const dbMap = new Map<string, { id: string; name: string; obor: string | null }>();
  for (const m of dbMembers) {
    dbMap.set(m.name.trim().toLowerCase(), m);
  }

  // Build preview rows
  const rows: ImportPreviewRow[] = [];
  let newCount = 0;
  let updateCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;

  for (const xlsxRow of parseResult.rows) {
    if (xlsxRow.isDuplicate) {
      rows.push({
        xlsxName: xlsxRow.name,
        xlsxObor: xlsxRow.obor,
        xlsxRole: xlsxRow.role,
        xlsxJoinedAt: xlsxRow.joinedAt,
        status: "skipped",
        reason: "Duplicitni jmeno v souboru",
      });
      skippedCount++;
      continue;
    }

    const normalizedName = xlsxRow.name.toLowerCase();
    const dbMatch = dbMap.get(normalizedName);

    if (!dbMatch) {
      rows.push({
        xlsxName: xlsxRow.name,
        xlsxObor: xlsxRow.obor,
        xlsxRole: xlsxRow.role,
        xlsxJoinedAt: xlsxRow.joinedAt,
        status: "new",
      });
      newCount++;
    } else {
      const oborChanged =
        (xlsxRow.obor ?? null) !== (dbMatch.obor ?? null);

      if (oborChanged) {
        rows.push({
          xlsxName: xlsxRow.name,
          xlsxObor: xlsxRow.obor,
          xlsxRole: xlsxRow.role,
          xlsxJoinedAt: xlsxRow.joinedAt,
          status: "update",
          existingMemberId: dbMatch.id,
          existingObor: dbMatch.obor,
        });
        updateCount++;
      } else {
        rows.push({
          xlsxName: xlsxRow.name,
          xlsxObor: xlsxRow.obor,
          xlsxRole: xlsxRow.role,
          xlsxJoinedAt: xlsxRow.joinedAt,
          status: "unchanged",
          existingMemberId: dbMatch.id,
          existingObor: dbMatch.obor,
        });
        unchangedCount++;
      }
    }
  }

  return {
    success: true,
    data: {
      rows,
      summary: { newCount, updateCount, unchangedCount, skippedCount },
    },
  };
}

/**
 * Perform the actual import of confirmed rows.
 * Only processes rows with status 'new' or 'update'.
 * managementRole is NEVER set — import creates regular members only.
 */
export async function importMembersAction(
  rows: ImportPreviewRow[]
): Promise<ActionResult<ImportResult>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  if (!Array.isArray(rows) || rows.length === 0) {
    return { success: false, error: "Zadne radky k importu." };
  }

  const rowsToProcess = rows.filter(
    (r) => r.status === "new" || r.status === "update"
  );

  if (rowsToProcess.length === 0) {
    return { success: false, error: "Zadne radky ke zpracovani (pouze new/update)." };
  }

  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (const row of rowsToProcess) {
    try {
      if (row.status === "new") {
        // Server-side safety: never pass managementRole
        await createMember({
          name: row.xlsxName.trim(),
          obor: row.xlsxObor ?? null,
          // joined_at: XLSX value if present (MAJOR-3), otherwise omitted so
          // the column's own DB default (CURRENT_DATE) applies — import must
          // never be blocked by a missing entry date.
          joinedAt: row.xlsxJoinedAt ?? null,
          // managementRole is intentionally omitted — import creates regular members only
        });
        createdCount++;
      } else if (row.status === "update") {
        if (!row.existingMemberId) {
          errors.push(`Clen "${row.xlsxName}": chybi existingMemberId.`);
          errorCount++;
          continue;
        }

        // Server-side validation: verify the member still exists in DB
        const dbMember = await getMemberById(row.existingMemberId);
        if (!dbMember) {
          errors.push(`Clen "${row.xlsxName}": v DB nenalezen (id: ${row.existingMemberId}).`);
          errorCount++;
          continue;
        }

        await updateMemberObor(row.existingMemberId, row.xlsxObor ?? null);
        // joined_at: only touched when the XLSX row actually has a value
        // (MAJOR-3) — an update row never clears an existing entry date just
        // because the column was left blank in the file.
        if (row.xlsxJoinedAt) {
          await updateMemberJoinedAt(row.existingMemberId, row.xlsxJoinedAt);
        }
        updatedCount++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Clen "${row.xlsxName}": ${message}`);
      errorCount++;
    }
  }

  revalidatePath("/admin/members");

  return {
    success: true,
    data: { createdCount, updatedCount, errorCount, errors },
  };
}
