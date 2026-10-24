import { requirePageSession } from "@/lib/auth/page-guard";
import { getAllQuestions } from "@/lib/db/queries/interview-questions";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateQuestionForm } from "./CreateQuestionForm";
import { SortableQuestionList } from "./SortableQuestionList";

/**
 * Global interview question set editor (arch section 6.1/6.2, T-004a delta 1).
 *
 * Lives OUTSIDE the /admin/* segment on purpose - admin AND moderator must be
 * able to manage the question set, and middleware only session-gates this
 * route (no role check there). The role check therefore happens here,
 * page-level, exactly like every action in actions/interview-questions.ts
 * re-checks it independently (R-9: a management session must never rely on
 * client-side nav hiding alone).
 */
export default async function InterviewQuestionsPage() {
  const session = await requirePageSession({ permission: "interviewQuestions.manage" });

  const questions = await getAllQuestions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">
          Sada otázek pro pohovory
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Otázky se použijí při založení nového pohovoru (po 5 a po 10 měsících).
          Změna textu, pořadí nebo archivace se projeví jen u nově založených
          pohovorů. Pohovor si otázky uloží při založení, pozdější úpravy otázek
          ho nezmění.
        </p>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Nová otázka
        </h2>
        <CreateQuestionForm />
      </Card>

      <section>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Otázky ({questions.length})
        </h2>
        {questions.length > 0 ? (
          <SortableQuestionList
            questions={questions.map((q) => ({
              id: q.id,
              text: q.text,
              active: q.active,
              appliesMonth5: q.appliesMonth5,
              appliesMonth10: q.appliesMonth10,
            }))}
          />
        ) : (
          <Card>
            <EmptyState
              title="Zatím žádné otázky"
              description="Přidej první otázku ve formuláři výše."
            />
          </Card>
        )}
      </section>
    </div>
  );
}
