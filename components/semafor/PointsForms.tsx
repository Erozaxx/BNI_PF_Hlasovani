"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import {
  addActivityAction,
  addHostMemberAction,
  addTrainingAction,
  addWorkAction,
  thankAction,
} from "@/actions/semafor-points";
import { WORK_POINTS } from "@/lib/semafor/bonus";
import { NOTE_LENGTH, TITLE_LENGTH } from "@/lib/semafor/points";
import { POINT_TEXTS, SEMAFOR_TEXTS } from "@/lib/semafor/texts";

/**
 * iter-044 (arch 7.1, 7.2): formuláře vlastních bodů. Obyčejné formuláře bez
 * klientského stavu kromě stavové hlášky: výsledek akce je text nad tlačítkem,
 * záznam je vidět v seznamu, který obnoví `revalidatePath` na serveru (LL-017:
 * žádné `router.refresh()`, nic důležitého nedrží jen klient). Tlačítka a pole
 * mají aspoň 44 px, vše v jednom sloupci.
 */

export interface MemberOpt {
  id: string;
  name: string;
}

type ActionFn = (formData: FormData) => Promise<{ success: boolean; error?: string; data?: { message: string } | void }>;

const FIELD = "h-11 w-full rounded-lg border border-border bg-white px-3 text-base text-text-main focus:outline-none focus:shadow-focus";
const LABEL = "flex flex-col gap-1 text-sm font-medium text-text-main";
const HINT = "text-sm font-normal text-text-muted";

/** Stav odeslání: hláška jako text (role="status"), po úspěchu se formulář vyprázdní. */
function useActionForm(action: ActionFn, onSuccess?: () => void) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    setPending(true);
    setMessage(null);
    try {
      const res = await action(new FormData(form));
      if (res.success) {
        const text = res.data && typeof res.data === "object" ? res.data.message : POINT_TEXTS.pointsSaved;
        setMessage({ ok: true, text });
        form.reset();
        onSuccess?.();
      } else {
        setMessage({ ok: false, text: res.error ?? SEMAFOR_TEXTS.errSaveFailed });
      }
    } catch {
      setMessage({ ok: false, text: SEMAFOR_TEXTS.errSaveFailed });
    } finally {
      setPending(false);
    }
  }
  return { ref, pending, message, onSubmit };
}

function Message({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return <p role="status" className="sr-only" />;
  return (
    <p role="status" className={`text-sm ${message.ok ? "text-text-main" : "text-danger"}`}>
      {message.text}
    </p>
  );
}

function MemberSelect({ name, label, members, hint }: { name: string; label: string; members: MemberOpt[]; hint?: string }) {
  return (
    <label className={LABEL}>
      {label}
      <select name={name} required defaultValue="" className={FIELD}>
        <option value="" disabled>
          {POINT_TEXTS.thanksPick}
        </option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {hint && <span className={HINT}>{hint}</span>}
    </label>
  );
}

function DateField({ name, label, min, max }: { name: string; label: string; min: string; max: string }) {
  return (
    <label className={LABEL}>
      {label}
      <input type="date" name={name} required min={min} max={max} className={FIELD} />
    </label>
  );
}

function FormFrame({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  action: ActionFn;
  children: ReactNode;
}) {
  const { ref, pending, message, onSubmit } = useActionForm(action);
  return (
    <details className="rounded-card border border-border bg-surface p-4">
      <summary className="flex min-h-[44px] cursor-pointer select-none items-center text-base font-semibold text-text-main focus:outline-none focus:shadow-focus">
        {title}
      </summary>
      <form ref={ref} onSubmit={onSubmit} className="mt-3 space-y-3">
        {note && <p className="text-sm text-text-muted">{note}</p>}
        {children}
        <Message message={message} />
        <Button type="submit" size="sm" className="min-h-[44px]" disabled={pending}>
          {POINT_TEXTS.pointsSave}
        </Button>
      </form>
    </details>
  );
}

export function TrainingForm({ members, min, max }: { members: MemberOpt[]; min: string; max: string }) {
  return (
    <FormFrame title={POINT_TEXTS.formTraining} note={POINT_TEXTS.formTrainingNote} action={addTrainingAction}>
      <MemberSelect name="memberId" label={POINT_TEXTS.formTrainingMember} members={members} />
      <DateField name="heldOn" label={POINT_TEXTS.formTrainingDate} min={min} max={max} />
      <label className={LABEL}>
        {POINT_TEXTS.formTrainingTopic}
        <input
          type="text"
          name="topic"
          required
          minLength={NOTE_LENGTH.min}
          maxLength={NOTE_LENGTH.max}
          className={FIELD}
        />
      </label>
    </FormFrame>
  );
}

export function HostMemberForm({ members, newMembers }: { members: MemberOpt[]; newMembers: MemberOpt[] }) {
  return (
    <FormFrame title={POINT_TEXTS.formHostMember} action={addHostMemberAction}>
      {newMembers.length === 0 ? (
        <p className="text-sm text-text-muted">{POINT_TEXTS.formHostMemberEmpty}</p>
      ) : (
        <>
          <MemberSelect name="memberId" label={POINT_TEXTS.formHostMemberWho} members={members} />
          <MemberSelect name="newMemberId" label={POINT_TEXTS.formHostMemberNew} members={newMembers} />
        </>
      )}
    </FormFrame>
  );
}

export function ActivityForm({ members, min, max }: { members: MemberOpt[]; min: string; max: string }) {
  return (
    <FormFrame title={POINT_TEXTS.formActivity} note={POINT_TEXTS.formActivityNote} action={addActivityAction}>
      <label className={LABEL}>
        {POINT_TEXTS.formActivityTitle}
        <input
          type="text"
          name="title"
          required
          minLength={TITLE_LENGTH.min}
          maxLength={TITLE_LENGTH.max}
          className={FIELD}
        />
      </label>
      <DateField name="heldOn" label={POINT_TEXTS.formActivityDate} min={min} max={max} />
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-text-main">{POINT_TEXTS.formActivityWho}</legend>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-white p-2">
          {members.map((m) => (
            <label key={m.id} className="flex min-h-[44px] items-center gap-2 text-base text-text-main">
              <input type="checkbox" name="memberIds" value={m.id} className="h-5 w-5" />
              {m.name}
            </label>
          ))}
        </div>
      </fieldset>
    </FormFrame>
  );
}

export function WorkForm({
  members,
  min,
  max,
  guide,
}: {
  members: MemberOpt[];
  min: string;
  max: string;
  /** Vodítko k bodům (`workGuideText(sources)`), skládá ho server podle zapnutých částí. */
  guide: string;
}) {
  const options = Array.from({ length: WORK_POINTS.max - WORK_POINTS.min + 1 }, (_, i) => WORK_POINTS.min + i);
  return (
    <FormFrame title={POINT_TEXTS.formWork} action={addWorkAction}>
      <MemberSelect name="memberId" label={POINT_TEXTS.formWorkMember} members={members} />
      <DateField name="workedOn" label={POINT_TEXTS.formWorkDate} min={min} max={max} />
      <label className={LABEL}>
        {POINT_TEXTS.formWorkPoints}
        <select name="points" required defaultValue="" className={FIELD}>
          <option value="" disabled>
            –
          </option>
          {options.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className={HINT}>{guide}</span>
      </label>
      <label className={LABEL}>
        {POINT_TEXTS.formWorkDescription}
        <textarea
          name="description"
          required
          minLength={NOTE_LENGTH.min}
          maxLength={NOTE_LENGTH.max}
          rows={3}
          className="min-h-[88px] w-full rounded-lg border border-border bg-white px-3 py-2 text-base text-text-main focus:outline-none focus:shadow-focus"
        />
      </label>
    </FormFrame>
  );
}

/** Poděkování (každý přihlášený). Výsledek jako text nad tlačítkem, seznam „Tvoje poděkování“ řeší server. */
export function ThanksForm({ recipients }: { recipients: MemberOpt[] }) {
  const [len, setLen] = useState(0);
  // Počítadlo se vynuluje jen po úspěchu: po chybě text v poli zůstává (F-04).
  const { ref, pending, message, onSubmit } = useActionForm(thankAction, () => setLen(0));
  return (
    <form
      ref={ref}
      onSubmit={onSubmit}
      className="mt-3 space-y-3"
    >
      <MemberSelect name="recipientId" label={POINT_TEXTS.thanksMember} members={recipients} />
      <label className={LABEL}>
        {POINT_TEXTS.thanksText}
        <textarea
          name="text"
          required
          minLength={NOTE_LENGTH.min}
          maxLength={NOTE_LENGTH.max}
          rows={3}
          onChange={(e) => setLen(e.target.value.length)}
          className="min-h-[88px] w-full rounded-lg border border-border bg-white px-3 py-2 text-base text-text-main focus:outline-none focus:shadow-focus"
        />
        <span className={HINT}>{`${len} / ${NOTE_LENGTH.max} ${POINT_TEXTS.thanksCounter}`}</span>
      </label>
      <Message message={message} />
      <Button type="submit" size="sm" className="min-h-[44px]" disabled={pending}>
        {POINT_TEXTS.thanksSubmit}
      </Button>
    </form>
  );
}
