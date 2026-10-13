/**
 * Rejstřík ověřených citací stránky „Jak probíhá čtvrteční schůzka (/pravidla/schuzka)", iter-031 (T-007s, X14).
 *
 * Přepsáno z tabulky návrhu (arch_iter-031_T-001d sekce 14) po deltě T-003s 1.3 a gate T-004 3s.
 * Obsahuje jen citace, které mají fakt ve schválených textech (T-005 + gate
 * T-006), a záměrně ponechané nepoužité. Každá `quoteEn` ověřena skriptem
 * proti textu PDF 12. 10. 2026. Citace doslovně včetně apostrofů z PDF.
 * U manuálu je strana PDF = vytištěné číslo.
 *
 * Prefix QG, QM. Shodná citace má v celé sérii jedno id (T-003s 1.3).
 * Nahrazené: QG3 = H01, QM13 = H56, QM45 = H100, QM47 = H95.
 * Vyřazené v T-012w (program otevřené schůzky, gate T-012w2): QM4, QM5, QM6, QM7, QM8, QM9,
 * QM10, QM12, QM20, QM21, QM23, QM26 až QM30, QM43. Záměrně nepoužité: QM49 (gate T-004 d K2). Nezapsané (po škrtech bez faktu): QM33,
 * QM41, QM42, QM44.
 *
 * Stránky citují přes `src()` / `fact()` z `content/pravidla/fakta.ts`,
 * coder stránky tenhle soubor nemění (T-003s sekce 3).
 */
import type { SourceRef } from "@/lib/info-pages/types";

export const SCHUZKA_SOURCES: Record<string, SourceRef> = {
  QG1: { doc: "general-policies", page: 1, rule: "General Policy #3", quoteEn: "BNI Members must arrive on time and stay for the entire published meeting time." },
  QG2: { doc: "general-policies", page: 1, rule: "General Policy #5", quoteEn: "A BNI Member is allowed three absences within a continuous six-month period. If a Member cannot attend, they may send a substitute; this will not count as an absence. Additionally, a member is allowed three substitutes in a six-month period." },
  QG4: { doc: "general-policies", page: 3, rule: "Visiting Chapters 1", quoteEn: "Before visiting another Chapter, the visiting Member should call that Chapter’s President first." },
  QG5: { doc: "general-policies", page: 3, rule: "Visiting Chapters 2", quoteEn: "Members visiting other Chapters should announce that they are from another Chapter." },
  QG6: { doc: "general-policies", page: 3, rule: "Visiting Chapters 3", quoteEn: "Visiting Members must not do or say anything that competes with a Member of that Chapter." },
  QG7: { doc: "general-policies", page: 3, rule: "Visiting Chapters 4", quoteEn: "The Chapter should be cautious in giving referrals to individuals they don’t know, including visiting Members." },
  QG9: { doc: "general-policies", page: 3, rule: "Visiting Chapters 6", quoteEn: "Visiting Members follow the same visiting policies as non-members; no more than two visits allowed." },
  QG10: { doc: "general-policies", page: 3, rule: "Absences and Tardiness", quoteEn: "If the problem continues, the Member’s classification may be subject to being re-opened." },
  QG12: { doc: "general-policies", page: 3, rule: "Substitute Program 2", quoteEn: "Members should alert the Chapter of a substitute so that the Visitor Host can be there to greet him/her." },
  QM1: { doc: "ops-manual-2022", page: 10, rule: "Substitute Program", quoteEn: "At the discretion of Chapter Leadership, if the substitute’s classification is not filled then substitutes may be permitted to present their business during the visitor meeting section." },
  QM2: { doc: "ops-manual-2022", page: 11, quoteEn: "every BNI Chapter meeting is run by an agenda." },
  QM3: { doc: "ops-manual-2022", page: 12, quoteEn: "arrive a minimum of 15 minutes prior to the designated meeting time to welcome visitors." },
  QM11: { doc: "ops-manual-2022", page: 13, quoteEn: "an Education Moment is presented to help our Members enhance their networking skills." },
  QM14: { doc: "ops-manual-2022", page: 15, quoteEn: "Use your 30 to 60 second Weekly Presentation to educate your referral marketing team on who you are, what you do, how you add value and how to find referrals for you." },
  QM15: { doc: "ops-manual-2022", page: 15, quoteEn: "Please include your name, business name and specific referral request." },
  QM16: { doc: "ops-manual-2022", page: 15, quoteEn: "Substitutes, during Member introductions, give the Weekly Presentation for the Member you are substituting for." },
  QM18: { doc: "ops-manual-2022", page: 16, quoteEn: "Visitors, it is now time for you to introduce yourself." },
  QM19: { doc: "ops-manual-2022", page: 16, quoteEn: "the Vice President provides the “PALMS Report” statistics: average number of monthly referrals, average number of monthly visitors and the total referrals to date." },
  QM22: { doc: "ops-manual-2022", page: 17, quoteEn: "One or two Members provide a presentation that gives Members greater clarity as to the target market and business to help generate more referrals." },
  QM24: { doc: "ops-manual-2022", page: 17, quoteEn: "All Members stand for this, the most important part of the meeting." },
  QM25: { doc: "ops-manual-2022", page: 17, quoteEn: "Members report referrals given or provide a testimonial for any Member of the Chapter." },
  QM31: { doc: "ops-manual-2022", page: 35, quoteEn: "Arrive 15 minutes early to the meeting" },
  QM32: { doc: "ops-manual-2022", page: 39, quoteEn: "keeps accurate records of attendance, referrals given and received, visitors, One-to-Ones and closed business" },
  QM35: { doc: "ops-manual-2022", page: 55, rule: "Substitutes", quoteEn: "Keep in mind the absences are for the last-minute situation. Substitutes are for planned absences. It is a best practice to alert the Chapter of a substitute so that the Visitor Host can be there to greet them." },
  QM36: { doc: "ops-manual-2022", page: 55, rule: "Substitutes", quoteEn: "Help the Member identify one or two substitutes they can use in the event they must miss a meeting." },
  QM37: { doc: "ops-manual-2022", page: 55, rule: "Late/Leaving Early", quoteEn: "To build meaningful relationships, reliability is very important and is supported by policy #3" },
  QM38: { doc: "ops-manual-2022", page: 55, rule: "Late/Leaving Early", quoteEn: "The Membership Committee tracks and coaches Members who are consistently late and/or leave early." },
  QM39: { doc: "ops-manual-2022", page: 62, quoteEn: "Time the Member Weekly Presentations and Visitor Introductions" },
  QM40: { doc: "ops-manual-2022", page: 64, rule: "Speaker Rotation Schedule", quoteEn: "must complete Member Success Program before being added to the rotation." },
  QM49: { doc: "ops-manual-2022", page: 68, rule: "Visiting BNI Members", quoteEn: "Before visiting another Chapter, the visiting Member should register to attend through the BNI Connect Mobile App to let the Leadership Team know they are coming." },
};
