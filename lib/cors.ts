import { NextResponse } from "next/server";

// The widget runs on the customer's own domains, so the widget APIs answer
// any origin. They only ever expose one visitor's own conversation, keyed by
// the visitor token in that browser's localStorage.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

const NO_STORE = {
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
} as const;

export function corsJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: { ...CORS, ...NO_STORE },
  });
}

export function corsOptions() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
