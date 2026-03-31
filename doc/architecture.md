# Architektura: BNI PF Hlasovaci aplikace
# iter-001 | T-001 | 2026-03-31

---

## Obsah
1. [Kontext a omezení](#1-kontext-a-omezení)
2. [Zvolená architektura — přehled](#2-zvolená-architektura--přehled)
3. [Struktura Next.js projektu](#3-struktura-nextjs-projektu)
4. [Auth flow](#4-auth-flow)
5. [DB schema — SQL DDL](#5-db-schema--sql-ddl)
6. [API vrstva](#6-api-vrstva)
7. [Vercel Hobby a Neon free tier limity](#7-vercel-hobby-a-neon-free-tier-limity)
8. [ASCII diagram komponent](#8-ascii-diagram-komponent)
9. [Architektonická alternativa](#9-architektonická-alternativa)
10. [Rizika a mitigace](#10-rizika-a-mitigace)
11. [Implementační doporučení](#11-implementační-doporučení)
12. [Review Response (iter-001 T-003)](#12-review-response-iter-001-t-003)
13. [Review Response — T-004](#13-review-response--t-004)

---

## 1. Kontext a omezení

### Projekt
Komunitní hlasovací webová aplikace pro BNI Plzeň. Členové píší poznámky k hostům a hlasují o jejich přijetí. Tři role: Admin, Moderator, Člen.

### Klíčová omezení prostředí
| Omezení | Hodnota | Dopad |
|---|---|---|
| Vercel Hobby serverless timeout | 10 s | Žádné dlouhé synchronní operace v API routes |
| Vercel Hobby max. serverless functions | 12 | Konsolidace routů — nelze mít route per resource |
| Neon free tier storage | 512 MB | Omezený objem dat; bez binárních příloh |
| Neon free tier compute | 0.5 CU (shared) | Pomalý cold start; nutný connection pooling |
| Neon free tier projects | 1 projekt | Sdílení jednoho projektu pro dev i prod není vhodné — nutno použít branches |
| Resend/SendGrid free | 100 emailů/den | Dostačující pro týdenní reporty |

### Předpoklady
- Počet členů: desítky (BNI chapter ~20–40 lidí), ne tisíce.
- Provoz je periodický — špička vždy v úterý–středu (hlasovací okno), jinak minimální.
- Bezpečnost: interní komunita, ne veřejná aplikace. Risk model je nízký až střední.
- Next.js 14+ s App Routerem je zvolená technologie (viz zadání).

---

## 2. Zvolená architektura — přehled

**Monolitická Next.js aplikace** s App Routerem. Veškerá logika v jednom repozitáři a deploymentu na Vercel. Databáze Neon PostgreSQL přes Neon serverless driver s connection poolingem (PgBouncer na straně Neon).

### Rozhodnutí: App Router vs Pages Router

**Zvoleno: App Router (Next.js 14+)**

Důvody:
- Server Components redukují JavaScript bundle — vhodné pro read-heavy stránky (archiv, výsledky hlasování).
- Server Actions umožňují formulářové operace bez explicitní API route — méně serverless funkcí (respektuje limit 12).
- Route Groups a Layouts usnadňují role-based UI bez duplicity.
- Pages Router bude deprecated.

Nevýhody App Routeru (akceptované):
- Vyšší kognitivní složitost (Server vs Client Components).
- Mladší ekosystém — méně příkladů pro specifické patterns.

### Rozhodnutí: Server Actions vs API Routes

**Pravidlo:** Server Actions pro operace iniciované z formulářů nebo UI (mutace). API Routes pro operace vyžadující HTTP sémantiku (webhooky, emailové spouštěče, magic link verify endpoint).

Toto rozdělení minimalizuje počet serverless funkcí a udržuje business logiku blízko UI.

---

## 3. Struktura Next.js projektu

```
bni-hlasovani/
├── app/
│   ├── layout.tsx                    # Root layout (fonty, metadata)
│   ├── page.tsx                      # Landing / redirect na /login nebo /dashboard
│   │
│   ├── (auth)/                       # Route group — bez sdíleného layoutu s app
│   │   ├── login/
│   │   │   └── page.tsx              # Přihlášení admin/moderator (email+heslo)
│   │   └── magic/
│   │       └── page.tsx              # Magic link verify (?token=...) → set session → redirect
│   │
│   ├── (app)/                        # Route group — vyžaduje přihlášení (middleware)
│   │   ├── layout.tsx                # App shell (navbar, role-aware nav)
│   │   ├── dashboard/
│   │   │   └── page.tsx              # Přehled aktivního hlasování + hosté
│   │   ├── guests/
│   │   │   ├── page.tsx              # Seznam hostů (admin/mod: editace; člen: jen read)
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx          # Detail hosta: poznámky + hlasování
│   │   │   └── new/
│   │   │       └── page.tsx          # Přidání hosta (admin/mod only)
│   │   ├── archive/
│   │   │   └── page.tsx              # Archiv hostů (časové okno / výběr schůzek + filtr)
│   │   ├── meetings/
│   │   │   ├── page.tsx              # Seznam schůzek (admin/mod: správa)
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Detail schůzky, start/close voting
│   │   └── admin/
│   │       ├── layout.tsx            # Guard: jen role=admin
│   │       ├── members/
│   │       │   └── page.tsx          # Správa členů + generování magic linků
│   │       └── categories/
│   │           └── page.tsx          # Správa kategorií
│   │
│   └── api/
│       ├── auth/
│       │   └── magic/
│       │       └── route.ts          # GET ?token= → verify → issue session cookie
│       ├── report/
│       │   └── route.ts             # POST → generuj a rozešli týdenní report (Resend)
│       └── cron/
│           └── close-voting/
│               └── route.ts         # POST (Vercel Cron Job) → auto-close voting ve středu 23:59
│
├── lib/
│   ├── db/
│   │   ├── client.ts                # Neon serverless driver + pool init
│   │   ├── queries/                 # SQL query funkce (per-domain)
│   │   │   ├── members.ts
│   │   │   ├── guests.ts
│   │   │   ├── meetings.ts
│   │   │   ├── notes.ts
│   │   │   └── votes.ts
│   │   └── schema.sql               # Referenční DDL (source of truth)
│   ├── auth/
│   │   ├── session.ts               # Session management (iron-session nebo jose)
│   │   ├── magic.ts                 # Magic token generování + validace
│   │   └── guards.ts                # requireRole(), requireAuth() helpers
│   ├── email/
│   │   └── resend.ts                # Odesílání emailů (týdenní report)
│   └── types.ts                     # Sdílené TypeScript typy (Member, Guest, Vote, ...)
│
├── components/
│   ├── ui/                          # Primitiva (Button, Input, Badge, ...) — shadcn/ui nebo vlastní
│   ├── guests/
│   │   ├── GuestCard.tsx
│   │   ├── GuestForm.tsx
│   │   └── VoteForm.tsx             # Client Component (interaktivní)
│   ├── notes/
│   │   └── NoteList.tsx
│   │   └── NoteForm.tsx             # Client Component
│   ├── meetings/
│   │   └── MeetingControls.tsx      # Start/close voting (admin/mod)
│   └── archive/
│       └── ArchiveFilters.tsx       # Časové okno / schůzky / kategorie
│
├── actions/                         # Server Actions (mutace)
│   ├── guests.ts                    # createGuest, updateGuest, updateGuestCategory
│   ├── notes.ts                     # createNote
│   ├── votes.ts                     # castVote
│   ├── meetings.ts                  # createMeeting, openVoting, closeVoting
│   ├── members.ts                   # createMember, generateMagicLink, revokeToken
│   └── categories.ts                # createCategory, renameCategory
│
├── middleware.ts                    # Auth guard: redirect nepřihlášených na /login
├── next.config.ts
├── package.json
└── .env.local                       # DATABASE_URL, SESSION_SECRET, RESEND_API_KEY, CRON_SECRET, REPORT_SECRET
```

### Klíčové konvence
- **Server Components** jsou výchozí — Client Components (`"use client"`) jen tam kde je potřeba interaktivita (formuláře s optimistic UI, realtime stav).
- **Server Actions** jsou v `actions/` jako samostatné soubory importované z Server nebo Client Components.
- **DB queries** jsou v `lib/db/queries/` — jen čisté funkce, žádná business logika mimo actions.
- **Middleware** (`middleware.ts`) chrání celý `(app)/` route group před nepřihlášenými uživateli.

---

## 4. Auth flow

### 4.1 Magic Link — všichni uživatelé (člen i admin/moderator)

> **T-004fix:** Magic link již není omezen na `role=member`. Admin i Moderator mohou mít
> magic link a přihlásit se přes něj pro hlasování. Hlasovací session se vydá pro
> libovolného člena s platným tokenem.

```
Admin generuje token (pro sebe nebo jiného člena)
        │
        ▼
rawToken = crypto.randomUUID()
hash = SHA-256(rawToken)
member.magic_token_hash = hash
member.token_expires_at = now+7d
                                   Uživatel klikne na odkaz
                                           │
                                           ▼
                              GET /api/auth/magic?token=<rawToken>
                                           │
                                           ▼
                                  hash = SHA-256(received token)
                                           │
                                           ▼
                              SELECT member WHERE
                              magic_token_hash = $1
                              AND token_expires_at > NOW()
                              AND token_used = FALSE
                                       │
                               ┌───────┴───────┐
                              OK             FAIL (expired/used/notfound)
                               │               │
                               ▼               ▼
                       SET token_used=TRUE  redirect /login?error=invalid_token
                       issue encrypted      (stejná zpráva pro všechny
                       session cookie       stavy — žádná user enumeration)
                       (member_id,
                        management_role,   ← NULL pro řadového člena
                        auth_method:       ← 'magic_link'
                        name)
                               │
                               ▼
                       redirect /dashboard
```

**Token vlastnosti:**
- UUID v4 generovaný na serveru (122 bitů entropie)
- V DB uložen pouze `SHA-256(token)` ve sloupci `magic_token_hash` — BLOCKER-002 fix
- Plaintext token se posílá výhradně v URL magic linku, nikdy se neukládá
- Pokud útočník získá přístup k DB (SQL injection, backup leak), získá jen SHA-256 hashe — tokeny jsou nepoužitelné
- Platnost: 7 dní (konfigurovatelné)
- Single-use: `token_used BOOLEAN DEFAULT FALSE`
- Po přihlášení: `token_used = TRUE` (token se NEMAŽE — pro audit trail)
- Chybové stavy: viz Graceful Fallback níže

**Auto-renewal (cron):**
- Denní cron (`POST /api/cron/renew-tokens`, chráněn `CRON_SECRET`) zkontroluje všechny členy kde `token_expires_at - NOW() < INTERVAL '1 day'`
- Pro každého takového člena automaticky vygeneruje nový token:
  1. `previous_token_hash = magic_token_hash` (záloha aktuálního)
  2. `previous_token_expires_at = token_expires_at`
  3. `magic_token_hash = SHA-256(newRawToken)`, `token_expires_at = NOW() + 7d`, `token_used = FALSE`
  4. Odešle email s novým magic linkem
- Člen dostane nový link automaticky den před vypršením, bez zásahu admina

**Graceful Fallback — starý link (max 1 cyklus zpět):**
Pokud člen klikne na starý magic link (z minulého týdne):

```
GET /api/auth/magic?token=<oldToken>
        │
        ▼
  hash = SHA-256(oldToken)
        │
        ▼
  1. Zkus aktuální token: SELECT WHERE magic_token_hash = hash AND token_expires_at > NOW() AND token_used = FALSE
     → NALEZEN → standardní přihlášení (viz výše)
        │
        ▼ (nenalezen)
  2. Zkus předchozí token: SELECT WHERE previous_token_hash = hash AND previous_token_expires_at IS NOT NULL
     → NALEZEN → člen použil starý link z minulého období
        │
        ▼
     a) Okamžitě vygeneruj nový token (pokud aktuální ještě neexistuje)
     b) Odešli email s novým magic linkem
     c) Redirect na /login?info=new_link_sent
        ("Tvůj odkaz vypršel. Nový link ti byl právě odeslán na email.")
        │
        ▼ (nenalezen ani v previous)
  3. Token není platný ani jako předchozí → redirect /login?error=invalid_token
     (generic error, žádná user enumeration)
```

**Pravidla pro previous_token:**
- Uchovává se POUZE jeden předchozí token (ne starší)
- `previous_token_hash` se nastaví jen při auto-renewal nebo manuální regeneraci adminem
- Fallback funguje i po expiraci `previous_token_expires_at` — kontroluje se jen existence záznamu, ne platnost (uživatel zjevně měl platný link minulý týden)
- Bezpečnost: fallback NEPŘIHLÁSÍ uživatele — pouze pošle nový link na registrovaný email. Žádný session cookie se nevydá na základě starého tokenu.

**SHA-256 implementace (pseudokód):**
```typescript
import { createHash } from 'crypto'

// Generování tokenu (generateMagicLink action):
const rawToken = crypto.randomUUID()
const tokenHash = createHash('sha256').update(rawToken).digest('hex')
// Uložit tokenHash do DB, poslat rawToken v URL

// Ověření tokenu (GET /api/auth/magic?token=):
const receivedHash = createHash('sha256').update(params.token).digest('hex')

// 1. Zkus aktuální token
const member = await db.query(
  'SELECT id, name, management_role FROM member WHERE magic_token_hash = $1 AND token_expires_at > NOW() AND token_used = FALSE',
  [receivedHash]
)
if (member) {
  // Standardní přihlášení → session cookie → redirect /dashboard
}

// 2. Graceful fallback — předchozí token (max 1 cyklus zpět)
const prevMember = await db.query(
  'SELECT id, name, email FROM member WHERE previous_token_hash = $1',
  [receivedHash]
)
if (prevMember) {
  // NEPŘIHLAŠUJ — pouze pošli nový link na email
  await generateAndSendNewMagicLink(prevMember.id)
  // redirect /login?info=new_link_sent
}

// 3. Neznámý token → generic error (žádná user enumeration)
// redirect /login?error=invalid_token
```

**Bezpečnostní poznámky:**
- Token se přenáší pouze přes HTTPS (Vercel zajišťuje TLS).
- Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`.
- Session payload je šifrován `iron-session` nebo `jose` (HS256 s `SESSION_SECRET`).
- Token se nikdy nezobrazuje na frontendu po přihlášení.
- UUID v4 prostor (2^122) vylučuje brute-force; timing attack přes DB index na hash je zanedbatelný.

### 4.2 Admin / Moderator — Email + Heslo (management přihlášení)

> **T-004fix:** Tento login vydává management session. Admin/Moderator se může přihlásit
> přes email+heslo i přes magic link — jsou to dvě různé session, obě platné.
> Email+heslo session slouží pro management funkce (vytvoření hosta, spuštění hlasování…).
> Magic link session slouží pro hlasování. Systém rozlišuje `auth_method` v session.

```
POST /login (Server Action)
        │
        ▼
SELECT member WHERE email = $1 AND management_role IN ('admin', 'moderator')
        │
        ▼
bcrypt.compare(password, member.password_hash)
        │
   ┌────┴────┐
  OK       FAIL
   │         │
   ▼         ▼
issue      redirect /login?error=invalid
session
cookie
(member_id,
 management_role,   ← 'admin' nebo 'moderator'
 auth_method:       ← 'password'
 name)
   │
   ▼
redirect /dashboard
```

**Poznámky:**
- Hesla hashována `bcrypt` (cost factor 12).
- Řadoví členové (`management_role IS NULL`) nemají `password_hash` — sloupec je NULL-able.
- Rate limiting: implementovat přes Vercel Edge Config nebo jednoduchý IP-based counter v DB (viz rizika).
- Admin/Moderator může mít obě session aktivní (v různých browserech nebo záložkách) — každá má jiný `auth_method` a jiný scope.

### 4.3 Session Management

**Knihovna:** `iron-session` (jednoduché, bez externího store, šifrovaný JWT v cookie)

Session payload (aktualizováno v T-004fix):
```typescript
interface SessionData {
  memberId: string;
  managementRole: 'admin' | 'moderator' | null;  // null = řadový člen
  authMethod: 'magic_link' | 'password';
  name: string;
}
```

**Lifetime:**
- Magic link session: 7 dní (= délka platnosti magic linku)
- Password session (management): 8 hodin

**SUGGESTION-001 — session vs. weekly cyklus:** Session lifetime pro magic link session je 7 dní. Původních 24 hodin bylo příliš krátké pro weekly BNI cyklus — člen přihlášený v pondělí by musel žádat admina o nový magic link před středečním hlasováním. Iron-session nepodporuje sliding window nativně; 7denní absolutní lifetime je dostatečné a bezpečné pro interní komunitu (low-risk threat model).

**Middleware guard** (`middleware.ts`):
- Veškeré cesty pod `/(app)/` vyžadují platnou session.
- Cesty pod `/admin/` navíc vyžadují `session.managementRole === 'admin'`.
- Management operace (přidat hosta, spustit hlasování…) vyžadují `session.managementRole IN ('admin', 'moderator')`.
- Hlasování (`castVote`) vyžaduje pouze platnou session (libovolný `auth_method`, libovolný `managementRole`).

### 4.4 Role-Based Access Control (RBAC)

> **T-004fix:** Admin a Moderator jsou také členové BNI — mají magic link (hlasování)
> i email+heslo (management). Sloupec `management_role` určuje management oprávnění;
> přítomnost `magic_token_hash` určuje schopnost hlasovat přes magic link.

| Operace | Admin | Moderator | Člen (bez management_role) |
|---|---|---|---|
| Přihlášení — email+heslo (management) | ✓ | ✓ | — |
| Přihlášení — magic link (hlasování) | ✓ | ✓ | ✓ |
| Přidat hosta | ✓ | ✓ | — |
| Změnit kategorii hosta | ✓ | ✓ | — |
| Přidat kategorii | ✓ | ✓ | — |
| Spustit hlasování | ✓ | ✓ | — |
| Uzavřít hlasování | ✓ | ✓ | — |
| Hlasovat | ✓ | ✓ | ✓ |
| Psát poznámky | ✓ | ✓ | ✓ |
| Generovat magic linky | ✓ | — | — |
| Spravovat členy | ✓ | — | — |
| Vidět report | ✓ | ✓ | — |
| Vidět archiv | ✓ | ✓ | ✓ |

**Poznámky k RBAC:**
- "Člen (bez management_role)" = řadový člen BNI; `management_role IS NULL`.
- Admin a Moderator mají `management_role = 'admin'` nebo `'moderator'` a zároveň mohou mít magic link.
- Hlasovací oprávnění (`can_vote`) = přihlášený přes magic link NEBO management session uživatele s libovolnou hodnotou `management_role` (nebo NULL) — klíčová podmínka je platná session, ne role.
- Management operace (přidat hosta, spustit hlasování, …) = session musí mít `management_role IN ('admin', 'moderator')`.

RBAC se vynucuje na dvou úrovních:
1. **Middleware** — redirect nepřihlášených a neautorizovaných.
2. **Server Actions / API Routes** — explicitní `requireManagementRole()` nebo `requireAuth()` check na začátku každé akce.

---

## 5. DB schema — SQL DDL

```sql
-- ============================================================
-- BNI Hlasovani – PostgreSQL Schema
-- Neon free tier: 512 MB, max 100 connections (doporučeno 20)
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- pro gen_random_uuid()

-- ============================================================
-- CATEGORY
-- ============================================================
CREATE TABLE category (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT category_name_unique UNIQUE (name)
);

-- ============================================================
-- MEMBER
-- T-004fix: Sloupec `role` nahrazen sloupcem `management_role` (nullable).
-- Všichni záznamy jsou "member" identity (mohou hlasovat přes magic link).
-- management_role určuje POUZE management oprávnění (přidání hosta, spuštění
-- hlasování, správa členů…). NULL = řadový člen BNI bez management oprávnění.
-- Admin a Moderator mohou mít BOTH: password_hash (pro management login)
-- I magic_token_hash (pro hlasování přes magic link).
-- ============================================================
CREATE TABLE member (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT        NOT NULL,
    -- email je povinný pro admin/moderator (kvůli password přihlášení a reportům),
    -- volitelný pro řadové členy (magic link nepotřebuje email — URL se předá přímo)
    email            TEXT,
    -- password_hash: vyplněno pouze pro management_role IN ('admin', 'moderator')
    password_hash    TEXT,
    -- management_role: NULL = řadový člen; 'admin'/'moderator' = management oprávnění
    management_role  TEXT        CHECK (management_role IN ('admin', 'moderator')),
    -- magic_token_hash: SHA-256(rawToken), může být vyplněn pro KOHOKOLIV (včetně admin/mod)
    -- BLOCKER-002 fix: ukládáme SHA-256 hash tokenu, nikdy plaintext
    magic_token_hash          TEXT        UNIQUE,
    token_expires_at          TIMESTAMPTZ,
    token_used                BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Předchozí token — graceful fallback pro členy kteří použijí starý link (max 1 cyklus zpět)
    previous_token_hash       TEXT,
    previous_token_expires_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Admin a Moderator MUSÍ mít email a password_hash (pro management login)
    CONSTRAINT member_management_requires_credentials
        CHECK (
            management_role IS NULL
            OR (email IS NOT NULL AND password_hash IS NOT NULL)
        ),
    -- SUGGESTION-002 fix: UNIQUE constraint na email
    CONSTRAINT member_email_unique UNIQUE (email)
);

CREATE INDEX idx_member_magic_token_hash ON member (magic_token_hash)
    WHERE magic_token_hash IS NOT NULL;

CREATE INDEX idx_member_email ON member (email)
    WHERE email IS NOT NULL;

CREATE INDEX idx_member_management_role ON member (management_role)
    WHERE management_role IS NOT NULL;

-- ============================================================
-- GUEST
-- ============================================================
CREATE TABLE guest (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    description TEXT,
    category_id UUID        REFERENCES category(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  UUID        REFERENCES member(id) ON DELETE SET NULL
);

CREATE INDEX idx_guest_category ON guest (category_id);
CREATE INDEX idx_guest_created_at ON guest (created_at DESC);

-- ============================================================
-- MEETING
-- ============================================================
CREATE TABLE meeting (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    date              DATE        NOT NULL UNIQUE,
    voting_open_at    TIMESTAMPTZ,
    voting_closes_at  TIMESTAMPTZ,
    status            TEXT        NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'voting', 'closed')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT meeting_voting_window_valid
        CHECK (
            voting_open_at IS NULL
            OR voting_closes_at IS NULL
            OR voting_open_at < voting_closes_at
        )
);

CREATE INDEX idx_meeting_date ON meeting (date DESC);
CREATE INDEX idx_meeting_status ON meeting (status);

-- ============================================================
-- MEETING_GUEST  (M:N – host muze byt ve vice schůzkách)
-- ============================================================
CREATE TABLE meeting_guest (
    meeting_id  UUID    NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
    guest_id    UUID    NOT NULL REFERENCES guest(id) ON DELETE CASCADE,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (meeting_id, guest_id)
);

CREATE INDEX idx_meeting_guest_guest ON meeting_guest (guest_id);

-- ============================================================
-- NOTE
-- ============================================================
CREATE TABLE note (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id   UUID        REFERENCES member(id) ON DELETE SET NULL,
    guest_id    UUID        NOT NULL REFERENCES guest(id) ON DELETE CASCADE,
    text        TEXT        NOT NULL CHECK (char_length(text) > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- BEZ vazby na meeting (dle zadání)
    -- member_id SET NULL: poznámky jsou anonymní log a přežijí smazání člena
);

CREATE INDEX idx_note_guest ON note (guest_id);
CREATE INDEX idx_note_member ON note (member_id);
CREATE INDEX idx_note_created_at ON note (created_at DESC);

-- ============================================================
-- VOTE
-- ============================================================
CREATE TABLE vote (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id   UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    guest_id    UUID        NOT NULL REFERENCES guest(id) ON DELETE CASCADE,
    meeting_id  UUID        NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
    value       TEXT        NOT NULL CHECK (value IN ('up', 'neutral', 'down')),
    reason      TEXT,       -- povinný pokud value = 'down'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vote_unique_per_member_guest_meeting
        UNIQUE (member_id, guest_id, meeting_id),
    CONSTRAINT vote_reason_required_for_down
        CHECK (value != 'down' OR (reason IS NOT NULL AND char_length(reason) > 0))
);

CREATE INDEX idx_vote_guest_meeting ON vote (guest_id, meeting_id);
CREATE INDEX idx_vote_member ON vote (member_id);
CREATE INDEX idx_vote_meeting ON vote (meeting_id);

-- ============================================================
-- VOTE IMMUTABILITY — BLOCKER-003 fix
-- Trigger zabrání vložení hlasu pokud schůzka není ve stavu
-- 'voting' nebo pokud hlasovací okno již vypršelo.
-- Aplikační vrstva (castVote action) provádí stejný check —
-- trigger je druhá linie obrany pro případy race condition,
-- přímého přístupu k DB nebo bugu v aplikaci.
-- ============================================================
CREATE OR REPLACE FUNCTION check_meeting_voting_open()
RETURNS TRIGGER AS $$
DECLARE
  m_status TEXT;
  m_closes TIMESTAMPTZ;
BEGIN
  SELECT status, voting_closes_at INTO m_status, m_closes
  FROM meeting WHERE id = NEW.meeting_id;
  IF m_status != 'voting' OR (m_closes IS NOT NULL AND NOW() > m_closes) THEN
    RAISE EXCEPTION 'Voting is not open for this meeting (status=%, closes=%)', m_status, m_closes;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vote_meeting_open_check
  BEFORE INSERT ON vote
  FOR EACH ROW EXECUTE FUNCTION check_meeting_voting_open();
```

### Poznámky k schématu
- `UUID` místo `SERIAL` — bezpečnější pro API (neodhaluje počty záznamů), kompatibilní s Neon.
- `TIMESTAMPTZ` pro všechny časové sloupce — správná práce s časovými pásmy (hlasování se zavírá "ve středu 23:59" — nutno specifikovat timezone při otevření).
- Constraint `vote_reason_required_for_down` vynucuje povinný důvod přímo v DB — druhá linie obrany za validací na serveru.
- `ON DELETE CASCADE` na `vote` — smazání člena smaže jeho hlasy (GDPR-friendly).
- `ON DELETE SET NULL` na `note.member_id` — poznámky jsou anonymní log a přežijí smazání člena (member_id = NULL).
- `ON DELETE SET NULL` na `guest.category_id` — smazání kategorie neodstraní hosta.
- Anonymizace poznámek v zadání = `member_id` se neexponuje na frontendu. DB uchovává vazbu pro případný audit.
- **SUGGESTION-004 — smazání člena a poznámky:** **Rozhodnutí (T-004 human review):** `note.member_id ON DELETE SET NULL` — poznámky jsou anonymní log a musí přežít smazání člena. Po smazání člena zůstane text poznámky zachován s `member_id = NULL` (plně anonymní záznam). Poznámky jsou již na frontendu anonymizované, takže NULL member_id nenaruší žádnou funkci.

---

## 6. API vrstva

### Pravidlo výběru

| Situace | Použij |
|---|---|
| Formulář, tlačítko, mutace z UI | **Server Action** |
| Webhook nebo external trigger | **API Route** |
| Cron job (Vercel Cron) | **API Route** (POST s tajným tokenem) |
| Magic link verify (GET s tokenem) | **API Route** (GET, musí být URL-addressable) |
| Týdenní report (ruční spuštění i cron) | **API Route** |

### Server Actions (mutace)

```
actions/guests.ts
  - createGuest(data)        → INSERT guest; INSERT meeting_guest
  - updateGuest(id, data)    → UPDATE guest SET name, description
  - updateGuestCategory(id, categoryId) → UPDATE guest SET category_id

actions/notes.ts
  - createNote(guestId, text) → INSERT note (member_id z session)

actions/votes.ts
  - castVote(guestId, meetingId, value, reason?)
      → requireAuth()        ← T-004fix: stačí platná session, JAKÁKOLIV role
      → CHECK meeting.status = 'voting' AND NOW() < meeting.voting_closes_at
      → CHECK existující vote neexistuje
      → INSERT vote

actions/meetings.ts
  - createMeeting(date)      → requireManagementRole(['admin','moderator']) → INSERT meeting (status='draft')
  - addGuestToMeeting(meetingId, guestId) → requireManagementRole(['admin','moderator']) → INSERT meeting_guest
  - openVoting(meetingId)    → requireManagementRole(['admin','moderator'])
                               → UPDATE meeting SET status='voting', voting_open_at=NOW(),
                               voting_closes_at='next Wednesday 23:59 in Europe/Prague'
  - closeVoting(meetingId)   → requireManagementRole(['admin','moderator']) → UPDATE meeting SET status='closed'

actions/members.ts
  - createMember(name, managementRole?) → requireManagementRole(['admin']) → INSERT member
  - generateMagicLink(memberId)         → requireManagementRole(['admin'])
                                           → rawToken = uuid_v4(); hash = SHA-256(rawToken)
                                           → UPDATE member SET magic_token_hash=hash, token_expires_at, token_used=FALSE
                                           → RETURN full magic link URL (obsahuje rawToken, nikdy hash)
                                           → T-004fix: funguje pro KOHOKOLIV (member_id bez omezení role)
  - revokeToken(memberId)    → requireManagementRole(['admin']) → UPDATE member SET token_used=TRUE

actions/categories.ts
  - createCategory(name)     → INSERT category
  - renameCategory(id, name) → UPDATE category SET name
```

### API Routes (HTTP endpoints)

```
GET  /api/auth/magic?token=<uuid>
  → Verify magic token → issue session → redirect /dashboard
  → Error: redirect /login?error=invalid_token (stejná zpráva pro všechny
    chybové stavy — nerozlišovat "token neexistuje" vs. "token použit/expirován",
    aby se zabránilo user enumeration)

POST /api/report
  Headers: Authorization: Bearer REPORT_SECRET (nebo platná admin session)
  Server-side ověření (stejný pattern jako CRON_SECRET):
      const authHeader = request.headers.get('authorization')
      if (authHeader !== `Bearer ${process.env.REPORT_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }
  → Sestaví report ze všech uzavřených schůzek (nebo konkrétní meeting_id)
  → Odešle email přes Resend na všechny admin+moderator
  → Response: { sent: number, emails: string[] }

POST /api/cron/close-voting
  Headers: Authorization: Bearer CRON_SECRET
  → Server-side ověření tokenu (BLOCKER-001 fix):
      const authHeader = request.headers.get('authorization')
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }
  → Najde meetings kde status='voting' AND voting_closes_at < NOW()
  → UPDATE status='closed'
  → Spustí sestavení a odeslání reportu
  Vercel Cron: "0 23 * * 3"  (středa 23:00 UTC = středa 00:00 CET v zimě / 01:00 CEST v létě)
  Timezone poznámka: cron je nastaven konzervativně na 23:00 UTC; samotný check
  používá voting_closes_at (TIMESTAMPTZ uložený v UTC z Europe/Prague) jako zdroj
  pravdy — i kdyby cron proběhl o hodinu dřív nebo později, uzavřou se jen ta
  hlasování kde NOW() > voting_closes_at.
```

### Serverless function count (Vercel Hobby limit = 12)

| Route | Počet |
|---|---|
| `/api/auth/magic/route.ts` | 1 |
| `/api/report/route.ts` | 1 |
| `/api/cron/close-voting/route.ts` | 1 |
| Server Actions (bundled per page segment) | ~4–6 |
| **Celkem odhadovaný počet** | **~7–9** |

Server Actions se na Vercelu nesčítají jako samostatné funkce — jsou bundlované do page segmentů. Číslo 12 platí pro explicitní `/api/route.ts` soubory + page segmenty s runtime logikou. Design je bezpečně pod limitem.

### Data fetching (čtení) — Server Components

Čtecí operace nejsou Server Actions ani API Routes — jsou přímé DB queries volané v Server Components:

```typescript
// app/(app)/guests/[id]/page.tsx
import { getGuestWithNotes } from '@/lib/db/queries/guests'
import { getVotesForGuest } from '@/lib/db/queries/votes'

export default async function GuestPage({ params }) {
  const guest = await getGuestWithNotes(params.id)
  const votes = await getVotesForGuest(params.id, activeMeetingId)
  return <GuestDetail guest={guest} votes={votes} />
}
```

Toto eliminuje zbytečné API round-tripy pro read-only data a snižuje počet serverless funkcí.

---

## 7. Vercel Hobby a Neon free tier limity

### Vercel Hobby

| Limit | Hodnota | Náš dopad | Mitigace |
|---|---|---|---|
| Serverless function timeout | 10 s | Týdenní report může být pomalý pokud je hodně hlasů | Async odesílání (fire-and-forget) nebo Vercel Queue (není na Hobby) → report se sestavuje synchronně, ale Resend API je rychlé |
| Max serverless functions | 12 | Viz sekce 6 — jsme pod limitem | Konsolidace routes, Server Actions |
| Bandwidth | 100 GB/měsíc | Zanedbatelné pro desítky uživatelů | — |
| Build minutes | 6000 min/měsíc | Dostačující | — |
| Cron Jobs | 1 job na Hobby | Dostatečné pro close-voting | Jeden cron, jedna route |
| Edge Config | 1 store | Není nutné pro MVP | — |
| Deployment regions | 1 (iad1 default) | Latence pro CZ uživatele ~80–120 ms | Akceptovatelné; volitelně nastavit `fra1` ve vercel.json |

**Klíčové omezení:** Vercel Hobby má pouze **1 Cron Job**. Pokud v budoucnu bude potřeba více automatických úloh, je nutný upgrade nebo vlastní cron logika (napr. external trigger přes GitHub Actions).

### Neon Free Tier

| Limit | Hodnota | Náš dopad | Mitigace |
|---|---|---|---|
| Storage | 512 MB | Pro desítky členů a stovky hlasů zanedbatelné; 1 hlas ~ 200 B | Monitor přes Neon dashboard |
| Compute | 0.5 CU (shared) | Cold start 1–3 s po idle | Connection pooling přes Neon's built-in PgBouncer; serverless driver |
| Branches | 10 | Dostatečné pro dev/staging/prod | Použít Neon branch pro development |
| Max connections | 100 (pool) | Serverless = každý request nový connection bez pool → pool je kritický | Neon serverless driver automaticky pooluje; nastavit `max: 10` v pool konfiguraci |
| Projects | 1 | Dev a prod sdílí projekt, ale různé branches | Neon branches = izolované DB environments |

**Connection pooling konfigurace:**

```typescript
// lib/db/client.ts
import { neon, neonConfig } from '@neondatabase/serverless'
import { Pool } from '@neondatabase/serverless'

neonConfig.fetchConnectionCache = true  // cache connections přes fetch

// Pro jednoduché queries (Server Components, Server Actions)
export const sql = neon(process.env.DATABASE_URL!)

// Pro transakce (nutné pro multi-step operace)
export const pool = new Pool({ connectionString: process.env.DATABASE_URL!, max: 10 })
```

**DATABASE_URL** musí ukazovat na **Neon connection pooler endpoint** (port 5432 na `pooler.*.neon.tech`), ne na přímé připojení — to je kritické pro serverless.

---

## 8. ASCII diagram komponent

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          BROWSER (Client)                               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Next.js App (Vercel Serverless)                                │   │
│  │                                                                 │   │
│  │  ┌──────────────────────────────────────────────────────────┐  │   │
│  │  │  middleware.ts                                           │  │   │
│  │  │  ─ session check ─ role guard ─ redirect               │  │   │
│  │  └────────────────────────┬─────────────────────────────────┘  │   │
│  │                           │                                     │   │
│  │         ┌─────────────────┼──────────────────────┐             │   │
│  │         ▼                 ▼                      ▼             │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │   │
│  │  │  (auth)/     │  │   (app)/     │  │    api/              │  │   │
│  │  │  login       │  │  layout.tsx  │  │                      │  │   │
│  │  │  magic       │  │  (app shell) │  │  auth/magic/route.ts │  │   │
│  │  └──────────────┘  │              │  │  report/route.ts     │  │   │
│  │                    │  dashboard   │  │  cron/close-voting/  │  │   │
│  │                    │  guests/     │  │    route.ts          │  │   │
│  │                    │    [id]/     │  └──────────┬───────────┘  │   │
│  │                    │  archive/    │             │              │   │
│  │                    │  meetings/   │             │              │   │
│  │                    │  admin/      │             │              │   │
│  │                    └──────┬───────┘             │              │   │
│  │                           │                     │              │   │
│  │         ┌─────────────────┼─────────────────────┘             │   │
│  │         ▼                 ▼                                    │   │
│  │  ┌──────────────────────────────────────────────────────────┐  │   │
│  │  │  actions/  (Server Actions — mutace)                    │  │   │
│  │  │  guests.ts | notes.ts | votes.ts | meetings.ts           │  │   │
│  │  │  members.ts | categories.ts                              │  │   │
│  │  └───────────────────────────┬──────────────────────────────┘  │   │
│  │                              │                                  │   │
│  │  ┌──────────────────────────────────────────────────────────┐  │   │
│  │  │  lib/                                                   │  │   │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │  │   │
│  │  │  │ db/      │  │ auth/    │  │ email/   │              │  │   │
│  │  │  │ client   │  │ session  │  │ resend   │              │  │   │
│  │  │  │ queries/ │  │ magic    │  └────┬─────┘              │  │   │
│  │  │  └────┬─────┘  │ guards   │       │                    │  │   │
│  │  │       │        └──────────┘       │                    │  │   │
│  │  └───────┼────────────────────────────┼────────────────────┘  │   │
│  └──────────┼────────────────────────────┼──────────────────────┘   │
│             │                            │                           │
└─────────────┼────────────────────────────┼───────────────────────────┘
              │                            │
              ▼                            ▼
   ┌──────────────────┐         ┌─────────────────────┐
   │  Neon PostgreSQL │         │  Resend (Email API)  │
   │  (free tier)     │         │  (free tier)         │
   │  PgBouncer pool  │         └─────────────────────┘
   └──────────────────┘

Vercel Cron (1x týdně, středa 23:00 UTC):
  ─────────────────────────────────────────►  POST /api/cron/close-voting
                                                      │
                                               close voting + trigger report
```

### Datový tok — hlasování

> **T-004fix:** Hlasovat může libovolný přihlášený uživatel (admin, moderator i člen).
> Podmínkou je platná session — `auth_method` ani `management_role` se neověřuje.

```
Libovolný přihlášený uživatel (browser)
     │
     │  [Server Action: castVote]
     ▼
Server Action (actions/votes.ts)
     │  1. requireAuth()       ← T-004fix: stačí platná session (any role)
     │  2. CHECK meeting.status = 'voting'
     │  3. CHECK NOW() < meeting.voting_closes_at
     │  4. CHECK no existing vote (UNIQUE constraint + aplikační check)
     │  5. INSERT vote
     ▼
Neon DB (vote table)
     │
     ▼
Server revalidates page cache → nová data v Server Component
```

---

## 9. Architektonická alternativa

### Alternativa A: Next.js Pages Router + tRPC

**Popis:** Místo App Routeru použít Pages Router s tRPC pro type-safe API vrstvu. Server Actions by neexistovaly — vše přes tRPC procedures.

**Výhody:**
- Zralejší ekosystém, více příkladů a tutoriálů.
- tRPC dává automatické TypeScript typy pro frontend i backend bez codegen.
- Jednodušší mentální model (vše je "request → response").
- Snadnější testování (pure functions, žádné Server Component specifika).

**Nevýhody:**
- tRPC přidává další dependency a boilerplate (router, context, provider).
- Pages Router je na ústupu — Vercel a Next.js tým investuje do App Routeru.
- Každá tRPC procedure = API Route = počítá se do limitu 12 funkcí, pokud jsou v separátních souborech (nebo jeden catch-all `/api/trpc/[trpc].ts` = 1 funkce, ale timeout 10 s na všechny).
- Chybí Server Components → více client-side JavaScriptu → pomalejší initial load.

**Závěr:** Zamítnuto. Hlavní důvod: tRPC s Pages Routerem by vyžadoval buď jeden catch-all handler (single point of failure pro timeout) nebo mnoho separátních funkcí (blíží se limitu 12). App Router + Server Actions dává lepší fit pro Vercel Hobby limity.

---

### Alternativa B: Fullstack SPA (React + Hono/Express backend)

**Popis:** Separátní React SPA (Vite) + Node.js backend (Hono nebo Express) nasazený jako Vercel Serverless Function.

**Výhody:**
- Jasné oddělení frontend/backend.
- Backend lze snáze přenést na jiný hosting.
- Žádná Next.js specifická komplexnost.

**Nevýhody:**
- Dva projekty, dvě deploy pipeline, dvojí konfigurace.
- Vercel Hobby je optimalizovaný pro Next.js — SPA + backend = suboptimální.
- Ztráta Next.js výhod (SSR, file-based routing, image optimization).
- Výrazně více boilerplatu.

**Závěr:** Zamítnuto. Zvyšuje komplexnost bez přínosu pro tento use case. Aplikace je jednoduchá, tým pravděpodobně zná Next.js z ekosystému, přechod na SPA+backend by byl krok zpět.

---

## 10. Rizika a mitigace

| ID | Riziko | Pravděpodobnost | Dopad | Mitigace |
|---|---|---|---|---|
| R-001 | Magic link token úniku přes email forwarding nebo phishing | Střední | Vysoký | Single-use token, krátká platnost (7 dní), HTTPS only, revokace tokenu adminem |
| R-002 | Neon cold start způsobí timeout 10 s na Vercelu | Střední | Střední | Neon serverless driver + connection cache; `fetchConnectionCache=true`; keep-alive cron ping každých 5 minut (alternativa: Neon autoscaling) |
| R-003 | Překročení limitu 12 serverless functions | Nízká | Střední | Aktuální design je pod limitem (~7–9); nerozšiřovat API routes bez auditu počtu |
| R-004 | Hlasování zůstane otevřené přes střed polnoc (cron selhání) | Nízká | Střední | Double-check v Server Actions pro cast vote (`NOW() < voting_closes_at`); admin může zavřít manuálně; Vercel Cron alert via email při selhání |
| R-005 | Ztráta dat při smazání kategorie/člena | Nízká | Vysoký | `ON DELETE SET NULL` pro category a notes (poznámky = log); `ON DELETE CASCADE` pro votes; soft-delete jako alternativa (přidat `deleted_at`) |
| R-006 | Neon 512 MB storage přeplnění | Velmi nízká | Střední | Pro desítky členů zanedbatelné; archivace starých meetings přes `status=archived` bez mazání dat |
| R-007 | Session hijacking / CSRF | Nízká | Vysoký | `iron-session` cookie je HttpOnly+Secure; Server Actions mají built-in CSRF protection v Next.js 14+ |
| R-008 | Brute-force přihlášení admin/moderatora | Nízká | Vysoký | bcrypt cost 12; rate limiting na `/login` (Vercel Edge middleware nebo DB counter); lock-out po N neúspěšných pokusech |
| R-009 | Resend/SendGrid free tier limit (100 emailů/den) | Velmi nízká | Nízká | Týdenní report = 2–3 emaily týdně; daleko pod limitem |
| R-010 | Next.js App Router breaking changes | Nízká | Střední | Pinovat verzi v package.json; upgrade jen při plánované iteraci |

---

## 11. Implementační doporučení

### Prioritizace (MVP pořadí)
1. **DB schema + Neon setup** — základ pro vše ostatní
2. **Auth flow** — magic link + admin login + middleware
3. **Hosté + kategorie CRUD** — core data management
4. **Hlasování** — castVote + openVoting + closeVoting
5. **Poznámky** — jednoduchá featura
6. **Archiv** — read-only, komplex dotazy
7. **Týdenní report** — email odesílání
8. **Admin panel** — správa členů, magic link generování

### Technologická doporučení

| Vrstva | Doporučení | Důvod |
|---|---|---|
| Session | `iron-session` | Jednoduché, bez externího store, šifrované cookie |
| Password hashing | `bcryptjs` | Pure JS, žádné native binaries (Vercel kompatibilní) |
| DB client | `@neondatabase/serverless` | Optimalizováno pro serverless, pooling built-in |
| Email | `resend` (npm) | Jednodušší API než SendGrid, free tier dostačující |
| Validace | `zod` | Type-safe validace v Server Actions i na klientovi |
| UI komponenty | `shadcn/ui` | Copy-paste komponenty, bez runtime dependency |
| Datum/čas | `date-fns-tz` | Správné zpracování timezone (středa 23:59 Europe/Prague) |

### Kritické body implementace

1. **Timezone pro uzavření hlasování**: `voting_closes_at` musí být uloženo jako UTC timestamp vypočtený z `Europe/Prague` timezone. Použít `date-fns-tz` nebo `Temporal` API.

2. **Anonymizace poznámek**: `member_id` se nikdy neposílá na frontend. Query v `lib/db/queries/notes.ts` vrací pouze `text` a `created_at`, nikoli `member_id` nebo `member.name`.

3. **Vote immutability po uzavření**: Vynuceno na dvou úrovních:
   - **DB trigger** `vote_meeting_open_check` (BEFORE INSERT ON vote) — druhá linie obrany; odmítne INSERT pokud `meeting.status != 'voting'` nebo hlasovací okno vypršelo.
   - **Server Action** `castVote` — aplikační check (`meeting.status = 'voting'` AND `NOW() < meeting.voting_closes_at`) před INSERT; trigger je záloha pro race condition a přímý DB přístup.

4. **Magic link URL**: Formát `https://app.domain/magic?token=<uuid>`. Token v query parametru (ne v path) — méně pravděpodobné logování v serverech. Vercel automaticky HTTPS.

5. **Connection pooler URL**: `DATABASE_URL` musí být pooler URL (obsahuje `-pooler` v hostname nebo port 6543), ne přímé připojení. Přímé připojení pro Neon = pro migrační skripty v CI, ne pro runtime.

6. **Error handling strategie pro Server Actions (SUGGESTION-005):** Všechny mutující Server Actions vrací jednotný návratový typ:
   ```typescript
   type ActionResult<T = void> =
     | { success: true; data?: T }
     | { success: false; error: string }
   ```
   - Nikdy nepoužívat `throw` pro očekávané chyby (validace, neautorizovaný přístup) — vrátit `{ success: false, error }`.
   - `throw` / Next.js `redirect()` jen pro neočekávané systémové chyby (Neon down, atd.) — zachytit přes Error Boundary.
   - Na frontendu vždy ověřit `result.success` před zobrazením UI zprávy.
   - Tím je error handling konzistentní a testovatelný bez speciální infrastruktury.

---

## 12. Review Response (iter-001 T-003)

Tento dokument byl aktualizován na základě review report T-002 (2026-03-31).

### Opravené BLOCKERy

| ID | Problém | Řešení | Umístění v dokumentu |
|---|---|---|---|
| BLOCKER-001 | Chybějící server-side validace CRON_SECRET | Doplněn explicitní pseudokód ověření `Authorization: Bearer` headeru pro `/api/cron/close-voting` i `/api/report` | Sekce 6 — API Routes; sekce 3 — .env.local |
| BLOCKER-002 | Magic link token uložen plaintextem v DB | DDL přejmenován `magic_token` → `magic_token_hash TEXT`; auth flow popsán s SHA-256 hashing (generování i ověření); doplněn pseudokód implementace | Sekce 4.1, sekce 5 DDL |
| BLOCKER-003 | Vote immutability pouze aplikačně | Přidán PostgreSQL trigger `vote_meeting_open_check` (BEFORE INSERT ON vote) — second line of defense vedle aplikačního checku | Sekce 5 DDL, sekce 11 bod 3 |

### Adresované SUGGESTIONy

| ID | Problém | Řešení |
|---|---|---|
| SUGGESTION-001 | Session 24h příliš krátká pro weekly cyklus | Prodloužena na 7 dní pro členy s explicitním odůvodněním | Sekce 4.3 |
| SUGGESTION-002 | `member.email` bez UNIQUE constraint | Přidán `CONSTRAINT member_email_unique UNIQUE (email)` do DDL | Sekce 5 DDL |
| SUGGESTION-003 | Cron timezone nesprávný výpočet | Cron opraven na `"0 23 * * 3"` (středa 23:00 UTC); dokumentováno, že `voting_closes_at` je zdroj pravdy | Sekce 6 API Routes |
| SUGGESTION-004 | `ON DELETE CASCADE` způsobí ztrátu obsahu poznámek | Změněno na `ON DELETE SET NULL` — poznámky jsou anonymní log a přežijí smazání člena (rozhodnutí uživatele v T-004/T-008 review) | Sekce 5 — DDL + Poznámky k schématu |
| SUGGESTION-005 | Chybějící error handling strategie pro Server Actions | Doplněna standardní strategie `{ success: boolean, error?: string }` s pravidly pro throw vs. return | Sekce 11 bod 6 |

---

## 13. Review Response — T-004

**Datum:** 2026-03-31 | **Task:** T-004fix | **Agent:** architect

### Identifikovaný problém

Původní model měl `role TEXT NOT NULL CHECK (role IN ('admin', 'moderator', 'member'))` jako jediný atribut identity. Magic link byl nastaven jako `NULL pro admin/moderator` a RBAC tabulka explicitně zakazovala adminu/moderátorovi hlasovat. Přitom v BNI reálném světě jsou Admin a Moderator také členové BNI a mají právo hlasovat.

### Zvolen přístup: Varianta C — Rozšíření member tabulky

**Zdůvodnění výběru:**

Varianta C (rozšíření jednoho záznamu) byla zvolena z těchto důvodů:

| Kritérium | Varianta A (dual identity) | Varianta B (M:N) | Varianta C (rozšíření) — ZVOLENA |
|---|---|---|---|
| Složitost modelu | Střední (2 záznamy/uživatel) | Vysoká (3 tabulky, JOIN) | Nízká (1 záznam) |
| Složitost queries | Střední (JOIN linked_member) | Vysoká (M:N JOIN) | Nízká (přímý SELECT) |
| Integrity riziko | Střední (sync dvou záznamů) | Nízká | Nízká (DB constraint) |
| Audit trail | Komplikovaný (kdo je "hlavní"?) | Čistý | Čistý |
| Fit pro ~20–40 uživatelů | Overkill | Velký overkill | Ideální |
| Realizovatelnost v MVP | Ano | Ano (ale zbytečná práce) | Ano (minimální změny) |

**Proč ne Varianta A:** Dva záznamy pro stejného člověka způsobují duplicitu jména v seznamech, komplikují hlasovací statistiky (kdo hlasoval?) a zvyšují riziko nekonzistentního stavu (admin-záznam smažu, member-záznam zůstane). `linked_member_id` je hack, ne řešení.

**Proč ne Varianta B:** M:N `user ↔ role` s extra `user_auth` tabulkou je nadměrně komplexní pro doménu s třemi rolemi a desítkami uživatelů. Přidává 2–3 JOINy ke každému dotazu. Vercel Hobby a Neon free tier jsou omezené — zbytečná složitost queries zvyšuje latenci a risk cold start timeoutu.

### Provedené změny

#### DDL — member tabulka

| Sloupec | Původní stav | Nový stav | Důvod |
|---|---|---|---|
| `role` | `TEXT NOT NULL CHECK IN ('admin','moderator','member')` | **ODSTRANĚN** | Nahrazen dvěma oddělénými atributy |
| `management_role` | neexistoval | `TEXT NULL CHECK IN ('admin','moderator')` | Určuje POUZE management oprávnění; NULL = řadový člen |
| `magic_token_hash` | `NULL pro admin/moderator` | Nullable pro **kohokoliv** (odstraněno omezení) | Admin i Mod mohou mít magic link pro hlasování |
| `password_hash` | NULL pro `role=member` | NULL pro `management_role IS NULL` | Stejná logika, nový sloupec |
| Constraint `member_email_required_for_staff` | CHECK na `role IN ('admin','moderator')` | `member_management_requires_credentials` — CHECK na `management_role IS NOT NULL` | Opravená podmínka |
| Index na role | `idx_member_role ON member (role)` | `idx_member_management_role ON member (management_role) WHERE management_role IS NOT NULL` | Partial index — efektivnější |

#### Auth flow

| Část | Původní stav | Nový stav |
|---|---|---|
| Magic link query | `WHERE magic_token_hash = $1` (implicitně jen members) | Stejný SQL — ale nyní funguje pro kohokoliv, kdo má token |
| Session payload | `role: 'admin' \| 'moderator' \| 'member'` | `managementRole: 'admin' \| 'moderator' \| null` + `authMethod: 'magic_link' \| 'password'` |
| Email+heslo query | `WHERE email = $1 AND role IN ('admin', 'moderator')` | `WHERE email = $1 AND management_role IN ('admin', 'moderator')` |
| Middleware admin guard | `role === 'admin'` | `managementRole === 'admin'` |

#### RBAC tabulka

| Operace | Původně | Nově |
|---|---|---|
| Přihlášení magic link | Pouze člen | Všichni (admin, mod, člen) |
| Hlasovat | Pouze člen | Všichni přihlášení (requireAuth) |
| Psát poznámky | Pouze člen | Všichni přihlášení (requireAuth) |

#### Server Actions

| Action | Původně | Nově |
|---|---|---|
| `castVote` | `requireRole('member')` | `requireAuth()` |
| `createNote` | `requireRole('member')` | `requireAuth()` |
| `generateMagicLink` | generuje token jen pro `role=member` záznamy | generuje token pro libovolný `member_id` |
| `createMember` | parametr `role` | parametr `managementRole?` (nullable) |

### Koherence dokumentu — ověření

- [x] DDL member tabulky přepsáno (sekce 5)
- [x] Auth flow 4.1 aktualizován (magic link pro všechny)
- [x] Auth flow 4.2 aktualizován (email+heslo query na management_role)
- [x] Session payload aktualizován (sekce 4.3)
- [x] RBAC tabulka aktualizována (sekce 4.4)
- [x] Server Actions aktualizovány (sekce 6)
- [x] Datový tok hlasování aktualizován (sekce 8)
- [x] Obsah dokumentu aktualizován (sekce 0 — Obsah)

### Zbývající součásti bez změny

Ostatní tabulky (`guest`, `meeting`, `meeting_guest`, `note`, `vote`, `category`) a jejich DDL zůstávají beze změny — oprava se dotkla pouze `member` tabulky a auth/RBAC vrstvy. `vote.member_id` FK stále odkazuje na `member.id` — admin/mod nyní mají platnou member identitu pro hlasování bez potřeby duplicitního záznamu.

---

*Dokument sestaven: 2026-03-31 | Agent: architect | Task: T-001 | Iter: iter-001*
*Aktualizováno: 2026-03-31 | Agent: architect | Task: T-003 | Iter: iter-001 — review fixes*
*Aktualizováno: 2026-03-31 | Agent: architect | Task: T-004fix | Iter: iter-001 — dual auth fix (Varianta C)*
