"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export interface InterviewQuestionShape {
  snapshotId: string;
  position: number;
  text: string;
  valueText: string | null;
  /**
   * iter-021 (arch T-001 5.1/5.3, decision T-004 delta D-5): server-derived
   * boolean — false means the question does not apply to this interview's
   * type. Such a question renders as struck-through text with an explanatory
   * sentence, no input at all (not even disabled) — the server-side
   * upsertInterviewAnswer guard is the actual write authority regardless of
   * what the UI renders.
   */
  applies: boolean;
}

interface InterviewFillFormProps {
  token: string;
  memberName: string;
  typeLabel: string;
  status: "open" | "submitted";
  submittedAt: string | null;
  initialQuestions: InterviewQuestionShape[];
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Public fill-form UI for the interview leader (arch 8d/8e, T-008). No
 * session — every mutation goes through /api/i/[token]/* which re-verifies
 * the token server-side on each call. Per-question autosave on blur; explicit
 * confirm before submit (submit does not require full completion, arch 8e).
 */
export function InterviewFillForm({
  token,
  memberName,
  typeLabel,
  status: initialStatus,
  submittedAt: initialSubmittedAt,
  initialQuestions,
}: InterviewFillFormProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialQuestions.map((q) => [q.snapshotId, q.valueText ?? ""])
    )
  );
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [status, setStatus] = useState<"open" | "submitted">(initialStatus);
  const [submittedAt, setSubmittedAt] = useState<string | null>(
    initialSubmittedAt
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const readOnly = status === "submitted";

  async function saveAnswer(snapshotQuestionId: string) {
    if (readOnly) return;

    setSaveStates((prev) => ({ ...prev, [snapshotQuestionId]: "saving" }));
    try {
      const res = await fetch(`/api/i/${token}/answers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshotQuestionId,
          valueText: answers[snapshotQuestionId] ?? "",
        }),
      });

      if (!res.ok) {
        setSaveStates((prev) => ({ ...prev, [snapshotQuestionId]: "error" }));
        return;
      }

      setSaveStates((prev) => ({ ...prev, [snapshotQuestionId]: "saved" }));
    } catch {
      setSaveStates((prev) => ({ ...prev, [snapshotQuestionId]: "error" }));
    }
  }

  // iter-021: questions that do not apply to this interview's type are
  // excluded from the unanswered count — the leader could not have answered
  // them, so they must not count as "left blank" in the submit confirm.
  const unansweredCount = initialQuestions.filter(
    (q) => q.applies && !(answers[q.snapshotId] ?? "").trim()
  ).length;

  async function handleSubmit() {
    const confirmMessage =
      unansweredCount > 0
        ? `${unansweredCount} otazek zustava bez odpovedi. Opravdu chcete pohovor odeslat?`
        : "Opravdu chcete pohovor odeslat? Po odeslani jiz odpovedi nepujde upravit.";
    if (!window.confirm(confirmMessage)) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/i/${token}/submit`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(
          typeof data.error === "string"
            ? data.error
            : "Nepodarilo se odeslat pohovor."
        );
        return;
      }
      setStatus("submitted");
      setSubmittedAt(new Date().toISOString());
    } catch {
      setSubmitError("Nepodarilo se odeslat pohovor. Zkuste to znovu.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-text-main">
              Pohovor — {memberName}
            </h1>
            <Badge variant={readOnly ? "success" : "info"}>{typeLabel}</Badge>
          </div>
          {readOnly && (
            <p className="text-sm text-text-muted">
              Pohovor byl odeslan
              {submittedAt
                ? ` ${new Date(submittedAt).toLocaleDateString("cs-CZ")}`
                : ""}
              . Odpovedi jsou jen ke cteni.
            </p>
          )}
        </div>

        {readOnly && (
          <div className="bg-success-light border border-success rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-success">
              Pohovor byl uspesne odeslan. Dekujeme za vyplneni.
            </p>
          </div>
        )}

        <section className="space-y-4">
          {initialQuestions.length === 0 && (
            <Card>
              <p className="text-sm text-text-muted">
                Tento pohovor nema zadne otazky.
              </p>
            </Card>
          )}

          {initialQuestions.map((q) => (
            <Card key={q.snapshotId}>
              <p
                className={`text-sm font-medium mb-2 ${
                  q.applies
                    ? "text-text-main"
                    : "text-text-muted line-through opacity-60"
                }`}
              >
                {q.text}
              </p>
              {!q.applies ? (
                // iter-021 (decision T-004 delta D-5): no <Textarea>, not even
                // disabled — the question simply isn't rendered as
                // answerable. This sentence must always be present (editable
                // AND read-only mode), never left as a blank gap and never
                // "Bez odpovedi".
                <p className="text-sm text-text-muted italic">
                  Neplati pro pohovor {typeLabel}
                </p>
              ) : readOnly ? (
                answers[q.snapshotId]?.trim() ? (
                  <p className="text-sm text-text-main whitespace-pre-wrap">
                    {answers[q.snapshotId]}
                  </p>
                ) : (
                  <p className="text-sm text-text-muted italic">
                    Bez odpovedi
                  </p>
                )
              ) : (
                <>
                  <Textarea
                    name={`answer-${q.snapshotId}`}
                    value={answers[q.snapshotId] ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.snapshotId]: e.target.value,
                      }))
                    }
                    onBlur={() => saveAnswer(q.snapshotId)}
                    placeholder="Vase odpoved..."
                    rows={3}
                  />
                  <p className="text-xs mt-1 h-4">
                    {saveStates[q.snapshotId] === "saving" && (
                      <span className="text-text-muted">Uklada se...</span>
                    )}
                    {saveStates[q.snapshotId] === "saved" && (
                      <span className="text-success">Ulozeno</span>
                    )}
                    {saveStates[q.snapshotId] === "error" && (
                      <span className="text-danger">
                        Ulozeni se nezdarilo, zkuste to znovu.
                      </span>
                    )}
                  </p>
                </>
              )}
            </Card>
          ))}
        </section>

        {!readOnly && (
          <div className="space-y-2">
            {submitError && (
              <p className="text-sm text-danger" role="alert">
                {submitError}
              </p>
            )}
            <Button
              type="button"
              loading={submitting}
              onClick={handleSubmit}
              disabled={initialQuestions.length === 0}
            >
              Odeslat pohovor
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
