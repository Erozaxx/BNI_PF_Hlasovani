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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError("Text otazky je povinny.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await createQuestionAction(text);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setText("");
        showToast("success", "Otazka byla vytvorena.");
        router.refresh();
      }
    } catch {
      setError("Nepodarilo se vytvorit otazku.");
      showToast("error", "Nepodarilo se vytvorit otazku.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-xl">
      <Textarea
        name="text"
        label="Text otazky"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Napr. Jak se ti darilo v posledních 5 mesicich v BNI?"
        error={error}
      />
      <div>
        <Button type="submit" variant="primary" size="sm" loading={loading}>
          Pridat otazku
        </Button>
      </div>
    </form>
  );
}
