import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function GlobalLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoadingSpinner size="lg" />
    </div>
  );
}
