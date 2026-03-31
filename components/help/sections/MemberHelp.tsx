export function MemberHelp() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-3">Přihlášení</h2>
        <p className="text-sm text-text-muted mb-3">
          Jako člen se přihlašujete pomocí tzv. magic linku — přihlašovacího
          odkazu zaslaného na váš e-mail. Není potřeba si pamatovat žádné heslo.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>Otevřete přihlašovací stránku aplikace.</li>
          <li>
            Zadejte svou e-mailovou adresu a klikněte na tlačítko{" "}
            <strong>Odeslat odkaz</strong>.
          </li>
          <li>Otevřete e-mail a klikněte na přihlašovací odkaz.</li>
          <li>
            Aplikace vás automaticky přihlásí a přesměruje na Dashboard.
          </li>
        </ol>
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm mb-3">
          Přihlašovací odkaz je platný <strong>7 dní</strong> od odeslání a lze
          ho použít opakovaně. Pokud odkaz vyprší, jednoduše si nechte zaslat
          nový.
        </div>
        <ul className="text-sm space-y-1">
          <li>
            <strong>E-mail s odkazem mi nepřišel.</strong> — Zkontrolujte složku
            Spam nebo Hromadná pošta. Pokud tam odkaz také není, požádejte
            administrátora o opětovné zaslání.
          </li>
          <li>
            <strong>Mohu se přihlásit z jiného zařízení?</strong> — Ano, odkaz
            funguje na libovolném zařízení a prohlížeči.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Dashboard</h2>
        <p className="text-sm text-text-muted mb-3">
          Dashboard je úvodní stránka, kterou vidíte ihned po přihlášení.
          Zobrazuje přehled aktuálního dění — aktivní schůzky a probíhající
          hlasování — abyste věděli, kde je potřeba vaše pozornost.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>Přihlaste se do aplikace (viz kapitola Přihlášení).</li>
          <li>
            Prohlédněte si karty aktivních schůzek zobrazené na Dashboardu.
          </li>
          <li>
            Klikněte na kartu schůzky nebo na odkaz <strong>Schůzky</strong> v
            navigaci pro přechod na hlasování.
          </li>
        </ol>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Na Dashboardu nevidím žádné schůzky.</strong> — Momentálně
            neprobíhá žádné aktivní hlasování. Jakmile moderátor otevře
            hlasování, schůzka se zde zobrazí.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Rychlé hlasování na stránce Schůzky
        </h2>
        <p className="text-sm text-text-muted mb-3">
          Stránka Schůzky zobrazuje karty všech aktuálních i uzavřených schůzek.
          Schůzky ve stavu <strong>Aktuální</strong> mají přímo pod kartou
          zobrazený seznam hostů s tlačítky pro rychlé hlasování. Nemusíte
          otevírat detail hosta — hlasovat můžete přímo ze seznamu.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            Klikněte na položku <strong>Schůzky</strong> v navigačním menu.
          </li>
          <li>
            Najděte schůzku označenou jako <strong>Aktuální</strong>.
          </li>
          <li>
            Pod kartou schůzky se zobrazí seznam hostů přihlášených do
            hlasování.
          </li>
          <li>
            U každého hosta klikněte na jedno z tlačítek:{" "}
            <strong>Ano</strong>, <strong>Ne</strong> nebo{" "}
            <strong>Zdržuji se</strong>.
          </li>
          <li>
            Váš hlas je okamžitě uložen — potvrzení se zobrazí přímo u
            tlačítka.
          </li>
        </ol>
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm mb-3">
          Svůj hlas můžete změnit opakovaným kliknutím na jiné tlačítko, dokud
          je hlasování otevřené. Po uzavření hlasování moderátorem již změna
          není možná.
        </div>
        <ul className="text-sm space-y-1">
          <li>
            <strong>
              Tlačítka Ano / Ne / Zdržuji se se nezobrazují.
            </strong>{" "}
            — Hlasování pro tuto schůzku ještě nebylo otevřeno nebo již bylo
            uzavřeno. Stav schůzky musí být <strong>Aktuální</strong>.
          </li>
          <li>
            <strong>
              Je rozdíl mezi hlasováním zde a hlasováním v detailu hosta?
            </strong>{" "}
            — Ne, obě místa zaznamenávají stejný hlas. Jde jen o dvě různé
            cesty k téže akci.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Hosté a hlasování (detail hosta)
        </h2>
        <p className="text-sm text-text-muted mb-3">
          Detail hosta zobrazuje podrobné informace o přihlašovaném hostu —
          jméno, firmu, kategorii a popis. Zde také můžete hlasovat nebo si
          přečíst, co o hostovi víte, a teprve pak rozhodnout.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            Na stránce Schůzky najděte schůzku ve stavu{" "}
            <strong>Aktuální</strong>.
          </li>
          <li>
            Klikněte na kartu hosta (na jeho jméno nebo kartu) — otevře se
            detail hosta.
          </li>
          <li>
            Přečtěte si informace o hostovi (jméno, firma, kategorie, popis).
          </li>
          <li>
            Klikněte na tlačítko <strong>Ano</strong>, <strong>Ne</strong> nebo{" "}
            <strong>Zdržuji se</strong> pro odeslání hlasu.
          </li>
          <li>
            Pro návrat zpět na seznam schůzek klikněte na šipku zpět nebo
            použijte navigaci.
          </li>
        </ol>
        <ul className="text-sm space-y-1">
          <li>
            <strong>
              Mohu hlasovat jak v detailu hosta, tak na stránce Schůzky?
            </strong>{" "}
            — Ano, hlas zadaný v jednom místě se automaticky projeví i ve
            druhém. Eviduje se vždy jen jeden váš hlas na hosta.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Archiv</h2>
        <p className="text-sm text-text-muted mb-3">
          Archiv obsahuje seznam všech uzavřených schůzek s výsledky hlasování.
          Slouží k dohledání, jak probíhalo hlasování v minulosti.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            Klikněte na položku <strong>Archiv</strong> v navigačním menu.
          </li>
          <li>Prohlédněte si seznam uzavřených schůzek.</li>
          <li>
            Klikněte na kartu schůzky pro zobrazení výsledků hlasování — u
            každého hosta uvidíte souhrn hlasů (Ano / Ne / Zdržuji se).
          </li>
        </ol>
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm mb-3">
          Uzavřené schůzky v archivu jsou pouze pro čtení. Hlasování ani
          poznámky již nelze měnit.
        </div>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Nenacházím schůzku v archivu.</strong> — Schůzka se v
            archivu zobrazí až poté, co ji moderátor uzavře. Pokud hlasování
            stále probíhá, schůzka je ve stavu <strong>Aktuální</strong> na
            stránce Schůzky.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Poznámky</h2>
        <p className="text-sm text-text-muted mb-3">
          K profilu každého hosta lze přidat poznámku — například doplňující
          informaci nebo kontext k hostovi. Poznámka je veřejná a vidí ji
          všichni přihlášení uživatelé.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>Otevřete detail hosta (viz kapitola Hosté a hlasování).</li>
          <li>
            Najděte pole <strong>Poznámka</strong> v dolní části stránky.
          </li>
          <li>Klikněte do pole a zadejte nebo upravte text poznámky.</li>
          <li>
            Klikněte na tlačítko <strong>Uložit</strong> pro uložení poznámky.
          </li>
        </ol>
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm mb-3">
          Pokud opustíte stránku bez kliknutí na <strong>Uložit</strong>,
          neuložené změny budou ztraceny.
        </div>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Vidí mou poznámku i ostatní členové?</strong> — Ano, poznámky
            jsou veřejné a vidí je všichni přihlášení uživatelé.
          </li>
          <li>
            <strong>Mohu poznámku smazat?</strong> — Ano, vymažte text v poli a
            klikněte na <strong>Uložit</strong>. Prázdná poznámka se neuloží.
          </li>
        </ul>
      </section>
    </div>
  );
}
