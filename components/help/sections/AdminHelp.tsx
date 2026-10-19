import { HelpSection } from "@/components/help/HelpParts";

export function AdminHelp() {
  return (
    <div className="space-y-8">
      <HelpSection
        title="Členové"
        intro="Na stránce Členové jsou všichni členové chapteru. Vše se dělá přímo v řádku člena."
        steps={[
          "Nového člena přidáte v kartě „Nový člen“ tlačítkem „Přidat člena“. E-mail vyplňte, bez něj se člen nepřihlásí.",
          "Víc členů naráz nahrajete v kartě „Import členů z XLSX“ přes „Nahrát a zobrazit preview“. Zkontrolujte náhled a klikněte na „Importovat vybrané“.",
          "E-mail, firmu, obor a datum vstupu změníte tlačítkem „Upravit“ u daného údaje.",
          "Pořadí členů změníte přetažením za „≡“.",
        ]}
        note="„Smazat“ smaže člena i jeho pohovory a vrátit to nejde. Sebe ani posledního admina smazat nejde."
        faq={[
          {
            q: "Co znamená štítek „5 měsíců“ nebo „10 měsíců“?",
            a: "Členovi vychází pohovor. Klik na štítek otevře jeho založení.",
          },
          {
            q: "Jak členovi pošlu osobní odkaz?",
            a: "Ve sloupci Akce „Generovat odkaz“ a „Poslat emailem“. Odkaz platí 7 dní. Většinou to není potřeba, člen si o přihlášení řekne sám e-mailem.",
          },
          {
            q: "Změnil jsem členovi e-mail.",
            a: "Odkazy poslané na starou adresu přestaly platit.",
          },
        ]}
      />

      <HelpSection
        title="Role a hesla vedení"
        steps={[
          "Ve sloupci Role vyberte u člena „Moderátor“ nebo „Admin“ a klikněte na „Uložit roli“.",
          "Zaškrtněte „E-mail jsem si s členem ověřil“ a klikněte na „Potvrdit“.",
          "Členovi přijde mail s odkazem na nastavení hesla. Platí 24 hodin a jde použít jednou.",
        ]}
        note="Roli Admin dávejte jen tomu, komu svěříte mazání členů, hostů a schůzek."
        faq={[
          {
            q: "Člen zapomněl heslo.",
            a: "U jeho řádku „Poslat odkaz pro nové heslo“. Staré heslo hned přestane platit. Když mail nedorazí, „Zobrazit odkaz ke zkopírování“ a pošlete mu ho jinak.",
          },
          {
            q: "Jak roli odeberu?",
            a: "Vyberte „Žádná“. Heslo se smaže a člen se přihlašuje odkazem z mailu.",
          },
          {
            q: "",
            a: "Vlastní roli ani roli posledního admina změnit nejde. Vlastní heslo změníte v Nastavení.",
          },
          {
            q: "",
            a: "Člen bez e-mailu roli dostat nemůže. Nejdřív mu e-mail doplňte.",
          },
        ]}
      />

      <HelpSection
        title="Kategorie"
        intro="Kategorie jsou obory hostů. Novou přidáte polem „Název kategorie“ a tlačítkem „Přidat“, název změníte „Přejmenovat“."
        note="Po smazání kategorie mají její hosté „[bez kategorie]“. Vrátit to nejde."
        faq={[
          {
            q: "",
            a: "Moderátor kategorii vytvoří i přímo ve formuláři hosta. Přejmenovat a smazat ji může jen admin.",
          },
        ]}
      />

      <HelpSection
        title="Mazání hostů, schůzek a akcí"
        intro="Mazat smí jen admin a vrátit to nejde. Aplikace se před smazáním zeptá."
        faq={[
          {
            q: "Host:",
            a: "v detailu „Smazat hosta“. Smažou se i jeho hlasy, poznámky a zařazení do schůzek.",
          },
          {
            q: "Schůzka:",
            a: "v detailu „Smazat schůzku“. Smažou se hlasy a zařazení hostů, hosté zůstanou.",
          },
          {
            q: "Akce:",
            a: "v detailu „Smazat akci“. Běžící akci nejdřív uzavřete.",
          },
        ]}
      />
    </div>
  );
}
