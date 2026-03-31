# Design System — BNI PF Hlasování
# iter-001 | T-006 | 2026-03-31

---

## Obsah

1. [Design Tokens](#1-design-tokens)
2. [Komponentový systém](#2-komponentový-systém)
3. [Varianty hlavního layoutu](#3-varianty-hlavního-layoutu)
4. [Wireframy — 6 klíčových obrazovek](#4-wireframy--6-klíčových-obrazovek)
5. [UX doporučení a friction points](#5-ux-doporučení-a-friction-points)

---

## 1. Design Tokens

### 1.1 Barvy

```css
/* === Primární paleta === */
--color-primary:        #cf2e2e;   /* BNI červená — CTA, aktivní stav, accent */
--color-primary-hover:  #b02626;   /* Tmavší červená — hover stav buttonu */
--color-primary-light:  #f9e6e6;   /* Světlé pozadí — badges, alerts, highlights */

--color-gold:           #C69E63;   /* Zlatá — sekundární akcent, hover links, ikony */
--color-gold-light:     #f5eddc;   /* Světlá zlatá — jemné zvýraznění */

--color-navy:           #605BE5;   /* Navy/fialová — odkaz na BNI logo, info prvky */
--color-navy-light:     #eeeeff;   /* Světlá navy — badge pozadí pro informace */

/* === Neutrály === */
--color-white:          #FFFFFF;
--color-background:     #F7F7F7;   /* Stránkové pozadí — off-white místo čisté bílé */
--color-surface:        #FFFFFF;   /* Povrch karet, modalů */
--color-border:         #E8E8E8;   /* Ohraničení prvků */
--color-border-strong:  #D0D0D0;   /* Silnější ohraničení (tabulky) */

--color-text-primary:   #333333;   /* Hlavní text */
--color-text-secondary: #888888;   /* Popisky, metadata, placeholdery */
--color-text-disabled:  #BBBBBB;   /* Disabled stav */
--color-text-inverse:   #FFFFFF;   /* Text na barevném pozadí */

/* === Sémantické barvy === */
--color-success:        #2d7a3a;   /* Úspěch, palec nahoru */
--color-success-light:  #e6f4e8;
--color-warning:        #b07d00;   /* Varování, neutrální hlas */
--color-warning-light:  #fdf5dc;
--color-danger:         #cf2e2e;   /* Chyba, palec dolů (= primary) */
--color-danger-light:   #f9e6e6;
--color-info:           #605BE5;   /* Informace (= navy) */
--color-info-light:     #eeeeff;
```

### 1.2 Typografie

```css
/* === Font family === */
--font-family-base: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
/* Načten z Google Fonts: weights 400, 500, 600, 700 */

/* === Font sizes (mobile-first rem scale) === */
--text-xs:   0.75rem;   /*  12px — mikro popisky, badges */
--text-sm:   0.875rem;  /*  14px — pomocné texty, tabulky */
--text-base: 1rem;      /*  16px — tělo textu */
--text-lg:   1.125rem;  /*  18px — důležitý obsah */
--text-xl:   1.25rem;   /*  20px — card titulky */
--text-2xl:  1.5rem;    /*  24px — sekční nadpisy */
--text-3xl:  1.875rem;  /*  30px — page titulky */
--text-4xl:  2.25rem;   /*  36px — hero nadpisy */

/* === Font weights === */
--font-regular:    400;
--font-medium:     500;
--font-semibold:   600;
--font-bold:       700;

/* === Line heights === */
--leading-tight:   1.25;
--leading-normal:  1.5;
--leading-relaxed: 1.75;
```

### 1.3 Spacing

```css
/* === Spacing scale (4px base) === */
--space-1:   0.25rem;   /*  4px */
--space-2:   0.5rem;    /*  8px */
--space-3:   0.75rem;   /* 12px */
--space-4:   1rem;      /* 16px */
--space-5:   1.25rem;   /* 20px */
--space-6:   1.5rem;    /* 24px */
--space-8:   2rem;      /* 32px */
--space-10:  2.5rem;    /* 40px */
--space-12:  3rem;      /* 48px */
--space-16:  4rem;      /* 64px */
--space-20:  5rem;      /* 80px */

/* === Standardní aplikační spacing === */
--page-padding-x: var(--space-4);         /* Mobile: 16px bočně */
--page-padding-x-md: var(--space-8);      /* Tablet: 32px */
--page-padding-x-lg: var(--space-12);     /* Desktop: 48px */
--section-gap: var(--space-8);            /* Mezera mezi sekcemi */
--card-padding: var(--space-6);           /* Vnitřní padding karty */
--form-gap: var(--space-4);               /* Mezera mezi formulářovými prvky */
```

### 1.4 Border Radius

```css
/* === Border radius === */
--radius-sm:   4px;    /* Checkbox, malé tagy */
--radius-md:   8px;    /* Input fieldy, malé karty */
--radius-lg:   12px;   /* Standardní karty */
--radius-xl:   16px;   /* Velké karty, modaly */
--radius-2xl:  24px;   /* Hero sekce */
--radius-full:  9999px; /* Pill badges, avatar */

/* Buttons: BNI styl — výrazně zaoblené */
--radius-btn-primary:   30px;   /* Primární tlačítko — pill */
--radius-btn-secondary: 8px;    /* Sekundární tlačítko — standardní */
```

### 1.5 Shadows

```css
/* === Box shadows === */
--shadow-sm:  0 1px 2px rgba(0,0,0,0.05);
--shadow-md:  0 4px 6px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05);
--shadow-lg:  0 10px 15px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04);
--shadow-xl:  0 20px 25px rgba(0,0,0,0.10), 0 10px 10px rgba(0,0,0,0.04);
--shadow-focus: 0 0 0 3px rgba(207,46,46,0.25);  /* Focus ring — červená */
```

### 1.6 Breakpoints (mobile-first)

```css
/* === Breakpoints === */
--bp-sm:   640px;
--bp-md:   768px;
--bp-lg:   1024px;
--bp-xl:   1280px;
```

### 1.7 Tailwind config snippet

```js
// tailwind.config.js — extend sekce
extend: {
  colors: {
    primary:   { DEFAULT: '#cf2e2e', hover: '#b02626', light: '#f9e6e6' },
    gold:      { DEFAULT: '#C69E63', light: '#f5eddc' },
    navy:      { DEFAULT: '#605BE5', light: '#eeeeff' },
    surface:   '#FFFFFF',
    border:    '#E8E8E8',
    'text-main': '#333333',
    'text-muted': '#888888',
  },
  fontFamily: {
    sans: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
  },
  borderRadius: {
    btn: '30px',
    card: '12px',
    modal: '16px',
  },
  boxShadow: {
    card:  '0 4px 6px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)',
    focus: '0 0 0 3px rgba(207,46,46,0.25)',
  },
}
```

---

## 2. Komponentový systém

### 2.1 Button

**Varianty:** primary | secondary | ghost | danger | link

```
┌──────────────────────────────────────────────────────────┐
│  BUTTON KOMPONENTY                                       │
│                                                          │
│  [  Hlasovat  ]   ← primary: bg=#cf2e2e, radius=30px    │
│                     text=white, font-weight=600           │
│                     hover: bg=#b02626                     │
│                     padding: 12px 28px                   │
│                                                          │
│  [  Zrušit   ]   ← secondary: bg=white, border=1px      │
│                     border-color=#E8E8E8, radius=8px     │
│                     text=#333333, hover bg=#F7F7F7        │
│                     padding: 12px 20px                   │
│                                                          │
│  [  Smazat   ]   ← danger: bg=#cf2e2e/10, text=#cf2e2e  │
│                     border=1px #cf2e2e, radius=8px       │
│                     hover: bg=#cf2e2e, text=white        │
│                                                          │
│   Výsledky →      ← ghost/link: no bg, color=#605BE5    │
│                     underline on hover                   │
│                                                          │
│  STAVY:                                                  │
│  - Default / Hover / Focus (shadow-focus) / Disabled     │
│  - Loading: spinner inline left                          │
│                                                          │
│  SIZE VARIANTY:                                          │
│  sm: padding 8px 16px, text-sm                           │
│  md: padding 12px 24px, text-base  ← default            │
│  lg: padding 16px 32px, text-lg                          │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Card

```
┌─────────────────────────────────────────┐
│  CARD — radius=12px, shadow=card        │
│  bg=white, border=1px #E8E8E8           │
│  padding=24px                           │
│                                         │
│  Varianty:                              │
│  - Default (neutrální)                  │
│  - Interactive (hover: shadow-lg,       │
│    transform: translateY(-1px))         │
│  - Highlighted (border-left: 4px solid  │
│    #cf2e2e — aktivní/důležitý prvek)    │
│  - Dimmed (opacity 0.6 — uzavřené       │
│    hlasování, read-only archiv)         │
└─────────────────────────────────────────┘
```

### 2.3 Badge

```
Malé štítky pro status a kategorie:

[Hlasování aktivní]  bg=#f9e6e6, text=#cf2e2e, border=1px #cf2e2e
                     font-size=12px, radius=full, padding=2px 10px

[Uzavřeno]           bg=#E8E8E8, text=#888888
[IT / Technologie]   bg=#eeeeff, text=#605BE5     ← kategorie oboru
[Nový host]          bg=#e6f4e8, text=#2d7a3a

Varianty: success | warning | danger | info | neutral | category
```

### 2.4 Form Inputs

```
┌──────────────────────────────────────────────────────┐
│  INPUT FIELD                                         │
│                                                      │
│  Label (font-weight: 500, text-sm, color: #333333)   │
│  ┌────────────────────────────────────────────────┐  │
│  │  Placeholder text...                          │  │
│  └────────────────────────────────────────────────┘  │
│  height: 44px, radius: 8px, border: 1px #E8E8E8     │
│  focus: border-color #cf2e2e, box-shadow: shadow-focus│
│  padding: 10px 14px, font-size: 16px (no zoom iOS)  │
│                                                      │
│  Chybový stav:                                       │
│  border-color: #cf2e2e                               │
│  Chybová zpráva: text-sm, color: #cf2e2e, mt: 4px   │
│                                                      │
│  TEXTAREA:                                           │
│  min-height: 80px, resize: vertical                  │
│  (Použití: poznámky, důvod zamítnutí)                │
│                                                      │
│  SELECT:                                             │
│  Custom arrow, stejné styly jako input               │
│                                                      │
│  CHECKBOX / RADIO:                                   │
│  accent-color: #cf2e2e, size: 18px                   │
│  Label vlevo, control vpravo (přirozenější na mobilu)│
└──────────────────────────────────────────────────────┘
```

### 2.5 Hlasovací widget (klíčový custom komponent)

```
┌──────────────────────────────────────────────────────┐
│  HLASOVACÍ WIDGET — stav: aktivní                    │
│                                                      │
│  Jak hodnotíte tohoto hosta?                         │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │    👍    │  │    😐    │  │    👎    │           │
│  │  Přijmout│  │ Neutrální│  │ Zamítnout│           │
│  └──────────┘  └──────────┘  └──────────┘           │
│                                                      │
│  Selected stav: border 2px, shadow-focus, bg-light   │
│  👍 → border #2d7a3a, bg #e6f4e8                     │
│  😐 → border #b07d00, bg #fdf5dc                     │
│  👎 → border #cf2e2e, bg #f9e6e6                     │
│                                                      │
│  Při výběru 👎 — kondicionální pole:                 │
│  ┌────────────────────────────────────────────────┐  │
│  │  Důvod zamítnutí *                             │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │  Napište důvod...                        │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  [  Odeslat hlas  ]                                  │
│                                                      │
│  Po odeslání — potvrzovací stav:                     │
│  ✓ Váš hlas byl zaznamenán. Děkujeme.               │
│  (read-only, bez možnosti změny)                     │
└──────────────────────────────────────────────────────┘
```

### 2.6 Table

```
Použití: výsledky hlasování, seznam hostů, správa členů

┌────────────────────────────────────────────────────────────┐
│  Jméno          │ Obor       │ 👍 │ 😐 │ 👎 │ Akce       │
├────────────────────────────────────────────────────────────┤
│  Jan Novák      │[IT]        │  8 │  2 │  0 │  Detail →  │
│  Eva Procházková│[Marketing] │  6 │  3 │  1 │  Detail →  │
├── (zebra: sudé řádky bg #F7F7F7) ─────────────────────────┤

Styl:
- Header: font-weight 600, border-bottom 2px #cf2e2e
- Buňky: padding 12px 16px, text-sm
- Hover řádku: bg #f9e6e6 (lehce)
- Mobilní fallback: card-per-row layout (tabulka se skryje, každý řádek = karta)
```

### 2.7 Modal

```
Overlay: bg rgba(0,0,0,0.5), z-index 50
Panel:   max-width 480px, radius-xl, bg white, shadow-xl
         padding 32px
         pozice: centered (flex, full screen overlay)

Header:  nadpis (text-xl, font-bold) + close button vpravo (×)
Body:    obsah, max-height 70vh, overflow-y auto
Footer:  flex row-reverse, gap 12px (primary vlevo od secondary)

Mobilní: full-screen slide-up z dola (bottom sheet pattern)
```

---

## 3. Varianty hlavního layoutu

### Varianta A — Sidebar navigace (doporučená)

```
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────────────────────────────────────────┐ │
│  │ SIDEBAR  │  │  MAIN CONTENT AREA                      │ │
│  │ 240px    │  │                                          │ │
│  │          │  │  ┌──────────────────────────────────┐   │ │
│  │ [Logo]   │  │  │  Page Title + Actions            │   │ │
│  │          │  │  └──────────────────────────────────┘   │ │
│  │ ─────────│  │                                          │ │
│  │ Dashboard│  │  ┌──────┐ ┌──────┐ ┌──────┐            │ │
│  │ Hosté    │  │  │ Card │ │ Card │ │ Card │            │ │
│  │ Archiv   │  │  └──────┘ └──────┘ └──────┘            │ │
│  │ Výsledky │  │                                          │ │
│  │          │  │  ┌──────────────────────────────────┐   │ │
│  │ ─────────│  │  │  Table / Content                 │   │ │
│  │ [Admin]  │  │  └──────────────────────────────────┘   │ │
│  │  Správa  │  │                                          │ │
│  │  Členové │  │                                          │ │
│  │          │  │                                          │ │
│  │ ─────────│  │                                          │ │
│  │  Odhlásit│  │                                          │ │
│  └──────────┘  └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
MOBILE: sidebar skrytý, hamburger menu → slide-in drawer
```

**Trade-offs:**
- Pro: Navigace vždy viditelná, jasná hierarchie sekcí, snadné přidávat položky, role-aware (admin vidí víc)
- Pro: Maximální plocha pro obsah (dashboard s kartami hostů)
- Proti: Na malých displejích zabírá místo, vyžaduje hamburger pattern
- Proti: Pro 6 položek je sidebar mírně předimenzovaný
- Vhodné pro: interní nástroj s opakovaným používáním, kde uživatelé znají strukturu

---

### Varianta B — Top navigace s tab barem

```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────┐│
│  │  [Logo] BNI Plzeň     Dashboard Hosté Archiv  [Admin ▾]││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Page Title                            [+ Přidat hosta] ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Card    │  │  Card    │  │  Card    │  │  Card    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                             │
│  [Tabulka / obsah stránky]                                  │
└─────────────────────────────────────────────────────────────┘
MOBILE: logo + hamburger v topu, spodní tab bar (max 4 položky)
```

**Trade-offs:**
- Pro: Kompaktnější, maximální vertikální prostor na obsah
- Pro: Přirozený pattern pro webové aplikace, nízká kognitivní zátěž
- Pro: Admin sekce jako dropdown — skrytá od běžných členů
- Proti: Více položek v jednom řádku → overflow problém při větší navigaci
- Proti: Mobilní horní navigace je méně ergonomická (palec daleko)
- Vhodné pro: uživatele, kteří přicházejí z desktopového prostředí

---

### Varianta C — Minimalistická single-column (card-first)

```
┌──────────────────────────────────────┐
│  [BNI Logo]              [Menu ≡]    │
├──────────────────────────────────────┤
│                                      │
│  Hlasování — 14. dubna 2026          │
│  ────────────────────────            │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 👤 Jan Novák — IT             │  │
│  │ [Hlasovat]   [Poznámky (3)]   │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │ 👤 Eva Procházková — Marketing│  │
│  │ [Hlasovat]   [Poznámky (1)]   │  │
│  └────────────────────────────────┘  │
│                                      │
│  [ Archiv ] [ Výsledky ]             │
└──────────────────────────────────────┘
Navigace: hamburger → full-screen overlay menu
```

**Trade-offs:**
- Pro: Absolutně nejjednodušší pro mobilní uživatele, nulová navigační zátěž
- Pro: Fokus na primární akci (hlasování) — vše ostatní je sekundární
- Pro: Nejrychlejší implementace, nejméně komponent
- Proti: Špatná škálovatelnost — s více hosty se stane přehled nepřehledným
- Proti: Admin funkce jsou skryté → horší pro moderátory, kteří potřebují spravovat
- Proti: Chybí kontextová navigace (kdo jsem, kde jsem v aplikaci)
- Vhodné pro: čistě mobilní MVP, kde primární use case je jednoduché hlasování

---

### Doporučení layoutu

**Zvolená varianta: A (Sidebar)**

Odůvodnění: BNI Plzeň je interní nástroj s ~20-40 uživateli, opakované použití každý týden. Uživatelé se rychle naučí strukturu. Sidebar umožňuje role-aware navigaci (admin vidí správu členů, člen ji nevidí) bez potřeby dropdownů. Dashboard s kartami hostů potřebuje maximální horizontální prostor. Mobile sidebar → drawer pattern je dobře zavedený a intuitivní.

---

## 4. Wireframy — 6 klíčových obrazovek

### Wireframe 1 — Přihlášení (Magic Link Landing + Admin Login)

```
STAV A: Magic link landing (?token=abc123)
═══════════════════════════════════════════

┌──────────────────────────────────────────┐
│                                          │
│         [BNI Plzeň Logo]                 │
│                                          │
│   ┌────────────────────────────────┐     │
│   │                                │     │
│   │    Vítejte v BNI Hlasování     │     │
│   │                                │     │
│   │    Ověřujeme váš přístup...    │     │
│   │    ████████████░░░░            │     │
│   │    (progress bar)              │     │
│   │                                │     │
│   └────────────────────────────────┘     │
│                                          │
│   Pokud se nic nestalo, kontaktujte      │
│   administrátora.                        │
│                                          │
└──────────────────────────────────────────┘

→ Po úspěchu: automatický redirect na /dashboard
→ Po chybě: zobrazí error card (neplatný/expirovaný token)

───────────────────────────────────────────

ERROR STAV:
┌──────────────────────────────────────────┐
│  ┌────────────────────────────────────┐  │
│  │  ⚠ Odkaz je neplatný nebo expiroval│  │
│  │                                    │  │
│  │  Váš přístupový odkaz nefunguje.   │  │
│  │  Požádejte administrátora o nový.  │  │
│  │                                    │  │
│  │  Kontakt: admin@bni-plzen.cz       │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘

═══════════════════════════════════════════

STAV B: Admin / Moderator login (email + heslo)
═══════════════════════════════════════════

┌──────────────────────────────────────────┐
│                                          │
│         [BNI Plzeň Logo]                 │
│         Administrátorský přístup         │
│                                          │
│   ┌────────────────────────────────┐     │
│   │  Email                         │     │
│   │  ┌──────────────────────────┐  │     │
│   │  │  vas@email.cz            │  │     │
│   │  └──────────────────────────┘  │     │
│   │                                │     │
│   │  Heslo                         │     │
│   │  ┌──────────────────────────┐  │     │
│   │  │  ••••••••                │  │     │
│   │  └──────────────────────────┘  │     │
│   │                                │     │
│   │  [ Přihlásit se ]              │     │
│   │  (primary button, full-width)  │     │
│   └────────────────────────────────┘     │
│                                          │
│   Nejste admin? Použijte svůj            │
│   přístupový odkaz od administrátora.   │
└──────────────────────────────────────────┘

UX poznámky:
- Bez "zapomenuté heslo" (interní nástroj, admin řeší)
- Žádná registrace — pouze přihlášení
- Magic link landing je primární vstup pro většinu uživatelů
```

---

### Wireframe 2 — Dashboard člena

```
DESKTOP (sidebar layout)
═══════════════════════════════════════════════════════════════

┌──────────┬────────────────────────────────────────────────┐
│  BNI     │  Dashboard                    [Jan Novák ▾]    │
│  Plzeň   ├────────────────────────────────────────────────┤
│          │                                                │
│ Dashboard│  ┌──────────────────────────────────────────┐ │
│ Hosté    │  │ 🔴 Hlasování je aktivní                  │ │
│ Archiv   │  │ Uzavírá se: středa 16. 4. ve 23:59       │ │
│ Výsledky │  │ Zbývá: 2 dny 14 hodin                    │ │
│          │  └──────────────────────────────────────────┘ │
│ ─────────│                                                │
│ [Admin]  │  Hosté k hlasování (4)                        │
│  Správa  │  ─────────────────────────────────────────    │
│  Členové │                                                │
│          │  ┌────────────────┐ ┌────────────────┐        │
│ ─────────│  │ Jan Novák      │ │ Eva Procházková│        │
│ Odhlásit │  │ [IT]           │ │ [Marketing]    │        │
│          │  │                │ │                │        │
│          │  │ ✓ Hlasováno    │ │ ○ Nehlasováno  │        │
│          │  │                │ │                │        │
│          │  │ [Zobrazit]     │ │ [Hlasovat →]   │        │
│          │  └────────────────┘ └────────────────┘        │
│          │                                                │
│          │  ┌────────────────┐ ┌────────────────┐        │
│          │  │ Petr Svoboda   │ │ Marie Horáková │        │
│          │  │ [Finance]      │ │ [Právní služby]│        │
│          │  │                │ │                │        │
│          │  │ ○ Nehlasováno  │ │ ○ Nehlasováno  │        │
│          │  │                │ │                │        │
│          │  │ [Hlasovat →]   │ │ [Hlasovat →]   │        │
│          │  └────────────────┘ └────────────────┘        │
└──────────┴────────────────────────────────────────────────┘

MOBILE (card-first, sticky bottom nav)
═══════════════════════════════════

┌──────────────────────────┐
│  BNI Hlasování   [≡]     │
├──────────────────────────┤
│ 🔴 Hlasování aktivní     │
│ Uzavírá se: stř 23:59    │
├──────────────────────────┤
│ Hosté (4)                │
│ ─────────────────────    │
│ ┌────────────────────┐   │
│ │ Jan Novák   [IT]   │   │
│ │ ✓ Hlasováno        │   │
│ │ [Zobrazit detail]  │   │
│ └────────────────────┘   │
│ ┌────────────────────┐   │
│ │ Eva Procházková    │   │
│ │ [Marketing]        │   │
│ │ ○ Nehlasováno      │   │
│ │ [Hlasovat →]       │   │
│ └────────────────────┘   │
│  ... další karty ...     │
├──────────────────────────┤
│ [Dash] [Hosté] [Archiv]  │
└──────────────────────────┘

UX poznámky:
- Prominentní status banner (aktivní hlasování = červená, žádné = šedá)
- Vizuální stav každé karty: ✓ hotovo vs ○ čekající
- "Hlasovat →" button vede přímo na detail hosta — zkratka k hlavní akci
- Počet nehlasovaných hostů viditelný v navigaci jako badge
```

---

### Wireframe 3 — Detail hosta s hlasovacím formulářem

```
┌──────────────────────────────────────────────────────────────┐
│  ← Zpět                    BNI Hlasování                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Eva Procházková                              [Marketing]    │
│  ──────────────────────────────────────────────────────      │
│                                                              │
│  Popis:                                                      │
│  Marketingová konzultantka se specializací na B2B            │
│  komunikaci a brand strategie. 10 let praxe v agenturách.    │
│                                                              │
│  Přidáno: 10. dubna 2026                                     │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  HLASOVÁNÍ                                            │  │
│  │  ─────────────────────────────────────────────────    │  │
│  │                                                       │  │
│  │  Jak hodnotíte tohoto hosta?                          │  │
│  │                                                       │  │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐         │  │
│  │  │   👍     │   │   😐     │   │   👎     │         │  │
│  │  │ Přijmout │   │Neutrální │   │Zamítnout │         │  │
│  │  └──────────┘   └──────────┘   └──────────┘         │  │
│  │                                                       │  │
│  │  [  Odeslat hlas  ]                                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Poznámky (3)                                                │
│  ─────────────────────────────────────────────────────       │
│                                                              │
│  10. 4. 2026, 14:22                                          │
│  "Skvělá prezentace, jasně komunikovala hodnotu pro B2B.     │
│   Doporučuji přijmout."                                      │
│                                                              │
│  8. 4. 2026, 09:15                                           │
│  "Zeptejte se na zkušenosti s finančním sektorem."          │
│                                                              │
│  5. 4. 2026, 16:40                                           │
│  "Podnikání v Plzni, lokální kontakty jsou výhodou."        │
│                                                              │
│  ─────────────────────────────────────────────────────       │
│  Napište poznámku:                                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Vaše poznámka...                                      │  │
│  └────────────────────────────────────────────────────────┘  │
│  [ Přidat poznámku ]                                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘

UX poznámky:
- Hlasovací widget je above-the-fold na desktopu, na mobilu po scrollu
- Na mobilu: sticky "Hlasovat" button dole (fixed), aby byl vždy přístupný
- Stav po odeslání hlasu: widget se změní na "✓ Hlasováno" read-only kartu
- Poznámky jsou anonymizované — žádné jméno autora, jen datum/čas
- Pole pro novou poznámku je vždy viditelné (bez toggle) — nízká friction
```

---

### Wireframe 4 — Admin panel

```
┌──────────┬────────────────────────────────────────────────┐
│  BNI     │  Administrace              [Admin: Tomáš N. ▾] │
│  Plzeň   ├────────────────────────────────────────────────┤
│          │                                                │
│ Dashboard│  ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │
│ Hosté    │  │  Schůzky    │ │  Členové    │ │ Hlasov. │  │
│ Archiv   │  │  a hosté    │ │  a přístupy │ │ správa  │  │
│ Výsledky │  └─────────────┘ └─────────────┘ └─────────┘  │
│          │  (tab navigace uvnitř Admin panelu)            │
│ ─────────│                                                │
│ ★ Admin  │  TAB: Schůzky a hosté                         │
│   Správa │  ──────────────────────────────────────────── │
│   Členové│                                                │
│          │  Aktivní schůzka: 10. dubna 2026               │
│          │  Status: [Hlasování aktivní] [Uzavřít hlasov.] │
│          │                                                │
│          │  Hosté na této schůzce:                        │
│          │  ┌────────────────────────────────────────┐   │
│          │  │ Jméno       │ Kategorie │ Hlasů │ Akce │   │
│          │  ├────────────────────────────────────────┤   │
│          │  │ Jan Novák   │ [IT]      │ 8/10  │ ···  │   │
│          │  │ Eva Proch.  │ [Market.] │ 5/10  │ ···  │   │
│          │  └────────────────────────────────────────┘   │
│          │  [+ Přidat hosta]                              │
│          │                                                │
│          │  TAB: Členové a přístupy                       │
│          │  ──────────────────────────────────────────── │
│          │                                                │
│          │  ┌────────────────────────────────────────┐   │
│          │  │ Jméno       │ Role      │ Odkaz  │ Akce│   │
│          │  ├────────────────────────────────────────┤   │
│          │  │ Jan Novák   │ [Člen]    │[Kopír.]│ ··· │   │
│          │  │ Eva Proch.  │ [Mod.]    │[Kopír.]│ ··· │   │
│          │  │ Tomáš Nový  │ [Admin]   │   —    │ ··· │   │
│          │  └────────────────────────────────────────┘   │
│          │  [+ Přidat člena]  [Regenerovat odkaz]        │
└──────────┴────────────────────────────────────────────────┘

Modal: Přidat/upravit člena
┌────────────────────────────────┐
│  Nový člen              [×]    │
│  ─────────────────────────     │
│  Jméno                         │
│  [________________________]    │
│  Email (pro report)            │
│  [________________________]    │
│  Role                          │
│  [Člen ▾]                      │
│  [Zrušit]         [Uložit]     │
└────────────────────────────────┘

UX poznámky:
- Tab navigace uvnitř admin — jedna stránka, ne více URL (méně navigace)
- Akce "···" (kebab menu) pro každý řádek: upravit / smazat / regenerovat odkaz
- Tlačítko "Uzavřít hlasování" je destruktivní — vyžaduje potvrzovací modal
- Magic link se kopíruje do clipboardu jedním klikem (UX pro admina)
```

---

### Wireframe 5 — Archiv

```
┌──────────┬────────────────────────────────────────────────┐
│  BNI     │  Archiv hostů                                  │
│  Plzeň   ├────────────────────────────────────────────────┤
│          │                                                │
│ Dashboard│  ┌───────────────────────────────────────────┐ │
│ Hosté    │  │  FILTRY                                   │ │
│ Archiv ← │  │                                           │ │
│ Výsledky │  │  Způsob výběru:                           │ │
│          │  │  ● Časové okno  ○ Výběr schůzek           │ │
│          │  │                                           │ │
│          │  │  Od: [10. 1. 2026]  Do: [31. 3. 2026]    │ │
│          │  │                                           │ │
│          │  │  Kategorie: [Vše ▾]                       │ │
│          │  │                                           │ │
│          │  │  [Zobrazit výsledky]                      │ │
│          │  └───────────────────────────────────────────┘ │
│          │                                                │
│          │  Výsledky: 12 hostů (Q1 2026)                  │
│          │  ─────────────────────────────────────────     │
│          │                                                │
│          │  ┌────────────────────────────────────────┐   │
│          │  │ Jan Novák          [IT]   10. 1. 2026  │   │
│          │  │ 👍 8  😐 1  👎 1          [Detail →]  │   │
│          │  └────────────────────────────────────────┘   │
│          │  ┌────────────────────────────────────────┐   │
│          │  │ Eva Procházková  [Mark.]  17. 1. 2026  │   │
│          │  │ 👍 10  😐 0  👎 0         [Detail →]  │   │
│          │  └────────────────────────────────────────┘   │
│          │  ... další záznamy ...                         │
└──────────┴────────────────────────────────────────────────┘

ALTERNATIVNÍ FILTR — Výběr schůzek:
┌───────────────────────────────────────────┐
│  FILTRY                                   │
│  Způsob výběru:                           │
│  ○ Časové okno  ● Výběr schůzek           │
│                                           │
│  ☑ 14. 4. 2026 — Schůzka BNI             │
│  ☑ 7. 4. 2026  — Schůzka BNI             │
│  ☐ 31. 3. 2026 — Schůzka BNI             │
│  ☐ 24. 3. 2026 — Schůzka BNI             │
│  (scrollable list, max-height 200px)      │
│                                           │
│  Kategorie: [Vše ▾]                       │
│                                           │
│  [Zobrazit výsledky]                      │
└───────────────────────────────────────────┘

UX poznámky:
- Filtr panel je vždy viditelný (ne collapse) — snížení friction
- Radio toggle mezi časovým oknem a výběrem schůzek — jedno nebo druhé
- Výsledky se zobrazí až po kliknutí na "Zobrazit" — ne live update (výkon)
- Stránkování nebo infinite scroll pro velký archiv
- Mobilní layout: filtry nahoře, výsledky pod nimi (accordion pro filtr)
```

---

### Wireframe 6 — Výsledky hlasování

```
┌──────────┬────────────────────────────────────────────────┐
│  BNI     │  Výsledky hlasování — 10. dubna 2026           │
│  Plzeň   ├────────────────────────────────────────────────┤
│          │                                                │
│ Dashboard│  Status: [Uzavřeno]   [Stáhnout report]        │
│ Hosté    │                                                │
│ Archiv   │  ┌─────────────────────────────────────────┐  │
│ Výsledky←│  │  Souhrn                                 │  │
│          │  │  Hlasovalo: 9 z 10 členů                │  │
│          │  │  Hosté: 4    Průměrná účast: 90 %        │  │
│          │  └─────────────────────────────────────────┘  │
│          │                                                │
│          │  Jan Novák — [IT]                              │
│          │  ────────────────────────────────────────      │
│          │  👍 Přijmout: 8   😐 Neutrální: 1   👎 Zamí.: 0│
│          │  ████████████████████░░░░░  80 %               │
│          │                                                │
│          │  ┌───────────────────────────────────────┐    │
│          │  │ Hlasující    │ Hlas  │ Poznámka       │    │
│          │  ├───────────────────────────────────────┤    │
│          │  │ Eva Proch.   │  👍   │ —              │    │
│          │  │ Petr Svoboda │  👍   │ —              │    │
│          │  │ Marie H.     │  😐   │ —              │    │
│          │  │ ...          │  ...  │ ...            │    │
│          │  └───────────────────────────────────────┘    │
│          │                                                │
│          │  Eva Procházková — [Marketing]                 │
│          │  ────────────────────────────────────────      │
│          │  👍 10  😐 0  👎 0  | ████████████████ 100 %  │
│          │  [Zobrazit hlasující ▾]                        │
│          │  (collapsed by default — kliknutím rozbalí)    │
│          │                                                │
└──────────┴────────────────────────────────────────────────┘

Detail zamítavého hlasu (inline):
┌──────────────────────────────────────────┐
│ Karel Novotný   │  👎  │  "Nemá kontakty │
│                 │      │  v našem sektoru│
│                 │      │  B2B průmyslu." │
└──────────────────────────────────────────┘

UX poznámky:
- Každý host má progress bar pro vizuální rychlé srovnání
- Tabulka hlasujících defaultně collapsed — lze rozbalit (méně overwhelm)
- Zamítavé hlasy se zobrazují s důvodem inline — neskryté, transparentní
- "Stáhnout report" — spustí generování a download PDF/HTML přehledu
- Stránka je veřejná pro přihlášené členy — žádná extra autorizace
```

---

## 5. UX doporučení a friction points

### 5.1 Kritická cesta uživatele (happy path)

```
Člen dostane magic link →
  Klikne → auto-přihlášení →
    Dashboard: vidí hosty s aktivním hlasováním →
      Klikne na hosta →
        Hlasuje (3 tlačítka) →
          Potvrzení → zpět na dashboard →
            Postupně hlasuje pro všechny hosty →
              Vidí "✓ Vše hotovo" banner

Celková délka: max 5 kliků od magic linku k dokončení hlasování pro všechny hosty.
```

### 5.2 Friction Points — konkrétní

| # | Friction Point | Popis | Řešení |
|---|---|---|---|
| FP-1 | Magic link expirace | Token expiruje a uživatel neví proč přihlášení selhalo | Jasná error page s kontaktem na admina (ne generická 401) |
| FP-2 | Povinný důvod u 👎 | Uživatel musí psát text — zastaví flow | Kondicionální textarea se zobrazí jen po výběru 👎, placeholder text navede |
| FP-3 | Ztráta stavu po back | Po kliknutí zpět z detailu hosta ztratí kontext | Zachovat scroll pozici na dashboardu (sessionStorage nebo URL params) |
| FP-4 | Nejasný stav hlasování | Člen neví, zda hlasovací okno je otevřené | Prominentní barevný banner na každé stránce (ne jen dashboard) |
| FP-5 | Admin: ruční kopírování linku | Admin musí link kopírovat a posílat ručně | Tlačítko "Kopírovat odkaz" + volitelně přímý send emailem |
| FP-6 | Mobilní tabulka výsledků | Tabulka hlasujících se na mobilu nevejde | Card-per-row fallback nebo horizontální scroll s fixed first column |
| FP-7 | Archiv bez kontextu | Uživatel neví, kde schůzky hledat při prvním použití | Empty state s příkladovým dotazem ("Zkuste Q1 2026") |
| FP-8 | Re-vote pokus | Člen zkusí hlasovat podruhé — dostane chybu | Okamžitá vizuální indikace "již jsi hlasoval" (widget v read-only stavu) |

### 5.3 UX doporučení

**Mobile-first priorita:**
Mobilní optimalizace je klíčová — magic link přichází emailem, uživatel pravděpodobně klikne z telefonu. Dashboard, detail hosta a hlasovací widget musí fungovat na 375px šířce bez horizontálního scrollu. Admin panel může být desktop-first (admin pracuje z počítače).

**Progressive disclosure:**
Na dashboardu zobrazit jen to nejdůležitější (název hosta, stav hlasování, button). Detaily (poznámky, popis) až na detailu hosta. V archivu a výsledcích defaultně collapsed detaily — rozbalení na vyžádání.

**Explicitní stavy:**
Každý hostovský element má jasný stav: "nehlasováno", "hlasováno", "uzavřeno". Barvy + ikony (ne jen text). Hlasovací okno status musí být viditelný na každé stránce přihlášeného uživatele.

**Zero ambiguity v hlasování:**
Hlasovací akce je nevratná. Před odesláním zobrazit sumář výběru (nebo výrazné vizuální zvýraznění zvoleného tlačítka). Po odeslání okamžité potvrzení — ne jen "formulář odeslán".

**Administrace — oddělení odpovědností:**
Admin panel je fyzicky oddělená sekce (sidebar sekce "Admin"). Standardní člen sekci vůbec nevidí. Destruktivní akce (uzavření hlasování, smazání hosta) vždy vyžadují potvrzovací modal s jasným popisem dopadu.

**Výsledky — transparentnost:**
BNI komunita funguje na vzájemné důvěře. Jmenovité výsledky jsou designová volba v souladu se zadáním. UI by mělo tuto transparentnost reflektovat — žádné skrývání za accordion defaultně. Zamítavé hlasy s důvodem jsou prominentní, ne zahrabané.

**Prázdné stavy (empty states):**
- Dashboard bez hostů: "Žádní hosté k hlasování. Schůzka ještě nebyla vytvořena."
- Archiv bez výsledků: "Pro zvolené období nebyly nalezeny žádné záznamy."
- Tyto stavy musí být navrženy — prázdná stránka je worst-case UX.

### 5.4 UX debt pro post-MVP

| Položka | Dopad | Priorita |
|---|---|---|
| Bulk hlasování z dashboardu | Hlasování přímo z karty bez detailu hosta | Střední |
| Push notifikace (Web Push) | Upozornění na otevřené hlasování | Nízká |
| Filtry na dashboardu | Třídění hostů podle kategorie | Nízká |
| Dark mode | Komfort při večerním použití | Nízká |
| Export do Excelu | Alternativa k PDF reportu | Střední |

---

## Příloha: Checklist splnění Acceptance Criteria

- [x] Design tokens jsou konkrétní (hex kódy, px hodnoty, font names)
- [x] Komponentový systém pokrývá Button, Card, Form input, Badge, Table + hlasovací widget
- [x] Min. 3 varianty layoutu s explicitními trade-offs (A: Sidebar, B: Top nav, C: Single-column)
- [x] Wireframy pokrývají všech 6 klíčových obrazovek
- [x] UX friction points jsou konkrétní (FP-1 až FP-8 s řešením)
- [x] Design respektuje BNI Plzeň brand (#cf2e2e, Poppins, rounded corners 30px CTA)
- [x] Mobile-first zmíněno a zdůvodněno (magic link email → mobilní příchod)
