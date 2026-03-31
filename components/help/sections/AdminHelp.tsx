export function AdminHelp() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-3">Správa členů</h2>
        <p className="text-sm text-text-muted mb-3">
          Admin spravuje seznam členů aplikace — uživatelů, kteří se přihlašují
          magic linkem. Admin může revokovat stávající magic link (člen se jím
          přihlásit nemůže) nebo člena zcela smazat.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            V navigaci klikněte na <strong>Členové</strong> (sekce Admin).
          </li>
          <li>Zobrazí se seznam všech členů s jejich statusem.</li>
          <li>
            Pro <strong>revokaci magic linku</strong>: klikněte na jméno člena,
            pak na <strong>Revokovat odkaz</strong> a potvrďte akci.
          </li>
          <li>
            Pro <strong>smazání člena</strong>: klikněte na jméno člena, pak na{" "}
            <strong>Smazat člena</strong> a potvrďte akci.
          </li>
        </ol>
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm mb-3">
          Revokace magic linku je nevratná pro stávající odkaz — člen se
          přihlásit nemůže, dokud mu nebude vygenerován a zaslán nový magic
          link. Smazání člena je nevratná akce; záznam nelze obnovit.
        </div>
        <ul className="text-sm space-y-1">
          <li>
            <strong>
              Jak vygeneruji členovi nový magic link po revokaci?
            </strong>{" "}
            — Nový magic link se vygeneruje automaticky při zaslání pozvánky
            členovi; kontaktujte administraci systému pro zaslání nového odkazu.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Správa kategorií</h2>
        <p className="text-sm text-text-muted mb-3">
          Admin spravuje seznam kategorií dle číselníku CZ-NACE, které
          moderátoři přiřazují hostům. Kategorie lze přidávat, přejmenovávat a
          mazat.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            V navigaci klikněte na <strong>Kategorie</strong> (sekce Admin).
          </li>
          <li>
            Pro <strong>přidání kategorie</strong>: klikněte na{" "}
            <strong>Přidat kategorii</strong>, zadejte název a klikněte na{" "}
            <strong>Uložit</strong>.
          </li>
          <li>
            Pro <strong>přejmenování kategorie</strong>: klikněte na ikonu
            editace u kategorie, změňte název a klikněte na{" "}
            <strong>Uložit</strong>.
          </li>
          <li>
            Pro <strong>smazání kategorie</strong>: klikněte na ikonu smazání u
            kategorie a potvrďte akci.
          </li>
        </ol>
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm mb-3">
          Smazáním kategorie ji ztratí všichni hosté, kteří ji mají přiřazenou
          — jejich záznam zůstane, ale pole kategorie bude prázdné. Tuto akci
          nelze vzít zpět.
        </div>
        <ul className="text-sm space-y-1">
          <li>
            <strong>
              Mohu přidat vlastní kategorii, která není v CZ-NACE?
            </strong>{" "}
            — Ano, při přidávání kategorie lze zadat libovolný název; doporučujeme
            však používat standardní číselník CZ-NACE pro konzistenci.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Mazání hostů</h2>
        <p className="text-sm text-text-muted mb-3">
          Admin může trvale smazat hosta ze systému. Tato funkce je určena pro
          odstranění záznamů, které byly vytvořeny chybně nebo jsou již
          neaktuální.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            V navigaci klikněte na <strong>Hosté</strong>.
          </li>
          <li>
            Vyberte hosta, kterého chcete smazat, a otevřete jeho detail.
          </li>
          <li>
            Klikněte na tlačítko <strong>Smazat hosta</strong>.
          </li>
          <li>
            Potvrďte smazání v dialogovém okně kliknutím na{" "}
            <strong>Potvrdit</strong>.
          </li>
        </ol>
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm mb-3">
          Smazání hosta je nevratná akce. Spolu s hostem se trvale smažou i
          všechny hlasy, které k němu byly odevzdány. Tuto akci nelze vzít
          zpět.
        </div>
        <ul className="text-sm space-y-1">
          <li>
            <strong>
              Co se stane s hlasováními, kde byl host zařazen?
            </strong>{" "}
            — Záznamy o schůzce zůstanou, ale host a jeho hlasy budou trvale
            odstraněny z výsledků.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Změna hesla</h2>
        <p className="text-sm text-text-muted mb-3">
          Admin může změnit heslo pro účty moderátora nebo admina. Tato funkce
          je dostupná v sekci Nastavení a slouží například při zapomenutí hesla
          nebo pravidelné rotaci přihlašovacích údajů.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            V navigaci klikněte na <strong>Nastavení</strong> (sekce Účet).
          </li>
          <li>
            Přejděte na kartu nebo sekci <strong>Změna hesla</strong>.
          </li>
          <li>Vyberte uživatelský účet, jehož heslo chcete změnit.</li>
          <li>
            Zadejte nové heslo do pole <strong>Nové heslo</strong>.
          </li>
          <li>
            Zadejte heslo znovu do pole <strong>Potvrdit heslo</strong>.
          </li>
          <li>
            Klikněte na <strong>Uložit heslo</strong>.
          </li>
        </ol>
        <ul className="text-sm space-y-1">
          <li>
            <strong>
              Mohu změnit heslo moderátora, pokud je přihlášen?
            </strong>{" "}
            — Ano, admin může heslo změnit kdykoliv; moderátor bude muset použít
            nové heslo při příštím přihlášení.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Přidání nového moderátora nebo admina
        </h2>
        <p className="text-sm text-text-muted mb-3">
          Admin může přidat do systému nového uživatele s rolí moderátor nebo
          admin. Moderátor spravuje schůzky a hlasování; admin má navíc přístup
          ke správě členů, kategorií, mazání dat a nastavení hesel.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            V navigaci klikněte na <strong>Členové</strong> (sekce Admin).
          </li>
          <li>
            Klikněte na tlačítko <strong>Přidat uživatele</strong> nebo{" "}
            <strong>Přidat moderátora/admina</strong>.
          </li>
          <li>
            Zadejte jméno, přihlašovací jméno a dočasné heslo nového uživatele.
          </li>
          <li>
            Vyberte roli: <strong>Moderátor</strong> nebo <strong>Admin</strong>.
          </li>
          <li>
            Klikněte na <strong>Uložit</strong> — nový účet bude vytvořen.
          </li>
          <li>
            Sdělte novému uživateli přihlašovací údaje a doporučte změnu hesla.
          </li>
        </ol>
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm mb-3">
          Roli Admin přidělujte pouze důvěryhodným osobám — admin má přístup k
          nevratným akcím (smazání členů, hostů, revokace odkazů).
        </div>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Jaký je rozdíl mezi moderátorem a adminem?</strong> —
            Moderátor může vytvářet schůzky, spravovat hosty a řídit hlasování.
            Admin má navíc přístup ke správě členů, kategorií, mazání hostů a
            změně hesel.
          </li>
          <li>
            <strong>
              Může moderátor sám povýšit svou roli na admina?
            </strong>{" "}
            — Ne, změnu role může provést pouze admin.
          </li>
        </ul>
      </section>
    </div>
  );
}
