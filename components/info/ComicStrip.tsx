/* eslint-disable @next/next/no-img-element -- statické PNG bez klientského JS, viz níž */
/**
 * Minikomiks ke kroku (T-010k). Panely v řadě jako v originále, šířka
 * sloupce podle šířky kresby. Když by nejužší panel na 390 px vyšel pod
 * ~95 px, na úzkém displeji se pruh zalomí do dvou sloupců.
 *
 * Bez JS, s reduced motion i v tisku se vykreslí stejně (žádná animace).
 * Obrázky jsou obyčejné `<img>` s `width`/`height` (CLS), ne `next/image`:
 * ten by přidal klientský JS (~5 kB) a malé statické PNG optimalizaci
 * nepotřebují.
 *
 * Text panelu je HTML v ručním písmu (Patrick Hand z `app/pravidla/layout.tsx`
 * přes proměnnou `--font-info-comic`), kresba je bez textu.
 */
import type { Comic, ComicPanel } from "@/lib/info-pages/types";

/** Šířka obsahu pruhu na 390 px (bez mezer mezi panely), jen pro rozhodnutí o zalomení. */
const NARROW_WIDTH = 330;
const MIN_PANEL_PX = 95;

export function comicWraps(panels: Pick<ComicPanel, "width">[]): boolean {
  if (panels.length < 3) return false;
  const total = panels.reduce((sum, p) => sum + p.width, 0);
  const narrowest = Math.min(...panels.map((p) => p.width));
  return (narrowest / total) * NARROW_WIDTH < MIN_PANEL_PX;
}

function Caption({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p className={`info-comic-caption ${className}`} lang="cs">
      {text}
    </p>
  );
}

export function ComicStrip({ comic }: { comic: Comic }) {
  const { panels } = comic;
  if (panels.length === 0) return null;

  // Ilustrace bez popisku (karty rozcestí): jen obrázek se zaoblením.
  if (panels.length === 1 && panels[0].caption === "") {
    const p = panels[0];
    return (
      <figure className="info-comic info-comic--illustration mt-3">
        <img
          src={p.src}
          alt={p.alt}
          width={p.width}
          height={p.height}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full max-w-[320px] rounded-card"
        />
      </figure>
    );
  }

  const wrap = comicWraps(panels);
  return (
    <figure
      className={wrap ? "info-comic info-comic--wrap mt-4" : "info-comic mt-4"}
      style={{ ["--info-comic-cols" as string]: panels.map((p) => `${p.width}fr`).join(" ") }}
    >
      {panels.map((p, i) => (
        <div key={i} className="info-comic-panel">
          {p.caption && <Caption text={p.caption} />}
          <img
            src={p.src}
            alt={p.alt}
            width={p.width}
            height={p.height}
            loading="lazy"
            decoding="async"
            className="info-comic-img"
          />
        </div>
      ))}
    </figure>
  );
}

/** Úvodní ilustrace u H1, text bubliny je HTML přes místo původní bubliny. */
export function ComicHero({ panel }: { panel: ComicPanel }) {
  return (
    <figure className="info-comic-hero">
      <img
        src={panel.src}
        alt={panel.alt}
        width={panel.width}
        height={panel.height}
        loading="eager"
        decoding="async"
        className="block h-auto w-full"
      />
      {panel.caption && <Caption text={panel.caption} className="info-comic-hero-caption" />}
    </figure>
  );
}
