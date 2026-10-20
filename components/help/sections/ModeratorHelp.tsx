import { HelpSection } from "@/components/help/HelpParts";

interface ModeratorHelpProps {
  /** Funkce vedení (session s heslem). Správce docházky přihlášený odkazem je nemá. */
  showLeadership?: boolean;
  /** Právo `attendance.view_all`: sekce „Docházka pro správce“. */
  attendance?: boolean;
  /** Právo `attendance.edit_history`: sekce „Opravy po uzávěrce“. */
  attendanceHistory?: boolean;
}

export function ModeratorHelp({
  showLeadership = true,
  attendance = false,
  attendanceHistory = false,
}: ModeratorHelpProps = {}) {
  return (
    <div className="space-y-8">
      {attendance && (
        <>
          <HelpSection
            title="Docházka pro správce"
            steps={[
              "V den schůzky vám ráno před 7:00 přijde mail s odkazem na zápis. Platí 12 hodin a nepotřebuje přihlášení. Docházku najdete i v aplikaci v menu Docházka, záložka Zápis.",
              "Zaškrtněte Přítomen u každého, kdo přišel. Když za člena přišel náhradník, zaškrtněte i „s náhradníkem“ a napište jméno. Ohlášený náhradník se vyplní sám.",
              "Kdo se omluvil až ráno, tomu zaškrtněte Omluven(a).",
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
            a: "V Nastavení, „Změnit heslo“. Na ostatních zařízeních se odhlásíte.",
          },
          {
            q: "Zapomněl(a) jsem heslo.",
            a: "Napište adminovi, pošle vám nový odkaz pro nastavení hesla.",
          },
        ]}
      />

      <HelpSection
        title="Schůzka a hosté"
        steps={[
          "Na stránce Schůzky vyplňte v kartě „Nová schůzka“ datum, případně místo konání, a klikněte na „Vytvořit“.",
          "Hosty přidáte třemi cestami. Na stránce Hosté přes „+ Přidat hosta“ (nechte zaškrtnuté „Přidat do schůzky {datum}“). V detailu schůzky přes „Přidat hosta“ u hosta, který už v aplikaci je. Nebo hromadně přes „Importovat hosty (.xlsx)“.",
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
        note="Když hlasování ve čtvrtek ráno neběží, aplikace ho pro dnešní schůzku spustí sama. Den předem a v den schůzky vás na to upozorní pruh nahoře na každé stránce, s odkazem „Spustit hlasování“. Hlasování běží do středy 23:59 po schůzce."
        faq={[
          {
            q: "Spouštím hlasování až v den schůzky.",
            a: "Maily pak odejdou hned. Kdo odkaz nedostal, tomu ho pošlete přes „Rozeslat hned“.",
          },
          {
            q: "Člen ztratil odkaz.",
            a: "V detailu schůzky v části „Magic linky členů“ ho zkopírujte, nebo pošlete znovu.",
          },
          {
            q: "Proč mi přišel varovný mail?",
            a: "Ve čtvrtek ráno nebylo co spustit, nebo něco neodešlo. Podrobnosti jsou v Provozu.",
          },
          {
            q: "",
            a: "Připomínky členům, kteří ještě nehlasovali, chodí samy, nejvýš třikrát.",
          },
        ]}
      />

      <HelpSection
        title="Uzavření a report"
        intro="Hlasování skončí ve středu 23:59 po schůzce a ve čtvrtek ráno ho aplikace sama uzavře. Report pak odejde mailem všem z vedení: počty hlasů, kdo jak hlasoval, důvody u „Proti“ a poznámky."
        note="„Uzavřít hlasování“ v detailu schůzky ukončí hlasování hned a vrátit to nejde. Report se při tom neposílá. Pošlete ho tlačítkem „Generovat report“."
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
          "Klikněte na „+ Nová akce“. Vyplňte název, typ hlasování (jedna možnost, víc, nebo nejvýš N), typ možností (text, datum, datum a čas), kdo může hlasovat a do kdy platí odkaz. Uložte „Vytvořit akci“.",
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
          "Zkopírujte oba odkazy. Zobrazovací patří na projekci, ovládací si nechte.",
          "Na ovládacím odkazu časovač spustíte „Spustit“, zastavíte „Pauza“ a vrátíte „Reset“.",
        ]}
        note="Oba odkazy se ukážou jen jednou. Ze seznamu časovačů je ale zkopírujete znovu."
        faq={[
          {
            q: "",
            a: "Malé okno místo celé obrazovky: na konec zobrazovacího odkazu přidejte ?mini=1.",
          },
        ]}
      />

      <HelpSection
        title="Pohovory s novými členy"
        intro="V pátém a desátém měsíci členství dělá vedení s členem pohovor. Komu pohovor vychází, ukazuje stránka Pohovory a dashboard."
        steps={[
          "Klikněte na „Založit pohovor“, vyberte člena, typ (5 nebo 10 měsíců) a vedoucího pohovoru.",
          "V detailu pohovoru pošlete vedoucímu odkaz na formulář. Vedoucí ho vyplní bez přihlášení.",
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

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Master mind: zařazování
        </h2>
        <p className="text-sm text-text-muted mb-3">
          Interní schůzky se v aplikaci nezakládají. Případ ze zásobníku
          zařadíte na čtvrtek a pořadí zásobníku podle zájmu je jen podklad,
          o programu rozhoduje vedení.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            Otevřete <strong>Master mind</strong>. U každého případu v zásobníku
            je hned vidět panel <strong>Zařadit na</strong>, rozbalovat nic
            nemusíte.
          </li>
          <li>
            V panelu vyberte čtvrtek. Čtvrtek s
            otevřenou schůzkou nebo s jiným případem vybrat nejde.
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
            <strong>Co když případ přesunu?</strong> Přesun na jiný čtvrtek
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
            stáhnout a zapsat znovu, zájmy se přitom ztratí.
          </li>
          <li>
            <strong>Vrátit potvrzení.</strong> Slouží jen na opravu překlepu.
          </li>
        </ul>
      </section>

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

      <HelpSection
        title="Co dělá jen admin"
        intro="Člen výboru a moderátor nespravují členy ani funkce, nedeaktivují členy, nemění cizí hesla, nemažou hosty, schůzky ani akce a nepřejmenovávají ani nemažou kategorie. To dělá admin, Prezident a Viceprezident. Sekci Admin s položkami Členové a Kategorie vidí v menu jen oni. Přidělování admina, funkcí a hesel a změny v účtu admina dělá jen admin."
      />
      </>
      )}
    </div>
  );
}
