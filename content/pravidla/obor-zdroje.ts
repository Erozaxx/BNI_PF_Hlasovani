/**
 * Rejstřík ověřených citací stránky „Jeden obor, jeden člověk (/pravidla/obor)", iter-031 (T-007s, X14).
 *
 * Přepsáno z tabulky návrhu (arch_iter-031_T-001b sekce 12) po deltě T-003s 1.3 a gate T-004 3s.
 * Obsahuje jen citace, které mají fakt ve schválených textech (T-005 + gate
 * T-006), a záměrně ponechané nepoužité. Každá `quoteEn` ověřena skriptem
 * proti textu PDF 12. 10. 2026. Citace doslovně včetně apostrofů z PDF.
 * U manuálu je strana PDF = vytištěné číslo.
 *
 * Prefix OG, OM. Shodná citace má v celé sérii jedno id (T-003s 1.3).
 * Dočasná id O-G/O-M bez pomlčky (O-M3 = OM3). Nahrazené: O-G4 = QG10, O-G5 = H02,
 * O-M8 = H45, O-M33 = H10, O-M36 = SM30, O-M39 = SM13, O-M44 = SM25.
 * Nezapsané (po škrtech bez faktu, gate T-004 3b a T-006b): OM20, OM22, OM35, OM37.
 *
 * Stránky citují přes `src()` / `fact()` z `content/pravidla/fakta.ts`,
 * coder stránky tenhle soubor nemění (T-003s sekce 3).
 */
import type { SourceRef } from "@/lib/info-pages/types";

export const OBOR_SOURCES: Record<string, SourceRef> = {
  OG1: { doc: "general-policies", page: 1, rule: "General Policy #1", quoteEn: "Only one person from each BNI classification can join a chapter of BNI. Each Member can only hold one BNI classification in a BNI Chapter." },
  OG2: { doc: "general-policies", page: 1, rule: "General Policy #2", quoteEn: "BNI Members must represent their primary professional focus." },
  OG3: { doc: "general-policies", page: 4, rule: "Business Representation #2", quoteEn: "Members of BNI who represent multi-level marketing organizations should represent their products and services in BNI and not the business opportunity element of their business." },
  OM1: { doc: "ops-manual-2022", page: 19, quoteEn: "Only one person can become a Member from your BNI Classification." },
  OM3: { doc: "ops-manual-2022", page: 44, quoteEn: "The BNI Classification chosen by the applicant provided by BNI Connect." },
  OM4: { doc: "ops-manual-2022", page: 44, quoteEn: "If there are any potential overlaps, resolve prior to acceptance." },
  OM5: { doc: "ops-manual-2022", page: 44, quoteEn: "If the applicant has a wide range of business activities, ensure that their application states clearly which single category they are applying to represent in the Chapter using the BNI Classification List." },
  OM6: { doc: "ops-manual-2022", page: 44, quoteEn: "If the applicant’s category has been revised to reflect BNI guidelines, correct this on the application and have the applicant initial to designate approval." },
  OM7: { doc: "ops-manual-2022", page: 45, quoteEn: "Is the BNI Classification under which you are applying for membership your primary professional focus?" },
  OM9: { doc: "ops-manual-2022", page: 48, quoteEn: "Selecting the BNI Classification" },
  OM10: { doc: "ops-manual-2022", page: 51, quoteEn: "changing jobs to a new classification that is filled in the current Chapter." },
  OM11: { doc: "ops-manual-2022", page: 57, quoteEn: "Members agree to only represent the one BNI classification approved by the Membership Committee." },
  OM12: { doc: "ops-manual-2022", page: 57, quoteEn: "One of the most common concerns that can often lead to a complaint is BNI classification creep." },
  OM13: { doc: "ops-manual-2022", page: 57, quoteEn: "BNI Classification creep usually starts with a simple mention of another classification in the Weekly Presentation" },
  OM15: { doc: "ops-manual-2022", page: 58, quoteEn: "This keeps them from overlapping with people in the employment BNI® classifications." },
  OM16: { doc: "ops-manual-2022", page: 30, quoteEn: "Many conflicts can be avoided if this process is thoughtful." },
  OM17: { doc: "ops-manual-2022", page: 59, quoteEn: "One Membership Committee Member calls challenged Member to notify them and briefly explain the decision." },
  OM18: { doc: "ops-manual-2022", page: 59, quoteEn: "Add Member’s name, date, and Code of Ethics or Policy violation reference" },
  OM19: { doc: "ops-manual-2022", page: 60, quoteEn: "Always get your Director/Director Consultant’s approval prior to sending an Open Classification or Probation letter." },
  OM23: { doc: "ops-manual-2022", page: 41, quoteEn: "Notify the Chapter when an individual is no longer a Member and when the category is opened." },
  OM24: { doc: "ops-manual-2022", page: 41, quoteEn: "For example: “We currently have an opening for a financial planner.”" },
  OM25: { doc: "ops-manual-2022", page: 54, quoteEn: "maintains and communicates growth initiatives including the top 10 list of most wanted BNI Classifications" },
  OM26: { doc: "ops-manual-2022", page: 54, quoteEn: "Identify and communicate the top ten BNI Classifications wanted in the Chapter." },
  OM27: { doc: "ops-manual-2022", page: 54, quoteEn: "The best way to identify what classifications are needed in the Chapter, examine the existing Members by contact sphere." },
  OM28: { doc: "ops-manual-2022", page: 54, quoteEn: "Fifty to sixty percent of your referrals come from people in your Contact Sphere." },
  OM29: { doc: "ops-manual-2022", page: 55, quoteEn: "It is important to start supporting your existing Members before you start building a Contact Sphere that doesn’t exist in the Chapter." },
  OM31: { doc: "ops-manual-2022", page: 16, quoteEn: "updates Members regarding professions needed in the Chapter" },
  OM32: { doc: "ops-manual-2022", page: 16, quoteEn: "Fill in gaps within your referral network by inviting visitors and sponsoring new Members." },
  OM34: { doc: "ops-manual-2022", page: 56, quoteEn: "In the event that a Member cannot get back into their original Chapter because their former position is no longer available in that Chapter" },
  OM41: { doc: "ops-manual-2022", page: 59, quoteEn: "The Membership Committee may open the Member’s classification without probation, if warranted." },
  OM42: { doc: "ops-manual-2022", page: 55, quoteEn: "A Member may be terminated by letter after their fourth absence within any six-month period." },
  OM43: { doc: "ops-manual-2022", page: 48, quoteEn: "Specialist:" },
  OM45: { doc: "ops-manual-2022", page: 16, rule: "11. Membership Committee Report", quoteEn: "Ensure a Membership Committee Member is pre-selected for this report each week." },
};
