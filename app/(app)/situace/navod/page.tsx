import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-guard";
import { GUIDE, type GuideTone } from "@/lib/situations/guide";
import { UI_TEXTS } from "@/lib/situations/rules";

export const dynamic = "force-dynamic";

const TONE_CLASSES: Record<GuideTone, { heading: string; box: string }> = {
  neutral: { heading: "border-border-strong", box: "border-border bg-background" },
  need: { heading: "border-success", box: "border-success/30 bg-success-light" },
  fear: { heading: "border-primary", box: "border-primary/30 bg-primary-light" },
  desire: { heading: "border-navy", box: "border-navy/30 bg-navy-light" },
};

/**
 * iter-050: Evin průvodce k vyplnění klientských situací. Text je v
 * `lib/situations/guide.ts` doslova, tady se jen formátuje. Statický segment
 * `navod` má v Next přednost před dynamickým `[memberId]`. Bez `loading.tsx`
 * (LL-017).
 */
export default async function SituationGuidePage() {
  await requirePageSession();

  return (
    <article className="max-w-3xl space-y-6">
      <div>
        <Link
          href="/situace"
          className="inline-flex min-h-[44px] items-center text-sm text-navy hover:underline focus:outline-none focus:shadow-focus"
        >
          {UI_TEXTS.backToOverview}
        </Link>
        <h1 className="text-2xl font-bold text-text-main">{GUIDE.title}</h1>
        <p className="mt-1 text-sm font-semibold text-text-muted">{GUIDE.subtitle}</p>
      </div>

      <div className="space-y-3 text-base text-text-main">
        {GUIDE.intro.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>

      {GUIDE.steps.map((step) => {
        const tone = TONE_CLASSES[step.tone];
        return (
          <section key={step.heading} className="space-y-3">
            <h2 className={`border-l-4 pl-3 text-lg font-semibold text-text-main ${tone.heading}`}>
              {step.heading}
            </h2>
            {step.lead.map((p) => (
              <p key={p} className="text-base text-text-main">
                {p}
              </p>
            ))}
            {step.bulletsLabel && <p className="text-base font-semibold text-text-main">{step.bulletsLabel}</p>}
            <ul className="list-disc space-y-1 pl-6 text-base text-text-main">
              {step.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <p className={`rounded-lg border px-4 py-3 text-base text-text-main ${tone.box}`}>
              <strong>Příklad:</strong> {step.example}
            </p>
            {step.after?.map((p) => (
              <p key={p} className="text-base text-text-main">
                {p}
              </p>
            ))}
          </section>
        );
      })}

      <section className="space-y-3">
        <h2 className="border-l-4 border-border-strong pl-3 text-lg font-semibold text-text-main">
          {GUIDE.closing.heading}
        </h2>
        <ul className="list-disc space-y-1 pl-6 text-base text-text-main">
          {GUIDE.closing.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <p className="rounded-lg border border-gold bg-gold-light px-4 py-3 text-base text-text-main">
          <strong>{GUIDE.closing.goalLabel}</strong> {GUIDE.closing.goal}
        </p>
      </section>

      <Link
        href="/situace"
        className="inline-flex min-h-[44px] items-center text-sm text-navy hover:underline focus:outline-none focus:shadow-focus"
      >
        {UI_TEXTS.backToOverview}
      </Link>
    </article>
  );
}
