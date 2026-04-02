import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  date,
  primaryKey,
  unique,
  check,
  index,
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailUnique: unique("member_email_unique").on(table.email),
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
// GUEST
// ============================================================
export const guest = pgTable(
  "guest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email"),
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
      sql`${table.status} IN ('draft', 'voting', 'closed')`
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
    memberId: uuid("member_id").references(() => member.id, { onDelete: "set null" }),
    externalName: text("external_name"),
    externalEmail: text("external_email"),
    // Global UNIQUE enforced at DB level (UNIQUE column)
    magicTokenHash: text("magic_token_hash").unique(),
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
