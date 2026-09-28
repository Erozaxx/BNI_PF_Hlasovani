/** OG náhled rozcestníku /pravidla (PNG 1200×630, staticky při buildu). */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { OG_ALT, OG_SIZE, renderInfoOgImage } from "@/lib/info-pages/og-image";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";
// Font a logo se čtou z disku jen při buildu (T-007r, n-6).
export const dynamic = "error";

export default function Image() {
  return renderInfoOgImage(TEMPLATE_TEXTS.hub.title);
}
