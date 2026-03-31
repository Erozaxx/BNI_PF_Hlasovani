import { getSession } from "@/lib/auth/session";
import { HelpPage } from "@/components/help/HelpPage";

export default async function HelpPageRoute() {
  const session = await getSession();
  return <HelpPage managementRole={session.managementRole ?? null} />;
}
