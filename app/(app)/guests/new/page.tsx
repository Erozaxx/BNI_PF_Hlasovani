import { requirePageSession } from "@/lib/auth/page-guard";
import { getCategories } from "@/lib/db/queries/categories";
import { getActiveMeeting } from "@/lib/db/queries/meetings";
import { GuestForm } from "@/components/guests/GuestForm";

export default async function NewGuestPage() {
  const session = await requirePageSession({ permission: "guests.manage", denyTo: "/guests" });

  const [categories, activeMeeting] = await Promise.all([
    getCategories(),
    getActiveMeeting(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-main">Novy host</h1>
      <GuestForm
        categories={categories}
        activeMeeting={activeMeeting ?? undefined}
      />
    </div>
  );
}
