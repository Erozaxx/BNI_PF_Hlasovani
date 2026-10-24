/**
 * iter-042 (T-003g, gate Z1, Z3, Z5): texty nápovědy, které závisí na nastavení
 * chapteru (den a začátek schůzky, zapnuté části, zdroje bonusu). Čistý modul bez
 * Reactu a bez DB, aby ho šlo testovat v holém Node. Nápověda vyká.
 *
 * Den a čas schůzky se nikdy nepíšou natvrdo. Výchozí hodnoty (čtvrtek, 7:30)
 * jsou jen v `DEFAULT_CHAPTER_SETTINGS`.
 */
import {
  DEFAULT_CHAPTER_SETTINGS,
  weekdayLocative,
  type ChapterSettings,
} from "@/lib/chapter/settings";
import type { BonusSources } from "@/lib/semafor/bonus";
import { clockText, helpSemaforMember } from "@/lib/semafor/texts";

export interface HelpQa {
  q: string;
  a: string;
}

/** „ve čtvrtek“ s velkým písmenem na začátku věty. */
export function sentenceStartLocative(weekday: number): string {
  const s = weekdayLocative(weekday);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Konec hlasování (Z1, BK3): bez jména dne, takže nezávisí na nastavení. */
export const HELP_VOTING_END =
  "Hlasovat můžete do 23:59 dne před další pravidelnou schůzkou. Přesné datum je na stránce hlasování.";

export const HELP_NEUTRAL_VOTE = "Nevím je neutrální hlas, nepočítá se do Pro ani do Proti.";

/** Slovník omluva / absence (K5, nález 11). */
export const HELP_ATTENDANCE_TERMS =
  "Omluva = dáte vědět předem, že nepřijdete. Absence = výsledek po schůzce: omluva bez náhradníka nebo Chyběl(a) bez omluvy.";

/** Legenda kalendáře docházky (nález 29, B3). Shodná s první větou `MEMBER_TEXTS.legend`. */
export const HELP_CALENDAR_LEGEND =
  "Světle modrý den je pravidelná schůzka, tmavě modrý schůzka s hosty, zelený interní schůzka.";

/** Reálné předměty mailů, jak je člen uvidí v poště (K2). */
export const HELP_SUBJECT_VOTING_LINK = "BNI Hlasování: odkaz pro hlasování";
export const HELP_SUBJECT_EVENT_INVITE = "BNI Hlasování: pozvánka: {název akce}";
export const HELP_SUBJECT_REMINDER = "BNI Hlasování: nezapomeň prosím odhlasovat (schůzka {datum})";
export const HELP_BUTTON_GO_VOTE = "Přejít na hlasování";

/** Do kdy jde změnit omluvu: začátek schůzky z nastavení (Z5). */
export function memberDeadlineHelp(settings: Pick<ChapterSettings, "meetingTime"> = DEFAULT_CHAPTER_SETTINGS): string {
  return `Změnit nebo zrušit to můžete do ${clockText(settings.meetingTime)} v den schůzky. Potom už to zapíše správce docházky.`;
}

/** Ráno v den pravidelné schůzky se spouští hlasování (Z5, BK5). */
export function autostartHelp(settings: Pick<ChapterSettings, "meetingWeekday">): string {
  return `Když hlasování ${weekdayLocative(settings.meetingWeekday)} ráno neběží, aplikace ho pro dnešní schůzku spustí sama. Den předem a v den schůzky vás na to upozorní pruh nahoře na každé stránce, s odkazem „Spustit hlasování“. Hlasování běží do 23:59 dne před další pravidelnou schůzkou.`;
}

/** Varovný mail „není schůzka“ se v den interní schůzky neposílá (BK5). */
export function warningMailHelp(settings: Pick<ChapterSettings, "meetingWeekday">): string {
  return `${sentenceStartLocative(settings.meetingWeekday)} ráno nebylo co spustit, nebo něco neodešlo. Podrobnosti jsou v Provozu. V den interní schůzky se varování, že není schůzka, neposílá.`;
}

export function closeVotingHelp(settings: Pick<ChapterSettings, "meetingWeekday">): string {
  return `Hlasování skončí v 23:59 dne před další pravidelnou schůzkou a ${weekdayLocative(settings.meetingWeekday)} ráno ho aplikace sama uzavře. Report pak odejde mailem všem z vedení: počty hlasů, kdo jak hlasoval, důvody u „Proti“ a poznámky.`;
}

/** Odpovědi k semaforu s otázkami (nález 36). Pořadí odpovídá `helpSemaforMember`. */
export function semaforMemberFaq(sources: BonusSources): HelpQa[] {
  const texts = helpSemaforMember(sources);
  return texts.map((a) => {
    let q = "";
    if (a.startsWith("Semafor ukazuje")) q = "Co je skóre a odkud jsou data?";
    else if (a.startsWith("Bonus:")) q = "Co je bonus?";
    else if (a.startsWith("Barvu určuje")) q = "Jak se určuje barva?";
    else if (a.startsWith("Své hodnoty")) q = "Kdo vidí přehled?";
    else if (a.startsWith("Když vám hodnoty")) q = "Hodnoty mi nesedí.";
    return { q, a };
  });
}

/** Karta člena v Burze a témata v Master mindu zmizí neaktivnímu členovi jen tam, kde jsou části zapnuté. */
export function inactiveHidesText(settings: ChapterSettings): string {
  const parts: string[] = [];
  if (settings.burzaEnabled) parts.push("jeho karty v Burze");
  if (settings.mastermindEnabled) parts.push("témata v Master mindu");
  if (parts.length === 0) return "";
  return ` a ${parts.join(" a ")} nejsou vidět`;
}

/** Dashboard v nápovědě člena (iter-042 T-005): věta o Master mindu jen při zapnuté části. */
export function memberDashboardIntro(settings: ChapterSettings): string {
  const mastermind = settings.mastermindEnabled
    ? " Pod ní je nejbližší Master mind a jestli na něj jste přihlášení."
    : "";
  return `Dashboard je první stránka po přihlášení. Nahoře je nejbližší schůzka, tlačítko „Zobrazit“ otevře její detail s hosty.${mastermind} Karta Docházka ukazuje vaše absence za posledních 6 měsíců a tlačítko „Omluvit se“. Na konci jsou poslední čtyři hosté.`;
}

/** Co deaktivace člena skryje (iter-042 T-005, N8): jmenuje jen zapnuté části. Tyká (admin). */
export function deactivationHidesText(parts: { burza: boolean; mastermind: boolean }): string {
  if (parts.burza && parts.mastermind) {
    return " Jeho karty v Burze a témata v Master mindu nebudou vidět, naplánované téma se vrátí do zásobníku.";
  }
  if (parts.burza) return " Jeho karty v Burze nebudou vidět.";
  if (parts.mastermind) {
    return " Jeho témata v Master mindu nebudou vidět, naplánované téma se vrátí do zásobníku.";
  }
  return "";
}

/** Co smazání člena odstraní (nález 25). Jmenuje jen části, které jsou zapnuté. */
export function deleteMemberScopeText(settings: ChapterSettings): string {
  const parts = ["docházku", "omluvy"];
  if (settings.semaforEnabled) parts.push("semafor");
  parts.push("hlasy u hostů", "pohovory");
  if (settings.burzaEnabled) parts.push("Burzu");
  if (settings.mastermindEnabled) parts.push("případy v Master mindu");
  const last = parts.pop() as string;
  return `${parts.join(", ")} i ${last}`;
}
