/**
 * OG náhled info stránek pro WhatsApp (iter-029, T-007, doplnění
 * orchestrátora: brand BNI Pilsner Fountains). WhatsApp SVG jako
 * `og:image` nevykreslí, proto PNG přes `next/og` (součást Next.js, žádná
 * nová závislost). Generuje se staticky při buildu.
 *
 * Písmo: Poppins SemiBold (SIL OFL 1.1, licence v `og/OFL.txt`). Výchozí
 * písmo `next/og` má jen základní latinku a české znaky (č, ř, ů) nemá.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "BNI Pilsner Fountains";

const BRAND_RED = "#CF2031";
const LOGO_PATH = join(process.cwd(), "public", "pravidla", "logo-bni-pilsner-fountains.svg");
const FONT_PATH = join(process.cwd(), "lib", "info-pages", "og", "Poppins-SemiBold.ttf");
/** Poměr stran loga (viewBox 3544.91 × 1056.73). */
const LOGO_RATIO = 3544.91 / 1056.73;

/**
 * Logo jako data URI. Třídy z `<style>` se převedou na atributy `fill`,
 * aby je vykreslovač SVG v `next/og` spolehlivě použil.
 */
async function logoDataUri(): Promise<string> {
  const raw = await readFile(LOGO_PATH, "utf8");
  const fills: Record<string, string> = {};
  for (const match of raw.matchAll(/\.(cls-\d+)\s*\{\s*fill:\s*(#[0-9a-fA-F]{3,6});?\s*\}/g)) {
    fills[match[1]] = match[2];
  }
  const svg = raw
    .replace(/<defs>[\s\S]*?<\/defs>/, "")
    .replace(/class="(cls-\d+)"/g, (_, cls: string) => `fill="${fills[cls] ?? "#020202"}"`);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function renderInfoOgImage(title: string): Promise<ImageResponse> {
  const [logo, font] = await Promise.all([logoDataUri(), readFile(FONT_PATH)]);
  const logoHeight = 150;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#FFFFFF",
          fontFamily: "Poppins",
        }}
      >
        <div style={{ height: 16, background: BRAND_RED, display: "flex" }} />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 80px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og vykresluje jen <img> */}
          <img
            src={logo}
            alt=""
            width={Math.round(logoHeight * LOGO_RATIO)}
            height={logoHeight}
          />
          <div
            style={{
              marginTop: 48,
              fontSize: 72,
              lineHeight: 1.15,
              color: "#333333",
              display: "flex",
            }}
          >
            {title}
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [{ name: "Poppins", data: font, weight: 600, style: "normal" }],
    }
  );
}
