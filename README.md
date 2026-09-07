# ConnectBot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

Open-source, self-hosted live chat for your website.

One embeddable widget (a Crisp-style bubble), one admin console, optional AI
auto-reply. Runs on Next.js + any Postgres. No migrations, no multi-tenant
account system — you deploy it, it's yours.

**Try it live:** [sent2x.com/connectbot](https://sent2x.com/connectbot) — the
bubble in the corner of that page *is* ConnectBot, answering from a knowledge
base when nobody is at the desk.

Built and maintained by the team behind [Sent2X](https://sent2x.com), an AI
growth tool for X (Twitter). ConnectBot is what runs Sent2X's own support
chat; we open-sourced it so you can run yours the same way.

## Features

- **Widget** — `public/relay.js`, a dependency-free script in a shadow root.
  Doesn't leak CSS, full-screen on phones, long-polls for replies, English/中文
  chrome that follows the embedding page's `<html lang>`. Renders the light
  markdown the bot writes (numbered steps, bold, links). Visitors can **unsend**
  a message within two minutes by holding their bubble.
- **Console** — `/console`, a ChatGPT-style inbox: conversation list with
  unread badges, live thread view, multi-line replies (Enter sends,
  Shift+Enter breaks the line), unsend your own or the bot's messages, delete
  threads, widget settings (name, color, welcome message, language, on/off).
- **AI auto-reply (optional)** — humans first: the bot answers only while you
  are away (no visible console tab for a minute, or you tapped your name to go
  away) and steps out of any thread you have replied in. Visitors see the
  bot's own name and avatar while it is the one answering. Works with any
  OpenAI-compatible API.
- **Knowledge base** — `public/bot-knowledge.md` holds your tutorials and FAQ;
  one click in the console syncs it into the bot, which then reproduces the
  matching section in full instead of improvising.
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
- **Presence** (your name at the bottom of the sidebar): tap to switch between
  *Online · you reply* and *Away · bot replies*. You also count as away after a
  minute without a visible console tab; polling from a background tab does
  not keep you online. A message that arrived while you were online is picked
  up by the bot a minute later if nobody answered and you are away by then.
- **Settings & snippet** (gear icon): copy the embed snippet, set the agent
  name / color / welcome message / widget language, pause the widget, toggle
  AI replies, name the bot and upload its avatar (cropped to 128px in the
  browser), paste the knowledge base or **Sync from repo**, and add extra
  instructions the bot must follow.

### Knowledge base

The bot's reference material lives in the repo at `public/bot-knowledge.md`
so it is versioned and deployed with your code. Edit it, deploy, then open
the console → Settings → **Sync from repo**. The prompt tells the model to
reproduce the matching section in full and in the visitor's language, and to
say a human will follow up for anything the file does not cover. Keep
sections short and factual; a Chinese copy of a section makes Chinese answers
faithful rather than summarised.

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
OpenAI 兼容接口，如 DeepSeek）即启用。人工优先：你在后台（页面可见、1 分钟内有
活动）时机器人不出声；点左下角自己的名字可手动切到「离线 · 机器人回复」；你回过话
的会话之后全由你接管。机器人回答时访客看到的是机器人自己的名字和头像。

**知识库：** 把教程和常见问题写进 `public/bot-knowledge.md`，部署后在后台
「Settings」里点 **Sync from repo** 同步进机器人；机器人会按访客语言完整复述匹配
的章节，不编造文件里没有的内容。后台还可以给机器人改名、上传头像、追加额外指令。

**撤回：** 访客按住自己的气泡可在 2 分钟内撤回；后台悬停（手机长按）自己或机器人
的消息可撤回，两端都显示「已撤回一条消息」。后台输入框 Enter 发送、Shift+Enter 换行，
编号步骤等格式会原样到达访客气泡。

## Who makes this

ConnectBot is maintained by [Sent2X](https://sent2x.com) — find the posts on X
worth replying to, draft replies in your own voice, and schedule your own
posts. If you grow an audience on X, that is the product we actually sell; the
free plan needs no card, and the [Chrome extension](https://sent2x.com/install)
puts the AI pen inside X's own reply box.

Every conversation in this repo's own support bubble goes through the code you
are reading, so bugs you hit are bugs we hit. Issues and PRs are welcome.

**关于我们：** ConnectBot 由 [Sent2X](https://sent2x.com) 团队维护。Sent2X 是一个
X（Twitter）AI 增长工具：找到值得回复的帖子、用你自己的语气起草回复、排程发帖。
如果你也在 X 上做增长，可以试试——免费版无需绑卡，
[Chrome 扩展](https://sent2x.com/install)会把 AI 蓝笔放进 X 自己的回复框里。

## License

[MIT](./LICENSE) — use it, fork it, sell it. Keeping the small "We run on
ConnectBot" line in the widget is appreciated but not required.
