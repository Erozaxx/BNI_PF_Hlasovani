"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { changePasswordAction } from "@/actions/auth";
import { PASSWORD_TEXTS } from "@/lib/auth/password-texts";

export function ChangePasswordForm({ mode }: { mode: "set" | "change" }) {
  const hasPassword = mode === "change";
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  // Režim platný v okamžiku odeslání: po nastavení hesla se stránka obnoví a prop `mode`
  // přijde jako "change", text a skrytí formuláře se ale řídí tím, co se opravdu stalo.
  const [submittedMode, setSubmittedMode] = useState<"set" | "change" | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);
    const modeAtSubmit = mode;

    try {
      const result = await changePasswordAction(
        currentPassword,
        newPassword,
        confirmPassword
      );
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setSubmittedMode(modeAtSubmit);
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        showToast("success", modeAtSubmit === "change" ? PASSWORD_TEXTS.changed : PASSWORD_TEXTS.saved);
      }
    } catch {
      const msg = "Heslo se nepodařilo změnit. Zkus to znovu.";
      setError(msg);
      showToast("error", msg);
    } finally {
      setLoading(false);
    }
  }

  // Po nastavení hesla se formulář bez starého hesla neukazuje znovu: další
  // odeslání by server vyhodnotil jako změnu a chtěl by staré heslo.
  if (success && submittedMode === "set") {
    return (
      <p className="text-sm text-success" role="status">
        {PASSWORD_TEXTS.saved}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      {hasPassword && (
        <Input
          name="currentPassword"
          type="password"
          label="Aktuální heslo"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      )}
      <Input
        name="newPassword"
        type="password"
        label="Nové heslo"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        autoComplete="new-password"
        required
        minLength={8}
      />
      <Input
        name="confirmPassword"
        type="password"
        label="Potvrď nové heslo"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        autoComplete="new-password"
        required
      />

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {success && (
        <p className="text-sm text-success" role="status">
          {submittedMode === "set" ? PASSWORD_TEXTS.saved : PASSWORD_TEXTS.changed}
        </p>
      )}

      <Button type="submit" variant="primary" size="md" className="min-h-[44px]" loading={loading}>
        {hasPassword ? "Změnit heslo" : "Nastavit heslo"}
      </Button>
    </form>
  );
}
