import { addMessage, listMessages, type Conversation, type Site } from "@/lib/db";

/**
 * Optional AI auto-reply through any OpenAI-compatible API.
 *
 * Enabled only when OPENAI_API_KEY is set AND the console's "AI replies"
 * switch is on. The bot stops as soon as a human agent replies in a
 * conversation (humanTakenOver).
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
): Promise<void> {
  if (!aiConfigured() || !site.aiEnabled || conversation.humanTakenOver) return;

  const history = await listMessages(conversation.id);
  const recent = history.slice(-12).map((m) => ({
    role: (m.author === "visitor" ? "user" : "assistant") as "user" | "assistant",
    content: m.text,
  }));

  const system = [
    `You are ${site.agentName || "Support"}, the live-chat agent for ${site.name}.`,
    "Reply in the visitor's language. Keep answers short (1–4 sentences).",
    "If you don't know, say a human will follow up — do not invent facts, prices, or account details.",
    site.aiPrompt?.trim() || "",
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
        messages: [
          { role: "system", content: system },
          ...recent,
          { role: "user", content: visitorText },
        ],
        temperature: 0.4,
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`AI API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) return;
    await addMessage({ conversation, author: "bot", text: reply });
  } catch (err) {
    console.error("[connectbot] AI reply failed", err instanceof Error ? err.message : err);
  }
}
