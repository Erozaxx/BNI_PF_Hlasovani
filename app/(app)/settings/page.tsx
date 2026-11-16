import { requirePageSession } from "@/lib/auth/page-guard";
import { PASSWORD_TEXTS } from "@/lib/auth/password-texts";
import { Card } from "@/components/ui/Card";
import { ChangePasswordForm } from "./ChangePasswordForm";

/**
 * iter-046 (arch 8.6): heslo si nastaví a změní každý člen. Režim počítá
 * `getSession()` z DB při každém požadavku (`session.passwordMode`):
 * `set` bez starého hesla, `change` se starým, `via-link` jen text (vedení bez
 * hesla ho dostane odkazem od vedení).
 */
export default async function SettingsPage() {
  const session = await requirePageSession();
  const mode = session.passwordMode;

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold text-text-main">Heslo</h1>

      <Card>
        {mode === "via-link" ? (
          <p className="text-sm text-text-muted">{PASSWORD_TEXTS.viaLink}</p>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-text-main mb-4">
              {mode === "set" ? PASSWORD_TEXTS.setTitle : PASSWORD_TEXTS.changeTitle}
            </h2>
            {mode === "set" ? (
              <p className="text-sm text-text-muted mb-4">{PASSWORD_TEXTS.setIntro}</p>
            ) : (
              <p className="text-sm text-text-muted mb-4">{PASSWORD_TEXTS.forgotten}</p>
            )}
            <ChangePasswordForm mode={mode} />
          </>
        )}
      </Card>
    </div>
  );
}
