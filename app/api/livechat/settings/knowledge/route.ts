import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { KNOWLEDGE_MAX, updateSite } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The bot's reference material lives in the repo as public/bot-knowledge.md
 * (edited like any other file, deployed with the build) and is copied into
 * the site's ai_knowledge on demand from the console.
 */
export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let text: string;
  try {
    text = (await readFile(path.join(process.cwd(), "public", "bot-knowledge.md"), "utf8")).trim();
  } catch {
    return NextResponse.json(
      { error: "public/bot-knowledge.md not found in this deployment" },
      { status: 404 },
    );
  }
  const aiKnowledge = text.slice(0, KNOWLEDGE_MAX);
  await updateSite({ aiKnowledge });
  return NextResponse.json({ aiKnowledge, truncated: text.length > KNOWLEDGE_MAX, length: aiKnowledge.length });
}
