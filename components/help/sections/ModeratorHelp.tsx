import { HelpSection } from "@/components/help/HelpParts";
import { DEFAULT_CHAPTER_SETTINGS, weekdayAccusative, type ChapterSettings } from "@/lib/chapter/settings";
import { bonusSources } from "@/lib/semafor/bonus";
import { helpAttendanceManagerUnexcused, helpSemaforLeadership } from "@/lib/semafor/texts";
import { autostartHelp, closeVotingHelp, warningMailHelp } from "@/components/help/help-texts";

interface ModeratorHelpProps {
  /** Funkce vedení (session s heslem). Správce docházky přihlášený odkazem je nemá. */
  showLeadership?: boolean;
  /** iter-043: právo `access.password_reset`: otázka, jak členovi vedení poslat odkaz pro nové heslo. */
  passwordReset?: boolean;
  /** Právo `attendance.view_all`: sekce „Docházka pro správce“. */
  attendance?: boolean;
  /** Právo `attendance.edit_history`: sekce „Opravy po uzávěrce“. */
  attendanceHistory?: boolean;
  /** iter-040: právo `attendance.internal_manage`: sekce „Interní schůzka“. */
  internalMeetings?: boolean;
  /** iter-041: právo `semafor.view_all`: sekce „Semafor pro vedení“. */
  semafor?: boolean;
  /** iter-041: právo `semafor.import`: první tři body sekce „Semafor pro vedení“. */
  semaforImport?: boolean;
  /** iter-044: právo `semafor.points`: body o vlastních bodech v sekci „Semafor pro vedení“. */
  semaforPoints?: boolean;
  /** iter-044: držitel funkce Člen výboru: bod o udělování ostatní práce. */
  semaforCommittee?: boolean;
  /** iter-042: nastavení chapteru (den a začátek schůzky, zapnuté části). Bez něj platí výchozí stav. */
  settings?: ChapterSettings;
}

export function ModeratorHelp({
  showLeadership = true,
  passwordReset = false,
  attendance = false,
  attendanceHistory = false,
  internalMeetings = false,
  semafor = false,
  semaforImport = false,
  semaforPoints = false,
  semaforCommittee = false,
  settings = DEFAULT_CHAPTER_SETTINGS,
}: ModeratorHelpProps = {}) {
  const sources = bonusSources(settings);
  const day = weekdayAccusative(settings.meetingWeekday);
  return (
    <div className="space-y-8">
      {attendance && (
        <>
          <HelpSection
            title="Docházka pro správce"
            steps={[
              "V den schůzky vám ráno před 7:00 přijde mail s odkazem na zápis. Platí 12 hodin a nepotřebuje přihlášení. Docházku najdete i v aplikaci v menu Docházka, záložka Zápis.",
              "Zapisovat jde dvěma způsoby: průběžně zaškrtávejte Přítomen u příchozích, nebo označte jen ty, kdo chyběli (Chyběl(a) bez omluvy).",
              "Náhradníka zapíšete tak, že u člena zaškrtnete Přítomen, tím se zpřístupní volba „s náhradníkem“ (u omluvy s náhradníkem se jméno vyplní samo). Kdo zůstane bez zápisu, počítá se při uzávěrce jako přítomný, s omluvou jako omluvený a s omluvou s náhradníkem jako náhradník. Pod jménem řádku bez zápisu to vidíte napsané.",
              "Kdo se omluvil až ráno, tomu zaškrtněte Omluven(a). Odškrtnutím Omluven(a) se smaže omluva i se jménem náhradníka, aplikace se předtím zeptá a vrátit to nejde.",
              "Každé kliknutí se hned uloží. Když řádek mezitím změnil jiný správce, uvidíte jeho stav a hlášku. Klikněte znovu.",
              "V 17:00 se den uzavře a přijde vám report. Potom už zápis nejde.",
            ]}
            faq={[
              {
                q: "Ranní mail nepřišel.",
                a: "Mrkněte do spamu. Zapisovat můžete i přes menu Docházka.",
              },
              {
                q: "Kdo se na schůzku omluvil?",
                a: "V menu Docházka, záložka Omluvy. Číslo pod dnem je počet omluvených. Klepněte na den a pod kalendářem uvidíte, kdo se omluvil a jestli posílá náhradníka.",
              },
              {
                q: "Jak najdu, koho jsem ještě nezapsal(a)?",
                a: "Nad seznamem přepněte filtr na „Bez zápisu“. Na dnešek bez schůzky v aplikaci zapisujte, jen když se schůzka opravdu konala.",
              },
              { q: "", a: helpAttendanceManagerUnexcused(settings.meetingTime) },
            ]}
          />
          {attendanceHistory && (
            <HelpSection
              title="Opravy po uzávěrce"
              intro="Opravit uzavřený nebo starší den může admin, Prezident a Viceprezident v záložce Zápis. Každá oprava se zapíše do historie oprav. Report se znovu neposílá."
            />
          )}
        </>
      )}

      {(semafor || semaforPoints) && settings.semaforEnabled && (
        <HelpSection
          title="Semafor pro vedení"
          faq={helpSemaforLeadership(sources)
            .filter((h) => (semaforImport || !h.importOnly) && (semaforPoints || !h.pointsOnly) && (semaforCommittee || !h.committeeOnly))
            .map((h) => ({
            q: "",
            a: h.text,
          }))}
        />
      )}

      {internalMeetings && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Interní schůzka</h2>
          <p className="text-sm text-text-muted mb-3">
            V menu Docházka klepněte na den a zvolte Založit interní schůzku.
            Den se počítá do docházky: správci docházky dostanou ráno před 7:00
            odkaz na zápis a v 17:00 report. Hosté ani hlasování se nezakládají.
          </p>
          <p className="text-sm text-text-muted mb-3">
            Zrušit ji můžete do 17:00 v den schůzky, dokud správce docházky nic
            nezapsal. Zrušením se smažou všechny omluvy členů na ten den. Členům
            o tom mail nepřijde.
          </p>
          <p className="text-sm text-text-muted mb-3">
            Když má být místo interní běžná schůzka, založte ji ve Schůzkách a
            interní nerušte. Platí běžná a omluvy zůstanou. Když běžnou schůzku
            potom smažete, platí zase interní.
          </p>
        </section>
      )}

      {showLeadership && (
      <>
      <HelpSection
        title="Přihlášení vedení"
        steps={[
          "Na přihlašovací stránce zadejte e-mail a klikněte na „Pokračovat“.",
          "Zadejte heslo a klikněte na „Přihlásit se“.",
        ]}
        note="Funkce vedení máte jen po přihlášení heslem. Přes „Poslat odkaz místo hesla“ se přihlásíte jako člen, na 12 hodin a bez tlačítek vedení. Přihlášení heslem vydrží 8 hodin."
        faq={[
          {
            q: "Heslo ještě nemám.",
            a: "Když vám admin dá funkci nebo roli, přijde vám mail „BNI Plzeň: nastav si heslo pro vedení“. Odkaz platí 24 hodin a jde použít jednou. Heslo musí mít aspoň 8 znaků.",
          },
          {
            q: "Jak změním heslo?",
            a: "V menu Účet, „Heslo“, tlačítko „Změnit heslo“. Na ostatních zařízeních se odhlásíte.",
          },
          {
            q: "Zapomněl(a) jsem heslo.",
            a: "Napište adminovi nebo moderátorovi. V menu Členové vám pošle nový odkaz pro nastavení hesla.",
          },
          ...(passwordReset
            ? [
                {
                  q: "Člen vedení zapomněl heslo.",
                  a: "V menu Členové u něj dejte „Poslat odkaz pro nové heslo“. Jeho dosavadní heslo hned přestane platit a odhlásí se. Odkaz platí 24 hodin, může skončit ve spamu. Účet admina ani vlastní heslo tudy nezměníte. Prezident a Viceprezident to dělají na stránce člena, karta Heslo.",
                },
              ]
            : []),
        ]}
      />

      <HelpSection
        title="Schůzka a hosté"
        steps={[
          "Na stránce Schůzky vyplňte v kartě „Nová schůzka“ datum, případně místo konání, a klikněte na „Vytvořit“.",
          "Hosty přidáte třemi cestami. Na stránce Hosté přes „+ Přidat hosta“ (nechte zaškrtnuté „Přidat do schůzky {datum}“). V detailu schůzky přes „Přidat hosta“ u hosta, který už v aplikaci je. Nebo hromadně v části „Hromadný import hostů“ přes „Importovat hosty (.xlsx)“.",
          "Pořadí hostů změníte přetažením za „≡“.",
          "Prezenční listinu stáhnete přes „Exportovat seznam (.xlsx)“.",
        ]}
        note="Hosty jde přidávat a importovat jen ve stavu Návrh. Po spuštění hlasování už ne."
        faq={[
          {
            q: "Kategorie hosta je povinná.",
            a: "Vyberte ze seznamu, nebo napište novou a zvolte „Vytvořit: {název}“. Držte se raději seznamu, kategorie vycházejí z číselníku CZ-NACE.",
          },
          {
            q: "Co musí mít importní soubor?",
            a: "Sloupce Full Name, Email, Phone Number, Company Name, Company profile (z něj je kategorie) a Poznamka, nejvýš 500 řádků. Host se stejným e-mailem nebo jménem se nezaloží znovu, sloučí se.",
          },
        ]}
      />

      <HelpSection
        title="Spuštění hlasování"
        steps={[
          "Otevřete detail schůzky a klikněte na „Spustit hlasování“. Hlasuje se o všech hostech schůzky.",
          "Potvrďte. Odkazy členům odejdou ráno v den schůzky, ne hned.",
        ]}
        note={autostartHelp(settings)}
        faq={[
          {
            q: "Spouštím hlasování až v den schůzky.",
            a: "Maily pak odejdou hned. Kdo odkaz nedostal, tomu ho pošlete přes „Rozeslat hned“.",
          },
          {
            q: "Člen ztratil odkaz.",
            a: "V detailu schůzky v části „Osobní odkazy členů“ ho zkopírujte tlačítkem „Zkopírovat odkaz“, nebo pošlete přes „Poslat e-mailem“. Zkopírováním i tlačítkem „Nový odkaz“ vznikne nový odkaz a ten z e-mailu přestane platit. „Zneplatnit“ odkaz zruší.",
          },
          {
            q: "Proč mi přišel varovný mail?",
            a: warningMailHelp(settings),
          },
          {
            q: "",
            a: "Připomínky členům, kteří ještě nehlasovali, chodí samy, nejvýš třikrát.",
          },
        ]}
      />

      <HelpSection
        title="Uzavření a report"
        intro={closeVotingHelp(settings)}
        note="„Uzavřít hlasování“ v detailu schůzky ukončí hlasování hned a vrátit to nejde. Report se při tom neposílá. Pošlete ho tlačítkem „Poslat report vedení“, aplikace se předtím zeptá. Každé kliknutí pošle nový mail celému vedení."
        faq={[
          {
            q: "Kde je uzavřená schůzka?",
            a: "Pořád na stránce Schůzky se stavem Uzavřeno. Hosty z ní najdete i v Archivu.",
          },
          {
            q: "",
            a: "Výsledky během hlasování vidí v detailu schůzky jen vedení. Členové je v aplikaci vidí až po uzavření.",
          },
        ]}
      />

      <HelpSection
        title="Úprava hosta"
        intro="V detailu hosta změníte kategorii v kartě „Změna kategorie“ tlačítkem „Změnit“. Jiné údaje hosta v aplikaci upravit nejdou."
        faq={[
          {
            q: "Host se stal členem.",
            a: "Klikněte na „Povýšit na člena“. Vznikne člen a host se smaže i s poznámkami a hlasy, vrátit to nejde. Novému členovi pak admin v Členech zkontroluje e-mail, ať se může přihlásit.",
          },
          {
            q: "",
            a: "Hosta smazat nemůžete, to dělá admin.",
          },
        ]}
      />

      <HelpSection
        title="Akce"
        intro="V Akcích se hlasuje o termínu nebo jiné volbě, třeba o místě. Hlasují členové i lidé mimo chapter, přes odkaz z mailu."
        steps={[
          "Klikněte na „+ Nová akce“. Vyplňte název, typ hlasování (Jedna možnost, Více možností, nebo Nejvýš N možností), typ možností (text, datum, datum a čas), kdo může hlasovat a do kdy platí odkaz. Uložte „Vytvořit akci“.",
          "V detailu akce přidejte možnosti a účastníky. Lidi mimo chapter přes „Přidat externího účastníka“.",
          "Klikněte na „Spustit akci“. Účastníkům odejde pozvánka s odkazem.",
          "Po hlasování „Uzavřít akci“, vítěze označte „Označit vítěze“ a po akci „Označit jako konanou“.",
        ]}
        faq={[
          {
            q: "",
            a: "Výsledky stáhnete v části „Report výsledků“ přes „Exportovat CSV“.",
          },
          {
            q: "Účastník nemá mail.",
            a: "V části „Účastníci“ mu ho pošlete znovu přes „Znovu odeslat“.",
          },
        ]}
      />

      <HelpSection
        title="Časovače"
        intro="Časovač odpočítává čas na projekci, třeba u prezentací členů na schůzce."
        steps={[
          "Na stránce Časovače vyplňte název a délku v sekundách a klikněte na „Vytvořit časovač“.",
          "Zkopírujte oba odkazy. „Odkaz pro publikum“ patří na projekci, „Odkaz pro moderátora“ si nechte.",
          "Na ovládacím odkazu časovač spustíte „Spustit“, zastavíte „Pauza“ a vrátíte „Reset“.",
        ]}
        note="Oba odkazy se ukážou jen jednou. Ze seznamu časovačů je ale zkopírujete znovu."
        faq={[
          {
            q: "",
            a: "Malé okno místo celé obrazovky: na konec odkazu pro publikum přidejte ?mini=1.",
          },
        ]}
      />

      <HelpSection
        title="Pohovory s novými členy"
        intro="V pátém a desátém měsíci členství dělá vedení s členem pohovor. Komu pohovor vychází, ukazuje stránka Pohovory a dashboard. „Na řadě“ znamená, že od vstupu člena uplynulo 5 nebo 10 měsíců, „Blíží se“ že bude na řadě brzy."
        steps={[
          "Klikněte na „Založit pohovor“, vyberte člena, typ (5 nebo 10 měsíců) a vedoucího pohovoru.",
          "V detailu pohovoru pošlete vedoucímu odkaz na formulář tlačítkem „Odeslat odkaz“. Vedoucí ho vyplní bez přihlášení.",
          "Po vyplnění pošlete report přes „Odeslat report“. Po obou pohovorech je porovnají „Porovnat 5 vs 10“.",
        ]}
        faq={[
          {
            q: "",
            a: "Otázky upravíte ve „Správě otázek“. U každé zaškrtnete, jestli platí pro pohovor po 5, nebo po 10 měsících. Otázka, která pro daný pohovor neplatí, je ve formuláři přeškrtnutá.",
          },
          {
            q: "U člena svítí „Neověřené datum vstupu“.",
            a: "Datum vstupu doplní admin v Členech, podle něj se počítá, kdy pohovor vychází.",
          },
        ]}
      />

      <HelpSection
        title="Provoz"
        intro="Provoz ukazuje, co aplikace sama dělala: rozesílání odkazů, připomínky, reporty, varování a zásahy vedení. Filtrujete podle člena, schůzky, závažnosti a data."
        faq={[
          {
            q: "Člen tvrdí, že mail nedostal.",
            a: "Otevřete běh a podívejte se na „Stav u poskytovatele“. „Doručeno“ znamená, že mail dorazil, nejspíš je ve spamu. „Odmítnuto“ znamená špatnou adresu.",
          },
        ]}
      />

      {settings.mastermindEnabled && (
        <section>
          <h2 className="text-lg font-semibold mb-3">
            Master mind: zařazování
          </h2>
          <p className="text-sm text-text-muted mb-3">
            Interní schůzku založíte v menu Docházka. Případ ze zásobníku
            zařadíte na {day} a pořadí zásobníku podle zájmu je jen podklad,
            o programu rozhoduje vedení.
          </p>
          <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
            <li>
              Otevřete <strong>Master mind</strong>. U každého případu v zásobníku
              je hned vidět panel <strong>Zařadit na</strong>, rozbalovat nic
              nemusíte.
            </li>
            <li>
              V panelu vyberte termín. Termín označený „(schůzka s hosty)“
              nebo „(už má jiný případ)“ vybrat nejde.
            </li>
            <li>
              Klikněte na <strong>Zařadit</strong>. Datum interní uvidí všichni
              na kartě případu.
            </li>
            <li>
              Po interní klikněte u případu na <strong>Proběhlo</strong>.
            </li>
          </ol>
          <ul className="text-sm space-y-1">
            <li>
              <strong>Jak je to s lhůtou?</strong> Téma ohlašujeme 14 dní předem.
              Aplikace kratší lhůtu nezakáže, jen ji při zařazení ukáže.
            </li>
            <li>
              <strong>Co když případ přesunu?</strong> Přesun na jiný termín
              znamená <strong>Vrátit do zásobníku</strong> a pak znovu{" "}
              <strong>Zařadit</strong>.
            </li>
            <li>
              <strong>Případ za člena, který se přihlásil ústně.</strong> V
              formuláři Přihlásit případ vyberte člena, který téma přináší. Limit 5
              otevřených případů platí i tady.
            </li>
            <li>
              <strong>Změna člena, který téma přináší.</strong> U zapsaného případu jde jen
              smazat a zapsat znovu, zájmy se přitom ztratí.
            </li>
            <li>
              <strong>Vrátit potvrzení.</strong> Slouží jen na opravu překlepu.
            </li>
          </ul>
        </section>
      )}

      {settings.burzaEnabled && (
        <section>
          <h2 className="text-lg font-semibold mb-3">
            Burza pomoci: zápis za členy
          </h2>
          <p className="text-sm text-text-muted mb-3">
            Řádky v burze si píšou členové sami. Vedení je může zapsat nebo
            upravit za člena, třeba podle papíru z interní, a zapsat pomoc podle
            hlášení.
          </p>
          <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
            <li>
              Otevřete <strong>Burza pomoci</strong>. V části{" "}
              <strong>Pro vedení</strong> rozbalte <strong>Bez řádku</strong> a
              u člena klikněte na <strong>Zapsat</strong>.
            </li>
            <li>
              Vyplňte <strong>S čím pomůžu</strong>, případně kontakt a
              poznámku, a klikněte na <strong>Uložit</strong>.
            </li>
          </ol>
          <ul className="text-sm space-y-1">
            <li>
              <strong>Řádek už existuje.</strong> U karty člena klikněte na{" "}
              <strong>Upravit</strong>. Člen svůj řádek kdykoli přepíše nebo
              smaže. Na kartě se nijak neliší, kdo ho psal.
            </li>
            <li>
              <strong>Revize řádku.</strong> Když člen řekne, že jeho řádek
              platí, otevřete <strong>Upravit</strong> a uložte. Uložení posune
              datum potvrzení.
            </li>
            <li>
              <strong>Zápis pomoci podle hlášení.</strong> Otevřete{" "}
              <strong>Záznamy pomoci</strong>, vyberte, kdo pomohl a komu, a
              klikněte na <strong>Zapsat</strong>. Pokud pomocník ve výběru
              chybí, nemá řádek v burze. Napřed mu ho zapište, pak pomoc.
            </li>
            <li>
              <strong>Kontakty člena.</strong> Nevhodnou položku upravíte nebo
              smažete přes <strong>Upravit</strong> na kartě kontaktu. Využití
              kontaktu se podle hlášení nezapisuje, člen si ho zaškrtne sám.
            </li>
            <li>
              <strong>Mazání.</strong> Záznam pomoci i využití kontaktu smažete
              tlačítkem <strong>Smazat</strong> na stránce Záznamy pomoci, řádek
              člena na jeho formuláři. Když se smaže položka kontaktu, záznamy o
              jejím využití zůstanou.
            </li>
            <li>
              <strong>Co se loguje?</strong> Zásahy vedení do cizích řádků a
              záznamů vidíte v sekci Provoz, bez textů a kontaktů.
            </li>
            <li>
              <strong>Akce vedení fungují jen po přihlášení heslem.</strong> Po
              přihlášení odkazem z e-mailu jste v aplikaci jako člen a tlačítka
              vedení neuvidíte.
            </li>
          </ul>
        </section>
      )}

      <HelpSection
        title="Co dělá jen admin"
        intro="Člen výboru a moderátor nespravují členy ani funkce, nedeaktivují členy, nemažou hosty, schůzky ani akce a nepřejmenovávají ani nemažou kategorie. Z hesel mohou jen členovi vedení poslat odkaz pro nové heslo. To dělá admin, Prezident a Viceprezident. V sekci Admin vidí moderátor a Člen výboru jen Členové, a v nich seznam Hesla vedení. Kategorie a Nastavení chapteru vidí jen admin, Prezident a Viceprezident. Přidělování admina a funkcí, odkaz ke zkopírování a změny v účtu admina dělá jen admin."
      />
      </>
      )}
    </div>
  );
}
