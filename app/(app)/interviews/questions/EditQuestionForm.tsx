"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { updateQuestionAction } from "@/actions/interview-questions";

interface EditQuestionFormProps {
  questionId: string;
  currentText: string;
  currentAppliesMonth5: boolean;
  currentAppliesMonth10: boolean;
}

export function EditQuestionForm({
  questionId,
  currentText,
  currentAppliesMonth5,
  currentAppliesMonth10,
}: EditQuestionFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(currentText);
  const [appliesMonth5, setAppliesMonth5] = useState(currentAppliesMonth5);
  const [appliesMonth10, setAppliesMonth10] = useState(currentAppliesMonth10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [appliesError, setAppliesError] = useState("");

  async function handleSave() {
    let hasError = false;

    if (!text.trim()) {
      setError("Text otázky je povinný.");
      hasError = true;
    } else {
      setError("");
    }

    if (!appliesMonth5 && !appliesMonth10) {
      setAppliesError("Otázka musí platit aspoň pro jeden typ pohovoru.");
      hasError = true;
    } else {
      setAppliesError("");
    }

    if (hasError) return;

    if (
      text.trim() === currentText &&
      appliesMonth5 === currentAppliesMonth5 &&
      appliesMonth10 === currentAppliesMonth10
    ) {
      setEditing(false);
      return;
    }

    setLoading(true);

    try {
      const result = await updateQuestionAction(
        questionId,
        text.trim(),
        appliesMonth5,
        appliesMonth10
      );
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setEditing(false);
        showToast("success", "Otázka je upravená.");
        router.refresh();
      }
    } catch {
      setError("Otázku se nepodařilo upravit.");
      showToast("error", "Otázku se nepodařilo upravit.");
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={() => setEditing(true)}>
        Upravit
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-w-xl">
      <Textarea
        name="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        error={error}
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`edit-applies-month-5-${questionId}`}
            checked={appliesMonth5}
            onChange={(e) => setAppliesMonth5(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:outline-none"
          />
          <label
            htmlFor={`edit-applies-month-5-${questionId}`}
            className="text-sm text-text-main cursor-pointer"
          >
            Platí pro pohovor po 5 měsících
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`edit-applies-month-10-${questionId}`}
            checked={appliesMonth10}
            onChange={(e) => setAppliesMonth10(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:outline-none"
          />
          <label
            htmlFor={`edit-applies-month-10-${questionId}`}
            className="text-sm text-text-main cursor-pointer"
          >
            Platí pro pohovor po 10 měsících
          </label>
        </div>
        {appliesError && (
          <p className="text-sm text-danger">{appliesError}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" className="min-h-[44px]" onClick={handleSave} loading={loading}>
          Uložit
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="min-h-[44px]"
          onClick={() => {
            setEditing(false);
            setText(currentText);
            setAppliesMonth5(currentAppliesMonth5);
            setAppliesMonth10(currentAppliesMonth10);
            setError("");
            setAppliesError("");
          }}
        >
          Zrušit
        </Button>
      </div>
    </div>
  );
}
