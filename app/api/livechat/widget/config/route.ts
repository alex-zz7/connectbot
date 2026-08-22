import { corsJson, corsOptions } from "@/lib/cors";
import { getSite, publicSiteConfig } from "@/lib/db";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsOptions();
}

/** Public widget config. Single-tenant: always answers for this deployment's site. */
export async function GET() {
  const site = await getSite();
  return corsJson(publicSiteConfig(site));
}
