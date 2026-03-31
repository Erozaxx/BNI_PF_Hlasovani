import { getMembers } from "@/lib/db/queries/members";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateMemberForm } from "./CreateMemberForm";
import { MemberActions } from "./MemberActions";
import { DeleteMemberButton } from "./DeleteMemberButton";

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

      <section>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Clenove ({members.length})
        </h2>
        {members.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-primary text-left">
                  <th className="px-4 py-3 font-semibold">Jmeno</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Token</th>
                  <th className="px-4 py-3 font-semibold">Akce</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr
                    key={m.id}
                    className={`border-b border-border ${
                      i % 2 === 1 ? "bg-background" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium">{m.name}</td>
                    <td className="px-4 py-3 text-text-muted">
                      {m.email || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {m.managementRole ? (
                        <Badge
                          variant={
                            m.managementRole === "admin" ? "danger" : "info"
                          }
                        >
                          {m.managementRole}
                        </Badge>
                      ) : (
                        <Badge variant="neutral">clen</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {m.tokenUsed ? (
                        <Badge variant="neutral">Pouzit</Badge>
                      ) : m.magicTokenHash ? (
                        <Badge variant="success">Aktivni</Badge>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <MemberActions memberId={m.id} hasToken={Boolean(m.magicTokenHash)} />
                        <DeleteMemberButton memberId={m.id} memberName={m.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
