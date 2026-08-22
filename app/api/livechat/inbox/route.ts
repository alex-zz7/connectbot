import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import {
  addMessage,
  deleteConversation,
  getConversation,
  getSite,
  listConversations,
  listMessages,
  markRead,
  serializeConversation,
  serializeMessage,
  touchAgentSeen,
  type Site,
} from "@/lib/db";
import { waitUntil } from "@/lib/wait";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

async function requireSite(): Promise<Site | NextResponse> {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const site = await getSite();
  await touchAgentSeen(site.id);
  return site;
}

export async function GET(req: Request) {
  const site = await requireSite();
  if (site instanceof NextResponse) return site;

  const url = new URL(req.url);
  const conversationId = url.searchParams.get("id");
  const wait = url.searchParams.get("wait") === "1";
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : undefined;
  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "Invalid since" }, { status: 400 });
  }

  if (conversationId) {
    const conversation = await getConversation(site.id, conversationId);
    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (wait) {
      await waitUntil(
        async () => {
          const fresh = await listMessages(conversation.id, since);
          return fresh.length > 0 ? fresh : null;
        },
        { signal: req.signal },
      );
    }
    await markRead(conversation.id);
    const msgs = await listMessages(conversation.id);
    const updated = await getConversation(site.id, conversation.id);
    return NextResponse.json({
      conversation: serializeConversation(updated ?? conversation),
      messages: msgs.map(serializeMessage),
    });
  }

  if (wait && since) {
    await waitUntil(
      async () => {
        const list = await listConversations(site.id);
        return list.some((c) => c.lastMessageAt > since) ? list : null;
      },
      { signal: req.signal },
    );
  }

  const list = await listConversations(site.id);
  return NextResponse.json({ conversations: list.map(serializeConversation) });
}

export async function POST(req: Request) {
  const site = await requireSite();
  if (site instanceof NextResponse) return site;

  let body: { conversationId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  if (!text || !body.conversationId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const conversation = await getConversation(site.id, body.conversationId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await addMessage({ conversation, author: "agent", text });
  const msgs = await listMessages(conversation.id);
  const updated = await getConversation(site.id, conversation.id);
  return NextResponse.json({
    conversation: serializeConversation(updated ?? conversation),
    messages: msgs.map(serializeMessage),
  });
}

export async function DELETE(req: Request) {
  const site = await requireSite();
  if (site instanceof NextResponse) return site;

  const conversationId = new URL(req.url).searchParams.get("id");
  if (!conversationId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const deleted = await deleteConversation(site.id, conversationId);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const list = await listConversations(site.id);
  return NextResponse.json({ conversations: list.map(serializeConversation) });
}
