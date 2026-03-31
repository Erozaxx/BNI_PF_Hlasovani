import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getCategories } from "@/lib/db/queries/categories";
import { getActiveMeeting } from "@/lib/db/queries/meetings";
import { GuestForm } from "@/components/guests/GuestForm";

export default async function NewGuestPage() {
  const session = await getSession();

  // Only admin/moderator can add guests
  if (
    session.managementRole !== "admin" &&
    session.managementRole !== "moderator"
  ) {
    redirect("/guests");
  }

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
