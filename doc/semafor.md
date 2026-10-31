# Semafor: skóre z BNI, bonus a vlastní body

Dokument pro vývoj a provoz (iter-041 až iter-044). Bez jmen členů. Čísla jsou
v kódu, tady je jen odkaz, kde je najít. Návod pro členy je veřejně na
`/pravidla/semafor`, nápověda je v aplikaci (menu Nápověda, sekce Semafor).

## 1. Co je semafor

- Oficiální skóre z BNI: vedení jednou měsíčně nahraje soubor `.xlsx` se skóre
  členů (záložka Import). Barvu podle skóre počítá aplikace (`lib/semafor/color.ts`).
- Interní skóre: skóre z BNI plus bonus za to, co člen dělá pro chapter navíc.
  Z něj vychází interní barva.
- Bonus: Master mind, Burza pomoci, funkce a pět ručních kategorií (sekce 3).
  Počítá se živě při čtení, nikam se neukládá.

## 2. Výpočet

```
interní skóre = min(100, skóre BNI + bonus)
bonus         = min(BONUS_CAP, součet kategorií po podstropech)
```

- Okno bonusu je šest měsíců ke konci měsíce snímku z BNI:
  `(poslední den měsíce - 6 měsíců, poslední den měsíce]` (`bonusWindow`).
- Nic se neodečítá. Bonus je vždy nejméně 0 a interní skóre nikdy nižší než BNI.
- Funkce nemá spodní mez okna: počítá se v měsíci M, když ji člen drží dnes a
  `assigned_at` je nejpozději poslední den M (`bonusForMonth`).
- Události po konci posledního nahraného měsíce se započtou s dalším měsícem
  (věta na kartě Můj semafor). Funkce se do té věty nepočítá, pokud byla přidělena
  před koncem měsíce snímku (`eventsAfterSnapshot`).
- Konstanty jsou jen v `lib/semafor/bonus.ts`: `BONUS_POINTS`, `CATEGORY_CAPS`,
  `WORK_POINTS`, `WORK_GUIDE`, `BONUS_CAP`. Barvy a prahy v `lib/semafor/color.ts`.
- Invariant: `BONUS_CAP` nesmí přesáhnout šířku nejužšího barevného pásma (dnes 20).
  Jinak by bonus mohl posunout barvu o dvě. Hlídá ho test 4b v
  `scripts/test-iter-044-semafor-body.ts`.

## 3. Kategorie a body

| Kategorie | Klíč | Zdroj | Body |
|---|---|---|---|
| Master mind, který proběhl | `mastermind` | automaticky, `mastermind_case` | 7 |
| Pomoc nebo kontakt v Burze pomoci | `burza` | automaticky, `burza_help`, `burza_contact_use` | 5 |
| Funkce v chapteru | `function` | automaticky, `member_function` | 5 |
| Školení nebo workshop (vedl) | `training` | ručně, vedení | 7 |
| Přivedený host, který se stal členem | `host_member` | ručně, vedení | 10 |
| Účast na akci chapteru | `activity` | ručně, vedení | 2, za okno nejvýš 6 |
| Poděkování od jiného člena | `thanks` | ručně, kdokoli přihlášený | 1, za okno nejvýš 5 |
| Ostatní práce pro chapter | `work` | ručně, jen člen výboru | 1 až 10 |

Strop 20 je jeden pro všechno. Hodnoty vycházejí z jednotky gate iter-041 (Z9):
1 host = 5 bodů, jedno doporučení zhruba 0,77 bodu. Master mind a školení jsou
stejná práce (7). Host, který se stal členem, je dva hosté (10), protože růst
chapteru je nejcennější. Podstropy poděkování a akcí brání tomu, aby se plný
bonus dal nasbírat jen účastí (aktivní člen jen s účastí a poděkováními dosáhne
nejvýš 11 z 20).

Jak hodnotu změnit: jeden řádek v `BONUS_POINTS` (nebo `CATEGORY_CAPS`,
`WORK_POINTS`), upravit testy, nové nasazení. Čísla na `/pravidla/semafor` se
skládají z týchž konstant při buildu, takže se změní s nasazením.

Pravidla po kategoriích:

- Poděkování: píše kdokoli přihlášený (i odkazem z mailu) komukoli kromě sebe,
  jednomu členovi jednou za kalendářní měsíc (UNIQUE `uq_sp_thanks`), text 3 až 300
  znaků. 31. 1. a 1. 2. jsou dva měsíce, dvě poděkování stejnému členovi projdou.
- Školení: datum školení v posledních šesti měsících, nejvýš dnes. Body dostane,
  kdo školení vedl. Pravidelné vzdělávací okénko na schůzce se nepočítá.
- Přivedený host, který se stal členem: datum bodu je `joined_at` nového člena
  z databáze (ne ze vstupu), nový člen musí být z posledních šesti měsíců. Body
  se dávají po vstupu, podmínku délky členství Tom nezadal. `joined_at` jde měnit
  (admin, správa členů), u starších členů je zpětně doplněné z `created_at`.
  Výběr je tak dobrý jako ta data. Jeden záznam na nového člena.
- Akce: název, datum a zaškrtnutí účastníků. Zapisující se na akci nezaškrtne.
  Smazání akce smaže body všech účastníků.
- Ostatní práce: body 1 až 10, popis 3 až 300 znaků povinný. Stejný popis stejnému
  příjemci od téhož udělujícího v jeden den jen jednou (`uq_sp_work`).
- Funkce: 5 bodů pro Prezidenta, Viceprezidenta i Člena výboru, dokud ji člen drží.
  Při změně funkce se `assigned_at` nepřepisuje (gate Q10 A), povýšený člen tak
  nepřijde o bonus v posledním měsíci. Po odebrání funkce bonus zmizí i ze starších
  měsíců, historie funkcí se neeviduje.

## 4. Datový model a migrace

| Tabulka | K čemu |
|---|---|
| `semafor_import` | historie nahrání (iter-041) |
| `semafor_score` | snímek skóre za měsíc a člena (iter-041) |
| `semafor_name_alias` | zapamatované párování jmen (iter-041) |
| `semafor_activity` | akce chapteru (iter-044) |
| `semafor_point` | ruční body: školení, poděkování, host, akce, ostatní práce (iter-044) |

Funkce, Master mind a Burza se do `semafor_point` nekopírují (jedna pravda,
smazání zdroje bod odebere). Pevné body kategorií nejsou v řádku, takže změna
kalibrace platí zpětně. V řádku je číslo jen u ostatní práce (rozhodnutí člena výboru).

Migrace:

- `scripts/migrate-iter-041-semafor.ts`, `scripts/migrate-iter-042-nastaveni.ts`,
  `scripts/migrate-iter-044-vlastni-body.ts`. Aditivní a idempotentní.
- DDL iter-044 je v `lib/semafor/points-ddl.ts` a čte ho migrace i SQL test nad
  PGlite, takže test ověřuje stejný SQL tvar (LL-006). Drizzle ho zrcadlí v
  `lib/db/schema.ts`.
- Migrace iter-044 vyžaduje `EXPECT_DB_HOST` (celý host nebo jeho první label).
  Na konci vypíše, které funkce dostanou právo `semafor.points`, kolik je držitelů
  funkce Člen výboru a kolik držitelů má každá funkce.
- Pořadí nasazení: dočasná větev Neonu (LL-010), druhé spuštění beze změny, pak
  PROD před testováním v preview a před mergem (preview i produkce běží nad PROD
  databází a Vercel nasazuje při mergi).
- Nová verze bez migrace nespadne: všechna čtení nových tabulek jdou přes
  `readPointsTables` (chyba 42P01), `/semafor` a `/semafor/body` ukážou větu
  místo karet a formulářů a bonus se počítá bez ručních bodů. Stará verze s
  migrací nové tabulky nečte.
- Rollback: vrátit kód. Tabulky nechat, nebo `DROP TABLE semafor_point, semafor_activity`.

Smazání člena: body příjemce zmizí (CASCADE). Smazaný autor nechá záznam s
`created_by` NULL (na kartě „bývalý člen“). Smazání nového člena smaže i bod za
přivedeného hosta, to je vzácné. Deaktivovanému příjemci záznamy zůstanou, nové
nejdou.

## 5. Práva

Dvě úrovně:

1. Právo `semafor.points` (výchozí sada funkce, tedy Člen výboru, dále Prezident a
   Viceprezident značkou `admin-delegable`, admin vždy). Řídí záložku Body, zápis
   školení, přivedeného hosta a akcí a mazání záznamů. Není v sadě role moderátor
   ani správce docházky. Přihlášení odkazem z mailu nemá žádné právo, takže odkazem
   jde jen poděkovat a smazat vlastní poděkování.
2. Ostatní práci navíc smí udělit jen aktér, který drží funkci s
   `chapter_function.area = 'vybor'` (dnes jen Člen výboru, konstanta
   `COMMITTEE_FUNCTION_AREA`). Kontrola je v akci i v SQL (`actorHoldsCommitteeFunctionSql`).
   Prezident, Viceprezident (mají funkci s `area = 'vedeni'`, člen má nejvýš jednu
   funkci) ani admin bez funkce Člen výboru ji neudělí.

Matice:

| Kdo | Poděkování | Školení, host, akce | Ostatní práce udělit | Ostatní práce smazat |
|---|---|---|---|---|
| Člen výboru | napíše, smaže své i cizí | zapíše, smaže | ano | ano |
| Admin s funkcí Člen výboru | napíše, smaže své i cizí | zapíše, smaže | ano | ano |
| Admin bez funkce Člen výboru | napíše, smaže své i cizí | zapíše, smaže | ne | ano |
| Prezident, Viceprezident | napíše, smaže své i cizí | zapíše, smaže | ne | ano |
| Moderátor bez funkce, běžný člen | napíše, smaže své | ne | ne | ne |
| Kdokoli přihlášený odkazem | napíše, smaže své | ne | ne | ne |

Nikdo si body nezapisuje sám (CHECK `sp_not_self`, WHERE příkazu i akce), ani
vedení, ani na akci se nezaškrtne. Master mind: vlastní případ nepotvrdí.

Pravidlo modulu `semafor-points`: SQL větev práva (`actorHasPermissionSql`) smí
volat jen akce, která před tím prošla `requirePermission("semafor.points")`, protože
SQL přihlášení odkazem nerozlišuje. Mazání vlastního poděkování je proto samostatná
cesta bez větve práva (`deleteOwnThanks`). Hlídá to statický test 19.

Důsledek pro provoz (gate Q6): jediný Člen výboru nedostane od nikoho body za
ostatní práci a bez Člena výboru ji nikdo neudělí. Migrace počet držitelů vypíše.
Vzájemné udělování mezi členy výboru nemá limit (Q14), kontrola je seznam na záložce
Body se jmény příjemců i udělujících, který vidí celé vedení a může mazat.

## 6. Ops log

Nové druhy v `/status` (všechny terminální, `lib/semafor/events.ts`):
`semafor.points-added`, `semafor.activity-added`, `semafor.points-deleted`,
`semafor.activity-deleted`. Loguje se jen zásah vedení: zápis školení, hosta,
ostatní práce a akce, a smazání. `warn` je smazání cizího poděkování a ostatní práce
smazané někým jiným než udělujícím. Do události nikdy nejde příjemce, jméno nového
člena, název akce, text poděkování ani popis práce. Poděkování, které člen napíše
nebo smaže sám, se neloguje. Audit vzájemného udělování tedy není na `/status`,
ale na záložce Body.

## 7. Stránky

| Adresa | Kdo | Co |
|---|---|---|
| `/semafor` | každý přihlášený | můj semafor, rozpis bonusu, Body za 6 měsíců, Poděkovat |
| `/semafor/prehled` | `semafor.view_all` | přehled se jmény, rozpis bonusu v řádku |
| `/semafor/body` | `semafor.points` | formuláře, seznam záznamů, mazání |
| `/semafor/import` | `semafor.import` | nahrání souboru |
| `/pravidla/semafor` | veřejně | návod celého semaforu, jen pravidla a body |

Všechny stránky v aplikaci jsou `force-dynamic`. `/pravidla/semafor` je statická.
Člen vidí jen své body a poděkování, včetně jména autora a textu. Text poděkování
a popisy práce vidí ještě vedení na záložce Body (moderace nevhodného textu).
Souhrn chapteru zůstává čtyři počty interních barev.

## 8. Známá omezení

- Funkce nemá historii: odebrání funkce změní bonus starších měsíců.
- Statická stránka `/pravidla/semafor` nezná nastavení chapteru. Když admin vypne
  Master mind nebo Burzu, stránka je dál popisuje. Aplikace a nápověda se skládají
  podle zapnutých částí.
- Při zapnutém semaforu je zdrojem bonusu vždy aspoň funkce a vlastní body, takže
  věta „bonus zatím žádný“ platí i bez Master mindu a Burzy.
- Jediný Člen výboru (nebo žádný), viz sekce 5.
- Poděkování se omezuje podle kalendářního měsíce, ne plovoucích 30 dní.
- Zdroj `joined_at` u přivedeného hosta, viz sekce 3.
- Ilustraci k `/pravidla/semafor` dodá Tom, do té doby karta rozcestníku používá
  existující panel.
- Akce je jednoznačná podle data a názvu bez ohledu na velikost písmen a mezery na
  krajích (`uq_sa_dup`). Akce se zakládá jen s aspoň jedním způsobilým účastníkem
  a smazáním posledního účastníka zmizí i akce, takže v databázi nezůstávají
  osiřelé akce.
- Texty poděkování a popisů se před kontrolou délky čistí od znaků nulové šířky,
  řídicích znaků směru a ostatních řídicích znaků (`lib/text/clean.ts`).

### Vědomá rozhodnutí (security review iter-044)

- Poděkování se nelogují a příjemce je nemůže nahlásit. Autor smí své poděkování
  smazat kdykoli, vedení smí smazat jakékoli. Smazaná poděkování se nearchivují.
  Autor je u poděkování vždy podepsaný, riziko je malé a přijímáme ho (L-4).
- Vzájemná poděkování (A děkuje B a B děkuje A) se neposuzují. Dopad omezuje
  podstrop 5 bodů za 6 měsíců, limit jednoho poděkování na dvojici a měsíc a strop
  bonusu 20. Vedení vidí autory všech poděkování. Přijímáme, bez kontroly
  vzájemnosti (L-5).
- Databázový CHECK `sp_points` povoluje body ostatní práce 1 až 20, aplikace 1 až
  10 (`WORK_POINTS.max`). Je to rezerva: hranici hlídá zápis (TS i WHERE) a
  `bonusForMonth` při čtení ořízne na 10. Přímý zápis do databáze může uložit 11
  až 20, skóre to neovlivní (F-12, I-2).

## 9. Testy

`npm run test:iter-044` řetězí `test:iter-044-body` (čisté moduly a statické
kontroly), `test:iter-044-sql` (PGlite, bez sítě), `test:info-pages`,
`test:iter-036` a `test:iter-043` (ta řetězí starší sady). Spuštění migrace proti
databázi je ruční krok mimo testy.
