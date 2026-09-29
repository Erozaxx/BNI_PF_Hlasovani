"use client";

/**
 * Bublina se shrnutím role (iter-030, T-010r4). Progresivní vylepšení:
 * server vykreslí `<a class="info-role-link" data-role href="…#role">`,
 * bez JS a v tisku zůstává obyčejný odkaz na kartu. Po načtení z odkazů
 * udělá spouštěče (`role="button"`, `aria-expanded`, `aria-controls`)
 * a klik otevře bublinu pod slovem místo skoku.
 *
 * Bublina se vykreslí jen na klientu a jen otevřená (portál do `body`),
 * v HTML ze serveru není, text stránky se tedy nemění. Otevřená je vždy
 * jen jedna. Zavírá ji klik mimo, Esc a druhý klik na totéž slovo, fokus
 * jde do bubliny a po zavření zpět na slovo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { popoverPosition, type PopoverRect, type RoleSummaries } from "@/lib/info-pages/role-popover";
import type { RoleId } from "@/lib/info-pages/types";

const POPOVER_ID = "info-role-popover";
const TRIGGER = "a.info-role-link[data-role]";

interface OpenState {
  trigger: HTMLAnchorElement;
  role: RoleId;
  href: string;
  rect: PopoverRect;
}

function measure(trigger: HTMLElement): PopoverRect {
  const r = trigger.getBoundingClientRect();
  return popoverPosition(
    { left: r.left, bottom: r.bottom },
    { width: document.documentElement.clientWidth, scrollX: window.scrollX, scrollY: window.scrollY }
  );
}

export function RolePopover({ summaries, linkLabel }: { summaries: RoleSummaries; linkLabel: string }) {
  const [open, setOpen] = useState<OpenState | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<OpenState | null>(null);
  openRef.current = open;

  const close = useCallback((returnFocus: boolean) => {
    const current = openRef.current;
    if (!current) return;
    current.trigger.setAttribute("aria-expanded", "false");
    setOpen(null);
    if (returnFocus) current.trigger.focus();
  }, []);

  // Spouštěče: atributy až na klientu, bez JS zůstává odkaz.
  useEffect(() => {
    const triggers = Array.from(document.querySelectorAll<HTMLAnchorElement>(TRIGGER)).filter(
      (a) => summaries[a.dataset.role as RoleId]
    );
    for (const a of triggers) {
      a.setAttribute("role", "button");
      a.setAttribute("aria-expanded", "false");
      a.setAttribute("aria-controls", POPOVER_ID);
      a.setAttribute("aria-haspopup", "dialog");
    }

    const toggle = (a: HTMLAnchorElement) => {
      const current = openRef.current;
      if (current?.trigger === a) {
        close(false);
        return;
      }
      current?.trigger.setAttribute("aria-expanded", "false");
      a.setAttribute("aria-expanded", "true");
      setOpen({ trigger: a, role: a.dataset.role as RoleId, href: a.getAttribute("href") ?? "#", rect: measure(a) });
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const a = target?.closest<HTMLAnchorElement>(TRIGGER);
      if (a && summaries[a.dataset.role as RoleId]) {
        event.preventDefault();
        toggle(a);
        return;
      }
      if (openRef.current && boxRef.current && target && !boxRef.current.contains(target)) close(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && openRef.current) {
        event.preventDefault();
        close(true);
        return;
      }
      // Mezerník na spouštěči s role="button" (Enter spustí click sám).
      const a = (event.target as Element | null)?.closest?.<HTMLAnchorElement>(TRIGGER);
      if (event.key === " " && a && summaries[a.dataset.role as RoleId]) {
        event.preventDefault();
        toggle(a);
      }
    };
    const onResize = () => {
      const current = openRef.current;
      if (current) setOpen({ ...current, rect: measure(current.trigger) });
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      for (const a of triggers) {
        for (const attr of ["role", "aria-expanded", "aria-controls", "aria-haspopup"]) a.removeAttribute(attr);
      }
    };
  }, [summaries, close]);

  // Fokus do bubliny a bublina celá v okně (případně posun dolů).
  useEffect(() => {
    const box = boxRef.current;
    if (!open || !box) return;
    box.focus({ preventScroll: true });
    const r = box.getBoundingClientRect();
    if (r.bottom > window.innerHeight) window.scrollBy({ top: r.bottom - window.innerHeight + 12 });
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  const summary = summaries[open.role];
  if (!summary) return null;

  return createPortal(
    <div
      ref={boxRef}
      id={POPOVER_ID}
      role="dialog"
      aria-labelledby={`${POPOVER_ID}-title`}
      tabIndex={-1}
      className="info-role-popover rounded-card border border-border-strong bg-surface p-4 text-left text-text-main shadow-lg focus:outline-none"
      style={{ position: "absolute", left: open.rect.left, top: open.rect.top, width: open.rect.width, zIndex: 50 }}
    >
      <p id={`${POPOVER_ID}-title`} className="text-base font-semibold leading-snug">
        {summary.title}
      </p>
      <p className="mt-1 text-sm leading-relaxed">{summary.text}</p>
      <a
        href={open.href}
        onClick={() => close(false)}
        className="mt-2 inline-block rounded text-sm font-medium text-navy underline underline-offset-2 focus:outline-none focus-visible:shadow-focus"
      >
        {linkLabel}
      </a>
    </div>,
    document.body
  );
}
