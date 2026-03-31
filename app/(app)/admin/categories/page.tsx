import { getCategories } from "@/lib/db/queries/categories";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateCategoryForm } from "./CreateCategoryForm";
import { RenameCategoryForm } from "./RenameCategoryForm";
import { DeleteCategoryButton } from "./DeleteCategoryButton";

export default async function AdminCategoriesPage() {
  const categories = await getCategories();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-main">Sprava kategorii</h1>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Nova kategorie
        </h2>
        <CreateCategoryForm />
      </Card>

      <section>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Kategorie ({categories.length})
        </h2>
        {categories.length > 0 ? (
          <div className="space-y-3">
            {categories.map((cat) => (
              <Card key={cat.id}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <Badge variant="category">{cat.name}</Badge>
                  <div className="flex flex-wrap gap-2 items-center">
                    <RenameCategoryForm categoryId={cat.id} currentName={cat.name} />
                    <DeleteCategoryButton categoryId={cat.id} categoryName={cat.name} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              title="Zatim zadne kategorie"
              description="Vytvorte prvni kategorii pomoci formulare vyse."
            />
          </Card>
        )}
      </section>
    </div>
  );
}
