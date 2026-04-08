/**
 * Types for the admin member import flow (XLSX → preview → confirm → upsert).
 */

export type ImportPreviewRow = {
  xlsxName: string;
  xlsxObor: string | null;
  xlsxRole: string | null;
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
