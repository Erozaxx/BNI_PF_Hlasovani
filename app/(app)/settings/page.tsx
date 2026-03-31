import { redirect } from "next/navigation";
import { requireManagementRole } from "@/lib/auth/guards";
import { getMemberById } from "@/lib/db/queries/members";
import { getSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function SettingsPage() {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) {
    redirect("/dashboard");
  }

  const session = await getSession();
  const member = session.memberId ? await getMemberById(session.memberId) : null;
  const hasPassword = !!member?.passwordHash;

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold text-text-main">Nastaveni</h1>

      <Card>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          {hasPassword ? "Zmena hesla" : "Nastavit heslo"}
        </h2>
        {!hasPassword && (
          <p className="text-sm text-text-muted mb-4">
            Zatim nemáte nastaveno heslo. Po nastavení se budete moci přihlásit i přes email a heslo.
          </p>
        )}
        <ChangePasswordForm hasPassword={hasPassword} />
      </Card>
    </div>
  );
}
