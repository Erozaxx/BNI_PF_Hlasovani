import { HelpSection } from "@/components/help/HelpParts";
import { deleteMemberScopeText, inactiveHidesText } from "@/components/help/help-texts";
import { CHAPTER_SETTINGS_TEXTS } from "@/lib/chapter/texts";
import { DEFAULT_CHAPTER_SETTINGS, type ChapterSettings } from "@/lib/chapter/settings";

interface AdminHelpProps {
  /** Čtenář smí přidělovat admina, funkce a hesla (právo `access.manage`, jen admin). */
  canManageAccess?: boolean;
  /** iter-042: čtenář má právo `chapter.settings` (sekce Nastavení chapteru). */
  canManageSettings?: boolean;
  /** iter-042: nastavení chapteru (zapnuté části). Bez něj platí výchozí stav. */
  settings?: ChapterSettings;
}

export function AdminHelp({
  canManageAccess = true,
  canManageSettings = false,
  settings = DEFAULT_CHAPTER_SETTINGS,
}: AdminHelpProps) {
  return (
    <div className="space-y-8">
      <HelpSection
        title="Členové"
        intro="Na stránce Členové jsou všichni členové chapteru. Údaje člena změníte po kliknutí na Upravit."
        steps={[
          "Nového člena přidáte v kartě „Nový člen“ tlačítkem „Přidat člena“. E-mail vyplňte, bez něj se člen nepřihlásí.",
          "Víc členů naráz nahrajete v kartě „Import členů z XLSX“ přes „Nahrát a zobrazit náhled“. Čte se první list: sloupec B jméno (povinné), D obor, E datum vstupu (nepovinné), nejvýš 500 řádků. Zkontrolujte náhled a klikněte na „Importovat vybrané“.",
          "Na stránce člena upravíte e-mail, firmu, obor a datum vstupu tlačítkem „Upravit“ u daného údaje. Tam je i funkce, role, heslo, deaktivace, osobní odkaz a smazání.",
          "Pořadí členů změníte přetažením za „≡“.",
        ]}
        note={`„Smazat“ na stránce člena smaže člena a s ním ${deleteMemberScopeText(settings)}. Vrátit to nejde. Když člen jen odchází, použijte Deaktivovat. Sebe ani posledního admina smazat nejde.`}
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
        note={`Neaktivní člen se nepřihlásí, nedostává odkazy k hlasování, připomínky ani pozvánky na akce${inactiveHidesText(settings)}. Hlasy, zápisy, pohovory i funkce zůstanou.`}
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
            a: "Člen si může odkaz poslat sám na přihlášení přes „Zapomněl(a) jsem heslo“, staré heslo mu přitom platí dál. Jinak na stránce člena „Poslat odkaz pro nové heslo“. Staré heslo hned přestane platit. Když mail nedorazí, „Zobrazit odkaz ke zkopírování“ a pošlete mu ho jinak.",
          },
          {
            q: "Jak funkci a roli odeberu?",
            a: "Vyberte „Běžný člen“ a roli „Žádná“. Když člen nemá ani funkci, ani roli, heslo se smaže a přihlašuje se odkazem z mailu.",
          },
          {
            q: "",
            a: "Vlastní roli ani roli posledního admina změnit nejde. Vlastní heslo změníte v menu Účet, položka Heslo.",
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

      {canManageSettings && (
        <HelpSection
          title="Nastavení chapteru"
          intro="V menu Admin otevřete Nastavení chapteru. Nastavení vidí a mění admin, Prezident a Viceprezident."
          steps={[
            "V části Části aplikace zapněte nebo vypněte Master mind, Burzu pomoci a Interní semafor.",
            "V části Pravidelná schůzka vyberte Den a Začátek.",
            "Klikněte na „Uložit“. Při vypnutí části nebo změně dne se aplikace nejdřív zeptá.",
          ]}
          note={`${CHAPTER_SETTINGS_TEXTS.featuresHint} ${CHAPTER_SETTINGS_TEXTS.meetingHint}`}
          faq={[
            {
              q: "Co se změní, když vypnu Burzu pomoci nebo Master mind?",
              a: "Část zmizí z menu, dashboardu a nápovědy a bonus za ni přestane platit v interním semaforu, takže se části členů může změnit barva. Data zůstanou a po zapnutí se vrátí.",
            },
            {
              q: "Co se stane po změně dne?",
              a: "Změní se kalendář docházky, termíny Master mindu, uzávěrka omluv a ranní spuštění hlasování. Už založené schůzky, omluvy a zařazené případy zůstanou na svých dnech. Texty na veřejných stránkách s pravidly se nemění, ty upraví vedení ručně.",
            },
            {
              q: "Proč jde začátek nastavit jen od 7:00 do 11:00?",
              a: "Ranní maily odcházejí mezi 6:00 a 7:00 a uzávěrka dne je v 17:00. Večerní schůzky by potřebovaly změnu v plánovači úloh.",
            },
          ]}
        />
      )}

      <HelpSection
        title="Kategorie"
        intro="Kategorie jsou obory hostů. Novou přidáte polem „Název kategorie“ a tlačítkem „Přidat“, název změníte „Přejmenovat“."
        note="Po smazání kategorie mají její hosté „Bez kategorie“. Vrátit to nejde."
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
