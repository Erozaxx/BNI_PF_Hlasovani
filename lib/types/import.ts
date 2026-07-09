/**
 * Types for the admin member import flow (XLSX → preview → confirm → upsert).
 */

export type ImportPreviewRow = {
  xlsxName: string;
  xlsxObor: string | null;
  xlsxRole: string | null;
  /**
   * Optional "Datum vstupu" column (iter-020, MAJOR-3), "YYYY-MM-DD" or null
   * if the column/value is absent or unparseable. Never blocks the import —
   * a missing/invalid value falls back to member.joined_at's own DB default
   * (CURRENT_DATE) at write time.
   */
  xlsxJoinedAt: string | null;
  status: "new" | "update" | "unchanged" | "skipped";
  existingMemberId?: string;
  existingObor?: string | null;
  /** Reason why the row was skipped (e.g. duplicate name in file). */
  reason?: string;
};

export type ImportPreview = {
  rows: ImportPreviewRow[];
  summary: {
    newCount: number;
    updateCount: number;
    unchangedCount: number;
    skippedCount: number;
  };
};

export type ImportResult = {
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: string[];
};
