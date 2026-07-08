import { getMembers } from "@/lib/db/queries/members";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateMemberForm } from "./CreateMemberForm";
import { ImportMembersForm } from "./ImportMembersForm";
import { SortableMemberList } from "./SortableMemberList";

export default async function AdminMembersPage() {
  const members = await getMembers();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-main">Sprava clenu</h1>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Novy clen
        </h2>
        <CreateMemberForm />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Import clenu z XLSX
        </h2>
        <ImportMembersForm />
      </Card>

      <section>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Clenove ({members.length})
        </h2>
        {members.length > 0 ? (
          <SortableMemberList
            members={members.map((m) => ({
              id: m.id,
              name: m.name,
              email: m.email ?? null,
              company: m.company ?? null,
              obor: m.obor ?? null,
              managementRole: m.managementRole ?? null,
              magicTokenHash: m.magicTokenHash ?? null,
              tokenUsed: m.tokenUsed,
            }))}
          />
        ) : (
          <Card>
            <EmptyState
              title="Zatim zadni clenove"
              description="Pridejte prvniho clena pomoci formulare vyse."
            />
          </Card>
        )}
      </section>
    </div>
  );
}
