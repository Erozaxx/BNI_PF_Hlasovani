import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { requirePageSession } from "@/lib/auth/page-guard";
import {
  ADMIN_ONLY_MESSAGE,
  can,
  hasRealPassword,
  isAdminSession,
  mayChangeMember,
} from "@/lib/auth/permissions";
import { hasPendingSetPasswordLink } from "@/lib/db/queries/login-links";
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";
import { getMemberById } from "@/lib/db/queries/members";
import { getInterviewCountsByMember } from "@/lib/db/queries/interviews";
import { getMemberFunctionId, listChapterFunctions } from "@/lib/db/queries/member-functions";
import {
  deactivationLabel,
  formatCzDate,
  isMemberActive,
  pragueToday,
} from "@/lib/members/activity";
import { personalLinkState, roleLabel } from "@/lib/members/labels";
import { MemberActions } from "../MemberActions";
import { DeleteMemberButton } from "../DeleteMemberButton";
import { EditMemberCompanyForm } from "../EditMemberCompanyForm";
import { EditMemberEmailForm } from "../EditMemberEmailForm";
import { EditMemberJoinedAtForm } from "../EditMemberJoinedAtForm";
import { MemberAccessControls } from "../MemberAccessControls";
import { MemberStatusControls } from "../MemberStatusControls";
import { AttendanceManagerToggle } from "../AttendanceManagerToggle";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * iter-037 (T-003c, arch 8.2): stránka člena. Údaje, funkce a přístup, stav
 * (deaktivace), osobní odkaz a smazání. Každá sekce se ptá na vlastní právo,
 * stránka sama chce `members.manage`. Účet admina mění jen admin (rozhodnutí
 * Toma 19. 10.): ostatní vidí jen údaje a větu, formuláře se nevykreslí (UI jen
 * skrývá, server to hlídá v každé akci i v SQL).
 */
export default async function AdminMemberPage({ params }: { params: { id: string } }) {
  const session = await requirePageSession({ permission: "members.manage" });
  if (!UUID_RE.test(params.id)) notFound();

  const chapterSettings = await getChapterSettings();
  const m = await getMemberById(params.id);
  if (!m) notFound();

  const [interviewCounts, functions, currentFunctionId, deactivator, pendingLink] =
    await Promise.all([
      getInterviewCountsByMember(),
      listChapterFunctions(),
      getMemberFunctionId(m.id),
      m.deactivatedBy ? getMemberById(m.deactivatedBy) : Promise.resolve(null),
      hasPendingSetPasswordLink(m.id),
    ]);
  const viewerIsAdmin = isAdminSession(session);
  const locked = !mayChangeMember(viewerIsAdmin, m.managementRole);

  const today = pragueToday();
  const active = isMemberActive(m, today);
  const inactiveLabel = deactivationLabel(m, today, { withDate: true });
  const link = personalLinkState(m);
  const isSelf = m.id === session.memberId;
  const managementRole =
    m.managementRole === "admin" || m.managementRole === "moderator" ? m.managementRole : null;
  const role = roleLabel(managementRole);
  const currentFunction = functions.find((f) => f.id === currentFunctionId) ?? null;

  const deactivatedInfo =
    !active && m.deactivatedAt
      ? `${deactivator ? `Deaktivoval(a) ${deactivator.name}` : "Deaktivováno"}, ${formatCzDate(
          new Date(m.deactivatedAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" })
        )}`
      : null;

  // Pořadí ve výběru: Běžný člen, pak od nejnižších práv (Člen výboru) k nejvyšším.
  // Katalog se needituje a řadí se `display_order` vzestupně (Prezident, Viceprezident,
  // Člen výboru), proto stačí otočit pořadí (NIT-3).
  const functionChoices = [...functions].reverse().map((f) => ({ id: f.id, name: f.name }));

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href="/admin/members"
          className="inline-flex min-h-[44px] items-center text-sm text-primary hover:underline"
        >
          ‹ Členové
        </Link>
        <h1 className="text-2xl font-bold text-text-main break-words">{m.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {currentFunction && <Badge variant="category">{currentFunction.name}</Badge>}
          {role && <Badge variant={managementRole === "admin" ? "danger" : "info"}>{role}</Badge>}
          {inactiveLabel && <Badge variant="warning">{inactiveLabel}</Badge>}
          {m.attendanceManagerSince && <Badge variant="info">Správce docházky</Badge>}
        </div>
      </div>

      <Card>
        <h2 className="text-lg font-semibold mb-3">Údaje</h2>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-text-muted">E-mail</dt>
            <dd className="break-all">{m.email || "–"}</dd>
            {!locked && (
              <dd>
                <EditMemberEmailForm memberId={m.id} initialEmail={m.email ?? null} />
              </dd>
            )}
          </div>
          <div>
            <dt className="text-text-muted">Firma</dt>
            <dd>{m.company || "–"}</dd>
            <dt className="mt-2 text-text-muted">Obor</dt>
            <dd>{m.obor || "–"}</dd>
            {!locked && (
              <dd>
                <EditMemberCompanyForm
                  memberId={m.id}
                  initialCompany={m.company ?? null}
                  initialObor={m.obor ?? null}
                />
              </dd>
            )}
          </div>
          <div>
            <dt className="text-text-muted">Datum vstupu</dt>
            <dd>{new Date(`${m.joinedAt}T00:00:00Z`).toLocaleDateString("cs-CZ")}</dd>
            {!locked && (
              <dd>
                <EditMemberJoinedAtForm memberId={m.id} initialJoinedAt={m.joinedAt} />
              </dd>
            )}
          </div>
        </dl>
      </Card>

      {locked && (
        <Card>
          <p className="text-sm text-text-muted">{ADMIN_ONLY_MESSAGE}</p>
        </Card>
      )}

      {!locked && can(session, "access.manage") && (
        <Card>
          <h2 className="text-lg font-semibold mb-3">Funkce a přístup</h2>
          <MemberAccessControls
            memberId={m.id}
            memberName={m.name}
            email={m.email ?? null}
            managementRole={managementRole}
            hasPassword={hasRealPassword({
              hasHash: Boolean(m.passwordHash),
              pendingSetPasswordLink: pendingLink,
            })}
            isSelf={isSelf}
            canChangeFunction={!isSelf || viewerIsAdmin}
            functions={functionChoices}
            currentFunctionId={currentFunctionId}
            isInactive={!active}
          />
        </Card>
      )}

      {/* iter-038 (arch 5.3, 15.3): příznak Správce docházky přiděluje, kdo spravuje členy */}
      {!locked && can(session, "members.manage") && (
        <Card>
          <h2 className="text-lg font-semibold mb-3">Docházka</h2>
          <AttendanceManagerToggle
            memberId={m.id}
            initialEnabled={m.attendanceManagerSince != null}
            hasEmail={Boolean(m.email)}
          />
        </Card>
      )}

      {!locked && can(session, "members.deactivate") && (
        <Card>
          <h2 className="text-lg font-semibold mb-3">Stav</h2>
          <MemberStatusControls
            memberId={m.id}
            inactiveLabel={inactiveLabel}
            currentUntil={m.inactiveUntil ?? null}
            deactivatedInfo={deactivatedInfo}
            todayPrague={today}
            isSelf={isSelf}
            burzaEnabled={chapterSettings.burzaEnabled}
            mastermindEnabled={chapterSettings.mastermindEnabled}
          />
        </Card>
      )}

      {!locked && (
        <Card>
          <h2 className="text-lg font-semibold mb-3">Osobní odkaz</h2>
          <MemberActions
            memberId={m.id}
            hasToken={Boolean(m.magicTokenHash)}
            stateLabel={link.label}
            isInactive={!active}
          />
        </Card>
      )}

      {!locked && can(session, "members.delete") && (
        <Card>
          <h2 className="text-lg font-semibold mb-3">Smazat</h2>
          <p className="mb-3 text-sm text-text-muted">
            Smazání vrátit nejde. Smaže se člen i jeho data. Když člen odchází, použij Deaktivovat.
          </p>
          <DeleteMemberButton
            memberId={m.id}
            memberName={m.name}
            interviewCount={interviewCounts.get(m.id) ?? 0}
            redirectTo="/admin/members"
          />
        </Card>
      )}
    </div>
  );
}
