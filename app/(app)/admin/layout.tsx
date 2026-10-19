import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // iter-037 (arch 6.3): jen ověření session. Práva stránek pod /admin hlídá
  // `requirePageSession({ permission })` v každé stránce. Middleware roli admin
  // pro /admin/* už nekontroluje (jen existenci session).
  if (!session.memberId) {
    redirect("/login");
  }

  return <>{children}</>;
}
