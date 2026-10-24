"use client";

import { useState } from "react";
import { saveChapterSettingsAction } from "@/actions/chapter-settings";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  type ChapterSettings,
  type FeatureKey,
  MEETING_TIME_OPTIONS,
  WEEKDAY_ORDER,
  weekdayName,
} from "@/lib/chapter/settings";
import { CHAPTER_SETTINGS_TEXTS as T, FEATURE_LABELS, settingsConfirmTexts } from "@/lib/chapter/texts";

/**
 * iter-042 (B2, gate Z8): formulář Nastavení chapteru. Jedno tlačítko Uložit,
 * změny se zapisují až po něm (žádná optimistická změna). Potvrzení přes
 * `window.confirm` se ptá PŘED voláním akce, Zrušit nic nezmění. Po uložení
 * žádné `router.refresh()` (LL-017), stav drží komponenta.
 */

const FEATURE_FIELDS: { key: FeatureKey; field: "mastermindEnabled" | "burzaEnabled" | "semaforEnabled" }[] = [
  { key: "mastermind", field: "mastermindEnabled" },
  { key: "burza", field: "burzaEnabled" },
  { key: "semafor", field: "semaforEnabled" },
];

const WEEKDAY_SELECT_OPTIONS = WEEKDAY_ORDER.map((d) => ({
  value: String(d),
  label: weekdayName(d).charAt(0).toUpperCase() + weekdayName(d).slice(1),
}));

const TIME_SELECT_OPTIONS = MEETING_TIME_OPTIONS.map((t) => ({
  value: t,
  label: t.replace(/^0/, ""),
}));

export function ChapterSettingsForm({ initial }: { initial: ChapterSettings }) {
  const { showToast } = useToast();
  const [saved, setSaved] = useState<ChapterSettings>(initial);
  const [draft, setDraft] = useState<ChapterSettings>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    // Potvrzení jsou první příkaz, před akcí; Zrušit nic neodešle ani nezmění.
    for (const text of settingsConfirmTexts(saved, draft)) {
      if (!window.confirm(text)) return;
    }
    setPending(true);
    setError("");
    try {
      const result = await saveChapterSettingsAction(draft);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
        return;
      }
      const next = result.data?.settings ?? draft;
      setSaved(next);
      setDraft(next);
      showToast("success", T.saved);
    } catch {
      setError(T.saveFailed);
      showToast("error", T.saveFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-main">{T.featuresHeading}</h2>
        <div className="space-y-1">
          {FEATURE_FIELDS.map(({ key, field }) => (
            <label key={key} className="flex min-h-[44px] cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                role="switch"
                checked={draft[field]}
                disabled={pending}
                onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.checked }))}
                className="h-5 w-5 accent-primary"
              />
              <span className="font-medium text-text-main">{FEATURE_LABELS[key].nominative}</span>
            </label>
          ))}
        </div>
        <p className="text-sm text-text-muted">{T.featuresHint}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-main">{T.meetingHeading}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={T.weekdayLabel}
            name="meetingWeekday"
            options={WEEKDAY_SELECT_OPTIONS}
            value={String(draft.meetingWeekday)}
            disabled={pending}
            onChange={(e) => setDraft((d) => ({ ...d, meetingWeekday: Number(e.target.value) }))}
          />
          <Select
            label={T.timeLabel}
            name="meetingTime"
            options={TIME_SELECT_OPTIONS}
            value={draft.meetingTime}
            disabled={pending}
            onChange={(e) => setDraft((d) => ({ ...d, meetingTime: e.target.value }))}
          />
        </div>
        <p className="text-sm text-text-muted">{T.meetingHint}</p>
      </section>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[44px] items-center justify-center rounded-btn bg-primary px-6 py-3 font-semibold text-white shadow-sm hover:bg-primary-hover focus:outline-none focus:shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? T.saving : T.save}
      </button>
    </form>
  );
}
