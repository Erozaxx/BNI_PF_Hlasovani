import * as XLSX from "xlsx";
import type { ImportPreviewRow } from "@/lib/types/import";

export type ParsedMemberRow = {
  name: string;
  obor: string | null;
  /** "Clen" or similar — informational only, never used for managementRole */
  role: string | null;
};

type ParseXlsxResult =
  | { success: true; rows: ParsedMemberRow[] }
  | { success: false; error: string };

/**
 * Parse a BNI member XLSX file from an ArrayBuffer.
 *
 * Expected column layout (0-indexed):
 *   col 0 — role (e.g. "Clen")
 *   col 1 — name (required)
 *   col 2 — (unused)
 *   col 3 — obor (profession / industry)
 *
 * Returns a result object — never throws.
 * Rows without a name (col 1) are filtered out.
 * Rows with a duplicate name (case-insensitive) are included with status
 * 'skipped' so the caller can communicate that back to the admin.
 *
 * NOTE: The role column is informational only and is NEVER mapped to
 * managementRole — that would bypass the intentional admin-manual elevation flow.
 */
export function parseXlsxFile(buffer: ArrayBuffer): ParseXlsxResult {
  try {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { success: false, error: "XLSX soubor neobsahuje zadny list." };
    }

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    // Filter rows that have a non-empty name in col 1
    const validRows = rawRows.filter(
      (row) => Array.isArray(row) && typeof row[1] === "string" && row[1].trim().length > 0
    );

    if (validRows.length > 500) {
      return {
        success: false,
        error: `XLSX obsahuje prilis mnoho radku (${validRows.length}). Maximum je 500.`,
      };
    }

    // Dedup: track normalized names seen so far
    const seenNames = new Set<string>();
    const rows: (ParsedMemberRow & { _isDuplicate?: boolean })[] = [];

    for (const row of validRows) {
      const rawName = String(row[1]).trim();
      const normalizedName = rawName.toLowerCase();

      const parsed: ParsedMemberRow & { _isDuplicate?: boolean } = {
        name: rawName,
        obor: row[3] != null && String(row[3]).trim() ? String(row[3]).trim() : null,
        role: row[0] != null && String(row[0]).trim() ? String(row[0]).trim() : null,
      };

      if (seenNames.has(normalizedName)) {
        parsed._isDuplicate = true;
      } else {
        seenNames.add(normalizedName);
      }

      rows.push(parsed);
    }

    // Strip internal flag before returning
    return {
      success: true,
      rows: rows.map(({ _isDuplicate: _dup, ...rest }) => rest),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Nepodarilo se nacist XLSX soubor: ${message}` };
  }
}

/**
 * Same as parseXlsxFile but also returns duplicate information so that the
 * caller can produce ImportPreviewRow entries with status 'skipped'.
 *
 * Returns rows enriched with an `isDuplicate` flag.
 */
export function parseXlsxFileWithDuplicates(buffer: ArrayBuffer):
  | { success: false; error: string }
  | { success: true; rows: (ParsedMemberRow & { isDuplicate: boolean })[] }
{
  try {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { success: false, error: "XLSX soubor neobsahuje zadny list." };
    }

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    const validRows = rawRows.filter(
      (row) => Array.isArray(row) && typeof row[1] === "string" && row[1].trim().length > 0
    );

    if (validRows.length > 500) {
      return {
        success: false,
        error: `XLSX obsahuje prilis mnoho radku (${validRows.length}). Maximum je 500.`,
      };
    }

    const seenNames = new Set<string>();
    const rows: (ParsedMemberRow & { isDuplicate: boolean })[] = [];

    for (const row of validRows) {
      const rawName = String(row[1]).trim();
      const normalizedName = rawName.toLowerCase();

      const isDuplicate = seenNames.has(normalizedName);
      if (!isDuplicate) seenNames.add(normalizedName);

      rows.push({
        name: rawName,
        obor: row[3] != null && String(row[3]).trim() ? String(row[3]).trim() : null,
        role: row[0] != null && String(row[0]).trim() ? String(row[0]).trim() : null,
        isDuplicate,
      });
    }

    return { success: true, rows };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Nepodarilo se nacist XLSX soubor: ${message}` };
  }
}
