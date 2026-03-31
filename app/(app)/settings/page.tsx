import { redirect } from "next/navigation";
import { requireManagementRole } from "@/lib/auth/guards";
import { Card } from "@/components/ui/Card";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function SettingsPage() {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold text-text-main">Nastaveni</h1>

      <Card>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Zmena hesla
        </h2>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
