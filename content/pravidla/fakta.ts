/**
 * Jeden způsob citování pro stránky série od iter-031 (T-007s, X13,
 * arch_iter-031_T-003s 1.3).
 *
 * `SERIES_SOURCES` = rejstřík rolí (G, M) + rejstříky pěti nových stránek
 * (H, OG/OM, SG/SM, QG/QM, KG/KM) a stránky semafor (TM, iter-044). Shodná citace má v sérii jedno id. Stejný klíč
 * ve dvou rejstřících shodí build už při načtení modulu, neznámé id při
 * sestavení stránky. Stránky importují `src`, `fact`, `refs` a `NOT_STATED`
 * odsud a vlastní pomocné funkce nepíšou. `role.ts` a `absence.ts` si
 * nechávají své (beze změny).
 */
import type { Fact, SourceRef } from "@/lib/info-pages/types";
import { CLENSTVI_SOURCES } from "./clenstvi-zdroje";
import { KODEX_SOURCES } from "./kodex-zdroje";
import { OBOR_SOURCES } from "./obor-zdroje";
import { ROLE_SOURCES } from "./role-zdroje";
import { SCHUZKA_SOURCES } from "./schuzka-zdroje";
import { SEMAFOR_SOURCES } from "./semafor-zdroje";
import { STIZNOSTI_SOURCES } from "./stiznosti-zdroje";

/** Sloučí rejstříky, stejný klíč ve dvou z nich je chyba. */
export function mergeSources(registries: Record<string, Record<string, SourceRef>>): Record<string, SourceRef> {
  const out: Record<string, SourceRef> = {};
  const owner = new Map<string, string>();
  for (const [name, registry] of Object.entries(registries)) {
    for (const [id, ref] of Object.entries(registry)) {
      const first = owner.get(id);
      if (first !== undefined) throw new Error(`fakta.ts: citace ${id} je v rejstříku ${first} i ${name}`);
      owner.set(id, name);
      out[id] = ref;
    }
  }
  return out;
}

export const SERIES_SOURCES: Record<string, SourceRef> = mergeSources({
  "role-zdroje": ROLE_SOURCES,
  "clenstvi-zdroje": CLENSTVI_SOURCES,
  "obor-zdroje": OBOR_SOURCES,
  "stiznosti-zdroje": STIZNOSTI_SOURCES,
  "schuzka-zdroje": SCHUZKA_SOURCES,
  "kodex-zdroje": KODEX_SOURCES,
  "semafor-zdroje": SEMAFOR_SOURCES,
});

/** Citace z rejstříku série, `noteCs` = poznámka k citaci. Neznámé id shodí build. */
export function src(id: string, noteCs?: string): SourceRef {
  const ref = SERIES_SOURCES[id];
  if (!ref) throw new Error(`fakta.ts: citace ${id} není v rejstříku série`);
  return noteCs ? { ...ref, noteCs } : ref;
}

/** Fakt se zdroji: id z rejstříku nebo hotová citace (`src(id, noteCs)`). */
export function fact(text: string, ...sources: (string | SourceRef)[]): Fact {
  return { text, sources: sources.map((s) => (typeof s === "string" ? src(s) : s)) };
}

/** Pole citací (řádek tabulky, položka seznamu). */
export function refs(...ids: string[]): SourceRef[] {
  return ids.map((id) => src(id));
}

/** Poznámka k citaci u pole „Pravidla neurčují" (stejná jako v `role.ts`). */
export const NOT_STATED = "Manuál to neuvádí.";
