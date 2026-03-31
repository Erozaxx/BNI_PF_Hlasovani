# Deployment Guide: BNI PF Hlasovaci aplikace
# iter-001 | T-007 | 2026-03-31

---

## Obsah

1. [Předpoklady](#1-předpoklady)
2. [Neon PostgreSQL setup](#2-neon-postgresql-setup)
3. [Vercel setup](#3-vercel-setup)
4. [Env variables — kompletní seznam](#4-env-variables--kompletní-seznam)
5. [DB migrace — první deploy a update postup](#5-db-migrace--první-deploy-a-update-postup)
6. [Resend setup](#6-resend-setup)
7. [Custom domain na Vercel](#7-custom-domain-na-vercel)
8. [Post-deploy checklist](#8-post-deploy-checklist)
9. [Rollback postup](#9-rollback-postup)
10. [Free tier limity — přehled](#10-free-tier-limity--přehled)

---

## 1. Předpoklady

Před zahájením mít připraveno:

- GitHub účet s repozitářem aplikace (Next.js 14+ s App Routerem)
- Email adresu pro Neon účet (stačí libovolný Gmail / Firemní)
- Email adresu pro Vercel účet (doporučeno stejný nebo firemní)
- Email adresu pro Resend účet
- Přístup k DNS záznamu domény (pokud chcete custom domain)
- Node.js 20+ lokálně pro testování migrací

---

## 2. Neon PostgreSQL setup

### 2.1 Vytvoření účtu a projektu

1. Jdi na [neon.tech](https://neon.tech) a klikni **Sign Up**.
2. Vytvoř účet přes GitHub nebo email.
3. Po přihlášení klikni **Create a new project**.
4. Vyplň:
   - **Project name**: `bni-pf-hlasovani`
   - **Database name**: `bni_hlasovani`
   - **Region**: vyberte `EU West (Frankfurt)` — nejblíže CZ uživatelům
   - **PostgreSQL version**: 16 (nejnovější stabilní)
5. Klikni **Create project**.

> **Free tier limit:** 1 projekt, 512 MB storage, 0.5 CU compute (shared). Pro ~40 členů zcela dostačující — jeden hlasovací záznam zabírá cca 200 B.

### 2.2 Získání connection strings

Po vytvoření projektu se zobrazí dialog s connection strings. **Zkopíruj a ulož oba typy:**

#### Pooled connection (pro runtime / Vercel)

```
postgresql://user:password@ep-xxxxx-pooler.eu-west-2.aws.neon.tech/bni_hlasovani?sslmode=require
```

Poznáš ji podle `-pooler` v hostname nebo portu `6543`. Tato URL jde do `DATABASE_URL` v produkci.

#### Direct connection (pro migrace)

```
postgresql://user:password@ep-xxxxx.eu-west-2.aws.neon.tech/bni_hlasovani?sslmode=require
```

Bez `-pooler`. Tato URL se používá pouze pro `drizzle-kit push` nebo ruční SQL migrace.

> Jak najít strings kdykoliv: Neon Dashboard → váš projekt → **Connection Details** (pravý panel) → přepni mezi "Pooled connection" a "Direct connection".

### 2.3 Connection pooling — konfigurace

Neon má vestavěný PgBouncer (connection pooler). Pro serverless prostředí Vercel je pooler **povinný** — bez něj každý serverless request otevírá nový DB connection a rychle narážíš na limit.

**Pooled URL** (vždy `?sslmode=require`):
- hostname obsahuje `-pooler`: `ep-xxxxx-pooler.eu-west-2.aws.neon.tech`
- port `5432` (výchozí pro Neon pooler)

Aplikační kód v `lib/db/client.ts` využívá tuto URL automaticky přes `process.env.DATABASE_URL`.

### 2.4 Branch strategie

Neon branches fungují jako Git branches — každý branch má vlastní izolované DB schema a data.

**Struktura:**

```
main branch        → production databáze (prod data)
dev branch         → vývojová databáze (testovací data)
```

**Jak vytvořit dev branch:**

1. Neon Dashboard → váš projekt → záložka **Branches**.
2. Klikni **Create branch**.
3. Name: `dev`, Source: `main`, Include data: dle potřeby (doporučeno prázdná pro dev).
4. Klikni **Create branch**.
5. Z dev branch zkopíruj **Pooled connection string** → použij v lokálním `.env.local` nebo Vercel Preview Environment.

**Pravidla:**
- `main` branch = produkce. Nikdy přímo neměníš schéma na prod.
- `dev` branch = vývoj a testování migrací.
- Před produkčním deployem spusť migrace na `dev` branch a ověř.

> **Neon free tier:** max. 10 branches. Pro MVP (main + dev) plně dostačuje.

---

## 3. Vercel setup

### 3.1 Vytvoření účtu

1. Jdi na [vercel.com](https://vercel.com) a klikni **Sign Up**.
2. Doporučeno: přihlás se přes **GitHub** — zjednoduší import repozitáře.
3. Vyber plán **Hobby** (zdarma).

### 3.2 Import GitHub repozitáře

1. Na Vercel Dashboard klikni **Add New → Project**.
2. V sekci "Import Git Repository" vyber svůj GitHub účet.
3. Najdi repozitář `bni-pf-hlasovani` (nebo jak je pojmenován) a klikni **Import**.
4. Vercel automaticky detekuje Next.js — framework settings nechej výchozí.
5. **NEZAHAJUJ YET deploy** — nejprve nastav env variables (krok 4).

### 3.3 Nastavení deployment regionu (volitelné, doporučeno)

Pro nižší latenci pro CZ uživatele (jinak výchozí je US East):

1. Po importu projektu jdi do **Settings → Functions**.
2. Pokud je dostupné nastavení regionu, vyber `fra1` (Frankfurt).
3. Alternativa: přidej soubor `vercel.json` do kořene repozitáře:

```json
{
  "regions": ["fra1"]
}
```

> Poznámka: na Hobby plánu je region 1 (iad1 = US East výchozí). Přepnutí na `fra1` sníží latenci z ~120ms na ~20–40ms pro CZ uživatele. Není povinné pro funkčnost, ale doporučeno.

### 3.4 Nastavení env variables v Vercel

1. Vercel Dashboard → váš projekt → **Settings → Environment Variables**.
2. Pro každou proměnnou (viz sekce 4) klikni **Add** a vyplň:
   - **Key**: název proměnné
   - **Value**: hodnota
   - **Environment**: zaškrtni `Production` (a volitelně `Preview` s jinými hodnotami)
3. Po přidání všech proměnných klikni **Save**.

### 3.5 Spuštění prvního deploye

1. Vercel Dashboard → váš projekt → záložka **Deployments**.
2. Klikni **Redeploy** (nebo pushni commit do `main` větve na GitHubu).
3. Sleduj build log — první build trvá 1–3 minuty.
4. Po úspěšném buildu se zobrazí URL ve formátu `bni-pf-hlasovani.vercel.app`.

### 3.6 GitHub → Vercel auto-deploy

Po importu je auto-deploy nakonfigurován automaticky:
- Push do větve `main` → deploy do **Production**.
- Push do jiné větve → deploy do **Preview** (s vlastní URL).
- Pull Request → automaticky Preview deployment s komentářem v PR.

Žádná další konfigurace CI/CD není pro MVP potřeba.

### 3.7 Cron Job konfigurace

Aplikace potřebuje jeden cron job pro automatické uzavírání hlasování (každou středu v 23:59).

Přidej do `vercel.json` v kořeni repozitáře (nebo uprav existující):

```json
{
  "regions": ["fra1"],
  "crons": [
    {
      "path": "/api/cron/close-voting",
      "schedule": "59 23 * * 3"
    }
  ]
}
```

> **Hobby limit:** 1 cron job. Toto je náš jediný cron — jsme v limitu.

Cron bude automaticky aktivní po deployi. Vercel volá endpoint s `Authorization: Bearer <CRON_SECRET>` hlavičkou.

---

## 4. Env variables — kompletní seznam

Všechny proměnné se nastavují v:
- **Lokálně**: soubor `.env.local` v kořeni projektu (nikdy commitovat do Gitu — přidej do `.gitignore`)
- **Vercel**: Settings → Environment Variables (viz krok 3.4)

### Tabulka proměnných

| Proměnná | Popis | Kde získat | Příklad / formát |
|---|---|---|---|
| `DATABASE_URL` | Neon pooler connection string (runtime) | Neon Dashboard → Connection Details → Pooled | `postgresql://user:pass@ep-xxx-pooler.eu-west-2.aws.neon.tech/bni_hlasovani?sslmode=require` |
| `DATABASE_URL_UNPOOLED` | Neon přímé připojení (migrace) | Neon Dashboard → Connection Details → Direct | `postgresql://user:pass@ep-xxx.eu-west-2.aws.neon.tech/bni_hlasovani?sslmode=require` |
| `SESSION_SECRET` | Tajný klíč pro šifrování session cookie (iron-session / jose HS256) | Vygeneruj náhodně — viz níže | 32+ náhodných znaků |
| `RESEND_API_KEY` | API klíč pro odesílání emailů přes Resend | Resend Dashboard → API Keys | `re_xxxxxxxxxxxxxxxxxx` |
| `RESEND_FROM_EMAIL` | Email adresa odesílatele (musí být ověřená v Resend) | Resend → Domains (tvá doména) | `noreply@tvadomena.cz` |
| `CRON_SECRET` | Tajný token pro ověření Vercel cron volání na `/api/cron/close-voting` | Vygeneruj náhodně — viz níže | 32+ náhodných znaků |
| `REPORT_SECRET` | Tajný token pro manuální volání reportu na `/api/report` | Vygeneruj náhodně — viz níže | 32+ náhodných znaků |
| `NEXT_PUBLIC_APP_URL` | Veřejná URL aplikace (pro generování magic links) | Vercel Dashboard → produkční URL nebo custom domain | `https://bni-pf.vercel.app` nebo `https://tvadomena.cz` |

### Generování náhodných tajných klíčů

Spusť lokálně v terminálu (vyžaduje Node.js nebo OpenSSL):

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# OpenSSL
openssl rand -hex 32
```

Spusť 3x — jednou pro `SESSION_SECRET`, jednou pro `CRON_SECRET`, jednou pro `REPORT_SECRET`. Každý klíč musí být unikátní.

### Příklad .env.local

```bash
# .env.local — NIKDY necommituj do Gitu!

# Neon PostgreSQL
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.eu-west-2.aws.neon.tech/bni_hlasovani?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://user:pass@ep-xxx.eu-west-2.aws.neon.tech/bni_hlasovani?sslmode=require"

# Session
SESSION_SECRET="<64-char-hex-string>"

# Resend email
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxx"
RESEND_FROM_EMAIL="noreply@tvadomena.cz"

# Security tokens
CRON_SECRET="<64-char-hex-string>"
REPORT_SECRET="<64-char-hex-string>"

# App URL (lokálně)
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

> Přidej `.env.local` do `.gitignore` — je tam výchozně u Next.js projektů, ale zkontroluj.

---

## 5. DB migrace — první deploy a update postup

### 5.1 Doporučený nástroj: Drizzle ORM

Architektura využívá Neon serverless driver. Drizzle ORM je doporučen pro:
- Type-safe SQL queries
- Schéma definici v TypeScriptu
- Jednoduché migrace přes `drizzle-kit`

**Instalace (jednou, do projektu):**

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit
```

**Konfigurace `drizzle.config.ts`:**

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!, // přímé připojení pro migrace
  },
})
```

> Migrace vždy používají `DATABASE_URL_UNPOOLED` (přímé připojení) — pooler není vhodný pro DDL operace.

### 5.2 První deploy — inicializace DB schématu

**Krok 1: Ověř připojení na Neon main branch**

```bash
# V lokálním .env.local nastav DATABASE_URL_UNPOOLED na main branch
npx drizzle-kit push
```

Drizzle se připojí na Neon a vytvoří všechny tabulky podle `lib/db/schema.ts`.

**Alternativa — ruční SQL přes Neon Console:**

1. Neon Dashboard → váš projekt → záložka **SQL Editor**.
2. Vyber branch `main`.
3. Vlož celý DDL skript (SQL) a klikni **Run**.
4. Ověř: záložka **Tables** — měly by se zobrazit všechny tabulky.

**Krok 2: Seed počátečních dat (admin účet)**

Po vytvoření schématu vložte prvního admina:

```sql
-- Spusť v Neon SQL Editor na main branch
INSERT INTO member (name, email, magic_token_hash, management_role, created_at)
VALUES (
  'Admin Jméno',
  'admin@tvadomena.cz',
  -- magic_token_hash: SHA-256 hash vygenerovaného tokenu
  encode(sha256('tvůj-první-magic-token'::bytea), 'hex'),
  'admin',
  NOW()
);
```

> První magic link vygeneruj manuálně nebo přes admin setup stránku po prvním deployi.

**Krok 3: Deploy na Vercel**

```bash
git add .
git commit -m "feat: initial schema and setup"
git push origin main
```

Vercel automaticky spustí build a deploy.

### 5.3 Update schématu — postup při změně

Při každé změně DB schématu (přidání sloupce, tabulky, indexu):

**1. Vývojový postup:**

```bash
# Uprav lib/db/schema.ts

# Spusť push na dev branch (DATABASE_URL_UNPOOLED ukazuje na dev branch)
DATABASE_URL_UNPOOLED="<dev-branch-direct-url>" npx drizzle-kit push

# Otestuj aplikaci lokálně s dev branch
# ...

# Vygeneruj migrační soubor (pro audit trail)
npx drizzle-kit generate
```

**2. Produkční update:**

```bash
# Přepni DATABASE_URL_UNPOOLED na main branch
DATABASE_URL_UNPOOLED="<main-branch-direct-url>" npx drizzle-kit push

# Nebo použij migrační soubory:
DATABASE_URL_UNPOOLED="<main-branch-direct-url>" npx drizzle-kit migrate
```

**3. Deploy kódu:**

```bash
git push origin main  # Vercel automaticky deployuje
```

> **Pořadí je důležité:** Nejprve migrace DB, pak deploy kódu. Nikdy naopak — starý kód musí fungovat se starým i novým schématem (backward compatible migrace).

### 5.4 Zásady bezpečné migrace

- Nikdy nemazej sloupce v první migraci — nejprve přidej nový, pak deprecated označ/zastarej, pak mazej v další iteraci.
- Pro přejmenování sloupce: přidej nový sloupec, zkopíruj data, odstraň starý (3 samostatné deploye).
- Vždy testuj na `dev` branch před `main`.

---

## 6. Resend setup

> **Free tier limit:** 100 emailů/den. Pro týdenní report ~40 adresátů je to dostatečné; limit nastane pouze při testování nebo neočekávané frekvenci.

### 6.1 Vytvoření účtu

1. Jdi na [resend.com](https://resend.com) a klikni **Sign Up**.
2. Vytvoř účet přes GitHub nebo email.

### 6.2 Získání API klíče

1. Resend Dashboard → **API Keys** (levé menu).
2. Klikni **Create API Key**.
3. Name: `bni-pf-production`
4. Permission: `Sending access` (není potřeba full access)
5. Klikni **Add** — klíč se zobrazí **pouze jednou**.
6. Zkopíruj klíč a ulož ho do `RESEND_API_KEY`.

> Pokud klíč ztratíš, musíš vytvořit nový — starý nelze zobrazit znovu.

### 6.3 Ověření domény odesílatele

Bez ověřené domény lze posílat pouze na vlastní email (pro testování). Pro produkci musíš ověřit doménu.

**Krok 1: Přidání domény**

1. Resend Dashboard → **Domains** → **Add Domain**.
2. Zadej svoji doménu: `tvadomena.cz`.
3. Resend zobrazí DNS záznamy, které je potřeba přidat.

**Krok 2: Přidání DNS záznamů**

Resend vyžaduje přidání SPF, DKIM a případně DMARC záznamů. Záznamy vypadají takto (přesné hodnoty dostaneš od Resend):

| Typ | Název | Hodnota |
|---|---|---|
| TXT | `@` nebo `tvadomena.cz` | `v=spf1 include:amazonses.com ~all` |
| CNAME | `resend._domainkey` | `resend._domainkey.tvadomena.cz.dkim.resend.com` |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@tvadomena.cz` |

Přidej záznamy u svého DNS providera (Wedos, Active24, Cloudflare, apod.).

**Krok 3: Ověření**

1. Po přidání DNS záznamů se vrať do Resend → **Domains**.
2. Klikni **Verify** u své domény.
3. DNS propagace trvá 5–30 minut (někdy až 24h).
4. Status se změní na **Verified** — pak lze odesílat z `noreply@tvadomena.cz`.

**Krok 4: Nastavení v aplikaci**

Nastav env proměnnou:
```
RESEND_FROM_EMAIL="noreply@tvadomena.cz"
```

### 6.4 Test odeslání emailu

Po ověření domény otestuj odeslání přes Resend Dashboard → **Emails → Send Test Email**, nebo zavolej `/api/report` endpoint manuálně:

```bash
curl -X POST https://tvoje-app.vercel.app/api/report \
  -H "Authorization: Bearer <REPORT_SECRET>" \
  -H "Content-Type: application/json"
```

---

## 7. Custom domain na Vercel

Volitelné, ale doporučeno pro produkci (lepší UX než `*.vercel.app` URL).

### 7.1 Přidání domény

1. Vercel Dashboard → váš projekt → **Settings → Domains**.
2. Klikni **Add** a zadej doménu: `bni.tvadomena.cz` (nebo `tvadomena.cz`).
3. Vercel zobrazí DNS záznamy k nastavení.

### 7.2 DNS konfigurace

**Pokud přidáváš subdoménu** (`bni.tvadomena.cz`):

| Typ | Název | Hodnota |
|---|---|---|
| CNAME | `bni` | `cname.vercel-dns.com` |

**Pokud přidáváš root doménu** (`tvadomena.cz`):

| Typ | Název | Hodnota |
|---|---|---|
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

### 7.3 SSL certifikát

Vercel automaticky vydá a obnoví Let's Encrypt SSL certifikát po ověření DNS. Nevyžaduje žádnou akci — HTTPS je automatické.

### 7.4 Aktualizace env variable

Po nastavení custom domain aktualizuj:
```
NEXT_PUBLIC_APP_URL="https://bni.tvadomena.cz"
```

Tato URL se používá pro generování magic links — musí odpovídat produkční URL.

---

## 8. Post-deploy checklist

Po prvním úspěšném deployi ověř funkčnost všech klíčových flows:

### 8.1 Základní dostupnost

- [ ] **1.** Otevři produkční URL v prohlížeči → zobrazí se login stránka (ne 500 chyba).
- [ ] **2.** Zkontroluj HTTPS — prohlížeč zobrazuje zámek, přístup přes `http://` přesměruje na `https://`.
- [ ] **3.** Vercel Dashboard → Deployments → poslední deployment má status **Ready** (zelený).

### 8.2 Databázové připojení

- [ ] **4.** Neon Dashboard → projekt → záložka **Tables** → zobrazují se všechny tabulky (member, guest, meeting, meeting_guest, note, vote, category).
- [ ] **5.** Vercel Dashboard → Logs (runtime logy) → žádné `Connection refused` nebo `ECONNREFUSED` chyby při načítání stránky.

### 8.3 Auth flow (magic link)

- [ ] **6.** Přihlás se jako admin (magic link nebo email+heslo podle implementace).
- [ ] **7.** Admin může přejít do sekce správy členů.
- [ ] **8.** Vygeneruj testovací magic link pro testovacího člena.
- [ ] **9.** Otevři magic link v anonymním okně → přihlásí tě jako daného člena.
- [ ] **10.** Odhlásíš se → přesměruje na login stránku.
- [ ] **11.** Expirovaný nebo neplatný magic link zobrazí chybovou stránku (ne 500).

### 8.4 Základní CRUD

- [ ] **12.** Admin vytvoří testovací kategorii.
- [ ] **13.** Admin nebo Moderátor přidá testovacího hosta s kategorií.
- [ ] **14.** Člen (přihlášen přes magic link) vidí hosta v přehledu.
- [ ] **15.** Člen napíše poznámku k hostovi — poznámka se zobrazí (anonymizovaná).

### 8.5 Hlasování

- [ ] **16.** Admin nebo Moderátor otevře hlasování (vytvoří meeting se statusem `voting`).
- [ ] **17.** Člen vidí hlasovací formulář pro hosta.
- [ ] **18.** Člen odhlasuje (palec nahoru) — hlas se uloží.
- [ ] **19.** Člen nemůže hlasovat podruhé za stejného hosta (UI zablokuje, server vrátí chybu).
- [ ] **20.** Hlasování s palcem dolů vyžaduje důvod — formulář zablokuje odeslání bez důvodu.

### 8.6 Email / report

- [ ] **21.** Zavolej report endpoint manuálně (viz krok 6.4) → vrátí `200 OK` s `{ sent: N, emails: [...] }`.
- [ ] **22.** Zkontroluj doručení emailu (admin / moderátor inbox) — email přišel, není ve spamu.
- [ ] **23.** Resend Dashboard → **Emails** → zobrazuje odeslané emaily se statusem `Delivered`.

### 8.7 Cron job

- [ ] **24.** Vercel Dashboard → **Settings → Crons** → zobrazuje nakonfigurovaný cron `59 23 * * 3`.
- [ ] **25.** Klikni **Trigger** (ruční spuštění) → endpoint vrátí `200 OK` bez chyby.
- [ ] **26.** Vercel Logs → zaznamenán request na `/api/cron/close-voting` s výsledkem `200`.

### 8.8 Bezpečnost

- [ ] **27.** Nepřihlášený uživatel, který přistoupí na `/dashboard` (nebo jinou chráněnou cestu), je přesměrován na login.
- [ ] **28.** Volání `/api/cron/close-voting` bez `Authorization` headeru vrátí `401 Unauthorized`.
- [ ] **29.** Volání `/api/report` bez správného `REPORT_SECRET` vrátí `401 Unauthorized`.

**Celkem: 29 checklistových bodů**

---

## 9. Rollback postup

### 9.1 Rollback deploye (kódová změna)

Pokud nový deploy způsobil regresi nebo chybu:

**Varianta A — Vercel instant rollback (nejrychlejší):**

1. Vercel Dashboard → váš projekt → **Deployments**.
2. Najdi poslední funkční deployment (zelený, předchozí).
3. Klikni na tři tečky (`...`) → **Promote to Production**.
4. Vercel okamžitě přepne produkci na starý deployment bez rebuild — trvá ~10 sekund.

**Varianta B — Git revert:**

```bash
git revert HEAD           # vytvoří revert commit
git push origin main      # Vercel automaticky deployuje revert
```

Vhodné pokud chceš mít clean Git historii s dokumentovaným revertem.

### 9.2 Rollback DB schématu

DB rollback je rizikovější než kódový rollback. Postup závisí na typu změny:

**Přidaný sloupec (nejjednodušší):**
```sql
-- Spusť v Neon SQL Editor na main branch
ALTER TABLE nazev_tabulky DROP COLUMN IF EXISTS novy_sloupec;
```

**Přidaná tabulka:**
```sql
DROP TABLE IF EXISTS nova_tabulka;
```

**Změna datového typu (riziková — data mohou být ztracena):**
- Nejprve rollbackni kód (viz 9.1).
- Pak konzultuj, zda data v novém formátu lze převést zpět.
- Pokud ne, obnov ze zálohy (viz 9.3).

> **Pravidlo:** Vždy nejprve rollbackni kód, pak teprve DB — starý kód musí fungovat s aktuálním DB stavem.

### 9.3 Obnova ze zálohy (Neon Point-in-Time Recovery)

Neon automaticky zálohuje data. Na free tier je dostupná obnova (Point-in-Time Recovery):

1. Neon Dashboard → váš projekt → záložka **Branches**.
2. Klikni **Restore** u `main` branch.
3. Vyber časový bod před problematickým deployem.
4. Neon vytvoří novou branch s obnoveným stavem.
5. Ověř data na nové branch.
6. Pokud data jsou správně, přejmenuj branch nebo překopíruj data.

> Na free tier je PITR dostupná s omezením — zkontroluj aktuální podmínky na neon.tech/docs.

### 9.4 Nouzový postup při totálním výpadku

Pokud aplikace nereaguje a Vercel ani Neon rollback nepomáhá:

1. Vercel Dashboard → **Settings → General → Pause Project** — dočasně pozastaví provoz.
2. Diagnostikuj v Vercel Logs (runtime) a Neon Dashboard.
3. Oprav problém lokálně, otestuj, pak obnovte project a deploy.

---

## 10. Free tier limity — přehled

| Služba | Limit | Náš dopad | Akce při překročení |
|---|---|---|---|
| **Vercel Hobby** | 10 s serverless timeout | Report může trvat déle při 40+ uživatelích | Async odesílání; nebo Vercel Pro upgrade ($20/měs) |
| **Vercel Hobby** | 12 serverless functions | Jsme pod limitem (~7–9) | Konsolidace routes pokud přidáme nové |
| **Vercel Hobby** | 100 GB bandwidth/měs | Zanedbatelné pro 40 uživatelů | — |
| **Vercel Hobby** | 1 Cron Job | Dostatečné pro 1 cron (close-voting) | Upgrade nebo external trigger (GitHub Actions) |
| **Neon Free** | 512 MB storage | Pro desítky členů a stovky hlasů zanedbatelné | Monitor přes Neon dashboard |
| **Neon Free** | 1 projekt | Dev a prod sdílí projekt přes branches | Neon Pro pokud potřeba izolovaný projekt |
| **Neon Free** | 10 branches | Dostatečné (main + dev) | Mažte nepoužívané branches |
| **Resend Free** | 100 emailů/den | Týdenní report ~40 emailů → OK | Resend paid ($20/měs) pokud frekvence stoupne |

---

*Dokument vytvořen: 2026-03-31 | Architect agent | iter-001 T-007*
