import { corsJson, corsOptions } from "@/lib/cors";
import {
  getOrCreateWidgetConversation,
  getSite,
  listMessages,
  newVisitorToken,
  publicSiteConfig,
  serializeMessage,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsOptions();
}

export async function POST(req: Request) {
  let body: {
    token?: string;
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

  const site = await getSite();

  // Only accept plain http(s) image URLs from the host page.
  const avatar =
    typeof body.avatar === "string" && /^https?:\/\//.test(body.avatar)
      ? body.avatar.slice(0, 500)
      : undefined;

  const token = (body.token || "").startsWith("v_") ? body.token! : newVisitorToken();
  const conversation = await getOrCreateWidgetConversation(site.id, token, {
    name: typeof body.name === "string" ? body.name.slice(0, 120) : undefined,
    email: typeof body.email === "string" ? body.email.slice(0, 255) : undefined,
    avatar,
    pageUrl: typeof body.pageUrl === "string" ? body.pageUrl.slice(0, 1000) : undefined,
  });
  const msgs = await listMessages(conversation.id);

  return corsJson({
    token,
    conversationId: conversation.id,
    lastReadAt: conversation.lastReadAt?.toISOString() ?? null,
    config: publicSiteConfig(site),
    messages: msgs.map(serializeMessage),
  });
}
