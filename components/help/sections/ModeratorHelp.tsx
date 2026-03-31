export function ModeratorHelp() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-3">Přihlášení</h2>
        <p className="text-sm text-text-muted mb-3">
          Moderátor se přihlašuje do aplikace pomocí hesla na přihlašovací
          stránce. Na rozdíl od členů, kteří používají magic link, moderátor
          zadává přímo své uživatelské jméno a heslo.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            Přejděte na stránku <strong>/login</strong>.
          </li>
          <li>Zadejte své přihlašovací jméno a heslo.</li>
          <li>
            Klikněte na tlačítko <strong>Přihlásit se</strong>.
          </li>
          <li>
            Po úspěšném přihlášení budete přesměrováni na Dashboard.
          </li>
        </ol>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Jak změním heslo?</strong> — Heslo lze změnit v sekci{" "}
            <strong>Nastavení</strong> — tato funkce je dostupná pouze adminovi;
            požádejte admina o změnu.
          </li>
          <li>
            <strong>Proč nemohu použít magic link jako člen?</strong> —
            Moderátoři a admini se přihlašují heslem; magic link je určen pouze
            pro členy s omezenou rolí.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Vytvoření schůzky a místo konání
        </h2>
        <p className="text-sm text-text-muted mb-3">
          Moderátor vytváří nové schůzky, ke kterým se přiřazují hosté a spouští
          hlasování. Každá schůzka má datum a volitelné pole Místo konání, které
          slouží pro evidenci, kde se schůzka koná.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            V navigaci klikněte na <strong>Schůzky</strong>.
          </li>
          <li>
            Klikněte na tlačítko <strong>Vytvořit schůzku</strong>.
          </li>
          <li>Zadejte datum schůzky (povinné pole).</li>
          <li>
            Volitelně vyplňte pole <strong>Místo konání</strong> (např. &ldquo;Café
            Imperial, Praha&rdquo;).
          </li>
          <li>
            Klikněte na <strong>Uložit</strong>.
          </li>
          <li>Nově vytvořená schůzka se zobrazí v seznamu schůzek.</li>
        </ol>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Je Místo konání povinné?</strong> — Ne, pole Místo konání je
            volitelné; vyplňte ho pouze tehdy, pokud chcete mít místo evidováno
            v reportu.
          </li>
          <li>
            <strong>Kde uvidím vytvořenou schůzku?</strong> — Schůzka se zobrazí
            ihned v seznamu na stránce Schůzky a bude dostupná k editaci.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Výběr hostů před hlasováním
        </h2>
        <p className="text-sm text-text-muted mb-3">
          Před spuštěním hlasování se zobrazí checklist hostů, kde moderátor
          určí, kteří hosté půjdou do hlasování. Výchozí stav je, že jsou
          zaškrtnuti všichni hosté přiřazení ke schůzce; moderátor může
          jednotlivé hosty odznačit.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            Otevřete detail schůzky, pro kterou chcete spustit hlasování.
          </li>
          <li>
            Klikněte na tlačítko <strong>Spustit hlasování</strong> — zobrazí se
            checklist hostů.
          </li>
          <li>Zkontrolujte seznam hostů; všichni jsou výchozně zaškrtnuti.</li>
          <li>
            Odznačte zaškrtávací políčko u hostů, kteří se hlasování neúčastní.
          </li>
          <li>
            Klikněte na <strong>Potvrdit a spustit</strong> — hlasování se
            spustí jen pro vybrané hosty.
          </li>
        </ol>
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm mb-3">
          Po kliknutí na &ldquo;Potvrdit a spustit&rdquo; již nelze seznam hlasovaných hostů
          změnit bez uzavření a opětovného spuštění hlasování.
        </div>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Co se stane s hostem, kterého odznačím?</strong> — Host
            zůstane přiřazen ke schůzce, ale nebude zařazen do aktuálního
            hlasování.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Spuštění a správa hlasování
        </h2>
        <p className="text-sm text-text-muted mb-3">
          Moderátor spouští hlasování po potvrzení výběru hostů a sleduje jeho
          průběh. Hlasování uzavře, jakmile jsou sbírány všechny hlasy nebo
          uplyne čas schůzky. Po uzavření schůzka přechází do archivu.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            Otevřete detail schůzky a projděte checklist hostů (viz předchozí
            kapitola).
          </li>
          <li>
            Kliknutím na <strong>Potvrdit a spustit</strong> otevřete hlasování
            — stav schůzky se změní na <strong>Aktuální</strong>.
          </li>
          <li>
            Sledujte průběh hlasování na detailu schůzky (přehled odevzdaných
            hlasů).
          </li>
          <li>
            Po dokončení hlasování klikněte na tlačítko{" "}
            <strong>Uzavřít hlasování</strong>.
          </li>
          <li>
            Schůzka přejde do stavu <strong>Uzavřeno</strong> a bude přesunuta
            do archivu.
          </li>
        </ol>
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm mb-3">
          Po uzavření hlasování nelze přijímat další hlasy. Schůzka bude
          dostupná pouze v archivu.
        </div>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Kde najdu schůzku po uzavření?</strong> — Uzavřené schůzky
            jsou v sekci <strong>Archiv</strong> v navigaci.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Správa hostů</h2>
        <p className="text-sm text-text-muted mb-3">
          Moderátor může přidávat nové hosty do systému a editovat existující
          záznamy. Každý host má profil s kontaktními údaji a kategorií dle
          číselníku CZ-NACE.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            V navigaci klikněte na <strong>Hosté</strong>.
          </li>
          <li>
            Pro přidání nového hosta klikněte na <strong>Přidat hosta</strong>.
          </li>
          <li>
            Vyplňte formulář: <strong>Jméno</strong>, <strong>Firma</strong>,{" "}
            <strong>E-mail</strong>, <strong>Kategorie</strong>,{" "}
            <strong>Popis</strong>.
          </li>
          <li>
            V poli <strong>Kategorie</strong> vyberte ze seznamu (CZ-NACE
            číselník) nebo klikněte na <strong>Vytvořit novou kategorii</strong>{" "}
            a zadejte vlastní název.
          </li>
          <li>
            Klikněte na <strong>Uložit</strong> — host je přidán do systému.
          </li>
          <li>
            Pro editaci existujícího hosta klikněte na jeho jméno v seznamu a
            pak na <strong>Upravit</strong>.
          </li>
        </ol>
        <ul className="text-sm space-y-1">
          <li>
            <strong>
              Mohu hosta přiřadit ke schůzce hned při vytváření?
            </strong>{" "}
            — Ano, v procesu přidávání hosta lze schůzku přiřadit přímo z
            formuláře.
          </li>
          <li>
            <strong>
              Doporučuje se vlastní kategorie nebo ze seznamu?
            </strong>{" "}
            — Doporučujeme použít standardní kategorii ze seznamu CZ-NACE;
            vlastní kategorii použijte jen pokud vhodná kategorie v číselníku
            neexistuje.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Generování reportu</h2>
        <p className="text-sm text-text-muted mb-3">
          Report schůzky je souhrn výsledků hlasování — zobrazuje, kteří hosté
          byli hodnoceni a jak dopadlo jejich hlasování. Report je dostupný po
          uzavření schůzky.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            Otevřete sekci <strong>Archiv</strong> v navigaci.
          </li>
          <li>
            Vyberte uzavřenou schůzku, pro kterou chcete zobrazit report.
          </li>
          <li>
            Na detailu schůzky klikněte na tlačítko{" "}
            <strong>Zobrazit report</strong>.
          </li>
          <li>
            Report se zobrazí na obrazovce se seznamem hostů a výsledky
            hlasování.
          </li>
        </ol>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Co report obsahuje?</strong> — Report obsahuje datum
            schůzky, místo konání (pokud bylo zadáno), seznam hlasovaných hostů
            a výsledky jejich hlasování (počty hlasů Ano/Ne/Zdržuji se).
          </li>
          <li>
            <strong>Mohu report exportovat?</strong> — V aktuální verzi aplikace
            je report dostupný pouze k zobrazení na obrazovce.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Omezení role Moderátora</h2>
        <p className="text-sm text-text-muted mb-3">
          Role moderátora je určena pro řízení schůzek a hlasování. Některé
          administrativní funkce jsou vyhrazeny pouze pro roli Admin a moderátor
          k nim nemá přístup.
        </p>
        <p className="text-sm font-medium mb-2">Co moderátor nemůže:</p>
        <ul className="list-disc list-inside text-sm space-y-1 mb-3">
          <li>
            Spravovat členy (přidat, smazat, revokovat magic link) — sekce
            /admin/members.
          </li>
          <li>Mazat hosty ze systému — pouze editace.</li>
          <li>
            Spravovat kategorie (přidávat, přejmenovávat, mazat) — sekce
            /admin/categories.
          </li>
          <li>Měnit hesla jiných uživatelů — sekce Nastavení.</li>
          <li>Přidávat nové moderátory nebo adminy.</li>
        </ul>
        <p className="text-sm font-medium mb-2">
          Postup v případě potřeby adminské funkce:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>Identifikujte, jakou adminskou akci potřebujete.</li>
          <li>Kontaktujte admina aplikace s konkrétním požadavkem.</li>
          <li>Admin provede akci v sekci /admin.</li>
        </ol>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Jak poznám, že jsem moderátor a ne admin?</strong> — V
            navigaci se vám nezobrazuje sekce <strong>Admin</strong> (položky
            Členové a Kategorie). Pokud ji vidíte, máte roli Admin.
          </li>
        </ul>
      </section>
    </div>
  );
}
