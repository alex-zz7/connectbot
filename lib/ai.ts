import {
  addMessage,
  botDisplayName,
  getConversation,
  getSite,
  isAgentOnline,
  latestMessage,
  listMessages,
  PRESENCE_WINDOW_MS,
  type Conversation,
  type Message,
  type Site,
} from "@/lib/db";

/**
 * Optional AI auto-reply through any OpenAI-compatible API.
 *
 * Enabled only when OPENAI_API_KEY is set AND the console's "AI replies"
 * switch is on. Humans first: the bot stays quiet while the owner is online
 * (console tab visible within the last minute and not switched to away) and
 * never speaks again in a conversation the owner has replied in.
 */

const API_KEY = process.env.OPENAI_API_KEY || "";
const BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export function aiConfigured(): boolean {
  return API_KEY.length > 0;
}

export async function maybeAutoReply(
  site: Site,
  conversation: Conversation,
  visitorText: string,
): Promise<"replied" | "skipped" | "online"> {
  if (!aiConfigured() || !site.aiEnabled || conversation.humanTakenOver) return "skipped";
  if (isAgentOnline(site)) return "online";
  await reply(site, conversation, visitorText);
  return "replied";
}

/**
 * The owner was online when the message arrived, so the bot stood aside. If
 * the presence window passes and nobody has answered — the owner went quiet
 * or flipped to away — the bot picks the message up after all. Skips itself
 * if anything newer landed in the thread. In-process timer: fine for a
 * long-lived Node host; on serverless the visitor's next message retries.
 */
export function autoReplyIfStillUnanswered(site: Site, conversation: Conversation, message: Message) {
  const timer = setTimeout(async () => {
    try {
      const [freshSite, freshConversation, last] = await Promise.all([
        getSite(),
        getConversation(site.id, conversation.id),
        latestMessage(conversation.id),
      ]);
      if (!freshSite || !freshConversation || !last) return;
      if (last.id !== message.id || last.recalledAt) return;
      await maybeAutoReply(freshSite, freshConversation, message.text);
    } catch (err) {
      console.error("[connectbot] delayed AI reply failed", err instanceof Error ? err.message : err);
    }
  }, PRESENCE_WINDOW_MS + 5_000);
  timer.unref?.();
}

async function reply(site: Site, conversation: Conversation, visitorText: string): Promise<void> {
  const history = await listMessages(conversation.id);
  const recent = history
    .filter((m) => !m.recalledAt)
    .slice(-12)
    .map((m) => ({
      role: (m.author === "visitor" ? "user" : "assistant") as "user" | "assistant",
      content: m.text,
    }));

  const knowledge = site.aiKnowledge?.trim() || "";
  const ownerRules = site.aiPrompt?.trim() || "";
  // Order matters to the model: the owner's rules sit in their own labelled
  // block right after the identity line and are declared to win over the
  // generic defaults. Sandwiched unlabelled between defaults and a long
  // knowledge dump, they get read as background and ignored.
  const system = [
    `You are ${botDisplayName(site)}, the AI assistant on the live chat of ${site.name}. The human owner is ${site.agentName || "Support"}.`,
    ownerRules
      ? `--- Owner's instructions (these override every default rule below) ---\n${ownerRules}\n--- End of owner's instructions ---`
      : "",
    "Defaults: reply in the visitor's language. Keep answers short (1–4 sentences) unless the owner's instructions or the reference material call for more.",
    "You are writing into a small chat bubble: put each step on its own line as a numbered list, use **bold** sparingly, write URLs plainly. No tables, no code blocks.",
    knowledge
      ? [
          "The reference material below is the owner's approved wording. When a section of it answers the visitor's question, reproduce that section in full and in order — every step, every option, the closing line. Do not summarise, shorten, merge steps or drop the second half; length is not a problem for these answers.",
          "Language: when the reference material offers the same section in more than one language, use the one matching the visitor's language and only that one. Never answer a Chinese question in English.",
          "Only narrow the answer when the visitor clearly asks about one specific part (e.g. only installing, only pricing). A general question such as “how do I use it” or “how does it work” gets the complete walkthrough.",
        ].join("\n")
      : "",
    "If the answer is not in the reference material and you don't know, say a human will follow up — do not invent facts, prices, or account details.",
    knowledge ? `--- Reference material (tutorials, FAQ) ---\n${knowledge}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: system }, ...recent, { role: "user", content: visitorText }],
        temperature: 0.4,
        // A full walkthrough from the knowledge base needs far more room than
        // a chat sentence.
        max_tokens: knowledge ? 1600 : 400,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`AI API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return;
    await addMessage({ conversation, author: "bot", text });
  } catch (err) {
    console.error("[connectbot] AI reply failed", err instanceof Error ? err.message : err);
  }
}
