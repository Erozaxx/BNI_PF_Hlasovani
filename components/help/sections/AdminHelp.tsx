import { HelpSection } from "@/components/help/HelpParts";

interface AdminHelpProps {
  /** Čtenář smí přidělovat admina, funkce a hesla (právo `access.manage`, jen admin). */
  canManageAccess?: boolean;
}

export function AdminHelp({ canManageAccess = true }: AdminHelpProps) {
  return (
    <div className="space-y-8">
      <HelpSection
        title="Členové"
        intro="Na stránce Členové jsou všichni členové chapteru. Údaje člena změníte po kliknutí na Upravit."
        steps={[
          "Nového člena přidáte v kartě „Nový člen“ tlačítkem „Přidat člena“. E-mail vyplňte, bez něj se člen nepřihlásí.",
          "Víc členů naráz nahrajete v kartě „Import členů z XLSX“ přes „Nahrát a zobrazit preview“. Zkontrolujte náhled a klikněte na „Importovat vybrané“.",
          "Na stránce člena upravíte e-mail, firmu, obor a datum vstupu tlačítkem „Upravit“ u daného údaje. Tam je i funkce, role, heslo, deaktivace, osobní odkaz a smazání.",
          "Pořadí členů změníte přetažením za „≡“.",
        ]}
        note="„Smazat“ na stránce člena smaže člena i jeho pohovory a vrátit to nejde. Sebe ani posledního admina smazat nejde."
        faq={[
          {
            q: "Co znamená štítek „5 měsíců“ nebo „10 měsíců“?",
            a: "Členovi vychází pohovor. Klik na štítek otevře jeho založení.",
          },
          {
            q: "Jak členovi pošlu osobní odkaz?",
            a: "Na stránce člena v části Osobní odkaz „Vygenerovat odkaz“ a „Poslat e-mailem“. Odkaz platí 7 dní. Většinou to není potřeba, člen si o přihlášení řekne sám e-mailem.",
          },
          {
            q: "Co dělá „Zneplatnit odkaz“?",
            a: "Odkaz přestane platit a člen se odhlásí, přihlásit se ale může dál přes nový odkaz z přihlašovací stránky. Když se přihlásit nemá, deaktivujte ho.",
          },
          {
            q: "Změnil jsem členovi e-mail.",
            a: "Odkazy poslané na starou adresu přestaly platit.",
          },
        ]}
      />

      <HelpSection
        title="Deaktivace člena"
        steps={[
          "Na stránce člena v části Stav klikněte na „Deaktivovat“.",
          "Vyberte „Do odvolání“, nebo „Do data“ a datum. Poslední neaktivní den je to datum, další den je člen zase aktivní sám.",
          "Přečtěte si souhrn a klikněte na „Deaktivovat“.",
        ]}
        note="Neaktivní člen se nepřihlásí, nedostává odkazy k hlasování, připomínky ani pozvánky na akce a jeho karty v Burze a témata v Master mindu nejsou vidět. Hlasy, zápisy, pohovory i funkce zůstanou."
        faq={[
          {
            q: "Jak ho vrátím dřív?",
            a: "Na stránce člena „Aktivovat hned“. Datum upravíte tlačítkem „Změnit“.",
          },
          {
            q: "Dozví se to člen?",
            a: "Aplikace mu nic nepošle. Řekněte mu to sami.",
          },
          {
            q: "Je to totéž co smazání?",
            a: "Ne. Smazání je samostatné tlačítko a vrátit nejde.",
          },
          {
            q: "",
            a: "Sebe ani posledního aktivního admina deaktivovat nejde.",
          },
        ]}
      />

      <HelpSection
        title="Funkce a přístup"
        intro={
          canManageAccess
            ? undefined
            : "Admina, funkce a hesla členů přiděluje jen admin. Prezident a Viceprezident mají jinak práva admina, účet admina ale měnit nemůžou."
        }
        steps={
          canManageAccess
            ? [
                "Na stránce člena v části Funkce a přístup vyberte funkci (Člen výboru, Viceprezident nebo Prezident) a klikněte na „Uložit funkci“. Moderátora nebo admina nastavíte ve výběru Role tlačítkem „Uložit roli“.",
                "Zaškrtněte „E-mail jsem si s členem ověřil“ a klikněte na „Potvrdit“.",
                "Když člen dostane první funkci nebo roli a nemá heslo, přijde mu mail s odkazem na nastavení hesla. Platí 24 hodin a jde použít jednou.",
              ]
            : undefined
        }
        note="Člen výboru má práva moderátora. Prezident a Viceprezident mají práva admina kromě přidělování admina, funkcí a hesel, to dělá jen admin. Účet admina (roli, funkci, heslo, osobní odkaz, údaje, deaktivaci i smazání) mění jen admin. Člen má nejvýš jednu funkci. Odkazem z mailu se vedení přihlásí jen s právy člena. Funkci Prezident nebo Viceprezident dávejte jen tomu, komu svěříte mazání a správu členů."
        faq={canManageAccess ? [
          {
            q: "Člen zapomněl heslo.",
            a: "Na stránce člena „Poslat odkaz pro nové heslo“. Staré heslo hned přestane platit. Když mail nedorazí, „Zobrazit odkaz ke zkopírování“ a pošlete mu ho jinak.",
          },
          {
            q: "Jak funkci a roli odeberu?",
            a: "Vyberte „Běžný člen“ a roli „Žádná“. Když člen nemá ani funkci, ani roli, heslo se smaže a přihlašuje se odkazem z mailu.",
          },
          {
            q: "",
            a: "Vlastní roli ani roli posledního admina změnit nejde. Vlastní heslo změníte v Nastavení.",
          },
          {
            q: "",
            a: "Člen bez e-mailu funkci ani roli dostat nemůže. Nejdřív mu e-mail doplňte.",
          },
        ] : undefined}
      />

      <HelpSection
        title="Správce docházky"
        intro="Na stránce člena v části Docházka zapněte Správce docházky. Člen pak v den založené schůzky dostane ráno před 7:00 mail s odkazem na zápis a v 17:00 report. Správce může být víc."
        note="Ranní mail chodí jen v den, kdy je v aplikaci založená schůzka."
      />

      <HelpSection
        title="Kategorie"
        intro="Kategorie jsou obory hostů. Novou přidáte polem „Název kategorie“ a tlačítkem „Přidat“, název změníte „Přejmenovat“."
        note="Po smazání kategorie mají její hosté „[bez kategorie]“. Vrátit to nejde."
        faq={[
          {
            q: "",
            a: "Člen vedení kategorii vytvoří i přímo ve formuláři hosta. Přejmenovat a smazat ji může jen admin.",
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
