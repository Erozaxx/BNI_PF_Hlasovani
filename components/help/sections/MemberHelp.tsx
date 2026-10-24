import Link from "next/link";
import { HelpSection } from "@/components/help/HelpParts";
import { HELP_ATTENDANCE_MEMBER_UNEXCUSED, HELP_SEMAFOR_MEMBER } from "@/lib/semafor/texts";

export function MemberHelp() {
  return (
    <div className="space-y-8">
      <HelpSection
        title="Hlasování o hostech"
        intro="O hostech se hlasuje přes osobní odkaz z mailu. V aplikaci se hlasovat nedá, tam vidíte hosty a výsledky."
        steps={[
          "Ráno v den schůzky vám přijde mail „BNI Hlasovani - Odkaz pro hlasovani“. Klikněte na „Prejit na hlasovani“.",
          "U každého hosta zvolte „Pro“, „Nevím“, nebo „Proti“. U „Proti“ napište důvod, bez něj se hlas neuloží.",
          "Hlas se uloží hned. Dokud hlasování běží, změníte ho tlačítkem „Změnit“.",
        ]}
        note="Hlasování běží do středy 23:59 po schůzce. Kdo jak hlasoval, je vidět jménem, u „Proti“ i s důvodem."
        faq={[
          {
            q: "Mail nepřišel.",
            a: "Mrkněte do spamu. Když tam není, napište někomu z vedení, pošle vám odkaz znovu.",
          },
          {
            q: "Proč mi chodí připomínky?",
            a: "Dokud nedáte ani jeden hlas, přijde připomínka nejvýš třikrát. Po prvním hlasu už další nepřijde.",
          },
          {
            q: "Odkaz píše, že hlasování ještě nezačalo.",
            a: "Použijte ho znovu v den schůzky.",
          },
          {
            q: "Můžu k hostovi něco napsat?",
            a: "Ano, na odkazu přes „+ Přidat poznámku“. Poznámka je bez jména.",
          },
        ]}
      />

      <HelpSection
        title="Přihlášení"
        steps={[
          "Na přihlašovací stránce zadejte e-mail, který máte vedený v chapteru, a klikněte na „Pokračovat“.",
          "Přijde vám mail „BNI Plzeň: přihlášení do aplikace“. Klikněte v něm na „Přihlásit se“.",
          "Na stránce, která se otevře, klikněte ještě jednou na „Přihlásit se“.",
        ]}
        note="Odkaz platí 15 minut a jde použít jen jednou. Přihlášení vydrží 12 hodin na zařízení, kde jste odkaz otevřeli."
        faq={[
          {
            q: "Mail nepřišel.",
            a: "Mrkněte do spamu. Když tam není, máte v chapteru nejspíš jinou adresu. Zkuste ji. Když nepřijde ani druhý mail, napište vedení chapteru.",
          },
          {
            q: "Odkaz píše, že už neplatí.",
            a: "Uplynulo 15 minut, nebo jste ho už použili. Zadejte e-mail znovu a přijde nový.",
          },
          {
            q: "Přihlásím se i z jiného zařízení?",
            a: "Ano, na každém si nechte poslat vlastní odkaz.",
          },
          {
            q: "Mám osobní odkaz od admina.",
            a: "Funguje dál. Platí 7 dní, jde použít opakovaně a den před koncem vám přijde nový.",
          },
          {
            q: "Jak se odhlásím?",
            a: "V menu dole „Odhlásit se“.",
          },
        ]}
      />

      <HelpSection
        title="Dashboard"
        intro="Dashboard je první stránka po přihlášení. Nahoře je nejbližší schůzka, tlačítko „Zobrazit“ otevře její detail s hosty. Pod ní je nejbližší Master mind a jestli na něj jste přihlášení. Na konci jsou poslední čtyři hosté."
        faq={[
          {
            q: "Proč se mi ukazuje otázka k burze?",
            a: "Váš řádek v Burze pomoci je starší než 3 měsíce. Klikněte na ni a potvrďte, že platí, nebo ho upravte.",
          },
        ]}
      />

      <HelpSection
        title="Hosté a poznámky"
        intro="Na stránce Hosté jsou všichni hosté chapteru. Podle oboru je vyfiltrujete přes „Filtrovat podle činnosti“. Klik na hosta otevře jeho detail: firmu, kategorii, popis a poznámky."
        steps={[
          "V detailu hosta napište text do pole u poznámek.",
          "Klikněte na „Přidat poznámku“.",
        ]}
        note="Poznámky vidí všichni přihlášení. Jméno autora se u nich neukazuje. Uloženou poznámku nejde upravit ani smazat."
        faq={[
          {
            q: "Každé uložení přidá novou poznámku.",
            a: "Opravu napište jako další poznámku.",
          },
          {
            q: "Poznámky napsané na hlasovacím odkazu najdete i v detailu hosta.",
            a: "Na odkazu jsou vidět jen poznámky k té schůzce.",
          },
        ]}
      />

      <HelpSection
        title="Schůzky a výsledky"
        intro="Na stránce Schůzky jsou všechny schůzky se stavem Návrh, Hlasování probíhá, nebo Uzavřeno. Detail schůzky ukáže, o kterých hostech se hlasuje a do kdy."
        note="Po uzavření hlasování uvidíte v detailu schůzky „Výsledky hlasování“: počty a kdo jak hlasoval, u „Proti“ s důvodem."
      />

      <HelpSection
        title="Archiv hostů"
        intro="V archivu dohledáte hosty z minulých schůzek. Zvolte období, nebo klikněte na konkrétní schůzky. Dál můžete zúžit podle kategorie, „Zrušit filtry“ vrátí vše."
        note="U každého hosta vidíte, na kterých schůzkách byl, součet hlasů (plus, vlnovka a minus pro Pro, Neutrální a Proti) a počet poznámek. Archiv je jen pro čtení."
      />

      <HelpSection
        title="Hlasování o akci"
        intro="Když vedení vybírá termín nebo jinou možnost pro akci chapteru, přijde vám mail „BNI Hlasovani - Pozvanka: {název akce}“."
        steps={[
          "V mailu klikněte na „Zobrazit akci a hlasovat“. Přihlašovat se nemusíte.",
          "Vyberte možnosti. Nahoře je napsané, jestli jednu, víc, nebo kolik nejvýš.",
          "Klikněte na „Uložit hlasy“.",
        ]}
        faq={[
          {
            q: "Chybí mi termín.",
            a: "Pokud to vedení u akce povolilo, přidáte ho přes „Přidat novou možnost“.",
          },
          {
            q: "",
            a: "Po uzavření akce uvidíte na stejném odkazu výsledek.",
          },
        ]}
      />

      <HelpSection
        title="Pravidla chapteru"
        intro={
          <>
            Jak u nás fungují pravidla BNI, najdete na{" "}
            <Link href="/pravidla" className="underline text-primary">
              /pravidla
            </Link>
            . Stránky jsou veřejné, odkaz můžete poslat i hostovi. Kdo o čem
            rozhoduje, od hosta ke členovi, čtvrteční schůzka, absence, obory,
            etický kodex a stížnosti.
          </>
        }
      />

      <section>
        <h2 className="text-lg font-semibold mb-3">Master mind</h2>
        <p className="text-sm text-text-muted mb-3">
          Na interní schůzce přinese jeden člen téma ze své praxe a probereme ho
          u kulatého stolu. Témata čekají v zásobníku a vedení z něj vybírá.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            Otevřete v navigaci <strong>Master mind</strong> a klikněte na{" "}
            <strong>Přihlásit případ</strong>.
          </li>
          <li>
            Vyplňte téma a v poli <strong>O čem to bude</strong> napište dvě až
            tři věty, ať ostatní vědí, jestli se přidat. Klienta popište
            obecně, bez jména.
          </li>
          <li>
            Klikněte na <strong>Přihlásit případ</strong>.
          </li>
        </ol>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Kolik případů můžu mít?</strong> Nejvýš 5 otevřených, tedy
            navržených a zařazených. Případ, který už proběhl, se do limitu nepočítá.
          </li>
          <li>
            <strong>Co znamená Mám zájem?</strong> Případ se v zásobníku posune
            výš, karty jsou seřazené podle počtu zájemců. Vlastnímu případu
            zájem dát nejde.
          </li>
          <li>
            <strong>Co se stane po zařazení?</strong> Váš zájem se změní na
            přihlášku účastníka. Datum interní uvidíte na kartě případu. Odhlásit se můžete
            tlačítkem <strong>Odhlásit se</strong> u případu. Přihláška je
            ohlášení, ne evidence docházky.
          </li>
          <li>
            <strong>Kdo vidí jména zájemců?</strong> Všichni přihlášení.
          </li>
          <li>
            <strong>Kdo může případ upravit?</strong> Autor navržený případ
            kdykoli a zařazený do dne před interní. Vedení kdykoli, dokud
            případ neproběhl.
          </li>
          <li>
            <strong>Jak případ stáhnu?</strong> Tlačítkem{" "}
            <strong>Stáhnout</strong>, dokud není zařazený. Zařazený případ
            stáhne vedení.
          </li>
          <li>
            <strong>Termín mi nesedí.</strong> Dejte vědět vedení chapteru.
          </li>
          <li>
            <strong>Co je v sekci Na řadě?</strong> Případy zařazené na
            konkrétní interní. Přihlásit se na ně můžete i bez předchozího
            zájmu, tlačítkem „Přihlásit se“.
          </li>
          <li>
            <strong>Kde jsou starší případy?</strong> Rozbalte „Proběhlé“ na
            konci stránky.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Burza pomoci</h2>
        <p className="text-sm text-text-muted mb-3">
          Burza pomoci je seznam toho, s čím kdo z chapteru pomůže ostatním.
          Pomoc z burzy je nezištná: rada nebo krátká konzultace. Když z ní
          vznikne zakázka, je to běžný obchod a patří do doporučení.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm mb-3">
          <li>
            Otevřete v navigaci <strong>Burza pomoci</strong> a klikněte na{" "}
            <strong>Přidat svůj řádek</strong>.
          </li>
          <li>
            Napište, s čím pomůžete, případně kontakt a poznámku, třeba kdy se
            hodí volat.
          </li>
          <li>
            Klikněte na <strong>Uložit</strong>.
          </li>
        </ol>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Kdo řádek vidí?</strong> Všichni přihlášení členové, včetně
            kontaktu. Do pole <strong>Jak mě kontaktovat</strong> napište
            telefon nebo e-mail, aplikace ho nijak nepředvyplňuje.
          </li>
          <li>
            <strong>Jak řádek změním nebo smažu?</strong> V rámečku{" "}
            <strong>Tvůj řádek</strong> tlačítkem <strong>Upravit</strong>{" "}
            nebo <strong>Smazat</strong>, kdykoli. Řádek může zapsat nebo upravit
            i vedení, třeba podle papíru z interní. Vy ho pak kdykoli přepíšete.
          </li>
          <li>
            <strong>Co znamená Platí dál?</strong> Po třech měsících se u vašeho
            řádku ukáže otázka, jestli ještě platí. Tlačítko{" "}
            <strong>Platí dál</strong> posune datum potvrzení, stejně ho posune
            každé uložení řádku. Nic se neposílá e-mailem a starý řádek
            nezmizí.
          </li>
          <li>
            <strong>Pomoc a Kontakty.</strong> Na záložce{" "}
            <strong>Pomoc</strong> je, s čím kdo pomůže, na záložce{" "}
            <strong>Kontakty</strong>, na koho má kdo kontakt.
          </li>
          <li>
            <strong>Jak přidám kontakt?</strong> Na záložce{" "}
            <strong>Kontakty</strong> klikněte na{" "}
            <strong>Přidat kontakt</strong> a napište, na koho kontakt máte,
            třeba ředitel logistiky ve firmě X. Jméno ani telefon toho člověka
            nepište, kdo kontakt chce, řekne si vám. Kontaktů můžete mít až 10.
            Pro úplně jiný kontakt přidejte nový, starý nepřepisujte.
          </li>
          <li>
            <strong>Kdy použít Využil(a) jsem?</strong> Když vám někdo z burzy
            pomohl nebo jste využili jeho kontakt, klikněte na jeho kartě na{" "}
            <strong>Využil(a) jsem</strong>. Dalším kliknutím zápis smažete,
            nic se nepotvrzuje. U pomoci platí zápis pro kalendářní měsíc a
            další měsíc ho můžete zapsat znovu, u kontaktu platí trvale.
          </li>
          <li>
            <strong>Kdo záznam uvidí?</strong> Vy a vedení. Ten, kdo pomohl
            nebo kontakt nabídl, vidí jen počet za posledních 6 měsíců, ne kdo
            ho zapsal.
          </li>
        </ul>
      </section>

      <HelpSection
        title="Docházka"
        steps={[
          "V menu Docházka klepněte na den.",
          "Zvolte „Nepřijdu, bez náhradníka“, nebo „Nepřijdu, pošlu náhradníka“ a napište jméno. Uloží se hned.",
          "Změnit nebo zrušit to můžete do 7:30 v den schůzky. Potom už to zapíše správce docházky.",
          "Zelený den v kalendáři je interní schůzka. Počítá se do docházky jako běžná schůzka a omlouváte se stejně.",
        ]}
        note="Bez záznamu počítáme, že přijdete. Náhradník se jako absence nepočítá. Na dashboardu vidíte své absence za posledních 6 měsíců."
        faq={[
          {
            q: "Kdo vidí, že chybím?",
            a: "Správci docházky, Prezident, Viceprezident a admin. Ostatní členové ne.",
          },
          {
            q: "Proč mám absenci, i když jsem se omluvil(a)?",
            a: "Omluva bez náhradníka se podle pravidel počítá jako absence. Když pošlete náhradníka, absence to není.",
          },
          {
            q: "Co se stane s mou omluvou, když se interní schůzka zruší?",
            a: "Omluva na ten den se smaže a den se do docházky nepočítá. Když na ten den později vznikne běžná schůzka, omluvte se znovu.",
          },
          {
            q: "Jak smažu jméno náhradníka?",
            a: "Dole na stránce Docházka v Uložených jménech.",
          },
          { q: "", a: HELP_ATTENDANCE_MEMBER_UNEXCUSED },
        ]}
      />

      <HelpSection title="Semafor" faq={HELP_SEMAFOR_MEMBER.map((text) => ({ q: "", a: text }))} />
    </div>
  );
}
