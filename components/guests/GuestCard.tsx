import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface GuestCardProps {
  name: string;
  description?: string | null;
  categoryName?: string | null;
  interactive?: boolean;
}

export function GuestCard({
  name,
  description,
  categoryName,
  interactive = false,
}: GuestCardProps) {
  return (
    <Card variant={interactive ? "interactive" : "default"}>
      <h3 className="font-medium text-text-main">{name}</h3>
      {categoryName && (
        <Badge variant="category" className="mt-2">
          {categoryName}
        </Badge>
      )}
      {description && (
        <p className="text-sm text-text-muted mt-2 line-clamp-3">
          {description}
        </p>
      )}
    </Card>
  );
}
