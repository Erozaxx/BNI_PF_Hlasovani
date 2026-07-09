import * as XLSX from "xlsx";
import type { ImportPreviewRow } from "@/lib/types/import";

export type ParsedMemberRow = {
  name: string;
  obor: string | null;
  /** "Clen" or similar — informational only, never used for managementRole */
  role: string | null;
  /**
   * Optional "Datum vstupu" column (iter-020, MAJOR-3), normalized to
   * "YYYY-MM-DD", or null if the column/cell is absent or unparseable.
   * Never blocks the import — a null value falls back to member.joined_at's
   * own DB default (CURRENT_DATE) at write time (see actions/import-members.ts).
   */
  joinedAt: string | null;
};

type ParseXlsxResult =
  | { success: true; rows: ParsedMemberRow[] }
  | { success: false; error: string };

/**
 * Validate that (y, m, d) form a real calendar date (rejects e.g. 2024-02-30
 * which `new Date(Date.UTC(...))` would otherwise silently roll over).
 */
function isValidDateParts(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Parse an optional "Datum vstupu" (member entry date) cell value into a
 * "YYYY-MM-DD" string, or null if absent/unparseable. Never throws.
 *
 * Accepts:
 *  - a JS Date (workbook is read with `cellDates: true`, so a cell formatted
 *    as a date in Excel arrives as a Date object) — read via UTC getters,
 *    since the xlsx library computes serial-date-to-Date conversion in UTC
 *    internally, matching that avoids an off-by-one-day shift.
 *  - an ISO string "YYYY-MM-DD"
 *  - a Czech/European string "D.M.YYYY" / "DD.MM.YYYY"
 *
 * Any other shape (plain un-formatted number, unrecognized string, etc.)
 * yields null — the import is never blocked by a bad/missing date (MAJOR-3).
 */
function parseImportJoinedAt(raw: unknown): string | null {
  if (raw == null || raw === "") return null;

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, "0");
    const d = String(raw.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const text = String(raw).trim();
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    return isValidDateParts(y, m, d)
      ? `${isoMatch[1]}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      : null;
  }

  const czMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (czMatch) {
    const d = Number(czMatch[1]);
    const m = Number(czMatch[2]);
    const y = Number(czMatch[3]);
    return isValidDateParts(y, m, d)
      ? `${czMatch[3]}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      : null;
  }

  return null;
}

/**
 * Parse a BNI member XLSX file from an ArrayBuffer.
 *
 * Expected column layout (0-indexed):
 *   col 0 — role (e.g. "Clen")
 *   col 1 — name (required)
 *   col 2 — (unused)
 *   col 3 — obor (profession / industry)
 *   col 4 — Datum vstupu (optional, iter-020 MAJOR-3 — date cell or
 *           "YYYY-MM-DD" / "DD.MM.YYYY" text; absent/unparseable is fine)
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
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { success: false, error: "XLSX soubor neobsahuje zadny list." };
    }

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

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
        joinedAt: parseImportJoinedAt(row[4]),
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
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { success: false, error: "XLSX soubor neobsahuje zadny list." };
    }

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

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
        joinedAt: parseImportJoinedAt(row[4]),
        isDuplicate,
      });
    }

    return { success: true, rows };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Nepodarilo se nacist XLSX soubor: ${message}` };
  }
}
