/**
 * Rejstřík ověřených citací stránky „Etický kodex (/pravidla/kodex)", iter-031 (T-007e).
 *
 * Podle arch_iter-031_T-001e sekce 2.1 (po review T-002e a gate T-004e).
 * Body kodexu se citují z General Policies (7 bodů). Každá `quoteEn` je
 * ověřená skriptem proti textu PDF. U manuálu je strana PDF = vytištěné číslo.
 * `rule` u hodnot je záměrně bez názvu hodnoty (hodnota 6 se v manuálu jmenuje
 * jinak a validátor hlídá, aby se anglický název nedostal do českého textu).
 *
 * Prefix KG (General Policies), KM (manuál). Shodná citace má v celé sérii
 * jedno id (T-003s 1.3).
 * Přesunuté ze stiznosti-zdroje.ts: SG2 až SG8 = KG1 až KG7, SM58 = KM1,
 * SM2 = KM2, SM1 = KM3. Nové: KM4 až KM11.
 * Sdílené citace H57 (clenstvi) a G2 (role) kodex bere přes `fakta.ts`.
 * QM9 (hodnota týdne) se na kodexu nepoužívá.
 *
 * Stránky citují přes `src()` / `fact()` z `content/pravidla/fakta.ts`,
 * coder stránky tenhle soubor nemění.
 */
import type { SourceRef } from "@/lib/info-pages/types";

export const KODEX_SOURCES: Record<string, SourceRef> = {
  KG1: { doc: "general-policies", page: 2, rule: "Code of Ethics #1", quoteEn: "I will provide the quality of services at the prices that I have quoted." },
  KG2: { doc: "general-policies", page: 2, rule: "Code of Ethics #2", quoteEn: "I will be truthful with the Members and their referrals." },
  KG3: { doc: "general-policies", page: 2, rule: "Code of Ethics #3", quoteEn: "I will build goodwill and trust among Members and their referrals." },
  KG4: { doc: "general-policies", page: 2, rule: "Code of Ethics #4", quoteEn: "I will take responsibility for following up on the referrals I receive." },
  KG5: { doc: "general-policies", page: 2, rule: "Code of Ethics #5", quoteEn: "I will display a positive and supportive attitude." },
  KG6: { doc: "general-policies", page: 2, rule: "Code of Ethics #6", quoteEn: "I will live up to the ethical standards of my profession." },
  KG7: { doc: "general-policies", page: 2, rule: "Code of Ethics #7", quoteEn: "Professional standards outlined in a formal code of conduct for any profession supersede the above standards. This means that a Member belonging to a profession that has a more stringent standard must adhere to that higher standard." },
  KM1: { doc: "ops-manual-2022", page: 7, quoteEn: "When evaluating Members, please apply the following BNI Code of Ethics to the various situations." },
  KM2: { doc: "ops-manual-2022", page: 7, quoteEn: "This is not meant to be a list of specifics but can be applied in principle to almost any conflict or complaint." },
  KM3: { doc: "ops-manual-2022", page: 7, quoteEn: "Upon acceptance to BNI, I agree to abide by the following BNI Code of Ethics during the service of my participation in the organization" },
  KM4: { doc: "ops-manual-2022", page: 15, quoteEn: "Reconfirms commitment to the BNI Code of Ethics" },
  KM5: { doc: "ops-manual-2022", page: 6, rule: "BNI Core Values #1", quoteEn: "Be willing to give first, before you expect to gain." },
  KM6: { doc: "ops-manual-2022", page: 6, rule: "BNI Core Values #2", quoteEn: "Building strong relationships creates an environment of trust and support that yields happiness, opportunity and meaning." },
  KM7: { doc: "ops-manual-2022", page: 7, rule: "BNI Core Values #3", quoteEn: "Invest in yourself to become the leader you want to be." },
  KM8: { doc: "ops-manual-2022", page: 7, rule: "BNI Core Values #4", quoteEn: "We honor our traditions and look to a brighter future fueled by innovation, optimism, and excitement." },
  KM9: { doc: "ops-manual-2022", page: 7, rule: "BNI Core Values #5", quoteEn: "We find the good in everything that happens to us and that propels our lives forward." },
  KM10: { doc: "ops-manual-2022", page: 7, rule: "BNI Core Values #6", quoteEn: "We keep the promises we make, especially when it is hard to do so." },
  KM11: { doc: "ops-manual-2022", page: 7, rule: "BNI Core Values #7", quoteEn: "We appreciate that recognition fuels the growth of successful organizations." },
};
