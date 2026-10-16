"use client";

import { useState } from "react";
import Link from "next/link";
import { ConfirmPresentedButtons } from "@/components/mastermind/ConfirmPresentedButtons";
import { InterestButton } from "@/components/mastermind/InterestButton";
import { RemoveCaseButton } from "@/components/mastermind/RemoveCaseButton";
import { ScheduleCasePanel } from "@/components/mastermind/ScheduleCasePanel";
import {
  canConfirm as canConfirmRule,
  canEdit,
  canRemove,
  canSchedule,
  canUndoPresented,
  caseDescription,
  formatDM,
  formatDMY,
  formatWeekdayDM,
  interestLabels,
  type CaseStatus,
  type ThursdayOption,
} from "@/lib/mastermind/rules";

export interface CaseCardData {
  id: string;
  title: string;
  memberId: string;
  presenterName: string;
  situation: string;
  path: string | null;
  takeaway: string | null;
  ask: string | null;
  status: CaseStatus;
  internalDate: string | null;
  /** Den přihlášení v Praze, „YYYY-MM-DD“ */
  createdDay: string;
  /** Zájemci / účastníci v pořadí přihlášení */
  interested: Array<{ memberId: string; name: string }>;
}

export interface CaseCardViewer {
  memberId: string;
  name: string;
  isManagement: boolean;
}

/**
 * Karta případu (7.3). Téma, kdo ho přináší, počet a tlačítko jsou vidět vždy,
 * popis (`caseDescription`, u starších případů spojený ze čtyř bodů) a jména
 * až po rozkliknutí (nativní `<details>`). Vlastní případ: „Tvůj případ“ jednou,
 * v místě tlačítka (Z6). Jména vidí všichni přihlášení (U6).
 */
export function CaseCard({
  data,
  viewer,
  today,
  thursdays,
  collision = false,
}: {
  data: CaseCardData;
  viewer: CaseCardViewer;
  today: string;
  /** Nabídka čtvrtků, jen pro vedení a jen u navrženého případu. */
  thursdays?: ThursdayOption[];
  /** Na datum zařazeného případu je v aplikaci otevřená schůzka (jen vedení). */
  collision?: boolean;
}) {
  const [names, setNames] = useState(data.interested);
  const labels = interestLabels(data.status);
  const own = data.memberId === viewer.memberId;
  const actor = { memberId: viewer.memberId, isManagement: viewer.isManagement };
  const caseLike = { memberId: data.memberId, status: data.status, internalDate: data.internalDate };

  const iAmInterested = names.some((n) => n.memberId === viewer.memberId);

  function handleInterestChange(interested: boolean) {
    setNames((prev) => {
      const without = prev.filter((n) => n.memberId !== viewer.memberId);
      return interested ? [...without, { memberId: viewer.memberId, name: viewer.name }] : without;
    });
  }

  const description = caseDescription(data);

  return (
    <article className="rounded-card border border-border bg-surface p-4 shadow-card sm:p-5 min-w-0">
      <h3 className="text-base font-semibold text-text-main break-words">{data.title}</h3>
      <p className="mt-1 text-sm text-text-muted break-words">Téma přináší: {data.presenterName}</p>
      {data.status === "scheduled" && data.internalDate && (
        <p className="mt-1 text-sm font-medium text-text-main">
          Interní {formatWeekdayDM(data.internalDate)}
        </p>
      )}
      {viewer.isManagement && data.status === "proposed" && (
        <p className="mt-1 text-xs text-text-muted">Čeká od {formatDMY(data.createdDay)}.</p>
      )}

      <div className="mt-3">
        {own ? (
          <p className="text-sm font-medium text-navy">
            Tvůj případ
            <span className="font-normal text-text-muted"> · {labels.countText(names.length)}</span>
          </p>
        ) : labels.editable && (data.status === "proposed" || data.status === "scheduled") ? (
          <InterestButton
            caseId={data.id}
            status={data.status}
            initialInterested={iAmInterested}
            initialCount={names.length}
            internalDate={data.internalDate}
            onChange={handleInterestChange}
          />
        ) : (
          <p className="text-sm text-text-main">{labels.countText(names.length)}</p>
        )}
      </div>

      {collision && viewer.isManagement && (
        <p className="mt-3 rounded-lg border border-warning bg-warning-light p-2 text-sm text-warning">
          Na tento čtvrtek je v aplikaci otevřená schůzka. Přesuň případ, nebo zkontroluj datum schůzky.
        </p>
      )}

      <details className="mt-3 group">
        <summary className="flex min-h-[44px] cursor-pointer select-none items-center text-sm font-medium text-navy focus:outline-none focus:shadow-focus rounded">
          {labels.summaryText}
        </summary>
        <div className="mt-2 space-y-3 text-sm text-text-main">
          {data.status === "scheduled" && data.internalDate && (
            <p className="font-medium">
              Interní {formatWeekdayDM(data.internalDate)}
              {iAmInterested ? ", jsi přihlášený(á)" : ""}
            </p>
          )}
          <p className="whitespace-pre-line break-words">{description || "–"}</p>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              {labels.namesLabel}
            </p>
            <p className="break-words">
              {names.length > 0
                ? names.map((n) => (n.memberId === viewer.memberId ? `${n.name} (ty)` : n.name)).join(", ")
                : "–"}
            </p>
          </div>
        </div>
      </details>

      {viewer.isManagement && canSchedule(actor, caseLike) && thursdays && (
        <ScheduleCasePanel caseId={data.id} options={thursdays} />
      )}

      {(canEdit(actor, caseLike, today) ||
        canRemove(actor, caseLike) ||
        (viewer.isManagement && data.status !== "proposed")) && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {viewer.isManagement && data.status === "scheduled" && (
            <ConfirmPresentedButtons
              caseId={data.id}
              mode="scheduled"
              canConfirm={canConfirmRule(actor, caseLike, today)}
            />
          )}
          {viewer.isManagement && canUndoPresented(actor, caseLike) && (
            <ConfirmPresentedButtons caseId={data.id} mode="presented" canConfirm={false} />
          )}
          {canEdit(actor, caseLike, today) && (
            <Link
              href={`/mastermind/${data.id}/edit`}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm text-text-main transition-colors hover:bg-background focus:outline-none focus:shadow-focus sm:w-auto"
            >
              Upravit
            </Link>
          )}
          {canRemove(actor, caseLike) && (
            <RemoveCaseButton caseId={data.id} scheduled={data.status === "scheduled"} />
          )}
        </div>
      )}

      {data.status === "presented" && data.internalDate && (
        <p className="mt-3 text-xs text-text-muted">Interní {formatDM(data.internalDate)}</p>
      )}
    </article>
  );
}
