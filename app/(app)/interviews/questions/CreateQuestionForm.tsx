"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { createQuestionAction } from "@/actions/interview-questions";

export function CreateQuestionForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [text, setText] = useState("");
  const [appliesMonth5, setAppliesMonth5] = useState(true);
  const [appliesMonth10, setAppliesMonth10] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [appliesError, setAppliesError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

    setLoading(true);

    try {
      const result = await createQuestionAction(
        text,
        appliesMonth5,
        appliesMonth10
      );
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setText("");
        setAppliesMonth5(true);
        setAppliesMonth10(true);
        showToast("success", "Otázka je vytvořená.");
        router.refresh();
      }
    } catch {
      setError("Otázku se nepodařilo vytvořit.");
      showToast("error", "Otázku se nepodařilo vytvořit.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-xl">
      <Textarea
        name="text"
        label="Text otázky"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Např. Jak se ti dařilo v posledních 5 měsících v BNI?"
        error={error}
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="create-applies-month-5"
            checked={appliesMonth5}
            onChange={(e) => setAppliesMonth5(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:outline-none"
          />
          <label
            htmlFor="create-applies-month-5"
            className="text-sm text-text-main cursor-pointer"
          >
            Platí pro pohovor po 5 měsících
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="create-applies-month-10"
            checked={appliesMonth10}
            onChange={(e) => setAppliesMonth10(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:outline-none"
          />
          <label
            htmlFor="create-applies-month-10"
            className="text-sm text-text-main cursor-pointer"
          >
            Platí pro pohovor po 10 měsících
          </label>
        </div>
        {appliesError && (
          <p className="text-sm text-danger">{appliesError}</p>
        )}
      </div>
      <div>
        <Button type="submit" variant="primary" size="sm" className="min-h-[44px]" loading={loading}>
          Přidat otázku
        </Button>
      </div>
    </form>
  );
}
