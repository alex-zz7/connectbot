# Contributing to ConnectBot

Thanks for helping out! ConnectBot is intentionally small — one widget, one
console, one Postgres — and we'd like to keep it that way. Small, focused
contributions are the easiest to review and merge.

## Local development

```bash
git clone https://github.com/alex-zz7/connectbot.git
cd connectbot
npm install
cp .env.example .env.local
npm run dev
```

In `.env.local` you only need two variables (see `.env.example` for the full
annotated list):

- `DATABASE_URL` — any Postgres connection string (a free
  [Neon](https://neon.tech) database works, so does local Postgres).
  **Tables auto-create on first run** — there is no migration step.
- `ADMIN_PASSWORD` — protects the console at `/console`.

Then open <http://localhost:3000> — the homepage embeds the widget itself, so
you can send a test message and read it at <http://localhost:3000/console>.

Optional: set `OPENAI_API_KEY` (and `OPENAI_BASE_URL` for any
OpenAI-compatible endpoint) to test the AI auto-reply.

## Project layout

| Path | What it is |
| --- | --- |
| `public/relay.js` | The embeddable widget. Plain ES5, zero dependencies, renders in a shadow root. Served as a static file — no build step. |
| `app/api/livechat/widget/*` | Public widget API: session bootstrap, message post/long-poll, public config. |
| `app/api/livechat/inbox` & `app/api/livechat/settings` | Admin API behind the console session cookie. |
| `app/api/admin/login` | Password login / logout for the console. |
| `app/console/page.tsx` + `components/console.tsx` | The admin console UI (inbox, thread view, settings drawer). |
| `lib/db.ts` | Drizzle schema, runtime `CREATE TABLE IF NOT EXISTS` DDL, and all queries. |
| `lib/ai.ts` | Optional AI auto-reply via any OpenAI-compatible API. |
| `lib/auth.ts`, `lib/cors.ts`, `lib/wait.ts` | Admin cookie auth, widget CORS headers, long-poll helper. |

## Code style

- **TypeScript strict mode** — the repo compiles with `strict: true`;
  `npm run typecheck` (`npx tsc --noEmit`) must pass with no errors.
- **`public/relay.js` stays dependency-free ES5** — it runs on arbitrary
  third-party pages, so no modern syntax that needs transpiling and no
  imports.
- **No new dependencies without discussion.** Open an issue first if you
  think a package is warranted; the current dependency list is deliberately
  short.
- Match the style of the surrounding code; comments explain *why*, not what.

## Submitting changes

1. **Fork** the repo and create a branch from `main`.
2. Make your change. Keep PRs focused — one fix or feature per PR.
3. Run `npx tsc --noEmit` and make sure it passes.
4. Open a **pull request against `main`** describing what changed and why.

For anything non-trivial (new feature, behavior change), please open an issue
first so we can agree on the approach before you spend time on it. Good first
issues are labeled
[`good first issue`](https://github.com/alex-zz7/connectbot/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).
