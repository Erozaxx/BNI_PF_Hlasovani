"use client";

/**
 * iter-045 (arch 2.2): ikona řetězu u nadpisu sekce. Vždy obyčejný odkaz
 * `#kotva`, takže bez JS funguje klik (skok na sekci, adresa v řádku) i dlouhý
 * stisk na mobilu („Kopírovat odkaz“). S JS klik zkopíruje absolutní adresu
 * z `location` (na preview adresa preview) a ohlásí „Odkaz zkopírován“.
 * Když schránka chybí nebo zápis selže (vestavěný prohlížeč WhatsAppu,
 * odmítnuté oprávnění), kotva se dá do adresního řádku a ohlásí se to.
 * Na rozdíl od `PrintButton` nevrací před hydratací `null`. V tisku skryté (CSS).
 */
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";

const T = TEMPLATE_TEXTS.sectionLink;
const MESSAGE_MS = 3000;

function withTitle(template: string, title: string): string {
  return template.split("{title}").join(title);
}

function canCopy(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && typeof navigator.clipboard?.writeText === "function";
}

export function SectionLink({ anchor, title }: { anchor: string; title: string }) {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setReady(canCopy());
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const announce = (text: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setMessage(text);
    timer.current = window.setTimeout(() => setMessage(""), MESSAGE_MS);
  };

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Nová karta, okno a podobně nechá prohlížeči.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function" || !window.isSecureContext) {
      // Bez schránky proběhne výchozí skok na kotvu, adresa je v řádku.
      announce(T.fallback);
      return;
    }
    event.preventDefault();
    const url = `${window.location.origin}${window.location.pathname}#${anchor}`;
    clipboard.writeText(url).then(
      () => announce(T.copied),
      () => {
        window.location.hash = anchor;
        announce(T.fallback);
      }
    );
  };

  return (
    <>
      <a
        href={`#${anchor}`}
        className="info-section-link -my-1.5 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded text-text-muted hover:text-navy focus:outline-none focus-visible:shadow-focus"
        aria-label={withTitle(ready ? T.label : T.labelNoJs, title)}
        onClick={onClick}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path
            d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4l-1.1 1.1M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.1-1.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
      <span role="status" aria-live="polite" className="info-section-link-status basis-full text-sm text-text-muted">
        {message}
      </span>
    </>
  );
}
