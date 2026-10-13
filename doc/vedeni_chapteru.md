# Vedení chapteru BNI Pilsner Fountains

Stav k 12. 10. 2026, podle prezentace vedení („pavouk“). Struktura se ještě bude měnit, tenhle soubor se udržuje průběžně.

Jména jsou tu se souhlasem prezidenta chapteru (12. 10. 2026). Kontaktní údaje sem nepatří, repo je veřejné.

## Schéma

```mermaid
flowchart TB
    P["<b>Prezident</b><br/><i>Tomáš Nekolný</i><br/>vedení skupiny a setkání<br/>strategie a směr<br/>kultura a hodnoty<br/>řízení Leadership Teamu<br/>reprezentace skupiny<br/>BNI Connect – noví členové"]
    VP["<b>Viceprezident</b><br/><i>Tomáš Fuchman</i><br/>PALMS, KPI, Semafor<br/>výsledky skupiny<br/>docházka<br/>doporučení<br/>obchodní výkon<br/>zastupování prezidenta"]

    subgraph LT["Leadership team"]
        direction LR
        VCV["<b>Vedoucí členského výboru</b><br/><i>Dominika Pašková</i><br/>vedení Membership Committee<br/>členská strategie<br/>přijímání a udržení členů<br/>reporty a doporučení LT"]
        VHC["<b>Visitor Host Coordinator</b><br/><i>Karolína Klečánková</i><br/>hosté a registrace<br/>follow-up hostů<br/>představení hostů"]
        PTC["<b>Power Teamy Coordinator</b><br/><i>Eva Feketová</i><br/>vytváření a rozvoj power týmů<br/>podpora spolupráce členů<br/>power týmy napříč skupinou"]
        EDU["<b>Education Coordinator</b><br/><i>Lenka Zedníková</i><br/>vzdělávání členů<br/>týdenní vzdělávací okénka<br/>rozvoj dovedností"]
        SOC["<b>Sociální sítě Coordinator</b><br/><i>Vojtěch Jurík</i><br/>správa sociálních sítí<br/>tvorba obsahu<br/>online komunikace a propagace"]
        EVT["<b>Events Coordinator</b><br/><i>Monika Anderlová</i><br/>akce skupiny<br/>networkingové akce<br/>propagace a marketing"]
        PRZ["<b>Příprava prezentace</b><br/><i>Jaroslava Murinová</i><br/>příprava na prezentace<br/>podpora při tvorbě obsahu<br/>trénink a zpětná vazba"]
        P5["<b>5minutové prezentace</b><br/><i>Lena Pfuger</i><br/>příprava a trénink 5min prezentací<br/>feedback a zlepšování<br/>rozvoj prezentačních dovedností"]
    end

    subgraph CV["Členský výbor"]
        direction LR
        NAB["<b>Nábor nových členů</b><br/><i>Lucie Krčmová, Tomáš Pešička, Dagmar Hebedová</i><br/>pohovory s kandidáty<br/>kontrola kolizí profesí<br/>doporučení k přijetí<br/>volání hostům, jak se jim líbilo"]
        MNO["<b>Mentor nováčků</b><br/><i>Libor Mencl, Kateřina Černá</i><br/>první 3 měsíce<br/>onboarding nových členů<br/>MSP program, školení nováčků<br/>integrace do skupiny<br/>podpora a rozvoj"]
        MCL["<b>Mentor členů</b><br/><i>Antonín Slezáček, Josef Machalíček</i><br/>pohovory v 5. až 10. měsíci<br/>podpora a rozvoj členů<br/>řešení poklesu aktivity<br/>prodlužování členství"]
        DB["<b>Databáze členů – správa</b><br/><i>Richard Běláč</i><br/>správa databáze členů a hostů<br/>správa ZOHO registrací"]
    end

    P --- LT
    VP --- LT
    VCV --> CV
```

## Rozdíly proti pravidlům BNI a stránce `/pravidla/role`

Tohle je k diskusi, na webu se zatím nic nemění.

| Téma | U nás (pavouk) | Manuál BNI a stránka rolí |
|---|---|---|
| Kdo vede členský výbor | samostatná role „Vedoucí členského výboru“ | viceprezident |
| Oblasti členského výboru | nábor nových členů, mentor nováčků, mentor členů, databáze členů | posouzení přihlášek, růst chapteru, zapojení členů, vztahy mezi členy |
| Role v Leadership teamu | navíc power teamy, sociální sítě, events, příprava prezentací, 5minutové prezentace | manuál tyto role nemá |
| Vzdělávání | „týdenní vzdělávací okénka“ | stejný termín jako na stránkách série |

## Historie

- 2026-10-12: první verze podle prezentace vedení, včetně obsazení rolí.
