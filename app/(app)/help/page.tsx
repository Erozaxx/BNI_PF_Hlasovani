import { requirePageSession } from "@/lib/auth/page-guard";
import { HelpPage } from "@/components/help/HelpPage";

export default async function HelpPageRoute() {
  const session = await requirePageSession();
  return <HelpPage managementRole={session.managementRole ?? null} />;
}
