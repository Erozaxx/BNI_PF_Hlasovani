# Requirements: BNI PF Hlasovací aplikace
# iter-001 | T-005 | 2026-03-31

---

## Obsah

1. [Přehled a cíl](#1-přehled-a-cíl)
2. [Role uživatelů](#2-role-uživatelů)
3. [User Stories — Admin](#3-user-stories--admin)
4. [User Stories — Moderator](#4-user-stories--moderator)
5. [User Stories — Člen](#5-user-stories--člen)
6. [Acceptance Criteria — Autentizace](#6-acceptance-criteria--autentizace)
7. [Acceptance Criteria — Hosté a Kategorie](#7-acceptance-criteria--hosté-a-kategorie)
8. [Acceptance Criteria — Poznámky](#8-acceptance-criteria--poznámky)
9. [Acceptance Criteria — Hlasování](#9-acceptance-criteria--hlasování)
10. [Acceptance Criteria — Archiv](#10-acceptance-criteria--archiv)
11. [Acceptance Criteria — Týdenní report](#11-acceptance-criteria--týdenní-report)
12. [Edge Cases a hraniční scénáře](#12-edge-cases-a-hraniční-scénáře)
13. [MVP vs Later prioritizace](#13-mvp-vs-later-prioritizace)
14. [Závislosti mezi features](#14-závislosti-mezi-features)
15. [Otevřené otázky](#15-otevřené-otázky)
16. [Rizika a předpoklady](#16-rizika-a-předpoklady)

---

## 1. Přehled a cíl

**Aplikace:** Komunitní hlasovací webová aplikace pro BNI Plzeň.

**Cíl:** Umožnit členům komunity psát anonymní poznámky k hostům a hlasovat o jejich přijetí do skupiny. Výsledky jsou veřejné a jmenovité.

**Rozsah uživatelů:** ~20–40 členů BNI chapteru. Interní aplikace, ne veřejná.

**Klíčová architektonická rozhodnutí relevantní pro requirements:**
- **Dual auth model:** Admin i Moderator mohou mít magic link a hlasovat přes něj (stejně jako řadový člen). Admin-specifické funkce jsou dostupné jen při přihlášení přes email+heslo, nikoli přes magic link.
- **Anonymní poznámky:** Poznámka nese datum/čas, ale nikoli jméno autora.
- **Jmenovité výsledky hlasování:** Každý vidí kdo jak hlasoval (včetně Admin/Moderator).

---

## 2. Role uživatelů

| Role | Přihlašovací metoda | Hlasovací přístup | Správa systému |
|---|---|---|---|
| **Admin** | Email + heslo (primárně), nebo magic link (pro hlasování) | Ano (přes magic link) | Plná správa: členové, hosté, kategorie, schůzky, reporty |
| **Moderator** | Email + heslo (primárně), nebo magic link (pro hlasování) | Ano (přes magic link) | Hosté, kategorie, schůzky, reporty |
| **Člen** | Pouze magic link | Ano | Žádná |

> **Poznámka k dual auth:** Admin/Moderator, kteří chtějí hlasovat, musí použít magic link. Přihlášení přes email+heslo NEZAKLÁDÁ hlasovací oprávnění — jde o oddělené session.

---

## 3. User Stories — Admin

### Autentizace a správa členů

**US-A-01:** Jako Admin chci se přihlásit pomocí emailu a hesla, abych měl přístup k administrativním funkcím aplikace.

**US-A-02:** Jako Admin chci generovat unikátní magic link pro každého člena, abych mu mohl bezpečně předat přístup do aplikace bez nutnosti registrace.

**US-A-03:** Jako Admin chci přiřadit nebo odebrat magic link konkrétnímu členovi, abych mohl řídit přístup do aplikace (např. při odchodu člena).

**US-A-04:** Jako Admin chci vidět přehled všech členů a stav jejich magic linků (aktivní/použitý/expirovaný), abych měl kontrolu nad přístupy.

**US-A-05:** Jako Admin chci mít svůj vlastní magic link pro hlasování, abych mohl hlasovat jako řadový člen bez konfliktu s mou adminskou session.

### Hosté a kategorie

**US-A-06:** Jako Admin chci přidávat nové hosty (jméno, popis, obor), abych evidoval zájemce o členství.

**US-A-07:** Jako Admin chci upravit obor hosta i zpětně (po vytvoření záznamu), abych mohl opravit chybné zařazení.

**US-A-08:** Jako Admin chci přidávat nové kategorie (obory), abych mohl rozšiřovat nabídku oborů pro hosty.

**US-A-09:** Jako Admin chci přejmenovat existující kategorii, abych mohl udržet aktuální pojmenování oborů.

### Schůzky a hlasování

**US-A-10:** Jako Admin chci vytvořit novou schůzku a přiřadit k ní hosty, abych definoval, kdo je součástí daného hlasovacího kola.

**US-A-11:** Jako Admin chci manuálně spustit hlasování pro danou schůzku, abych zahájil hlasovací okno po čtvrteční schůzce.

**US-A-12:** Jako Admin chci manuálně uzavřít hlasování dříve než ve středu 23:59, pokud to situace vyžaduje.

**US-A-13:** Jako Admin chci vidět živé výsledky hlasování (kdo jak hlasoval), abych měl přehled o průběhu.

### Reporty

**US-A-14:** Jako Admin chci obdržet týdenní report emailem po uzavření hlasování, abych měl souhrn výsledků bez nutnosti přístupu do aplikace.

**US-A-15:** Jako Admin chci spustit generování reportu na vyžádání, abych mohl report získat i mimo standardní cyklus.

---

## 4. User Stories — Moderator

### Autentizace

**US-M-01:** Jako Moderator chci se přihlásit pomocí emailu a hesla, abych měl přístup k moderátorským funkcím aplikace.

**US-M-02:** Jako Moderator chci mít svůj vlastní magic link pro hlasování, abych mohl hlasovat jako řadový člen.

### Hosté a kategorie

**US-M-03:** Jako Moderator chci přidávat nové hosty (jméno, popis, obor), abych mohl evidovat zájemce o členství.

**US-M-04:** Jako Moderator chci upravit obor hosta i zpětně, abych mohl opravit chybné zařazení.

**US-M-05:** Jako Moderator chci přidávat nové kategorie, abych mohl rozšiřovat nabídku oborů.

**US-M-06:** Jako Moderator chci přejmenovat existující kategorii, abych udržel aktuální pojmenování.

### Schůzky a hlasování

**US-M-07:** Jako Moderator chci vytvořit novou schůzku a přiřadit k ní hosty, abych mohl připravit hlasovací kolo.

**US-M-08:** Jako Moderator chci manuálně spustit hlasování, abych zahájil hlasovací okno.

**US-M-09:** Jako Moderator chci vidět živé výsledky hlasování, abych měl přehled o průběhu.

### Reporty

**US-M-10:** Jako Moderator chci obdržet týdenní report emailem po uzavření hlasování, abych měl souhrn výsledků.

---

## 5. User Stories — Člen

### Autentizace

**US-C-01:** Jako Člen chci se přihlásit kliknutím na magic link, abych získal přístup do aplikace bez nutnosti pamatovat si heslo.

### Poznámky

**US-C-02:** Jako Člen chci napsat textovou poznámku k libovolnému hostu kdykoliv (i mimo hlasovací okno), abych sdílel svůj dojem ze setkání s hostem.

**US-C-03:** Jako Člen chci vidět všechny anonymní poznámky k hostovi (s datem a časem), abych si mohl přečíst zkušenosti ostatních členů.

### Hlasování

**US-C-04:** Jako Člen chci hlasovat o přijetí hosta (👍 / 😐 / 👎), abych vyjádřil svůj názor na jeho přijetí.

**US-C-05:** Jako Člen chci při volbě 👎 povinně uvést textový důvod, abych sdělil konkrétní výhradu.

**US-C-06:** Jako Člen chci vidět, že jsem již hlasoval o daném hostu, abych věděl, že můj hlas byl zaznamenán.

**US-C-07:** Jako Člen chci vidět výsledky hlasování po jeho uzavření (kdo jak hlasoval, včetně důvodů u 👎), abych viděl jak se komunita rozhodla.

### Archiv

**US-C-08:** Jako Člen chci prohlížet archiv hostů z libovolného časového období (výběr „od–do"), abych mohl zpětně dohledat informace o konkrétním hostu.

**US-C-09:** Jako Člen chci vybrat jednu nebo více konkrétních schůzek a zobrazit jejich hosty, abych mohl porovnat hosty z vybraných termínů.

**US-C-10:** Jako Člen chci filtrovat hosty v archivu podle kategorie (oboru), abych se zaměřil na relevantní hosty.

**US-C-11:** Jako Člen chci v archivu u každého hosta vidět anonymní poznámky a jmenovité výsledky hlasování, abych měl úplný obraz o každém hostu.

---

## 6. Acceptance Criteria — Autentizace

### Feature: Magic link přihlášení

**AC-AUTH-01: Generování magic linku (Admin)**
- Given: Admin je přihlášen přes email+heslo
- When: Admin vygeneruje magic link pro člena
- Then: Systém vytvoří unikátní token (SHA-256 hash), nastaví expiraci 7 dní od vytvoření, uloží k záznamu člena a zobrazí Adminovi odkaz k předání.

**AC-AUTH-02: Úspěšné přihlášení přes magic link**
- Given: Člen má platný, nepoužitý, neexpirovaný magic link
- When: Člen klikne na magic link
- Then: Systém ověří token, označí ho jako použitý (token_used = TRUE), vytvoří šifrovanou session cookie a přesměruje na /dashboard.

**AC-AUTH-03: Expirovaný magic link**
- Given: Magic link je starší než 7 dní nebo již byl použit
- When: Uživatel klikne na link
- Then: Systém zobrazí chybovou stránku s generickou zprávou „Odkaz není platný nebo vypršel" (stejná zpráva pro expirovaný i neexistující token — žádná user enumeration).

**AC-AUTH-04: Neplatný token**
- Given: URL obsahuje neplatný nebo upravený token
- When: Uživatel přistoupí na /api/auth/magic?token=xxx
- Then: Systém zobrazí stejnou generickou chybu jako u expirovaného linku.

**AC-AUTH-05: Magic link je jednorázový**
- Given: Člen použil magic link poprvé a přihlásil se
- When: Člen (nebo kdokoli jiný) použije stejný link znovu
- Then: Přihlášení selže, zobrazí se generická chyba.

**AC-AUTH-06: Magic link pro Admin/Moderator**
- Given: Admin/Moderator má přiřazen magic link (volitelně)
- When: Použije magic link
- Then: Dostane hlasovací session (auth_method: magic_link) — management funkce (správa členů, generování linků) jsou v této session nedostupné.

### Feature: Email+heslo přihlášení (Admin/Moderator)

**AC-AUTH-07: Úspěšné přihlášení email+heslo**
- Given: Admin nebo Moderator zadá správný email a heslo
- When: Odešle přihlašovací formulář
- Then: Systém ověří přihlašovací údaje, vytvoří session cookie s management_role a přesměruje na /dashboard.

**AC-AUTH-08: Chybné přihlašovací údaje**
- Given: Zadán neplatný email nebo heslo
- When: Odešle přihlašovací formulář
- Then: Systém zobrazí generickou chybovou zprávu „Neplatné přihlašovací údaje" (žádný rozdíl mezi neexistujícím emailem a špatným heslem).

**AC-AUTH-09: Ochrana adminských funkcí**
- Given: Uživatel je přihlášen přes magic link (i Admin nebo Moderator)
- When: Pokusí se přistoupit na admin-only stránky (/admin/members, generování magic linků)
- Then: Systém vrátí chybu 403 / přesměruje na dashboard.

**AC-AUTH-10: Odhlášení**
- Given: Uživatel je přihlášen
- When: Klikne na „Odhlásit se"
- Then: Session cookie je zneplatněna, uživatel je přesměrován na /login.

**AC-AUTH-11: Revokace magic linku Adminem**
- Given: Admin je přihlášen přes email+heslo
- When: Revokuje magic link konkrétního člena
- Then: Token je označen jako neplatný (token_used = TRUE nebo token smazán), existující session tohoto člena zůstává aktivní do jejího přirozeného vypršení. Nový link nelze použít.

> **Otevřená otázka OQ-01:** Má revokace okamžitě ukončit i existující session člena? (Viz sekce 15)

---

## 7. Acceptance Criteria — Hosté a Kategorie

### Feature: Správa hostů

**AC-GUEST-01: Přidání nového hosta**
- Given: Admin nebo Moderator je přihlášen přes email+heslo
- When: Vyplní jméno, popis a vybere kategorii a odešle formulář
- Then: Host je uložen do databáze s datem vytvoření, zobrazí se v seznamu hostů.

**AC-GUEST-02: Povinná pole při přidání hosta**
- Given: Admin nebo Moderator vyplňuje formulář nového hosta
- When: Odešle formulář s chybějícím jménem nebo bez vybrané kategorie
- Then: Formulář zobrazí validační chybu, host není uložen.

**AC-GUEST-03: Změna kategorie hosta (ex post)**
- Given: Host již existuje v databázi
- When: Admin nebo Moderator změní jeho kategorii
- Then: Nová kategorie je uložena, změna se okamžitě projeví v seznamu, detailu i archivu.

**AC-GUEST-04: Přiřazení hosta ke schůzce**
- Given: Schůzka existuje ve stavu draft
- When: Admin nebo Moderator přiřadí hosta ke schůzce
- Then: Host je propojen se schůzkou přes MeetingGuest tabulku, je zahrnut do hlasování dané schůzky.

**AC-GUEST-05: Zobrazení hostů — Člen**
- Given: Člen je přihlášen
- When: Prohlíží seznam hostů
- Then: Vidí jméno, obor a popis hosta. Nevidí editační ovládací prvky.

**AC-GUEST-06: Zobrazení hostů — Admin/Moderator**
- Given: Admin nebo Moderator je přihlášen
- When: Prohlíží seznam hostů
- Then: Vidí jméno, obor, popis a ovládací prvky pro editaci (alespoň změna kategorie).

### Feature: Správa kategorií

**AC-CAT-01: Přidání nové kategorie**
- Given: Admin nebo Moderator je přihlášen
- When: Zadá název nové kategorie a potvrdí
- Then: Kategorie je uložena, okamžitě dostupná při přidávání/editaci hosta.

**AC-CAT-02: Přejmenování kategorie**
- Given: Kategorie existuje
- When: Admin nebo Moderator změní její název
- Then: Nový název se projeví u všech hostů přiřazených k této kategorii (v seznamu i archivu). Žádná data nejsou ztracena.

**AC-CAT-03: Kategorie jako filtr**
- Given: V systému existují hosté různých kategorií
- When: Uživatel vybere kategorii jako filtr
- Then: Zobrazí se pouze hosté z dané kategorie. Filtr funguje v seznamu hostů i v archivu.

**AC-CAT-04: Smazání kategorie**
- Given: Kategorie je přiřazena alespoň jednomu hostu
- When: Admin se pokusí smazat kategorii
- Then: Systém upozorní, že kategorie je používána, a neumožní smazání (nebo vyžaduje přiřazení hostů jiné kategorii).

> **Otevřená otázka OQ-02:** Je smazání kategorií vůbec v MVP scope? (Viz sekce 15)

---

## 8. Acceptance Criteria — Poznámky

### Feature: Psaní a zobrazení poznámek

**AC-NOTE-01: Přidání poznámky k hostu**
- Given: Člen (nebo Admin/Moderator přihlášen přes magic link) je přihlášen
- When: Zadá text poznámky a odešle formulář
- Then: Poznámka je uložena s časovým razítkem (datum + čas), zobrazí se v seznamu poznámek k hostu.

**AC-NOTE-02: Anonymizace poznámky**
- Given: Člen odeslal poznámku
- When: Kdokoliv prohlíží poznámky k hostu
- Then: Vidí text a datum/čas vzniku. Jméno autora není zobrazeno (ani pro Admin/Moderator v UI).

**AC-NOTE-03: Poznámky jsou viditelné všem přihlášeným**
- Given: Poznámka existuje
- When: Jakýkoliv přihlášený uživatel přistoupí na detail hosta
- Then: Poznámka je zobrazena.

**AC-NOTE-04: Psaní poznámek kdykoli**
- Given: Uživatel je přihlášen
- When: Přistoupí na detail hosta — bez ohledu na to, zda právě probíhá hlasování
- Then: Formulář pro přidání poznámky je dostupný.

**AC-NOTE-05: Neomezený počet poznámek**
- Given: Člen již napsal poznámky k hostu
- When: Napíše další poznámku ke stejnému hostu
- Then: Nová poznámka je přijata a uložena. Systém neomezuje počet poznámek na člena/hosta.

**AC-NOTE-06: Prázdná poznámka**
- Given: Uživatel otevřel formulář pro poznámku
- When: Odešle prázdný text (nebo jen mezery)
- Then: Formulář zobrazí validační chybu, poznámka není uložena.

**AC-NOTE-07: Poznámky nejsou vázány na schůzku**
- Given: Člen napsal poznámku k hostu mimo hlasovací okno
- When: Prohlíží archiv hostů z dané schůzky
- Then: Poznámka je zobrazena jako součást záznamu o hostu (bez vazby na konkrétní schůzku).

---

## 9. Acceptance Criteria — Hlasování

### Feature: Správa hlasovacího okna

**AC-VOTE-01: Spuštění hlasování**
- Given: Schůzka existuje ve stavu draft a má přiřazeny alespoň jednoho hosta
- When: Admin nebo Moderator spustí hlasování
- Then: Stav schůzky se změní na „voting", hlasovací formuláře jsou dostupné pro přihlášené členy. Datum/čas spuštění je zaznamenán (voting_open_at).

**AC-VOTE-02: Automatické uzavření hlasování**
- Given: Hlasování je spuštěno
- When: Nastane středa 23:59 (dle nastaveného closing time schůzky)
- Then: Stav schůzky se změní na „closed", hlasovací formuláře jsou skryty/zamčeny, výsledky jsou zobrazeny.

**AC-VOTE-03: Manuální uzavření hlasování**
- Given: Hlasování je ve stavu „voting"
- When: Admin nebo Moderator manuálně uzavře hlasování
- Then: Stav schůzky se změní na „closed", stejné chování jako při automatickém uzavření.

**AC-VOTE-04: Hlasovací formulář skryt mimo okno**
- Given: Schůzka je ve stavu draft nebo closed
- When: Člen přistoupí na detail hosta
- Then: Hlasovací formulář není zobrazen (nebo je viditelně zamčen s vysvětlením).

### Feature: Průběh hlasování

**AC-VOTE-05: Hlasování 👍 nebo 😐**
- Given: Hlasování je otevřeno, člen ještě nehlasoval o daném hostu
- When: Vybere 👍 nebo 😐 a potvrdí
- Then: Hlas je uložen (value: up/neutral, reason: null), člen vidí potvrzení hlasování.

**AC-VOTE-06: Hlasování 👎 s povinným důvodem**
- Given: Hlasování je otevřeno, člen ještě nehlasoval
- When: Vybere 👎 a odešle formulář bez textového důvodu
- Then: Formulář zobrazí validační chybu „Důvod je povinný při negativním hlasu", hlas není uložen.

**AC-VOTE-07: Hlasování 👎 s důvodem**
- Given: Člen vyplnil 👎 a textový důvod
- When: Odešle formulář
- Then: Hlas je uložen (value: down, reason: text), člen vidí potvrzení.

**AC-VOTE-08: Jeden hlas na hosta**
- Given: Člen již hlasoval o hostu
- When: Přistoupí na detail hosta
- Then: Vidí svůj odevzdaný hlas. Hlasovací formulář pro tohoto hosta je nedostupný (lze pouze číst).

**AC-VOTE-09: Změna hlasu není možná**
- Given: Člen odevzdal hlas
- When: Pokusí se hlasovat znovu (přímý POST request nebo manipulace s UI)
- Then: Backend odmítne požadavek, hlas se nezmění. Zobrazí se chybová zpráva.

**AC-VOTE-10: Uzamčení po uzavření**
- Given: Hlasování je uzavřeno
- When: Kdokoliv se pokusí odevzdat hlas (přímý POST)
- Then: Backend odmítne požadavek s chybou „Hlasování je uzavřeno".

### Feature: Výsledky hlasování

**AC-VOTE-11: Veřejné jmenovité výsledky**
- Given: Hlasování je uzavřeno
- When: Jakýkoliv přihlášený uživatel zobrazí výsledky
- Then: Vidí jméno každého hlasujícího, jeho volbu (👍/😐/👎) a důvod u 👎 hlasů.

**AC-VOTE-12: Průběžné výsledky pro Admin/Moderator**
- Given: Hlasování je otevřeno
- When: Admin nebo Moderator prohlíží výsledky
- Then: Vidí průběžné jmenovité výsledky (kdo již hlasoval a jak).

**AC-VOTE-13: Člen nevidí průběžné výsledky**
- Given: Hlasování je otevřeno
- When: Člen prohlíží detail hosta
- Then: Průběžné výsledky ostatních členů nejsou zobrazeny. Člen vidí pouze svůj vlastní odevzdaný hlas.

> **Otevřená otázka OQ-03:** Má člen vidět průběžný souhrn (počty, bez jmen) nebo úplně nic? (Viz sekce 15)

**AC-VOTE-14: Hlasování Admin/Moderator přes magic link**
- Given: Admin nebo Moderator je přihlášen přes svůj magic link
- When: Hlasuje o hostu
- Then: Hlas je zaznamenán jmenovitě (jejich jméno se zobrazí ve výsledcích stejně jako hlas řadového člena).

---

## 10. Acceptance Criteria — Archiv

### Feature: Archiv hostů

**AC-ARCH-01: Zobrazení archivu — přihlášený uživatel**
- Given: Uživatel je přihlášen
- When: Přistoupí na záložku Archiv
- Then: Vidí rozhraní pro výběr časového okna nebo seznam schůzek. Bez aktivního filtru/výběru se zobrazí výzva k zadání kritéria (nebo výchozí poslední schůzka).

**AC-ARCH-02: Filtrace časovým oknem (od–do)**
- Given: Uživatel zadal datum „od" a „do"
- When: Potvrdí výběr
- Then: Zobrazí se všichni hosté ze schůzek, jejichž datum spadá do zvoleného rozsahu. Hosté jsou seřazeni dle data schůzky nebo jména.

**AC-ARCH-03: Výběr konkrétních schůzek (multiselect)**
- Given: Uživatel vidí seznam schůzek s datumem
- When: Zaškrtne jednu nebo více schůzek a klikne „Zobrazit"
- Then: Zobrazí se hosté z vybraných schůzek.

**AC-ARCH-04: Kombinace výběru schůzek a kategorie**
- Given: Uživatel vybral schůzky nebo časové okno
- When: Přidá filtr kategorie
- Then: Výsledky jsou omezeny na průnik: hosté z vybraných schůzek A v dané kategorii.

**AC-ARCH-05: Detail hosta v archivu**
- Given: Uživatel prohlíží archiv
- When: Zobrazí detail hosta
- Then: Vidí jméno, obor (aktuální, i když byl změněn ex post), popis, anonymní poznámky s datem/časem, jmenovité výsledky hlasování.

> **Otevřená otázka OQ-04:** Má archiv zobrazovat kategorii platnou v době schůzky, nebo aktuální kategorii? (Viz sekce 15)

**AC-ARCH-06: Prázdný výsledek archivu**
- Given: Uživatel zadal kritéria, pro která neexistují data
- When: Potvrdí výběr
- Then: Zobrazí se prázdný stav se zprávou „Pro zvolené období / schůzky nebyly nalezeny žádné záznamy."

**AC-ARCH-07: Archiv nezobrazeného probíhajícího hlasování**
- Given: Schůzka je ve stavu „voting" (probíhá hlasování)
- When: Uživatel zobrazí tuto schůzku v archivu
- Then: Archiv zobrazuje hosty a poznámky, výsledky hlasování jsou skryty (hlasování ještě probíhá) — nebo schůzka není v archivu zobrazena dokud není uzavřena.

> **Otevřená otázka OQ-05:** Jsou schůzky ve stavu „voting" dostupné v archivu? (Viz sekce 15)

---

## 11. Acceptance Criteria — Týdenní report

### Feature: Generování a doručení reportu

**AC-REP-01: Automatické spuštění po uzavření hlasování**
- Given: Hlasování bylo uzavřeno (automaticky nebo manuálně)
- When: Systém detekuje uzavření
- Then: Report je automaticky vygenerován a odeslán emailem všem uživatelům s management_role (Admin, Moderator).

**AC-REP-02: Manuální spuštění reportu**
- Given: Admin nebo Moderator je přihlášen
- When: Klikne na „Generovat report"
- Then: Report je vygenerován pro aktuálně nebo naposledy uzavřené hlasování a odeslán emailem.

**AC-REP-03: Obsah reportu**
- Given: Report je generován
- Then: Obsahuje:
  - seznam hostů ze schůzky
  - počty hlasů v každé kategorii (👍 / 😐 / 👎) pro každého hosta
  - jmenovité výsledky pro každého hosta (kdo jak hlasoval)
  - textové důvody u 👎 hlasů (jmenovitě)
  - souhrn anonymních poznámek k hostům (text + datum/čas, bez jména)

**AC-REP-04: Příjemci reportu**
- Given: Report je odeslán
- Then: Dorazí na emailové adresy všech aktivních uživatelů s management_role. Řadoví členové email neobdrží.

**AC-REP-05: Selhání odeslání emailu**
- Given: Email provider (Resend/SendGrid) vrátí chybu
- When: Systém se pokusí odeslat report
- Then: Chyba je zalogována, systém zobrazí Adminovi notifikaci o selhání. Report data jsou dostupná v aplikaci (fallback).

**AC-REP-06: Limit emailů (free tier)**
- Given: Denní limit emailů (100/den) je dosažen
- When: Systém se pokusí odeslat report
- Then: Report není odeslán emailem, ale data jsou dostupná v aplikaci. Admin vidí upozornění.

---

## 12. Edge Cases a hraniční scénáře

### Autentizace

**EC-AUTH-01: Magic link vyprší uprostřed session**
- Scénář: Člen se přihlásil přes magic link, session cookie je stále platná, ale člen otevře tentýž magic link znovu (z emailu nebo záložek).
- Chování: Druhé použití magic linku selže (token_used = TRUE). Existující session zůstává aktivní — člen je nadále přihlášen a nemusí dělat nic.
- Riziko: Člen může být zmaten — myslí si, že musí použít link znovu pro každé přihlášení.

**EC-AUTH-02: Sdílení magic linku**
- Scénář: Člen pošle svůj magic link jiné osobě (neúmyslně nebo záměrně).
- Chování: Magic link je jednorázový — první, kdo ho použije, získá přístup. Druhý pokus selže. Nelze technicky zabránit sdílení.
- Mitigace: Dokumentovat a komunikovat členům, že link je osobní a jednorázový.

**EC-AUTH-03: Admin/Moderator použije magic link a zároveň je přihlášen přes email+heslo**
- Scénář: Admin je přihlášen přes email+heslo (management session) a také přes magic link (hlasovací session) — v různých záložkách prohlížeče nebo zařízeních.
- Chování: Každá session je nezávislá. Obě jsou platné. Management session opravňuje ke správě, hlasovací session k hlasování.
- Riziko: Technicky může hlasovat dvakrát, pokud session jsou v různých prohlížečích/zařízeních. Databáze neumožní dva hlasy od stejného member_id pro stejného hosta — backend odstraní duplicitu.

### Hosté a kategorie

**EC-GUEST-01: Smazání hosta, jehož hlasování právě probíhá**
- Scénář: Host je přiřazen ke schůzce s otevřeným hlasováním, Admin nebo Moderator se ho pokusí smazat.
- Chování: Systém neumožní smazání hosta s aktivním hlasováním — zobrazí chybu. (Nebo: smazání hosta automaticky uzavře/zruší hlasování o něm — vyžaduje rozhodnutí.)
- **Doporučení:** Zakázat smazání při aktivním hlasování. Alternativa: skrýt hosta bez mazání (soft delete).

> **Otevřená otázka OQ-06:** Je smazání hostů vůbec v MVP scope? (Viz sekce 15)

**EC-GUEST-02: Změna kategorie hosta zpětně — dopad na archiv**
- Scénář: Admin změní kategorii hosta po uzavření hlasování.
- Chování: Archiv zobrazuje aktuální kategorii hosta (ne kategorii platnou v době schůzky). Filtr v archivu funguje podle aktuální kategorie.
- Riziko: Historická analýza může být zkreslena. (Viz OQ-04)

**EC-GUEST-03: Přejmenování kategorie**
- Scénář: Moderator přejmenuje kategorii „IT" na „Technologie".
- Chování: Všichni hosté s touto kategorií ji mají přejmenovanou okamžitě. Archivní záznamy také.
- Předpoklad: Category tabulka obsahuje pouze name — žádná verzování není implementováno v MVP.

**EC-CAT-01: Kategorie použitá u hostů — pokus o smazání**
- Scénář: Kategorie „Finance" je přiřazena 3 hostům. Admin se pokusí ji smazat.
- Chování: Systém zobrazí chybu nebo potvrzovací dialog s upozorněním, že kategorie má přiřazené hosty. Smazání blokováno.

### Hlasování

**EC-VOTE-01: Host smazán (nebo odebrán ze schůzky) po zahájení hlasování**
- Scénář: Host je odpojen od schůzky poté, co někteří členové již hlasovali.
- Chování: Existující hlasy by měly být zachovány v databázi. Systém by měl zablokovat odebrání hosta ze schůzky s aktivním hlasováním (nebo vyžadovat potvrzení s upozorněním na ztrátu hlasů).

**EC-VOTE-02: Člen přidán do systému po zahájení hlasování**
- Scénář: Admin přidá nového člena (vygeneruje magic link) poté, co je hlasování otevřeno.
- Chování: Nový člen může hlasovat normálně — systém nekontroluje, zda člen existoval před zahájením hlasování. Toto je očekávané chování.

**EC-VOTE-03: Hlasovací okno automaticky uzavřeno při probíhajícím hlasování**
- Scénář: Člen má otevřený hlasovací formulář a ve středu 23:59 proběhne automatické uzavření.
- Chování: Pokud člen odešle formulář po uzavření, backend odmítne hlas s chybou „Hlasování je uzavřeno". Formulář by měl zobrazit aktuální stav po dalším načtení.

**EC-VOTE-04: Duplicitní hlas (race condition)**
- Scénář: Člen klikne na tlačítko hlasování dvakrát rychle za sebou (double-click) nebo pošle dvojí POST request.
- Chování: Databáze má unikátní constraint na (member_id, guest_id, meeting_id) — druhý INSERT selže. Backend vrátí chybu nebo idempotentní odpověď. UI zobrazí výsledek prvního hlasování.

**EC-VOTE-05: Žádný člen nehlasoval**
- Scénář: Hlasování je uzavřeno, ale o konkrétního hosta nehlasoval nikdo.
- Chování: Výsledky zobrazí hosta s 0 hlasy ve všech kategoriích. Host není ze zobrazení odstraněn.

**EC-VOTE-06: Všichni hlasovali 👎 s důvodem**
- Scénář: Edge case pro report — všechny hlasy jsou negativní.
- Chování: Report i výsledky zobrazují všechny 👎 hlasy s důvody jmenovitě. Žádné speciální zacházení.

**EC-VOTE-07: Člen nemá aktivní magic link při pokus o hlasování**
- Scénář: Adminovi byl revokován magic link, ale hlasovací session stále platí.
- Chování: Existující session je nezávislá na stavu magic linku — člen může hlasovat do vypršení session. (Viz OQ-01 o okamžité revokaci session.)

### Poznámky

**EC-NOTE-01: Extrémně dlouhý text poznámky**
- Scénář: Člen odešle poznámku s tisíci znaky.
- Chování: Systém by měl mít maximální délku poznámky (doporučeno: 2000 znaků). Formulář zobrazí validační chybu při překročení limitu.
- **Otevřená otázka OQ-07:** Jaký je maximální počet znaků poznámky? (Viz sekce 15)

**EC-NOTE-02: SQL injection nebo XSS v poznámce**
- Scénář: Člen zadá do poznámky HTML/JavaScript nebo SQL.
- Chování: Systém musí escapovat všechny vstupy. Poznámky jsou uloženy jako čistý text, při zobrazení jsou HTML-escapovány. Backend používá parametrizované SQL dotazy.

### Archiv

**EC-ARCH-01: Časové okno bez schůzek**
- Scénář: Uživatel zadá časové okno (např. letní prázdniny), ve kterém neproběhla žádná schůzka.
- Chování: Prázdný stav s vysvětlující zprávou.

**EC-ARCH-02: Výběr schůzky bez uzavřeného hlasování**
- Scénář: Uživatel vybere schůzku, jejíž hlasování stále probíhá.
- Chování: Viz OQ-05 — závisí na rozhodnutí, zda jsou „voting" schůzky dostupné v archivu.

### Report

**EC-REP-01: Generování reportu pro schůzku bez hlasů**
- Scénář: Hlasování bylo uzavřeno, ale žádný člen nehlasoval.
- Chování: Report je vygenerován a odeslán. Sekce výsledků zobrazuje „0 hlasů" pro každého hosta. Report není prázdný — zobrazuje alespoň seznam hostů a jejich poznámky.

**EC-REP-02: Opakované manuální spuštění reportu**
- Scénář: Admin klikne na „Generovat report" víckrát za sebou.
- Chování: Každý klik spustí nové odeslání emailu. Systém by měl mít ochranu (rate limiting nebo potvrzovací dialog) pro zabránění spamu.

---

## 13. MVP vs Later prioritizace

### MVP — musí být v první verzi

| Feature | Popis | Zdůvodnění |
|---|---|---|
| Magic link autentizace | Přihlášení pro členy | Primární přístupový mechanismus |
| Email+heslo autentizace | Přihlášení pro Admin/Moderator | Nutné pro správu systému |
| Dual auth (Admin/Mod magic link) | Admin/Mod může hlasovat přes magic link | Vyžadováno architekturou |
| Správa členů a magic linků | Generování, revokace linků | Bez toho nemůže nikdo hlasovat |
| Přidání a zobrazení hostů | Základní CRUD | Základ celého systému |
| Kategorie hostů | Přidání, přejmenování, filtrování | Nutné pro organizaci hostů |
| Poznámky k hostům | Anonymní, bez omezení, kdykoli | Klíčová feature pro rozhodnutí o hostu |
| Schůzky | Vytvoření, přiřazení hostů | Organizační jednotka pro hlasování |
| Hlasování (spuštění, průběh, uzavření) | Celý flow včetně automatického uzavření | Primární účel aplikace |
| Výsledky hlasování | Jmenovité, po uzavření | Klíčový výstup pro komunitu |
| Archiv — časové okno | Filtrace hostů dle data | Základní historický přehled |
| Archiv — výběr schůzek | Multiselect schůzek | Přirozenější způsob navigace archivu |
| Týdenní report email | Automatické odeslání po uzavření | Eliminuje manuální práci Admina |

### Later — odloženo po MVP

| Feature | Popis | Zdůvodnění odložení |
|---|---|---|
| Smazání hosta | Odstranění záznamu hosta | Komplikuje integritu dat (hlasy, poznámky), nízká priorita |
| Smazání kategorie | Odstranění kategorie | Riziko porušení FK, nízká priorita |
| Verzování kategorie hosta | Historická kategorie vs aktuální | Technická komplexita, nízká business hodnota |
| Rate limiting reportu | Ochrana před opakovaným spuštěním | Workaround je potvrzovací dialog |
| Průběžné výsledky pro členy | Statistiky během hlasování | Záměrně skryto v MVP (ovlivňuje hlasování) |
| Úprava/smazání poznámky | Editace nebo mazání vlastní poznámky | Komplikuje anonymitu, nízká priorita |
| Notifikace při zahájení hlasování | Email nebo push notifikace pro členy | Vyžaduje email pro každého člena |
| Export výsledků (CSV/PDF) | Stažení dat pro archivaci | Nice-to-have, nízká priorita |
| Přihlášení přes SSO | Google, Microsoft | Over-engineering pro interní aplikaci |
| Multi-chapter podpora | Více BNI chapterů v jedné instanci | Mimo scope projektu |

---

## 14. Závislosti mezi features

```
Kategorie
    └── Hosté (host musí mít kategorii)
            ├── Poznámky (poznámka je vázána na hosta)
            └── Schůzky (host je přiřazen ke schůzce)
                    └── Hlasování (hlasování je vázáno na schůzku + hosta)
                            ├── Výsledky (zobrazeny po uzavření)
                            └── Týdenní report (generován po uzavření)

Správa členů (magic linky)
    └── Autentizace
            └── Vše ostatní (všechny features vyžadují přihlášení)
```

**Kritická cesta pro MVP:**
1. Autentizace (magic link + email+heslo) → blocker pro vše
2. Kategorie → blocker pro Hosty
3. Hosté + Schůzky → blocker pro Hlasování
4. Hlasování → blocker pro Výsledky a Report

---

## 15. Otevřené otázky

| ID | Otázka | Dopad | Priorita |
|---|---|---|---|
| **OQ-01** | Má revokace magic linku Adminem okamžitě ukončit i existující session člena? | Bezpečnostní dopad — okamžitá revokace = vyšší bezpečnost, ale komplikuje implementaci (blacklist session). Doporučení: pro MVP session nevypínat, přidat do Later. | Střední |
| **OQ-02** | Je smazání kategorií v MVP scope? | Pokud ano, nutno řešit FK constraint a přeřazení hostů. Doporučení: přidat do Later — přejmenování postačuje pro MVP. | Nízká |
| **OQ-03** | Vidí člen průběžné souhrnné statistiky hlasování (počty bez jmen) nebo úplně nic? | Ovlivňuje hlasovací chování — průběžné výsledky mohou vést k „bandwagon" efektu. Doporučení: člen nevidí nic do uzavření. | Střední |
| **OQ-04** | Zobrazuje archiv kategorii platnou v době schůzky, nebo aktuální kategorii hosta? | Historická věrnost vs. jednoduchost implementace. Doporučení pro MVP: aktuální kategorie (jednodušší, žádné verzování). | Nízká |
| **OQ-05** | Jsou schůzky ve stavu „voting" viditelné v archivu? | Členové by mohli vidět průběžné hlasy v archivu obejít AC-VOTE-13. Doporučení: archiv zobrazuje pouze „closed" schůzky. | Vysoká |
| **OQ-06** | Je smazání hostů v MVP scope? | Smazání hosta s hlasy/poznámkami komplikuje integritu dat. Doporučení: přidat do Later. | Nízká |
| **OQ-07** | Jaký je maximální počet znaků pro textovou poznámku a pro důvod u 👎 hlasu? | Nutno definovat pro validaci UI i databázi. Doporučení: poznámka 2000 znaků, důvod 500 znaků. | Střední |
| **OQ-08** | Může Admin smazat jiného Admina nebo Moderátora? (nebo jen řadové členy?) | Bezpečnostní governance — kdo spravuje správce. Doporučení: Admin může spravovat všechny role. | Střední |
| **OQ-09** | Jak se chová aplikace, pokud probíhají hlasování pro více schůzek současně? (podporovaný scénář?) | Datový model to technicky umožňuje, ale UX může být matoucí. Doporučení: MVP podporuje max 1 otevřené hlasování najednou — přidat guard. | Střední |

---

## 16. Rizika a předpoklady

### Rizika

| Riziko | Pravděpodobnost | Dopad | Mitigace |
|---|---|---|---|
| Magic link sdílení / zneužití | Střední | Střední | Jednorázovost linku; komunikace s členy |
| Admin ztratí přístup (bez magic linku a bez hesla) | Nízká | Vysoká | Dokumentovat postup pro reset (přímá DB manipulace nebo seeding) |
| Vercel Hobby timeout při generování reportu | Nízká | Střední | Report generovat asynchronně nebo po částech; nebo Vercel Cron pro spuštění |
| Neon free tier cold start zpomalí UX při hlasování | Střední | Nízká | Connection pooling (PgBouncer na Neon straně); akceptovat v MVP |
| Překročení limitu emailů (100/den) | Nízká | Nízká | Report je jeden email per uzavření; monitor free tier limity |

### Předpoklady

- Počet členů zůstane v rozsahu 20–40 po celou dobu MVP.
- Hlasování probíhá max 1× týdně (čtvrteční schůzka → pátek–středa).
- Admin má technické znalosti pro správu magic linků a generování reportů.
- Komunita akceptuje anonymní poznámky (žádná atribuce autorství).
- Výsledky hlasování jsou sdíleny v rámci komunity — žádná zvýšená ochrana soukromí není vyžadována.

---

*Dokument vytvořen: 2026-03-31 | Agent: requirements | Task: T-005 | Iterace: iter-001*
