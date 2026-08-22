# ConnectBot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

Open-source, self-hosted live chat for your website.

One embeddable widget (a Crisp-style bubble), one admin console, optional AI
auto-reply. Runs on Next.js + any Postgres. No migrations, no multi-tenant
account system — you deploy it, it's yours.

**Try it live:** [sent2x.com/connectbot](https://sent2x.com/connectbot) — and
[sent2x.com](https://sent2x.com) runs its real support chat on ConnectBot.

## Features

- **Widget** — `public/relay.js`, a dependency-free script in a shadow root.
  Doesn't leak CSS, full-screen on phones, long-polls for replies, English/中文
  chrome that follows the embedding page's `<html lang>`.
- **Console** — `/console`, a ChatGPT-style inbox: conversation list with
  unread badges, live thread view, reply, delete, widget settings (name,
  color, welcome message, language, on/off switch).
- **AI auto-reply (optional)** — answers visitors until a human replies in the
  thread. Works with any OpenAI-compatible API.
- **Identity passthrough** — host pages with their own login can hand the
  visitor's name/email/avatar to the widget.
- **Zero-migration Postgres** — tables are created idempotently at runtime.
  Point `DATABASE_URL` at an empty database and it provisions itself.

## 1-minute deploy (Vercel + Neon)

1. Fork/clone this repo, import it into [Vercel](https://vercel.com).
2. Create a free Postgres database on [Neon](https://neon.tech) (or Supabase,
   or anything that gives you a connection string).
3. Set the environment variables:

| Variable | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Postgres connection string. Tables auto-create on first use. |
| `ADMIN_PASSWORD` | ✅ | Password for the console at `/console`. |
| `OPENAI_API_KEY` | — | Set it to enable AI auto-reply; unset = AI off. |
| `OPENAI_BASE_URL` | — | Any OpenAI-compatible endpoint. Default `https://api.openai.com/v1`. |
| `OPENAI_MODEL` | — | Default `gpt-4o-mini`. |
| `SITE_ID` | — | Public site id in the snippet. Default `default`. |
| `SITE_NAME` | — | Initial site name shown in the widget header. |

4. Deploy. Open `https://your-domain/` — the homepage runs the widget itself,
   so you can send a test message immediately and read it at
   `https://your-domain/console`.

Local development:

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL + ADMIN_PASSWORD
npm run dev
```

## Embed on your site

Paste one line before `</body>` on any page (plain HTML, WordPress, Shopify,
React/Next, Vue — anything that serves a page):

```html
<script src="https://your-domain.com/relay.js" data-site="default" async></script>
```

`data-site` is optional on a single-tenant deployment — the server always
answers for its own site.

## Identity passthrough

If your site has its own accounts, hand the logged-in user to the widget so
the console shows a real name and avatar instead of “Visitor 3F2A”. All three
forms work, in any order relative to the script loading:

```html
<!-- 1. Set it whenever you have it (read fresh on every message): -->
<script>
  window.$relayUser = { name: "Ada Lovelace", email: "ada@example.com", avatar: "https://…/ada.png" };
</script>

<!-- 2. Or call the API after the script loaded (e.g. after login): -->
<script>
  window.$relay.identify({ name: "Ada Lovelace", email: "ada@example.com" });
</script>

<!-- 3. Or queue the call before the script loads (pre-boot queue): -->
<script>
  window.$relay = window.$relay || [];
  window.$relay.push(["identify", { name: "Ada Lovelace" }]);
</script>
```

`$relay` also exposes `open()` and `close()` for wiring the widget to your own
“Contact us” buttons.

## Console

- `/console`, protected by `ADMIN_PASSWORD` (30-day cookie session).
- Conversations appear in real time (long-polling, no websockets to operate).
- Replying as a human marks the thread “taken over” — the AI stays out of it
  from then on.
- **Settings & snippet** (bottom of the sidebar): copy the embed snippet, set
  the agent name / color / welcome message / widget language, pause the widget,
  and toggle AI replies with an optional extra prompt.

## Stack

Next.js (App Router) · Drizzle ORM · Postgres (`postgres` driver) ·
Tailwind CSS v4. The widget itself is plain ES5 with zero dependencies.

## Contributing

Contributions are welcome — the codebase is small and easy to get into.
See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup (two env vars, no
migrations), the project layout, and the PR flow. Good starting points are
labeled [`good first issue`](https://github.com/alex-zz7/connectbot/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

---

## 中文说明

ConnectBot 是一个开源、可自托管的网站在线客服：一个嵌入式聊天挂件 +
一个管理后台，可选 AI 自动回复。Next.js + 任意 Postgres 即可运行，
表结构启动时自动创建，无需迁移。

**快速部署：** Fork 本仓库 → 导入 Vercel → 在 [Neon](https://neon.tech)
建一个免费 Postgres → 配好 `DATABASE_URL` 和 `ADMIN_PASSWORD` → 部署完成。
打开首页即可看到挂件本体，管理后台在 `/console`。

**接入网站：** 在 `</body>` 之前贴一行：

```html
<script src="https://your-domain.com/relay.js" data-site="default" async></script>
```

**传递登录用户：** 网站有自己的账号体系时，用
`window.$relay.identify({ name, email, avatar })` 或提前设置
`window.$relayUser`，后台就能看到访客的真实姓名和头像。

**AI 自动回复：** 配置 `OPENAI_API_KEY`（可用 `OPENAI_BASE_URL` 指向任意
OpenAI 兼容接口，如 DeepSeek）即启用；人工在会话里回复后 AI 自动退出该会话。

## License

[MIT](./LICENSE)
