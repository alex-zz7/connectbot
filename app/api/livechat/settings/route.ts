import { NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai";
import { isAdmin } from "@/lib/auth";
import { getSite, updateSite, type Site, type SitePatch } from "@/lib/db";

export const dynamic = "force-dynamic";

function snippet(req: Request, publicId: string): string {
  const origin = new URL(req.url).origin;
  return `<script src="${origin}/relay.js" data-site="${publicId}" async></script>`;
}

function sitePayload(req: Request, site: Site) {
  return {
    publicId: site.publicId,
    name: site.name,
    color: site.color,
    agentName: site.agentName,
    welcomeMessage: site.welcomeMessage,
    aiEnabled: site.aiEnabled,
    aiPrompt: site.aiPrompt,
    aiConfigured: aiConfigured(),
    locale: site.locale || "auto",
    enabled: site.enabled,
    snippet: snippet(req, site.publicId),
  };
}

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const site = await getSite();
  return NextResponse.json({ site: sitePayload(req, site) });
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name?: string;
    color?: string;
    agentName?: string;
    welcomeMessage?: string;
    aiEnabled?: boolean;
    aiPrompt?: string;
    locale?: string;
    enabled?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const color = body.color?.trim();
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return NextResponse.json({ error: "Color must be #RRGGBB" }, { status: 400 });
  }
  if (body.locale != null && !["auto", "en", "zh"].includes(body.locale)) {
    return NextResponse.json({ error: "Unsupported locale" }, { status: 400 });
  }

  const clean: SitePatch = {};
  if (typeof body.name === "string") clean.name = body.name.trim().slice(0, 120);
  if (color) clean.color = color;
  if (typeof body.agentName === "string") clean.agentName = body.agentName.trim().slice(0, 80);
  if (typeof body.welcomeMessage === "string") clean.welcomeMessage = body.welcomeMessage.slice(0, 500);
  if (typeof body.aiEnabled === "boolean") clean.aiEnabled = body.aiEnabled;
  if (typeof body.aiPrompt === "string") clean.aiPrompt = body.aiPrompt.slice(0, 4000);
  if (typeof body.locale === "string") clean.locale = body.locale;
  if (typeof body.enabled === "boolean") clean.enabled = body.enabled;
  const updated = await updateSite(clean);

  return NextResponse.json({ site: sitePayload(req, updated) });
}
