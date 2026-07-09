interface ReportPreviewProps {
  html: string;
  /** Tailwind height class for the preview frame. */
  heightClassName?: string;
}

/**
 * Renders a pre-built report HTML string (arch 8g "Nahled") inside a
 * sandboxed iframe. `srcDoc` is used (not dangerouslySetInnerHTML) because
 * the report is a full standalone <html>/<head>/<body> document — it cannot
 * be inlined into the surrounding React tree without invalid nesting.
 * `sandbox=""` blocks script execution / navigation / form submission inside
 * the frame; the report HTML never contains a <script> tag, this is defense
 * in depth. The same `html` string is what actually gets emailed — the
 * preview can never drift from the sent report.
 */
export function ReportPreview({ html, heightClassName = "h-[520px]" }: ReportPreviewProps) {
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-white">
      <iframe
        srcDoc={html}
        sandbox=""
        title="Nahled reportu"
        className={`w-full ${heightClassName}`}
      />
    </div>
  );
}
