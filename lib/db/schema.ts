import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  smallint,
  bigint,
  date,
  jsonb,
  primaryKey,
  unique,
  check,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================================
// CATEGORY
// ============================================================
export const category = pgTable(
  "category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    nameUnique: unique("category_name_unique").on(table.name),
  })
);

// ============================================================
// MEMBER
// ============================================================
export const member = pgTable(
  "member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    company: text("company"),
    obor: text("obor"),
    email: text("email"),
    passwordHash: text("password_hash"),
    managementRole: text("management_role"),
    magicTokenHash: text("magic_token_hash"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    tokenUsed: boolean("token_used").notNull().default(false),
    previousTokenHash: text("previous_token_hash"),
    previousTokenExpiresAt: timestamp("previous_token_expires_at", {
      withTimezone: true,
    }),
    // Global display order for member listings (drag&drop). Nullable for legacy
    // rows; backfilled by migration and always set on insert (max+1).
    displayOrder: integer("display_order"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // iter-020: source of truth for BNI entry date (used by interview 5/10-month
    // due logic). Backfilled from created_at::date (migration); created_at is
    // import time for bulk-imported members, NOT actual entry date — hence a
    // dedicated, admin-editable column. DATE (not timestamp): entry is a
    // calendar day, month arithmetic without timezone concerns.
    joinedAt: date("joined_at").notNull().default(sql`CURRENT_DATE`),
    // iter-032 (arch 7.2): revokace session. Zvyšuje se při změně role,
    // resetu a nastavení hesla, změně vlastního hesla a změně e-mailu člena
    // vedení. getSession() ji porovná s `sv` v cookie, neshoda = odhlášení.
    sessionVersion: integer("session_version").notNull().default(0),
    // iter-037 (arch 3.1, gate Z1): deaktivace člena. `deactivated_at` NULL =
    // aktivní. `inactive_until` = poslední neaktivní den včetně (NULL při
    // vyplněném `deactivated_at` = do odvolání). Bez poznámky k důvodu (Z1).
    // Logika deaktivace: lib/members/activity.ts, lib/db/queries/member-status.ts.
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    inactiveUntil: date("inactive_until"),
    deactivatedBy: uuid("deactivated_by").references(
      (): AnyPgColumn => member.id,
      { onDelete: "set null" }
    ),
    // iter-038 (arch 4.1): příznak Správce docházky. `NULL` = není správce.
    // Čte ho `getMemberAuthState` (bez migrace iter-038 spadne na 42703, R6).
    attendanceManagerSince: timestamp("attendance_manager_since", { withTimezone: true }),
    attendanceManagerBy: uuid("attendance_manager_by").references(
      (): AnyPgColumn => member.id,
      { onDelete: "set null" }
    ),
  },
  (table) => ({
    inactiveUntilNeedsDeactivation: check(
      "member_inactive_until_needs_deactivation",
      sql`${table.inactiveUntil} IS NULL OR ${table.deactivatedAt} IS NOT NULL`
    ),
    emailUnique: unique("member_email_unique").on(table.email),
    // iter-032 (K13): e-mail bez ohledu na velikost písmen, přísnější než
    // member_email_unique (přesná shoda), který zůstává.
    emailLowerUnique: uniqueIndex("member_email_lower_unique").on(
      sql`lower(${table.email})`
    ),
    // iter-032 (K5): heslo jen u vedení, odebrání role heslo maže. iter-037
    // (T-003b): CHECK `member_password_only_for_management` je pryč (migrace),
    // heslo smí mít držitel role NEBO funkce a CHECK nemůže číst
    // `member_function`. Pravidlo drží aplikace (`hasPasswordAccess`).
    magicTokenHashUnique: unique().on(table.magicTokenHash),
    managementRequiresCredentials: check(
      "member_management_requires_credentials",
      sql`${table.managementRole} IS NULL OR (${table.email} IS NOT NULL AND ${table.passwordHash} IS NOT NULL)`
    ),
    managementRoleCheck: check(
      "member_management_role_check",
      sql`${table.managementRole} IN ('admin', 'moderator')`
    ),
    magicTokenHashIdx: index("idx_member_magic_token_hash").on(
      table.magicTokenHash
    ),
    emailIdx: index("idx_member_email").on(table.email),
    managementRoleIdx: index("idx_member_management_role").on(
      table.managementRole
    ),
  })
);

// ============================================================
// DOCHÁZKA (iter-038, arch 4.2)
// ============================================================
// Docházka je vázaná na DATUM (Europe/Prague), ne na schůzku. Bez řádku
// `member_absence` je člen přítomný. Tabulky zakládá
// scripts/migrate-iter-038-dochazka.ts (zdroj pravdy pro DDL, vč. triggeru
// append-only nad `attendance_audit`).

/** Ohlášená nepřítomnost člena (kalendář). `substitute_name` NULL = bez náhradníka. */
export const memberAbsence = pgTable(
  "member_absence",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    absenceDate: date("absence_date").notNull(),
    substituteName: text("substitute_name"),
    createdBy: uuid("created_by").references(() => member.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => member.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.memberId, table.absenceDate] }),
    dateIdx: index("idx_member_absence_date").on(table.absenceDate),
    subLen: check(
      "ma_sub_len",
      sql`${table.substituteName} IS NULL OR char_length(btrim(${table.substituteName})) BETWEEN 2 AND 80`
    ),
  })
);

/** Zápis správce: stav člena v daný den. `version` pro compare-and-set (T-003b). */
export const attendanceRecord = pgTable(
  "attendance_record",
  {
    attendanceDate: date("attendance_date").notNull(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    substituteName: text("substitute_name"),
    source: text("source").notNull().default("manager"),
    version: integer("version").notNull().default(1),
    updatedBy: uuid("updated_by").references(() => member.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.attendanceDate, table.memberId] }),
    memberIdx: index("idx_attendance_record_member").on(table.memberId, table.attendanceDate),
    statusCheck: check("ar_status", sql`${table.status} IN ('absent', 'present', 'substitute')`),
    sourceCheck: check("ar_source", sql`${table.source} IN ('manager', 'auto')`),
    subCheck: check(
      "ar_sub",
      sql`(${table.status} = 'substitute') = (${table.substituteName} IS NOT NULL)`
    ),
    subLen: check(
      "ar_sub_len",
      sql`${table.substituteName} IS NULL OR char_length(btrim(${table.substituteName})) BETWEEN 2 AND 80`
    ),
  })
);

/** Paměť jmen náhradníků per člen (plní člen i správce). */
export const memberSubstituteName = pgTable(
  "member_substitute_name",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    memberNameUnique: uniqueIndex("msn_member_name").on(table.memberId, sql`lower(${table.name})`),
    nameLen: check("msn_name_len", sql`char_length(btrim(${table.name})) BETWEEN 2 AND 80`),
  })
);

/**
 * iter-040: interní schůzka v docházce. Řádek = interní schůzka na ten den,
 * zrušení = DELETE. Do `meeting` se nic nezapisuje. Tabulku zakládá migrace
 * `scripts/migrate-iter-040-interni-schuzky.ts`.
 */
export const attendanceInternalDay = pgTable("attendance_internal_day", {
  attendanceDate: date("attendance_date").primaryKey(),
  createdBy: uuid("created_by").references(() => member.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Uzavření dne (cron 17:00, T-003c). */
export const attendanceDay = pgTable(
  "attendance_day",
  {
    attendanceDate: date("attendance_date").primaryKey(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    mode: text("mode"),
    reportLate: boolean("report_late").notNull().default(false),
  },
  (table) => ({
    modeCheck: check("ad_mode", sql`${table.mode} IS NULL OR ${table.mode} IN ('recorded', 'unrecorded')`),
  })
);

/** Ranní odkaz správci (T-003c). V DB jen SHA-256 hash tokenu. */
export const attendanceLink = pgTable(
  "attendance_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    attendanceDate: date("attendance_date").notNull(),
    tokenHash: text("token_hash").unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    resendEmailId: text("resend_email_id"),
  },
  (table) => ({
    memberDateUnique: unique("attendance_link_member_date_unique").on(
      table.memberId,
      table.attendanceDate
    ),
  })
);

/** Kdo dostal report za den (jeden mail na příjemce a den, T-003c). */
export const attendanceReportMail = pgTable(
  "attendance_report_mail",
  {
    attendanceDate: date("attendance_date").notNull(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    resendEmailId: text("resend_email_id"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.attendanceDate, table.memberId] }),
  })
);

/**
 * Zpětné opravy docházky, append-only (DB trigger, T-003b). Záměrně BEZ cizích
 * klíčů na `member`: `ON DELETE SET NULL` by byl UPDATE a trigger by zablokoval
 * mazání člena. Jména jsou snímky.
 */
export const attendanceAudit = pgTable(
  "attendance_audit",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id"),
    actorName: text("actor_name").notNull(),
    memberId: uuid("member_id"),
    memberName: text("member_name").notNull(),
    attendanceDate: date("attendance_date").notNull(),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
  },
  (table) => ({
    dateIdx: index("idx_attendance_audit_date").on(table.attendanceDate),
    memberIdx: index("idx_attendance_audit_member").on(table.memberId, table.attendanceDate),
    fieldCheck: check("aa_field", sql`${table.field} IN ('presence', 'absence')`),
  })
);

// ============================================================
// GUEST
// ============================================================
export const guest = pgTable(
  "guest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    description: text("description"),
    categoryId: uuid("category_id").references(() => category.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by").references(() => member.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    categoryIdx: index("idx_guest_category").on(table.categoryId),
    createdAtIdx: index("idx_guest_created_at").on(table.createdAt),
  })
);

// ============================================================
// MEETING
// ============================================================
export const meeting = pgTable(
  "meeting",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull().unique(),
    votingOpenAt: timestamp("voting_open_at", { withTimezone: true }),
    votingClosesAt: timestamp("voting_closes_at", { withTimezone: true }),
    status: text("status")
      .notNull()
      .default("draft"),
    location: text("location"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      "meeting_status_check",
      sql`${table.status} IN ('draft', 'active', 'voting', 'closed')`
    ),
    votingWindowValid: check(
      "meeting_voting_window_valid",
      sql`${table.votingOpenAt} IS NULL OR ${table.votingClosesAt} IS NULL OR ${table.votingOpenAt} < ${table.votingClosesAt}`
    ),
    dateIdx: index("idx_meeting_date").on(table.date),
    statusIdx: index("idx_meeting_status").on(table.status),
  })
);

// ============================================================
// MEETING_GUEST (M:N)
// ============================================================
export const meetingGuest = pgTable(
  "meeting_guest",
  {
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guest.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    votingEnabled: boolean("voting_enabled").notNull().default(true),
    // Per-meeting display order for guest listings (drag&drop). Nullable for
    // legacy rows; backfilled per meeting by migration and set on insert (max+1).
    displayOrder: integer("display_order"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.meetingId, table.guestId] }),
    guestIdx: index("idx_meeting_guest_guest").on(table.guestId),
  })
);

// ============================================================
// NOTE
// ============================================================
export const note = pgTable(
  "note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id").references(() => member.id, {
      onDelete: "set null",
    }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guest.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id").references(() => meeting.id, {
      onDelete: "set null",
    }),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    textNotEmpty: check(
      "note_text_not_empty",
      sql`char_length(${table.text}) > 0`
    ),
    guestIdx: index("idx_note_guest").on(table.guestId),
    memberIdx: index("idx_note_member").on(table.memberId),
    meetingIdx: index("idx_note_meeting").on(table.meetingId),
    createdAtIdx: index("idx_note_created_at").on(table.createdAt),
  })
);

// ============================================================
// EVENT
// Note: selected_option_id FK → event_option is deferred (circular reference).
//       It is enforced at the DB level by the migration script.
// ============================================================
export const event = pgTable(
  "event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("draft"),
    votingType: text("voting_type").notNull().default("pick_one"),
    votingMaxX: integer("voting_max_x"),
    whoCanVote: text("who_can_vote").notNull().default("members_only"),
    customOptionsAllowed: boolean("custom_options_allowed").notNull().default(false),
    whoCanAddOptions: text("who_can_add_options").notNull().default("members_only"),
    optionType: text("option_type").notNull().default("text"),
    // FK to event_option — circular reference, enforced at DB level only
    selectedOptionId: uuid("selected_option_id"),
    createdBy: uuid("created_by").references(() => member.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    tokensRevokedAt: timestamp("tokens_revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    statusCheck: check(
      "event_status_check",
      sql`${table.status} IN ('draft', 'active', 'closed', 'done')`
    ),
    votingTypeCheck: check(
      "event_voting_type_check",
      sql`${table.votingType} IN ('pick_one', 'multiple', 'max_x')`
    ),
    whoCanVoteCheck: check(
      "event_who_can_vote_check",
      sql`${table.whoCanVote} IN ('members_only', 'anyone_with_link')`
    ),
    whoCanAddOptionsCheck: check(
      "event_who_can_add_options_check",
      sql`${table.whoCanAddOptions} IN ('members_only', 'anyone_with_link')`
    ),
    votingMaxXRequired: check(
      "event_voting_max_x_required",
      sql`${table.votingType} != 'max_x' OR ${table.votingMaxX} IS NOT NULL`
    ),
    statusIdx: index("idx_event_status").on(table.status),
    createdAtIdx: index("idx_event_created_at").on(table.createdAt),
  })
);

// ============================================================
// EVENT_OPTION
// Note: added_by_participant_id FK → event_participant is deferred (circular).
//       It is enforced at the DB level by the migration script.
// ============================================================
export const eventOption = pgTable(
  "event_option",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    // FK to event_participant — circular reference, enforced at DB level only
    addedByParticipantId: uuid("added_by_participant_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventIdLabelUnique: unique("event_option_event_id_label_unique").on(
      table.eventId,
      table.label
    ),
    eventIdIdx: index("idx_event_option_event_id").on(table.eventId),
  })
);

// ============================================================
// EVENT_PARTICIPANT
// ============================================================
export const eventParticipant = pgTable(
  "event_participant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => member.id, { onDelete: "cascade" }),
    externalName: text("external_name"),
    externalEmail: text("external_email"),
    // Global UNIQUE enforced at DB level (UNIQUE column)
    magicTokenHash: text("magic_token_hash").unique(),
    encryptedToken: text("encrypted_token"),
    tokenCreatedAt: timestamp("token_created_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    identityCheck: check(
      "event_participant_identity_check",
      sql`${table.memberId} IS NOT NULL OR ${table.externalName} IS NOT NULL`
    ),
    eventIdIdx: index("idx_event_participant_event_id").on(table.eventId),
    magicTokenHashIdx: index("idx_event_participant_magic_token_hash").on(
      table.magicTokenHash
    ),
    memberIdIdx: index("idx_event_participant_member_id").on(table.memberId),
    // Partial UNIQUE indexes — defined at DB level in migration; represented here as partial indexes
    eventMemberUniqueIdx: index("idx_event_participant_event_member_unique")
      .on(table.eventId, table.memberId)
      .where(sql`${table.memberId} IS NOT NULL`),
    eventEmailUniqueIdx: index("idx_event_participant_event_email_unique")
      .on(table.eventId, table.externalEmail)
      .where(sql`${table.externalEmail} IS NOT NULL`),
    externalEmailIdx: index("idx_event_participant_external_email")
      .on(table.externalEmail)
      .where(sql`${table.externalEmail} IS NOT NULL AND ${table.memberId} IS NULL`),
  })
);

// ============================================================
// EVENT_VOTE
// ============================================================
export const eventVote = pgTable(
  "event_vote",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => eventParticipant.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => eventOption.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    participantOptionUnique: unique("event_vote_participant_option_unique").on(
      table.participantId,
      table.optionId
    ),
    eventOptionIdx: index("idx_event_vote_event_option").on(table.eventId, table.optionId),
    participantIdIdx: index("idx_event_vote_participant_id").on(table.participantId),
  })
);

// ============================================================
// VOTE
// ============================================================
export const vote = pgTable(
  "vote",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guest.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniquePerMemberGuestMeeting: unique(
      "vote_unique_per_member_guest_meeting"
    ).on(table.memberId, table.guestId, table.meetingId),
    valueCheck: check(
      "vote_value_check",
      sql`${table.value} IN ('up', 'neutral', 'down')`
    ),
    reasonRequiredForDown: check(
      "vote_reason_required_for_down",
      sql`${table.value} != 'down' OR (${table.reason} IS NOT NULL AND char_length(${table.reason}) > 0)`
    ),
    guestMeetingIdx: index("idx_vote_guest_meeting").on(
      table.guestId,
      table.meetingId
    ),
    memberIdx: index("idx_vote_member").on(table.memberId),
    meetingIdx: index("idx_vote_meeting").on(table.meetingId),
  })
);

// ============================================================
// TIMER
// Presentation countdown timer with two-link architecture.
// 'paused' serves as both idle (elapsed=0) and pause state.
// updated_at MUST be set explicitly in every UPDATE (no auto-update in Drizzle).
// display_seconds = user-facing value; initial_seconds = display_seconds + LATENCY_PADDING_SECONDS (internal).
// ============================================================
export const timer = pgTable(
  "timer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // User-facing duration — value entered by admin, stored in DB
    displaySeconds: integer("display_seconds").notNull(),
    // Internal duration = displaySeconds + LATENCY_PADDING_SECONDS
    initialSeconds: integer("initial_seconds").notNull(),
    // 'paused' = idle (elapsed=0) or paused; 'running' = actively counting down
    status: text("status").notNull().default("paused"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
    viewToken: text("view_token").notNull().unique(),
    controlToken: text("control_token").notNull().unique(),
    createdBy: uuid("created_by").references(() => member.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Must be set explicitly in every UPDATE — Drizzle has no auto-update
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      "timer_status_check",
      sql`${table.status} IN ('running', 'paused')`
    ),
    initialSecondsCheck: check(
      "timer_initial_seconds_check",
      sql`${table.initialSeconds} > 0 AND ${table.initialSeconds} <= 86400`
    ),
    displaySecondsCheck: check(
      "timer_display_seconds_check",
      sql`${table.displaySeconds} > 0 AND ${table.displaySeconds} <= 86400`
    ),
    // S-001: cross-column constraint — elapsed upper bound prevents negative remaining_seconds
    elapsedCheck: check(
      "timer_elapsed_check",
      sql`${table.elapsedSeconds} >= 0 AND ${table.elapsedSeconds} <= ${table.initialSeconds}`
    ),
    nameCheck: check(
      "timer_name_check",
      sql`char_length(${table.name}) > 0 AND char_length(${table.name}) <= 100`
    ),
    viewTokenIdx: index("idx_timer_view_token").on(table.viewToken),
    controlTokenIdx: index("idx_timer_control_token").on(table.controlToken),
    statusIdx: index("idx_timer_status").on(table.status),
  })
);

// ============================================================
// MEETING_MEMBER_LINK
// Per-meeting per-member magic link for voting access.
// UNIQUE(meeting_id, member_id) enables UPDATE-only token regeneration.
// morning_email_sent_at tracks idempotent morning email delivery.
// ============================================================
export const meetingMemberLink = pgTable(
  "meeting_member_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // Iter-026 (arch E2, sekce 15.2): sloupec beze změny, jen nový význam —
    // "hlasovací odkaz byl tomuto členovi odeslán" (dřív: ranní e-mail
    // vypnuté Phase A). Zapisuje ho runVotingDispatch/send-email po
    // úspěšném odeslání (markLinkEmailSent), používá ho planVotingDispatch
    // pro skip "already-sent" a UI popisek "Odkaz odeslán". 42 historických
    // hodnot ze schůzek 23.4. a 7.5.2026 se před mergem jednorázově nuluje
    // runbookem (arch 15.3, krok 1) — dělá to uživatel/orchestrátor přímo
    // na produkční DB, ne kód v tomhle repu.
    morningEmailSentAt: timestamp("morning_email_sent_at", {
      withTimezone: true,
    }),
  },
  (table) => ({
    meetingMemberUnique: unique("mml_meeting_member_unique").on(
      table.meetingId,
      table.memberId
    ),
    tokenHashIdx: index("idx_mml_token_hash").on(table.tokenHash),
    meetingIdIdx: index("idx_mml_meeting_id").on(table.meetingId),
    memberIdIdx: index("idx_mml_member_id").on(table.memberId),
  })
);

// ============================================================
// INTERVIEW_QUESTION — iter-020, globální editovatelná sada otázek
// position: bez UNIQUE (reorder = sekvenční UPDATEy bez transakce, LL-003 —
//           UNIQUE by kolidoval transientně; stejný přístup jako display_order)
// active:   archivace místo hard delete (zachová source_question_id párování)
// ============================================================
export const interviewQuestion = pgTable(
  "interview_question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    text: text("text").notNull(),
    questionType: text("question_type").notNull().default("text"),
    position: integer("position").notNull(),
    active: boolean("active").notNull().default(true),
    // iter-021: platnost otázky pro daný typ pohovoru. Oba default TRUE
    // (zpětná kompatibilita se starou sdílenou sadou); CHECK níže vynucuje
    // "aspoň jeden" — otázka neplatná pro oba typy je nesmyslný stav.
    appliesMonth5: boolean("applies_month_5").notNull().default(true),
    appliesMonth10: boolean("applies_month_10").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Musí být nastaven explicitně v každém UPDATE (Drizzle nemá auto-update)
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    textNotEmpty: check(
      "interview_question_text_check",
      sql`char_length(${table.text}) > 0 AND char_length(${table.text}) <= 1000`
    ),
    // Rozšiřitelnost: dnes jen 'text'; budoucí 'scale_1_5' = rozšíření CHECK + value_scale sloupec v answer
    typeCheck: check(
      "interview_question_type_check",
      sql`${table.questionType} IN ('text')`
    ),
    // iter-021: otázka musí platit aspoň pro jeden typ pohovoru
    appliesCheck: check(
      "interview_question_applies_check",
      sql`${table.appliesMonth5} OR ${table.appliesMonth10}`
    ),
    activePositionIdx: index("idx_interview_question_active_position").on(
      table.active,
      table.position
    ),
  })
);

// ============================================================
// INTERVIEW — iter-020, instance pohovoru
// Partial UNIQUE (member_id, type) WHERE status <> 'cancelled':
//   max 1 živý pohovor 5m a 1 živý 10m na člena → porovnání 5 vs 10 je 1:1.
// member_id ON DELETE CASCADE: smazání člena (deleteMemberAction) maže i jeho
//   pohovory vč. submitted — VĚDOMÉ rozhodnutí, konzistentní s vote.member_id
//   (hlasovací historie člena dnes mizí stejně). Viz R-11.
// leader_id nullable + SET NULL: smazání člena-vedoucího nesmí smazat pohovor.
// Smazání dotazníku (T-004a): HARD DELETE řádku (admin i mod, open i submitted) —
//   DB cascade smaže snapshot/odpovědi/link jedním příkazem (flow 8h). Hodnota
//   'cancelled' zůstává v CHECK jako rezerva; žádná MVP cesta ji nenastavuje.
// ============================================================
export const interview = pgTable(
  "interview",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("open"),
    leaderId: uuid("leader_id").references(() => member.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => member.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (table) => ({
    typeCheck: check(
      "interview_type_check",
      sql`${table.type} IN ('month_5', 'month_10')`
    ),
    statusCheck: check(
      "interview_status_check",
      sql`${table.status} IN ('open', 'submitted', 'cancelled')`
    ),
    // Partial UNIQUE — enforced at DB level in migration (CREATE UNIQUE INDEX);
    // v Drizzle jen plain index s where — konvence projektu, viz event_participant
    memberTypeActiveIdx: index("idx_interview_member_type_active")
      .on(table.memberId, table.type)
      .where(sql`${table.status} <> 'cancelled'`),
    memberIdx: index("idx_interview_member").on(table.memberId),
    statusIdx: index("idx_interview_status").on(table.status),
    leaderIdx: index("idx_interview_leader").on(table.leaderId),
  })
);

// ============================================================
// INTERVIEW_QUESTION_SNAPSHOT — iter-020, zamrazená kopie otázek při založení
// source_question_id: primární párovací klíč 5 vs 10 (SET NULL při smazání zdroje)
// position: hustý rank 1..N přiřazený při kopii (NE surová position z živé sady —
//   duplicitní pozice v živé sadě, R-8, nemůže způsobit kolizi v kopii)
// UNIQUE(interview_id, source_question_id): idempotence repair-on-retry klíčovaná
//   OTÁZKOU, ne pozicí — opakovaný insert nikdy tiše nezahodí jinou otázku (MAJOR-1);
//   NULLs distinct (Postgres default) → řádky se source SET NULL nekolidují
// UNIQUE(interview_id, position): tvrdá integrita pozic — neočekávaná kolize = 23505
//   (viditelná chyba), už NENÍ conflict target pro DO NOTHING
// UNIQUE(id, interview_id): cíl composite FK z interview_answer (anti-IDOR na DB úrovni)
// ============================================================
export const interviewQuestionSnapshot = pgTable(
  "interview_question_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interview.id, { onDelete: "cascade" }),
    sourceQuestionId: uuid("source_question_id").references(
      () => interviewQuestion.id,
      { onDelete: "set null" }
    ),
    text: text("text").notNull(),
    questionType: text("question_type").notNull().default("text"),
    position: integer("position").notNull(),
    // iter-021: kopie příznaků platnosti ze zdrojové otázky v okamžiku založení
    // (zamrazeno navždy jako zbytek řádku). Viz arch T-001 sekce 1.3 pro
    // zdůvodnění, proč CHECK dává smysl i na insert-only tabulce.
    appliesMonth5: boolean("applies_month_5").notNull().default(true),
    appliesMonth10: boolean("applies_month_10").notNull().default(true),
  },
  (table) => ({
    interviewPositionUnique: unique("iqs_interview_position_unique").on(
      table.interviewId,
      table.position
    ),
    interviewSourceUnique: unique("iqs_interview_source_unique").on(
      table.interviewId,
      table.sourceQuestionId
    ),
    idInterviewUnique: unique("iqs_id_interview_unique").on(
      table.id,
      table.interviewId
    ),
    interviewIdx: index("idx_iqs_interview").on(table.interviewId),
    // iter-021: stejný "aspoň jeden" CHECK jako na živé sadě (1.3)
    appliesCheck: check(
      "iqs_applies_check",
      sql`${table.appliesMonth5} OR ${table.appliesMonth10}`
    ),
  })
);

// ============================================================
// INTERVIEW_ANSWER — iter-020, odpovědi vedoucího
// snapshot_question_id UNIQUE: max 1 odpověď na otázku (upsert ON CONFLICT).
// Composite FK (snapshot_question_id, interview_id) → snapshot(id, interview_id):
//   DB-level záruka, že odpověď patří k otázce SVÉHO pohovoru — druhá linie
//   obrany proti IDOR (H-7/H-8 lesson). Composite FK je v projektu NOVÝ vzor
//   (Drizzle ho neumí deklarovat) — vynucen jen na DB úrovni migrací (viz
//   lib/db/migrations/iter-020-interviews.sql).
// value_text nullable: prázdná odpověď povolena (submit nevyžaduje úplnost).
// ============================================================
export const interviewAnswer = pgTable(
  "interview_answer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interview.id, { onDelete: "cascade" }),
    snapshotQuestionId: uuid("snapshot_question_id").notNull(),
    valueText: text("value_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    snapshotUnique: unique("interview_answer_snapshot_unique").on(
      table.snapshotQuestionId
    ),
    interviewIdx: index("idx_interview_answer_interview").on(table.interviewId),
  })
);

// ============================================================
// INTERVIEW_LINK — iter-020, scoped magic link pohovoru (vzor meeting_member_link)
// interview_id UNIQUE: 1 řádek per pohovor → regenerace = UPDATE (starý hash
//   okamžitě zaniká; žádný previous_token fallback — H-9 lesson).
// expires_at NOT NULL: token NIKDY bez expirace (H-3 lesson).
// leader_id: token je vázán na konkrétního vedoucího; změna vedoucího token revokuje.
// ============================================================
export const interviewLink = pgTable(
  "interview_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    interviewId: uuid("interview_id")
      .notNull()
      .unique()
      .references(() => interview.id, { onDelete: "cascade" }),
    leaderId: uuid("leader_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  },
  (table) => ({
    tokenHashIdx: index("idx_interview_link_token_hash").on(table.tokenHash),
  })
);

// ============================================================
// AUTH_THROTTLE — iter-020, DB-backed fixed-window rate-limit (H-4 lesson, bez Upstash)
// key formát: "<scope>:<ip>" např. "i-verify:203.0.113.5"
// Jediný atomický UPSERT per failed pokus — bezpečné v serverless bez transakce.
// ============================================================
// ============================================================
// MEMBER_LOGIN_LINK — iter-032 (arch 8.1). Jednorázové odkazy: přihlášení
// člena z mailu (purpose 'login', 15 min) a nastavení hesla vedení
// (purpose 'set-password', 24 h). Spotřebování je atomický UPDATE
// ... WHERE used_at IS NULL AND expires_at > now() RETURNING. Úklid ve
// fázi 6 cronu close-voting (řádky prošlé víc než 1 den).
// ============================================================
export const memberLoginLink = pgTable(
  "member_login_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => ({
    purposeCheck: check(
      "mll_purpose_check",
      sql`${table.purpose} IN ('login', 'set-password')`
    ),
    tokenHashUnique: unique("mll_token_hash_unique").on(table.tokenHash),
    expiresAfterCreated: check(
      "mll_expires_after_created",
      sql`${table.expiresAt} > ${table.createdAt}`
    ),
    memberIdIdx: index("idx_mll_member_id").on(table.memberId),
    // T-006r (security L-4): nejvýš jeden nepoužitý odkaz `set-password` na
    // člena. Vystavení je UPSERT nad tímto indexem (login-links.ts), takže
    // souběh dvou požadavků nenechá platné dva odkazy.
    oneActiveSetPassword: uniqueIndex("mll_one_active_set_password")
      .on(table.memberId)
      .where(sql`${table.purpose} = 'set-password' AND ${table.usedAt} IS NULL`),
  })
);

export const authThrottle = pgTable("auth_throttle", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});

// ============================================================
// OPS_EVENT — iter-027, historie běhů (cron/dispatch/e-maily). "ops_" prefix
// aby se nekolidovalo se stávající "event" (společenská akce, lib/events/).
// meeting_id/member_id: ON DELETE SET NULL, proto snapshoty meeting_date /
// member_name / email — odpověď "proč tenhle člověk nedostal mail" se hledá
// týdny zpátky, JOIN by ukázal dnešní (třeba opravenou) adresu.
// severity má CHECK (jen 3 hodnoty, viz níže); kind NEMÁ CHECK — autoritou
// je TS union OpsEventKind (lib/ops/types.ts), bude přibývat bez migrace.
// Skutečné DDL (vč. pořadí kroků, lock_timeout) je v
// lib/db/migrations/iter-027-ops-event.sql — tahle definice je typová
// reference pro dotazy, ne zdroj pravdy pro strukturu DB (stejná konvence
// jako u interview_question_snapshot, partial index výše).
// ============================================================
export const opsEvent = pgTable(
  "ops_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    seq: integer("seq").notNull().default(0),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    source: text("source").notNull(),
    kind: text("kind").notNull(),
    severity: text("severity").notNull(),
    actor: text("actor"),
    meetingId: uuid("meeting_id").references(() => meeting.id, {
      onDelete: "set null",
    }),
    meetingDate: date("meeting_date"),
    memberId: uuid("member_id").references(() => member.id, {
      onDelete: "set null",
    }),
    memberName: text("member_name"),
    email: text("email"),
    code: text("code"),
    message: text("message").notNull(),
    detail: jsonb("detail"),
    resendEmailId: text("resend_email_id"),
    resendMessageId: text("resend_message_id"),
    deliveryStatus: text("delivery_status"),
    deliveryCheckedAt: timestamp("delivery_checked_at", { withTimezone: true }),
  },
  (table) => ({
    severityCheck: check(
      "ops_event_severity_check",
      sql`${table.severity} IN ('info', 'warn', 'error')`
    ),
    occurredAtIdx: index("idx_ops_event_occurred_at").on(table.occurredAt),
    runIdIdx: index("idx_ops_event_run_id").on(table.runId, table.seq),
    memberIdIdx: index("idx_ops_event_member_id").on(
      table.memberId,
      table.occurredAt
    ),
    meetingIdIdx: index("idx_ops_event_meeting_id").on(
      table.meetingId,
      table.occurredAt
    ),
  })
);

// ============================================================
// MEETING_MEMBER_REMINDER — iter-028, evidence připomínkových kol (T-006,
// arch 6.1, 6.2). Vlastní tabulka místo sloupců v meeting_member_link: kdyby
// se sloupce přidaly do meeting_member_link a kód nasadil dřív než migrace,
// Drizzle skládá INSERT ze VŠECH sloupců schema.ts — generateMeetingToken i
// getMeetingMemberLink by padaly na 42703 undefined_column a rozbily by i
// spuštění hlasování, ne jen připomínky. ops_event nepřipadá v úvahu — je to
// best-effort log s retencí, ztracený zápis by znamenal druhou připomínku.
//
// UNIQUE(meeting_id, member_id, round): nejvýš jedno kolo na člena — hlavní
// záruka "nejvýš jednou" (4.3), zabraňuje zapsat spolu s ON CONFLICT DO
// NOTHING v claimReminder.
// UNIQUE(token_hash): slouží zároveň jako index pro alias ověření tokenu
// (D4 C, 4.5) — víc řádků s NULL (u variant bez vlastního tokenu) Postgres
// v UNIQUE připouští.
// token_hash / link_token_hash: hash tokenu z připomínky (D4 C, jinak NULL) a
// hash meeting_member_link.token_hash v okamžiku zabrání — dvojice, kterou
// ověření tokenu (lib/auth/meeting-token-access.ts) porovná proti aktuálnímu
// řádku odkazu, aby revokace/přegenerování alias nikdy neobešly.
// ============================================================
export const meetingMemberReminder = pgTable(
  "meeting_member_reminder",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    round: smallint("round").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    tokenHash: text("token_hash"),
    linkTokenHash: text("link_token_hash"),
  },
  (table) => ({
    roundCheck: check(
      "mmr_round_check",
      sql`${table.round} BETWEEN 1 AND 3`
    ),
    meetingMemberRoundUnique: unique("mmr_meeting_member_round_unique").on(
      table.meetingId,
      table.memberId,
      table.round
    ),
    tokenHashUnique: unique("mmr_token_hash_unique").on(table.tokenHash),
    memberIdIdx: index("idx_mmr_member_id").on(table.memberId),
  })
);

// ============================================================
// MASTERMIND_CASE / MASTERMIND_INTEREST — iter-033 (T-005, arch T-001 sekce 4):
// zásobník případů „5 minut pro ostatní“. Pravdou je migrační skript
// scripts/migrate-iter-033-mastermind.ts (konvence iter-027, 028), tohle
// schéma slouží jen typům. `meeting` se nemění a mezi `meeting` a případy
// není cizí klíč (U13): interní schůzka v aplikaci není, případ nese datum
// interní (čtvrtek) sám. Dotazy a přechody jsou jednopříkazové SQL v
// lib/db/queries/mastermind.ts (LL-003).
//
// status: proposed (v zásobníku), scheduled (zařazený na internal_date),
// presented (vedení potvrdilo odprezentování). DELETE místo "withdrawn".
// mmc_date_by_status drží stav a datum spolu, mmc_one_per_date nejvýš jeden
// případ na datum interní, i po odprezentování (U1).
// ============================================================
export const mastermindCase = pgTable(
  "mastermind_case",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // navrhovatel = přednášející, nemění se
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    situation: text("situation").notNull(),
    path: text("path"),
    takeaway: text("takeaway"),
    ask: text("ask"),
    status: text("status").notNull().default("proposed"),
    internalDate: date("internal_date"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    scheduledBy: uuid("scheduled_by").references(() => member.id, {
      onDelete: "set null",
    }),
    presentedAt: timestamp("presented_at", { withTimezone: true }),
    presentedConfirmedBy: uuid("presented_confirmed_by").references(
      () => member.id,
      { onDelete: "set null" }
    ),
    createdBy: uuid("created_by").references(() => member.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      "mmc_status_check",
      sql`${table.status} IN ('proposed','scheduled','presented')`
    ),
    titleLen: check(
      "mmc_title_len",
      sql`char_length(btrim(${table.title})) BETWEEN 1 AND 120`
    ),
    situationLen: check(
      "mmc_situation_len",
      sql`char_length(btrim(${table.situation})) BETWEEN 1 AND 2000`
    ),
    pathLen: check("mmc_path_len", sql`char_length(${table.path}) <= 2000`),
    takeawayLen: check(
      "mmc_takeaway_len",
      sql`char_length(${table.takeaway}) <= 2000`
    ),
    askLen: check("mmc_ask_len", sql`char_length(${table.ask}) <= 2000`),
    dateByStatus: check(
      "mmc_date_by_status",
      sql`(${table.status} = 'proposed') = (${table.internalDate} IS NULL)`
    ),
    presentedComplete: check(
      "mmc_presented_complete",
      sql`${table.status} <> 'presented' OR ${table.presentedAt} IS NOT NULL`
    ),
    onePerDate: uniqueIndex("mmc_one_per_date")
      .on(table.internalDate)
      .where(sql`${table.internalDate} IS NOT NULL`),
    memberStatusIdx: index("idx_mmc_member_status").on(
      table.memberId,
      table.status
    ),
    statusCreatedIdx: index("idx_mmc_status_created").on(
      table.status,
      table.createdAt
    ),
  })
);

// Zájem o případ. Před zařazením řadí zásobník, po zařazení je to přihláška
// posluchače, po odprezentování zůstává zamrzlý (K10). Význam plyne ze stavu
// případu (U10), jedna tabulka.
export const mastermindInterest = pgTable(
  "mastermind_interest",
  {
    caseId: uuid("case_id")
      .notNull()
      .references(() => mastermindCase.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      name: "mastermind_interest_pkey",
      columns: [table.caseId, table.memberId],
    }),
    memberIdx: index("idx_mmi_member").on(table.memberId),
  })
);

// ============================================================
// BURZA_OFFER / BURZA_HELP — iter-035 (T-005, arch T-001 sekce 3, gate Z1 až Z5):
// Burza pomoci. Pravdou je migrační skript scripts/migrate-iter-035-burza.ts
// (konvence iter-027 až 033), tohle schéma slouží jen typům. `member` se
// nemění. Zápisy jsou jednopříkazové SQL v lib/db/queries/burza.ts (LL-003).
//
// burza_offer: jeden řádek na člena (PK member_id), jméno, firma a obor se
// berou živě z `member`. Bez sloupce `version` (Z3), `updated_by` zůstává bez UI.
// burza_help: „pomoc využita“, jen evidence. UNIQUE na dvojici a měsíc hlídá
// dvojklik a dvě záložky, bh_not_self zákaz „pomohl jsem si sám“.
// ============================================================
export const burzaOffer = pgTable(
  "burza_offer",
  {
    memberId: uuid("member_id")
      .primaryKey()
      .references(() => member.id, { onDelete: "cascade" }),
    offer: text("offer").notNull(),
    contact: text("contact"),
    note: text("note"),
    updatedBy: uuid("updated_by").references(() => member.id, {
      onDelete: "set null",
    }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    offerLen: check(
      "bo_offer_len",
      sql`char_length(btrim(${table.offer})) BETWEEN 1 AND 1000`
    ),
    contactLen: check("bo_contact_len", sql`char_length(${table.contact}) <= 500`),
    noteLen: check("bo_note_len", sql`char_length(${table.note}) <= 1000`),
  })
);

export const burzaHelp = pgTable(
  "burza_help",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    helperId: uuid("helper_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id").references(() => member.id, {
      onDelete: "set null",
    }),
    usedOn: date("used_on").notNull(),
    usedMonth: date("used_month").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => member.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    notSelf: check(
      "bh_not_self",
      sql`${table.recipientId} IS NULL OR ${table.recipientId} <> ${table.helperId}`
    ),
    monthCheck: check(
      "bh_month",
      sql`${table.usedMonth} = date_trunc('month', ${table.usedOn}::timestamp)::date`
    ),
    noteLen: check("bh_note_len", sql`char_length(${table.note}) <= 600`),
    oncePerMonth: unique("bh_once_per_month").on(
      table.helperId,
      table.recipientId,
      table.usedMonth
    ),
    helperUsedIdx: index("idx_bh_helper_used").on(table.helperId, table.usedOn),
    recipientIdx: index("idx_bh_recipient").on(table.recipientId),
  })
);

// ============================================================
// BURZA_CONTACT / BURZA_CONTACT_USE — iter-035 doplnění (T-013, arch T-011
// sekce 3, gate T-012 Z9): položky „Na koho mám kontakt“ a jejich využití.
// Pravdou je migrační skript scripts/migrate-iter-035b-burza-kontakty.ts,
// tohle schéma slouží jen typům. `burza_offer` a `burza_help` se nemění.
//
// burza_contact: až 10 položek na člena (limit hlídá aplikace v jednom příkazu).
// burza_contact_use: „kontakt využit“, natrvalo (UNIQUE položka + příjemce bez
// času). Bez `created_by` (Z9): zapisuje vždy příjemce. `helper_id` je uložený
// zvlášť, aby bod nabízejícího přežil smazání položky.
// ============================================================
export const burzaContact = pgTable(
  "burza_contact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    updatedBy: uuid("updated_by").references(() => member.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    labelLen: check(
      "bc_label_len",
      sql`char_length(btrim(${table.label})) BETWEEN 1 AND 400`
    ),
    memberIdx: index("idx_bc_member").on(table.memberId),
  })
);

export const burzaContactUse = pgTable(
  "burza_contact_use",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").references(() => burzaContact.id, {
      onDelete: "set null",
    }),
    helperId: uuid("helper_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id").references(() => member.id, {
      onDelete: "set null",
    }),
    usedOn: date("used_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    notSelf: check(
      "bcu_not_self",
      sql`${table.recipientId} IS NULL OR ${table.recipientId} <> ${table.helperId}`
    ),
    once: unique("bcu_once").on(table.contactId, table.recipientId),
    helperUsedIdx: index("idx_bcu_helper_used").on(table.helperId, table.usedOn),
    recipientIdx: index("idx_bcu_recipient").on(table.recipientId),
  })
);


// ============================================================
// CHAPTER FUNCTION + MEMBER FUNCTION (iter-037, arch 3.2)
// ============================================================
// Funkce chapteru (Prezident, Viceprezident, Člen výboru). `permissions` NULL = výchozí sada
// (lib/auth/permissions.ts, DEFAULT_FUNCTION_PERMISSIONS). Prezident a
// Viceprezident mají v datech plnou sadu. Editor práv není součástí iter-037.
export const chapterFunction = pgTable(
  "chapter_function",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    area: text("area").notNull(),
    description: text("description"),
    displayOrder: integer("display_order").notNull(),
    permissions: text("permissions").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    nameLowerUnique: uniqueIndex("chapter_function_name_lower_unique").on(
      sql`lower(${table.name})`
    ),
    areaCheck: check(
      "chapter_function_area_check",
      sql`${table.area} IN ('vedeni', 'leadership', 'vybor', 'ostatni')`
    ),
    descriptionLen: check(
      "chapter_function_description_len",
      sql`${table.description} IS NULL OR char_length(${table.description}) <= 300`
    ),
  })
);

export const memberFunction = pgTable(
  "member_function",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    functionId: uuid("function_id")
      .notNull()
      .references(() => chapterFunction.id, { onDelete: "restrict" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    assignedBy: uuid("assigned_by").references(() => member.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    // Člen má nejvýš jednu funkci (změna zadání 19. 10.): PK jen na member_id.
    pk: primaryKey({ columns: [table.memberId] }),
    functionIdx: index("idx_member_function_function").on(table.functionId),
  })
);
