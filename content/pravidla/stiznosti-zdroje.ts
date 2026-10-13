/**
 * Rejstřík ověřených citací stránky „Stížnost a spor (/pravidla/stiznosti)", iter-031 (T-007s, X14).
 *
 * Přepsáno z tabulky návrhu (arch_iter-031_T-001c sekce 15) po deltě T-003s 1.3 a gate T-004 3s.
 * Obsahuje jen citace, které mají fakt ve schválených textech (T-005 + gate
 * T-006), a záměrně ponechané nepoužité. Každá `quoteEn` ověřena skriptem
 * proti textu PDF 12. 10. 2026. Citace doslovně včetně apostrofů z PDF.
 * U manuálu je strana PDF = vytištěné číslo.
 *
 * Prefix SG, SM. Shodná citace má v celé sérii jedno id (T-003s 1.3).
 * Nahrazené: SM37 = OM17, SM49 = OM20, SM53 = H57, SM55 = M58, SM59 = OM12.
 * Přesunuté do `kodex-zdroje.ts` (T-001e): SG2 až SG8 = KG1 až KG7, SM58 = KM1, SM2 = KM2, SM1 = KM3.
 * Nezapsané (po škrtech bez faktu, gate T-004 3c a T-006c): SM10, SM35, SM47, SM48,
 * SM52, SM57, SM60, SM61.
 *
 * Stránky citují přes `src()` / `fact()` z `content/pravidla/fakta.ts`,
 * coder stránky tenhle soubor nemění (T-003s sekce 3).
 */
import type { SourceRef } from "@/lib/info-pages/types";

export const STIZNOSTI_SOURCES: Record<string, SourceRef> = {
  SG1: { doc: "general-policies", page: 1, rule: "General Policy #11", quoteEn: "All BNI membership lists are for the purpose of giving referrals only." },
  SM3: { doc: "ops-manual-2022", page: 8, rule: "General Policy #11", quoteEn: "Consent must be freely given, specific, informed and unambiguous." },
  SM4: { doc: "ops-manual-2022", page: 9, rule: "Non-Discrimination", quoteEn: "review and select persons for membership in all classifications based on qualifications without regard to race, color, gender, religion, national origin, marital status, sexual orientation, age or disability." },
  SM5: { doc: "ops-manual-2022", page: 9, rule: "No Harassment", quoteEn: "Any form of harassment on the basis of race, creed, color, age, sex, sexual orientation, gender identity, national origin, ancestry, citizenship status, religion, marital status, disability, military service or veteran status, genetic information or any other classification protected by applicable federal, state, or local laws and ordinances is prohibited and will be treated as a disciplinary matter." },
  SM6: { doc: "ops-manual-2022", page: 9, rule: "No Harassment", quoteEn: "we all need to be culturally sensitive so that we can best relate to each other." },
  SM7: { doc: "ops-manual-2022", page: 57, quoteEn: "handles any constructive facilitation between Members as needed and identifies any leading indicators that might cause concern." },
  SM8: { doc: "ops-manual-2022", page: 57, quoteEn: "Helps coach or arranges for a mentor or other Membership Committee Member to coach Members as needed using the GROW Coaching Model" },
  SM9: { doc: "ops-manual-2022", page: 57, quoteEn: "Brings Member Complaint Processing Checklist to monthly Chapter Success Meeting, when a complaint is in process" },
  SM11: { doc: "ops-manual-2022", page: 58, quoteEn: "When the Membership Committee observes conflicts or receives written complaints about a Member’s poor-quality referrals, poor attendance, policy violation or failure to uphold the Code of Ethics, the Membership Committee must take action." },
  SM12: { doc: "ops-manual-2022", page: 58, quoteEn: "Most complaints are the result of a miscommunication or misunderstanding." },
  SM13: { doc: "ops-manual-2022", page: 58, quoteEn: "First, encourage the Member with the complaint to try to work it out with the other Member." },
  SM14: { doc: "ops-manual-2022", page: 58, quoteEn: "Encourage a One-to-One to open the lines of communication, share their concerns and clear up the misunderstanding." },
  SM15: { doc: "ops-manual-2022", page: 58, quoteEn: "Each party is interviewed individually" },
  SM16: { doc: "ops-manual-2022", page: 58, quoteEn: "Interview the person filing the complaint to find out missing information" },
  SM17: { doc: "ops-manual-2022", page: 58, quoteEn: "Interview the Member at issue to allow them to give their version of the story" },
  SM18: { doc: "ops-manual-2022", page: 58, quoteEn: "One or two Membership Committee members interview each party" },
  SM19: { doc: "ops-manual-2022", page: 58, quoteEn: "Take notes and document the conversations (date, key points, Member’s reactions)" },
  SM20: { doc: "ops-manual-2022", page: 58, quoteEn: "Complaint letters are not shown to parties at issue, however key points may be shared" },
  SM21: { doc: "ops-manual-2022", page: 58, quoteEn: "Determine if there is a violation in a BNI Policy or Code of Ethics" },
  SM22: { doc: "ops-manual-2022", page: 58, quoteEn: "Determine severity of the violation" },
  SM23: { doc: "ops-manual-2022", page: 58, quoteEn: "The goal is to seek consensus of a resolution that is in the best interest of the Chapter." },
  SM24: { doc: "ops-manual-2022", page: 58, quoteEn: "Contact involved Members to notify them of the outcome/resolution." },
  SM25: { doc: "ops-manual-2022", page: 58, quoteEn: "Ask, \"How can we help you resolve this issue?\" and get the parties involved in coming to a resolution." },
  SM26: { doc: "ops-manual-2022", page: 58, quoteEn: "If the concern at hand is a Chapter-wide topic, encourage the Education Coordinator to address it through a Networking Education Moment." },
  SM27: { doc: "ops-manual-2022", page: 59, quoteEn: "Encourage the Member’s Mentor to have a One-to-One and work with them on a specific area." },
  SM28: { doc: "ops-manual-2022", page: 59, quoteEn: "Assign appropriate BNI Business Builder coursework for completion by Member." },
  SM29: { doc: "ops-manual-2022", page: 59, quoteEn: "Add Member’s name, date, Code of Ethics or Policy violation reference, and length of probation" },
  SM30: { doc: "ops-manual-2022", page: 59, quoteEn: "No other details are to be added" },
  SM31: { doc: "ops-manual-2022", page: 59, quoteEn: "Email the letter with a read receipt if possible." },
  SM32: { doc: "ops-manual-2022", page: 59, quoteEn: "Ideally two Membership Committee members meet(s) with the challenged Member." },
  SM33: { doc: "ops-manual-2022", page: 59, quoteEn: "Provide an example of the types of behaviors that could be considered a violation of probation and result in opening the classification to another qualified professional" },
  SM34: { doc: "ops-manual-2022", page: 59, quoteEn: "Measurable courses of action that allow for accountability, such as retaking the Member Success Program or bringing a certain number or qualified referrals or visitors, are to be addressed in this conversation" },
  SM36: { doc: "ops-manual-2022", page: 59, quoteEn: "If, at the end of the probation, the problem has not been rectified, the Membership Committee meet to consider opening the classification." },
  SM38: { doc: "ops-manual-2022", page: 60, quoteEn: "it may be necessary to have both men and women involved to keep the process gender neutral." },
  SM39: { doc: "ops-manual-2022", page: 60, quoteEn: "Based on Firsthand Experience" },
  SM40: { doc: "ops-manual-2022", page: 60, quoteEn: "From a BNI Member (this Chapter or any other)" },
  SM41: { doc: "ops-manual-2022", page: 60, quoteEn: "Vice President Assigns Two Membership Committee Members to Interview" },
  SM42: { doc: "ops-manual-2022", page: 60, quoteEn: "Assign a Fully Trained Membership Committee" },
  SM43: { doc: "ops-manual-2022", page: 60, quoteEn: "Was there a violation of the BNI Policies or BNI Code of Ethics?" },
  SM44: { doc: "ops-manual-2022", page: 60, quoteEn: "Notify Both Parties of the Decisions" },
  SM45: { doc: "ops-manual-2022", page: 60, quoteEn: "These letters must be sent out fairly and consistently to all Members, without exceptions." },
  SM46: { doc: "ops-manual-2022", page: 60, quoteEn: "Do not alter the BNI Accountability Letters. They have been approved by BNI attorneys." },
  SM50: { doc: "ops-manual-2022", page: 33, quoteEn: "All written complaints should be handled upon receipt." },
  SM51: { doc: "ops-manual-2022", page: 32, quoteEn: "How can concerns be addressed before they become written complaints?" },
  SM54: { doc: "ops-manual-2022", page: 58, quoteEn: "If the quality of a Member’s service or professionalism is in serious question, the following steps are to be followed before opening the Member’s classification." },
  SM56: { doc: "ops-manual-2022", page: 60, quoteEn: "In Writing" },
};
