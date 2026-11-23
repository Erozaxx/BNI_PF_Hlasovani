/**
 * iter-050: text Eviným průvodcem „Jak poznat skutečné potřeby svého klienta“.
 * Text je doslovný přepis z docx, mění se jen formátování. Stránka
 * `/situace/navod` ho jen vykresluje, test hlídá každý odstavec a odrážku.
 */

export type GuideTone = "neutral" | "need" | "fear" | "desire";

export interface GuideStep {
  heading: string;
  tone: GuideTone;
  /** Odstavce před odrážkami nebo před pomocnými otázkami. */
  lead: string[];
  /** Návěští nad odrážkami („Pomocné otázky:“), jen když ho text má. */
  bulletsLabel?: string;
  bullets: string[];
  /** Text za „Příklad:“. */
  example: string;
  /** Odstavce za příkladem. */
  after?: string[];
}

export interface GuideContent {
  title: string;
  subtitle: string;
  intro: string[];
  steps: GuideStep[];
  closing: {
    heading: string;
    bullets: string[];
    goalLabel: string;
    goal: string;
  };
}

export const GUIDE_LINK_TEXT = "Jak na to";
export const GUIDE_PATH = "/situace/navod";

export const GUIDE: GuideContent = {
  title: "Jak poznat skutečné potřeby svého klienta",
  subtitle: "Krátký průvodce pro členy BNI Pilsner Fountains",
  intro: [
    "Každý zákazník přichází s nějakou situací. Něco potřebuje vyřešit, něčeho se obává a k něčemu směřuje.",
    "Čím lépe tomuto příběhu rozumíme, tím lépe dokážeme klientovi pomoci, nabídnout mu své služby a rozpoznat příležitosti pro další členy chapter.",
  ],
  steps: [
    {
      heading: "1. Začni konkrétní situací",
      tone: "neutral",
      lead: ["Představ si jednoho skutečného klienta nebo typickou opakující se situaci."],
      bullets: [
        "Kdo je klient? Například majitel firmy, HR manažer, rodič, investor.",
        "Co se v jeho životě nebo podnikání děje?",
        "Co ho přimělo začít hledat řešení právě teď?",
      ],
      example:
        "Majiteli rostoucí firmy odcházejí kvalifikovaní zaměstnanci. Nedaří se mu obsazovat volná místa a provoz začíná být ohrožený.",
    },
    {
      heading: "2. POTŘEBY – Co potřebuje zvládnout?",
      tone: "need",
      lead: ["Přemýšlej o úkolech, problémech a povinnostech, které má klient před sebou."],
      bulletsLabel: "Pomocné otázky:",
      bullets: [
        "Co musí vyřešit, aby jeho situace začala fungovat lépe?",
        "Co potřebuje změnit, zajistit nebo rozhodnout?",
        "Co je pro něj v této chvíli nejdůležitější?",
      ],
      example: "Obsazení klíčových pozic, stabilizace týmu, nastavení odměňování, zajištění provozu.",
    },
    {
      heading: "3. OBAVY – Co ho trápí?",
      tone: "fear",
      lead: ["Představ si, co klientovi komplikuje život, čeho se bojí a co může ztratit."],
      bulletsLabel: "Pomocné otázky:",
      bullets: [
        "Co se stane, když problém nevyřeší?",
        "Co ho stojí čas, peníze nebo energii?",
        "Čeho se obává při rozhodování nebo při zavádění změny?",
        "Co už nechce znovu zažít?",
      ],
      example:
        "Odejdou další klíčoví lidé. Firma nebude zvládat zakázky. Zvýší se náklady. Změna odměňování vyvolá nespokojenost.",
    },
    {
      heading: "4. TOUHY – Čeho chce dosáhnout?",
      tone: "desire",
      lead: [
        "Představ si situaci, kdy je problém vyřešený. Co klient získal? Jak chce, aby jeho život nebo podnikání vypadaly?",
      ],
      bulletsLabel: "Pomocné otázky:",
      bullets: [
        "Co by považoval za ideální výsledek?",
        "Jak se chce cítit?",
        "Co mu vyřešení situace umožní?",
        "Po čem touží i nad rámec samotného odstranění problému?",
      ],
      example:
        "Stabilní a motivovaný tým, který zvládá zakázky. Spravedlivé odměňování. Více času na rozvoj firmy. Klidnější fungování.",
    },
    {
      heading: "5. Co dalšího klient potřebuje?",
      tone: "neutral",
      lead: ["Teď se podívej na celý klientův příběh."],
      bullets: [
        "Co potřeboval vyřešit ještě předtím, než přišel za tebou?",
        "Co musí řešit současně s tvojí službou?",
        "Co bude potřebovat potom?",
        "Které z těchto potřeb ty sám neposkytuješ?",
      ],
      example:
        "Firma hledá nové zaměstnance. Současně však může potřebovat upravit vedení lidí, organizační strukturu, interní komunikaci, procesy a systém odměňování.",
      after: ["Právě tady vznikají příležitosti k propojení jednotlivých členů BNI."],
    },
  ],
  closing: {
    heading: "Co si při vyplňování pohlídat",
    bullets: [
      "Popisuj situaci očima konkrétního zákazníka.",
      "Přemýšlej v širším kontextu jeho života nebo podnikání.",
      "Každou potřebu, obavu nebo touhu zapiš jako samostatnou položku.",
      "Buď konkrétní. „Chce mít klid“ může znamenat méně reklamací, jistotu dodávek, fungující zaměstnance nebo finanční stabilitu.",
      "Využij své zkušenosti z obchodních rozhovorů a skutečných zakázek.",
    ],
    goalLabel: "Cíl:",
    goal: "Aby si každý člen chapter dokázal při čtení tvých situací představit klienta, poznat jeho problém a rozpoznat, kdy ti ho může doporučit.",
  },
};
