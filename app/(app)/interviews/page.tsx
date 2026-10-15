import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-guard";
import {
  getInterviewDueList,
  getInterviewsList,
  type InterviewType,
} from "@/lib/db/queries/interviews";
import { getMembers } from "@/lib/db/queries/members";
import {
  buildInterviewListRows,
  isDueRelevant,
  sortDueEntries,
  sortMembersByName,
} from "@/lib/interviews/list-filters";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CreateInterviewForm } from "./CreateInterviewForm";
import { InterviewDueTable } from "./InterviewDueTable";
import { InterviewListTable } from "./InterviewListTable";

/**
 * Interview management landing page (arch section 8a/8f, T-007; iter-032
 * T-001b: filtr u hlaviček, vedoucí v řádku, chip zakládá pohovor). Mod/admin
 * only — middleware only session-gates this route (like /interviews/questions,
 * T-004a delta 1), so the role check happens here, page-level (R-9), same as
 * every action in actions/interviews.ts re-checks it independently.
 */
export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ memberId?: string; type?: string }>;
}) {
  const session = await requirePageSession({ role: "management" });

  const [interviews, allMembers, dueList] = await Promise.all([
    getInterviewsList(),
    getMembers(),
    getInterviewDueList(),
  ]);

  // iter-032 T-001b 5: členové abecedně (Intl.Collator "cs") pro všechny
  // výběry na stránce (D1, D2, D6, D7, D8). getMembers() dál řadí podle
  // display_order, to potřebuje konzole členů.
  const members = sortMembersByName(allMembers);
  const memberOptions = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email ?? null,
  }));

  // Gate T-004b U1: datumy i stav odkazu počítá server s jedním `now`
  // a v Europe/Prague, do klienta jdou jen řetězce a výčty (hydratace).
  const now = new Date();
  const listRows = buildInterviewListRows(interviews, now);

  // Horní tabulka (4.3): jen členové, u kterých něco svítí nebo se blíží,
  // svítící nahoře, uvnitř abecedně. Filtrování z_* běží v klientu.
  const dueEntries = sortDueEntries(dueList.filter(isDueRelevant)).map((e) => ({
    memberId: e.memberId,
    memberName: e.memberName,
    joinedAtUnverified: e.joinedAtUnverified,
    due5: e.due5,
    due10: e.due10,
    due5SinceDays: e.due5SinceDays,
    due10SinceDays: e.due10SinceDays,
    upcoming5: e.upcoming5,
    upcoming10: e.upcoming10,
  }));

  // memberId -> which types already have a non-cancelled interview — comfort
  // hint for the founding form only, the DB partial UNIQUE stays the authority.
  // D-4 (decision_iter-023_T-002): skip cancelled interviews so this matches
  // its own comment above — no MVP path sets status='cancelled' today, so
  // this is a provably-safe no-op, kept preventively.
  const existingByMember: Record<string, { month5: boolean; month10: boolean }> = {};
  for (const i of interviews) {
    if (i.status === "cancelled") continue;
    const entry = existingByMember[i.memberId] ?? { month5: false, month10: false };
    if (i.type === "month_5") entry.month5 = true;
    if (i.type === "month_10") entry.month10 = true;
    existingByMember[i.memberId] = entry;
  }

  // Pre-fill from a chip click on /admin/members (arch iter-023 T-001 §3.3).
  // Validation is a pure lookup over already-loaded data — never throws, an
  // invalid or missing param just falls back to "no pre-fill" for that field.
  const params = await searchParams;
  const initialType =
    params.type === "month_5" || params.type === "month_10"
      ? (params.type as InterviewType)
      : undefined;
  const memberExists = members.some((m) => m.id === params.memberId);
  const initialMemberId = memberExists ? params.memberId : undefined;

  // Stale-chip guard: the type may have been founded in the meantime (double
  // tab, back/forward router cache) — don't pre-select a now-disabled option,
  // keep the member pre-selected so the existing form hint explains why.
  const taken =
    initialMemberId && initialType
      ? initialType === "month_5"
        ? existingByMember[initialMemberId]?.month5
        : existingByMember[initialMemberId]?.month10
      : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-text-main">Pohovory</h1>
        <Link href="/interviews/questions">
          <Button variant="secondary" size="sm">
            Správa otázek
          </Button>
        </Link>
      </div>

      <InterviewDueTable entries={dueEntries} members={memberOptions} />

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Založit pohovor
        </h2>
        <CreateInterviewForm
          members={memberOptions}
          currentMemberId={session.memberId}
          existingByMember={existingByMember}
          initialMemberId={initialMemberId}
          initialType={taken ? undefined : initialType}
        />
      </Card>

      <InterviewListTable rows={listRows} members={memberOptions} />
    </div>
  );
}
