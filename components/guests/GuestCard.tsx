import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface GuestCardProps {
  name: string;
  company?: string | null;
  email?: string | null;
  description?: string | null;
  categoryName?: string | null;
  lastMeetingDate?: string | null;
  interactive?: boolean;
}

export function GuestCard({
  name,
  company,
  email,
  description,
  categoryName,
  lastMeetingDate,
  interactive = false,
}: GuestCardProps) {
  return (
    <Card variant={interactive ? "interactive" : "default"}>
      <h3 className="font-medium text-text-main">{name}</h3>
      {company && (
        <p className="text-sm text-text-muted">{company}</p>
      )}
      <Badge variant="category" className="mt-2">
        {categoryName ?? "[bez kategorie]"}
      </Badge>
      {email && (
        <p className="text-xs text-text-muted mt-1">{email}</p>
      )}
      {description && (
        <p className="text-sm text-text-muted mt-2 line-clamp-3">
          {description}
        </p>
      )}
      {lastMeetingDate && (
        <p className="text-xs text-text-muted mt-2">
          Naposledy na schůzce: {lastMeetingDate}
        </p>
      )}
    </Card>
  );
}
