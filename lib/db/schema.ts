import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
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
