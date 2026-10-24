"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { changePasswordAction } from "@/actions/auth";

export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);

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
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        showToast("success", "Heslo je změněné.");
      }
    } catch {
      const msg = "Heslo se nepodařilo změnit. Zkus to znovu.";
      setError(msg);
      showToast("error", msg);
    } finally {
      setLoading(false);
    }
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
          Heslo je změněné.
        </p>
      )}

      <Button type="submit" variant="primary" size="md" className="min-h-[44px]" loading={loading}>
        Změnit heslo
      </Button>
    </form>
  );
}
