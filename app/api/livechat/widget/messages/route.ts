import { autoReplyIfStillUnanswered, maybeAutoReply } from "@/lib/ai";
import { corsJson, corsOptions } from "@/lib/cors";
import {
  addMessage,
  getOrCreateWidgetConversation,
  getSite,
  getWidgetConversation,
  listMessages,
  publicSiteConfig,
  recallVisitorMessage,
  serializeMessage,
} from "@/lib/db";
import { waitUntil } from "@/lib/wait";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export function OPTIONS() {
  return corsOptions();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const site = await getSite();

  const token = url.searchParams.get("token") || "";
  const conversation = await getWidgetConversation(site.id, token);
  if (!conversation) return corsJson({ error: "Unknown session" }, { status: 404 });

  const afterRaw = url.searchParams.get("after");
  const after = afterRaw ? new Date(afterRaw) : undefined;
  if (after && Number.isNaN(after.getTime())) {
    return corsJson({ error: "Invalid after" }, { status: 400 });
  }

  const wait = url.searchParams.get("wait") === "1";
  if (wait) {
    await waitUntil(
      async () => {
        const fresh = await listMessages(conversation.id, after);
        return fresh.length > 0 ? fresh : null;
      },
      { signal: req.signal },
    );
  }

  const msgs = await listMessages(conversation.id, after);
  return corsJson({
    messages: msgs.map(serializeMessage),
    lastReadAt: conversation.lastReadAt?.toISOString() ?? null,
    config: publicSiteConfig(site),
  });
}

export async function POST(req: Request) {
  let body: {
    token?: string;
    text?: string;
    name?: string;
    email?: string;
    avatar?: string;
    pageUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  if (!text) return corsJson({ error: "Empty message" }, { status: 400 });

  const site = await getSite();

  let conversation = await getWidgetConversation(site.id, body.token || "");
  if (!conversation) return corsJson({ error: "Unknown session" }, { status: 404 });

  // Identity rides along on every message, so a conversation that started
  // anonymously still picks up the visitor's name/email/avatar here.
  const name = typeof body.name === "string" && body.name ? body.name.slice(0, 120) : undefined;
  const email = typeof body.email === "string" && body.email ? body.email.slice(0, 255) : undefined;
  const avatar =
    typeof body.avatar === "string" && /^https?:\/\//.test(body.avatar)
      ? body.avatar.slice(0, 500)
      : undefined;
  if (name || email || avatar) {
    conversation = await getOrCreateWidgetConversation(site.id, body.token!, {
      name,
      email,
      avatar,
      pageUrl: typeof body.pageUrl === "string" ? body.pageUrl.slice(0, 1000) : undefined,
    });
  }

  const msg = await addMessage({ conversation, author: "visitor", text });
  maybeAutoReply(site, conversation, text)
    .then((outcome) => {
      if (outcome === "online") autoReplyIfStillUnanswered(site, conversation, msg);
    })
    .catch(() => {});

  return corsJson({
    message: serializeMessage(msg),
    config: publicSiteConfig(site),
  });
}

/** Visitor takes one of their own messages back (long-press → Unsend in the widget). */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const site = await getSite();
  const conversation = await getWidgetConversation(site.id, url.searchParams.get("token") || "");
  if (!conversation) return corsJson({ error: "Unknown session" }, { status: 404 });

  const id = url.searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return corsJson({ error: "Invalid id" }, { status: 400 });

  const recalled = await recallVisitorMessage(conversation, id);
  if (!recalled) return corsJson({ error: "Cannot recall", code: "RECALL_DENIED" }, { status: 410 });
  return corsJson({ message: serializeMessage(recalled) });
}
