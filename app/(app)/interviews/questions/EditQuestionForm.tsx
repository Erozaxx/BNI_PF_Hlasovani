"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { updateQuestionTextAction } from "@/actions/interview-questions";

interface EditQuestionFormProps {
  questionId: string;
  currentText: string;
}

export function EditQuestionForm({
  questionId,
  currentText,
}: EditQuestionFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(currentText);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!text.trim()) {
      setError("Text otazky je povinny.");
      return;
    }
    if (text.trim() === currentText) {
      setEditing(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await updateQuestionTextAction(questionId, text.trim());
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setEditing(false);
        showToast("success", "Otazka byla upravena.");
        router.refresh();
      }
    } catch {
      setError("Nepodarilo se upravit otazku.");
      showToast("error", "Nepodarilo se upravit otazku.");
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
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
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={handleSave} loading={loading}>
          Ulozit
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditing(false);
            setText(currentText);
            setError("");
          }}
        >
          Zrusit
        </Button>
      </div>
    </div>
  );
}
