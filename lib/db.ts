import { randomBytes } from "crypto";
import { and, desc, eq, gte, isNull, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import postgres from "postgres";

// ── Client ──────────────────────────────────────────────────────────────
// The placeholder URL lets `next build` import this module without a
// database; postgres-js only connects on the first query.
const connectionString = process.env.DATABASE_URL || "postgres://localhost:5432/connectbot";
const client = postgres(connectionString);
export const db = drizzle(client);

// ── Schema ──────────────────────────────────────────────────────────────
// Single-tenant: one `sites` row (created on first use) holds the widget
// settings. Conversations and messages hang off it.

export const sites = pgTable("connectbot_sites", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: varchar("public_id", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull().default("My website"),
  color: varchar("color", { length: 16 }).notNull().default("#1972F5"),
  agentName: varchar("agent_name", { length: 80 }).notNull().default("Support"),
  welcomeMessage: text("welcome_message").notNull().default("Hi — how can we help?"),
  /** Widget chrome language: "auto" follows the embedding page. */
  locale: varchar("locale", { length: 8 }).notNull().default("auto"),
  /** Master switch. Off means relay.js renders nothing for visitors. */
  enabled: boolean("enabled").notNull().default(true),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  aiPrompt: text("ai_prompt").notNull().default(""),
  /** Reference material (tutorials, FAQ) the bot answers from. */
  aiKnowledge: text("ai_knowledge").notNull().default(""),
  /** Name the widget shows while the bot is answering. Empty = "<site> Assistant". */
  botName: varchar("bot_name", { length: 80 }).notNull().default(""),
  /** Uploaded bot avatar as a data: URL (≤128px, re-encoded client-side). Empty = /bot-avatar.png. */
  botAvatar: text("bot_avatar").notNull().default(""),
  agentLastSeenAt: timestamp("agent_last_seen_at"),
  /** Owner flipped themselves to "away": the bot answers even while they are on the page. */
  agentAway: boolean("agent_away").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const conversations = pgTable(
  "connectbot_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    visitorToken: varchar("visitor_token", { length: 64 }).notNull().default(""),
    visitorName: varchar("visitor_name", { length: 120 }).notNull().default(""),
    visitorEmail: varchar("visitor_email", { length: 255 }).notNull().default(""),
    visitorAvatar: varchar("visitor_avatar", { length: 500 }).notNull().default(""),
    pageUrl: text("page_url").notNull().default(""),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    lastMessagePreview: varchar("last_message_preview", { length: 240 }).notNull().default(""),
    unread: integer("unread").notNull().default(0),
    lastReadAt: timestamp("last_read_at"),
    humanTakenOver: boolean("human_taken_over").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("connectbot_conv_visitor").on(t.siteId, t.visitorToken)],
);

export const messages = pgTable("connectbot_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  author: varchar("author", { length: 20 }).notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** Set when the sender took the message back; text is blanked at the same time. */
  recalledAt: timestamp("recalled_at"),
});

export type Site = typeof sites.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;

// ── Runtime DDL ─────────────────────────────────────────────────────────
// Idempotent CREATE IF NOT EXISTS on first touch: point DATABASE_URL at any
// empty Postgres and the app provisions itself. No migration step.

let ensured = false;

export async function ensureTables() {
  if (ensured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS connectbot_sites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      public_id varchar(40) NOT NULL UNIQUE,
      name varchar(120) NOT NULL DEFAULT 'My website',
      color varchar(16) NOT NULL DEFAULT '#1972F5',
      agent_name varchar(80) NOT NULL DEFAULT 'Support',
      welcome_message text NOT NULL DEFAULT 'Hi — how can we help?',
      locale varchar(8) NOT NULL DEFAULT 'auto',
      enabled boolean NOT NULL DEFAULT true,
      ai_enabled boolean NOT NULL DEFAULT true,
      ai_prompt text NOT NULL DEFAULT '',
      agent_last_seen_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS connectbot_conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES connectbot_sites(id) ON DELETE CASCADE,
      visitor_token varchar(64) NOT NULL DEFAULT '',
      visitor_name varchar(120) NOT NULL DEFAULT '',
      visitor_email varchar(255) NOT NULL DEFAULT '',
      visitor_avatar varchar(500) NOT NULL DEFAULT '',
      page_url text NOT NULL DEFAULT '',
      last_message_at timestamp NOT NULL DEFAULT now(),
      last_message_preview varchar(240) NOT NULL DEFAULT '',
      unread integer NOT NULL DEFAULT 0,
      last_read_at timestamp,
      human_taken_over boolean NOT NULL DEFAULT false,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS connectbot_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid NOT NULL REFERENCES connectbot_conversations(id) ON DELETE CASCADE,
      author varchar(20) NOT NULL,
      text text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS connectbot_conv_visitor
      ON connectbot_conversations (site_id, visitor_token)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS connectbot_messages_conv_created
      ON connectbot_messages (conversation_id, created_at)
  `);
  // Columns added after the first release; safe on databases that predate them.
  await db.execute(sql`ALTER TABLE connectbot_sites ADD COLUMN IF NOT EXISTS ai_knowledge text NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE connectbot_sites ADD COLUMN IF NOT EXISTS bot_name varchar(80) NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE connectbot_sites ADD COLUMN IF NOT EXISTS bot_avatar text NOT NULL DEFAULT ''`);
  await db.execute(sql`ALTER TABLE connectbot_sites ADD COLUMN IF NOT EXISTS agent_away boolean NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE connectbot_messages ADD COLUMN IF NOT EXISTS recalled_at timestamp`);
  ensured = true;
}

// ── Site (single tenant) ────────────────────────────────────────────────

/** Public site id used in the embed snippet. Defaults to "default". */
export function siteId(): string {
  return (process.env.SITE_ID || "default").slice(0, 40);
}

/**
 * The one site this deployment serves. Created on first touch. The widget's
 * `data-site` value is accepted but not required — a single-tenant server
 * always answers for its own site.
 */
export async function getSite(): Promise<Site> {
  await ensureTables();
  const id = siteId();
  const [existing] = await db.select().from(sites).where(eq(sites.publicId, id)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(sites)
    .values({ publicId: id, name: process.env.SITE_NAME || "My website" })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  // Lost a create race — the row exists now.
  const [row] = await db.select().from(sites).where(eq(sites.publicId, id)).limit(1);
  return row;
}

export type SitePatch = Partial<
  Pick<
    Site,
    | "name"
    | "color"
    | "agentName"
    | "welcomeMessage"
    | "aiEnabled"
    | "aiPrompt"
    | "aiKnowledge"
    | "botName"
    | "botAvatar"
    | "agentAway"
    | "locale"
    | "enabled"
  >
>;

/** Cap on the bot avatar data URL: a 128px WebP/JPEG lands well under this. */
export const BOT_AVATAR_MAX = 60_000;
/** Hard cap on ai_knowledge, shared by the settings PATCH and the textarea. */
export const KNOWLEDGE_MAX = 30_000;
/** How long after sending a visitor can still take a message back. */
export const RECALL_WINDOW_MS = 2 * 60 * 1000;
/** Inactivity after which the owner counts as away and the bot takes over. */
export const PRESENCE_WINDOW_MS = 60 * 1000;

export function botDisplayName(site: Site): string {
  return site.botName?.trim() || `${site.name} Assistant`;
}

export async function updateSite(patch: SitePatch): Promise<Site> {
  const site = await getSite();
  const [updated] = await db
    .update(sites)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(sites.id, site.id))
    .returning();
  return updated;
}

export async function touchAgentSeen(id: string): Promise<void> {
  await db.update(sites).set({ agentLastSeenAt: new Date() }).where(eq(sites.id, id));
}

/**
 * Online = not switched to away, and a visible console tab hit the API within
 * the last minute. Drives the widget's badge and whether the bot answers.
 */
export function isAgentOnline(site: Site): boolean {
  if (site.agentAway || !site.agentLastSeenAt) return false;
  return Date.now() - site.agentLastSeenAt.getTime() < PRESENCE_WINDOW_MS;
}

// ── Conversations & messages ────────────────────────────────────────────

export function newVisitorToken(): string {
  return `v_${randomBytes(18).toString("hex")}`;
}

export async function listConversations(sid: string): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.siteId, sid))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);
}

export async function getConversation(sid: string, id: string): Promise<Conversation | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.siteId, sid)))
    .limit(1);
  return row ?? null;
}

export async function deleteConversation(sid: string, id: string): Promise<boolean> {
  const conversation = await getConversation(sid, id);
  if (!conversation) return false;
  await db.delete(messages).where(eq(messages.conversationId, conversation.id));
  await db.delete(conversations).where(eq(conversations.id, conversation.id));
  return true;
}

export async function getWidgetConversation(
  sid: string,
  visitorToken: string,
): Promise<Conversation | null> {
  if (!visitorToken) return null;
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.siteId, sid), eq(conversations.visitorToken, visitorToken)))
    .limit(1);
  return row ?? null;
}

export async function getOrCreateWidgetConversation(
  sid: string,
  visitorToken: string,
  meta?: { name?: string; email?: string; avatar?: string; pageUrl?: string },
): Promise<Conversation> {
  const existing = await getWidgetConversation(sid, visitorToken);
  if (existing) {
    if (meta && (meta.name || meta.email || meta.avatar || meta.pageUrl)) {
      const [updated] = await db
        .update(conversations)
        .set({
          visitorName: meta.name || existing.visitorName,
          visitorEmail: meta.email || existing.visitorEmail,
          visitorAvatar: meta.avatar || existing.visitorAvatar,
          pageUrl: meta.pageUrl || existing.pageUrl,
        })
        .where(eq(conversations.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }
  const [created] = await db
    .insert(conversations)
    .values({
      siteId: sid,
      visitorToken,
      visitorName: meta?.name || "",
      visitorEmail: meta?.email || "",
      visitorAvatar: meta?.avatar || "",
      pageUrl: meta?.pageUrl || "",
    })
    .returning();
  return created;
}

export async function listMessages(conversationId: string, after?: Date): Promise<Message[]> {
  if (after) {
    // Postgres keeps microseconds but the client cursor is an ISO string
    // truncated to milliseconds, so a plain `>` re-matches the newest row
    // forever. Advance to the next whole millisecond instead.
    const from = new Date(after.getTime() + 1);
    // A recall changes an old row, so the incremental fetch also returns rows
    // recalled since the cursor; clients merge by id and advance their cursor
    // past recalledAt.
    return db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          or(gte(messages.createdAt, from), gte(messages.recalledAt, from)),
        ),
      )
      .orderBy(messages.createdAt)
      .limit(200);
  }
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .limit(200);
}

export async function latestMessage(conversationId: string): Promise<Message | null> {
  const [row] = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return row ?? null;
}

/** Visitor takes back one of their own messages, inside the recall window. */
export async function recallVisitorMessage(conversation: Conversation, messageId: string): Promise<Message | null> {
  return recallMessage(conversation, messageId, [
    eq(messages.author, "visitor"),
    gte(messages.createdAt, new Date(Date.now() - RECALL_WINDOW_MS)),
  ]);
}

/** The owner takes back their own reply or a bot answer. No time window. */
export async function recallOwnerMessage(conversation: Conversation, messageId: string): Promise<Message | null> {
  return recallMessage(conversation, messageId, [or(eq(messages.author, "agent"), eq(messages.author, "bot"))!]);
}

async function recallMessage(conversation: Conversation, messageId: string, extra: SQL[]): Promise<Message | null> {
  const [updated] = await db
    .update(messages)
    .set({ text: "", recalledAt: new Date() })
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.conversationId, conversation.id),
        isNull(messages.recalledAt),
        ...extra,
      ),
    )
    .returning();
  if (!updated) return null;
  const latest = await latestMessage(conversation.id);
  if (latest?.id === updated.id) {
    await db.update(conversations).set({ lastMessagePreview: "" }).where(eq(conversations.id, conversation.id));
  }
  return updated;
}

function previewOf(text: string): string {
  // One line of plain words: drop the markdown marks the bubbles render.
  const t = text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 180 ? `${t.slice(0, 177)}…` : t;
}

export async function addMessage(opts: {
  conversation: Conversation;
  author: "visitor" | "agent" | "bot";
  text: string;
}): Promise<Message> {
  const text = opts.text.trim().slice(0, 4000);
  const [msg] = await db
    .insert(messages)
    .values({ conversationId: opts.conversation.id, author: opts.author, text })
    .returning();

  const unreadBump = opts.author === "visitor" ? opts.conversation.unread + 1 : opts.conversation.unread;
  await db
    .update(conversations)
    .set({
      lastMessageAt: msg.createdAt,
      lastMessagePreview: previewOf(text),
      unread: unreadBump,
      humanTakenOver: opts.author === "agent" ? true : opts.conversation.humanTakenOver,
    })
    .where(eq(conversations.id, opts.conversation.id));

  return msg;
}

export async function markRead(conversationId: string): Promise<void> {
  await db
    .update(conversations)
    .set({ unread: 0, lastReadAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

// ── Serializers ─────────────────────────────────────────────────────────

export function serializeMessage(m: Message) {
  return {
    id: m.id,
    author: m.author,
    text: m.text,
    createdAt: m.createdAt.toISOString(),
    recalledAt: m.recalledAt?.toISOString() ?? null,
  };
}

export function serializeConversation(c: Conversation) {
  return {
    id: c.id,
    visitorName: c.visitorName,
    visitorEmail: c.visitorEmail,
    visitorAvatar: c.visitorAvatar,
    pageUrl: c.pageUrl,
    lastMessageAt: c.lastMessageAt.toISOString(),
    lastMessagePreview: c.lastMessagePreview,
    unread: c.unread,
    lastReadAt: c.lastReadAt?.toISOString() ?? null,
    humanTakenOver: c.humanTakenOver,
    createdAt: c.createdAt.toISOString(),
  };
}

export function publicSiteConfig(site: Site) {
  const online = isAgentOnline(site);
  // While the owner is away and the bot is switched on, the bot is who the
  // visitor is talking to, so the header names it and shows it as online.
  const botActive = !online && site.aiEnabled;
  return {
    publicId: site.publicId,
    name: site.name,
    color: site.color || "#1972F5",
    agentName: site.agentName || "Support",
    botName: botDisplayName(site),
    // "" means: load /bot-avatar.png from the widget's own script origin.
    botAvatar: site.botAvatar?.trim() || "",
    welcomeMessage: site.welcomeMessage || "Hi — how can we help?",
    online,
    botActive,
    locale: site.locale || "auto",
    enabled: site.enabled,
  };
}
