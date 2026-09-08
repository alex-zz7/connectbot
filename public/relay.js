/* ConnectBot — self-hosted live-chat widget. Load with:
 *   <script src="https://your-domain.com/relay.js" data-site="default" async></script>
 *
 * (`data-site` is optional on a single-tenant deployment; the server always
 * answers for its own site. You can also set window.RELAY_SITE_ID.)
 *
 * Passing the logged-in user works in any order:
 *   - set window.$relayUser = { name, email, avatar } at any time (it is read
 *     fresh on every session and message post), or
 *   - call window.$relay.identify({ name, email, avatar }) after the script
 *     loaded, or
 *   - before the script loads, queue it:
 *       window.$relay = window.$relay || [];
 *       window.$relay.push(["identify", { name, email, avatar }]);
 *
 * Set window.RELAY_PREVIEW = true to render even when the owner has the bot
 * switched off — useful while configuring.
 */
(function () {
  if (window.__RELAY_BOOTED) return;
  window.__RELAY_BOOTED = true;

  var script = document.currentScript;
  var BASE = (function () {
    try {
      if (script && script.src) return new URL(script.src).origin;
    } catch (e) {}
    return location.origin;
  })();
  // Where the "We run on ConnectBot" footer link goes. The project page
  // explains the widget and links to the repo; ?from tells us it came from a
  // self-hosted widget rather than our own site.
  var BRAND_URL = "https://sent2x.com/connectbot?from=widget-oss";

  // Language follows the site's own setting ("auto" | "en" | "zh"), which the
  // owner picks in the console. Only "auto" falls back to the visitor's
  // browser, so widget chrome can no longer disagree with the owner's copy.
  var isZh = /zh/i.test(navigator.language || "");
  var T;

  function strings(zh) {
    return {
      chat: zh ? "聊天" : "Chat",
      placeholder: zh ? "输入你的信息..." : "Enter your message...",
      seen: zh ? "已读" : "Seen",
      from: zh ? "来自" : "from",
      online: zh ? "在线" : "Online",
      botOnline: zh ? "AI 助手 · 在线" : "AI assistant · Online",
      offline: zh ? "离线" : "Away",
      attach: zh ? "附件即将推出" : "Attachments coming soon",
      empty: zh ? "发一条消息开始对话" : "Send a message to start",
      welcome: zh ? "你好，有什么可以帮你？" : "Hi — how can we help?",
      minimize: zh ? "收起" : "Minimize",
      emoji: zh ? "表情" : "Emoji",
      jump: zh ? "回到最新" : "Jump to latest",
      recall: zh ? "撤回" : "Unsend",
      recalledMine: zh ? "你撤回了一条消息" : "You unsent a message",
      recalledTheirs: zh ? "对方撤回了一条消息" : "A message was unsent",
      recallExpired: zh ? "超过 2 分钟的消息不能撤回" : "Messages older than 2 minutes can't be unsent",
      brand: zh ? "由 <b>ConnectBot</b> 提供" : "We run on <b>ConnectBot</b>",
    };
  }

  // "auto" follows the page the widget is embedded in rather than the
  // visitor's browser: the host declares its language in <html lang>, which is
  // also what a site's own language switcher updates. Matching the page keeps
  // the bubble in the same language as the content around it. The browser
  // locale is only the fallback for pages that declare nothing.
  function resolveZh(locale) {
    if (locale === "zh") return true;
    if (locale === "en") return false;
    var pageLang = (document.documentElement.getAttribute("lang") || "").trim();
    if (pageLang) return /^zh/i.test(pageLang);
    return /zh/i.test(navigator.language || "");
  }

  T = strings(isZh);

  var EMOJIS = "😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤗 🤔 😎 👍 👎 👏 🙌 🔥 ❤️ 💙 ✨ 🎉 🙏 ✅".split(" ");

  function siteIdFromPage() {
    if (typeof window.RELAY_SITE_ID === "string" && window.RELAY_SITE_ID) return window.RELAY_SITE_ID;
    if (script && script.getAttribute("data-site")) return script.getAttribute("data-site");
    var cfg = window.$relay;
    if (cfg && !Array.isArray(cfg) && cfg.siteId) return cfg.siteId;
    return "";
  }

  function storageKey(site) {
    return "relay_tok_" + site;
  }

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return "25, 114, 245";
    return parseInt(m[1], 16) + ", " + parseInt(m[2], 16) + ", " + parseInt(m[3], 16);
  }

  function relativeTime(iso) {
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return isZh ? "刚刚" : "just now";
    if (mins < 60) return isZh ? mins + " 分钟前" : mins + "m ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return isZh ? hrs + " 小时前" : hrs + "h ago";
    var days = Math.floor(hrs / 24);
    return isZh ? days + " 天前" : days + "d ago";
  }

  function initials(name) {
    var parts = (name || "S").trim().split(/\s+/);
    var a = (parts[0] || "S").charAt(0);
    var b = parts.length > 1 ? parts[1].charAt(0) : "";
    return (a + b).toUpperCase();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Inline marks on an already-escaped line: [label](url), bare URLs,
  // **bold**, `code`. Bare-URL matching skips anything preceded by a quote
  // or ">" so it never re-links the href it just produced.
  function inlineMarks(s) {
    return s
      .replace(
        /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(
        /(^|[^"'>])(https?:\/\/[^\s<]+)/g,
        '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>'
      )
      .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>");
  }

  // The bot writes light markdown (numbered steps, headings, bold). Render it
  // line by line as blocks so a tutorial reads as a list instead of raw
  // asterisks and hashes. Everything is escaped first; only tags we emit here
  // reach the DOM.
  function formatMessage(text) {
    var lines = escapeHtml(text).split("\n");
    var out = [];
    var gap = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m;
      if (!line.trim() || /^\s*([-*_]\s*){3,}$/.test(line)) {
        gap = true;
        continue;
      }
      var cls = "";
      var body;
      if ((m = /^#{1,6}\s+(.*)$/.exec(line))) {
        cls = "h";
        body = inlineMarks(m[1]);
      } else if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) {
        cls = "li";
        body = '<span class="mk">•</span><span>' + inlineMarks(m[1]) + "</span>";
      } else if ((m = /^\s*(\d{1,2})[.)]\s+(.*)$/.exec(line))) {
        cls = "li";
        body = '<span class="mk">' + m[1] + ".</span><span>" + inlineMarks(m[2]) + "</span>";
      } else {
        body = inlineMarks(line);
      }
      if (gap && out.length) cls += " gap";
      gap = false;
      out.push("<p" + (cls.trim() ? ' class="' + cls.trim() + '"' : "") + ">" + body + "</p>");
    }
    return out.join("");
  }

  var css = function (color) {
    var rgb = hexToRgb(color);
    return [
      ":host{all:initial;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}",
      "*{box-sizing:border-box;}",
      ".fab{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;background:" + color + ";color:#fff;box-shadow:0 8px 24px rgba(" + rgb + ",.45);z-index:2147483000;transition:transform .15s ease;}",
      ".fab:hover{transform:scale(1.06);}",
      ".fab svg{width:28px;height:28px;fill:currentColor;}",
      ".badge{position:absolute;top:-2px;right:-2px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#ef4444;color:#fff;font:700 11px/18px system-ui;}",
      // Sized like the mainstream widgets (Crisp/Intercom): 400px wide, capped
      // at 640px tall, always inside the viewport. dvh keeps the composer above
      // mobile browser toolbars; the vh line is the fallback for old engines.
      ".panel{position:fixed;right:20px;bottom:92px;width:min(400px,calc(100vw - 32px));height:min(640px,calc(100vh - 120px));height:min(640px,calc(100dvh - 120px));min-height:380px;background:#fff;border-radius:18px;overflow:hidden;display:flex;flex-direction:column;z-index:2147483000;box-shadow:0 16px 70px rgba(15,23,42,.22);opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;transition:opacity .18s ease,transform .18s ease;overscroll-behavior:contain;}",
      ".panel.open{opacity:1;transform:none;pointer-events:auto;}",
      ".head{background:" + color + ";color:#fff;padding:12px 14px 16px;flex-shrink:0;}",
      ".chip{margin:0 auto 12px;width:fit-content;display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.18);border-radius:999px;padding:5px 12px;font:600 12px/1 system-ui;}",
      ".chip svg{width:14px;height:14px;fill:#fff;}",
      ".agent{display:flex;align-items:center;gap:10px;}",
      ".av{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font:700 14px/1 system-ui;position:relative;flex-shrink:0;}",
      ".dot{position:absolute;right:0;bottom:0;width:10px;height:10px;border-radius:50%;border:2px solid " + color + ";background:#22c55e;}",
      ".dot.off{background:#cbd5e1;}",
      ".av svg{width:22px;height:22px;fill:currentColor;}",
      ".row .av svg{width:15px;height:15px;}",
      ".row .av.bot{background:" + color + ";color:#fff;}",
      ".av.bot,.av.pic{background:#fff;}",
      ".row .av.pic{background:#e2e8f0;}",
      ".av .botimg{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;}",
      ".row .av.bot{background:#fff;}",
      ".who{flex:1;min-width:0;}",
      ".who b{display:block;font:700 15px/1.25 system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".who span{display:block;font:400 12px/1.35 system-ui;opacity:.85;}",
      ".min{width:32px;height:32px;border:0;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;border-radius:9px;display:flex;align-items:center;justify-content:center;}",
      ".min:hover{background:rgba(255,255,255,.24);}",
      ".min svg{width:20px;height:20px;fill:currentColor;}",
      ".mid{position:relative;flex:1;min-height:0;display:flex;background:#f7f8fa;}",
      // overscroll-behavior stops the wheel/touch from chaining to the host
      // page once the thread hits an edge — the "it scrolls the site behind"
      // bug. The scrollbar is styled so the thread reads as scrollable.
      ".msgs{flex:1;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:16px 14px 12px;display:flex;flex-direction:column;gap:10px;}",
      ".msgs::-webkit-scrollbar{width:6px;}",
      ".msgs::-webkit-scrollbar-thumb{background:rgba(15,23,42,.18);border-radius:999px;}",
      ".msgs::-webkit-scrollbar-track{background:transparent;}",
      ".time{align-self:center;background:#e8eaef;color:#64748b;font:500 11px/1 system-ui;padding:5px 9px;border-radius:999px;}",
      ".row{display:flex;gap:8px;align-items:flex-end;max-width:88%;}",
      ".row.me{align-self:flex-end;flex-direction:row-reverse;}",
      ".row .av{width:24px;height:24px;font-size:10px;background:#e2e8f0;color:#334155;}",
      ".bubble{padding:11px 14px;border-radius:16px;font:400 15px/1.5 system-ui;color:#0f172a;background:#e9edf2;word-break:break-word;white-space:pre-wrap;}",
      // Own bubbles are long-pressed to unsend; suppress the text-selection
      // callout iOS would otherwise show for the same gesture.
      ".row.me .bubble{background:" + color + ";color:#fff;border-bottom-right-radius:5px;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}",
      ".row.me.held .bubble{filter:brightness(.85);}",
      ".recalled{align-self:center;color:#94a3b8;font:400 12px/1 system-ui;padding:4px 0;}",
      ".bubble.typing{display:flex;gap:5px;align-items:center;padding:14px 16px;}",
      ".bubble.typing i{width:7px;height:7px;border-radius:50%;background:#94a3b8;animation:relay-dot 1.2s infinite ease-in-out;}",
      ".bubble.typing i:nth-child(2){animation-delay:.2s;}",
      ".bubble.typing i:nth-child(3){animation-delay:.4s;}",
      "@keyframes relay-dot{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-4px);opacity:1}}",
      ".act{position:absolute;z-index:5;transform:translate(-50%,-100%);background:#111827;color:#fff;border-radius:10px;padding:4px;display:flex;gap:2px;box-shadow:0 6px 18px rgba(15,23,42,.25);}",
      ".act:after{content:'';position:absolute;left:50%;bottom:-5px;width:10px;height:10px;background:#111827;transform:translateX(-50%) rotate(45deg);border-radius:2px;}",
      ".act button{border:0;background:transparent;color:inherit;font:500 13px/1 system-ui;padding:7px 12px;border-radius:7px;cursor:pointer;white-space:nowrap;}",
      ".act button:hover{background:rgba(255,255,255,.12);}",
      ".toast{position:absolute;left:50%;bottom:72px;transform:translateX(-50%);background:rgba(17,24,39,.92);color:#fff;font:400 12px/1 system-ui;padding:8px 12px;border-radius:999px;white-space:nowrap;z-index:6;}",
      ".row.them .bubble{border-bottom-left-radius:5px;}",
      ".bubble a{color:inherit;text-decoration:underline;}",
      ".bubble p{margin:0;}",
      ".bubble p.gap{margin-top:8px;}",
      ".bubble p.h{font-weight:700;}",
      ".bubble p.li{display:flex;gap:6px;}",
      ".bubble p.li .mk{flex:none;min-width:14px;text-align:right;}",
      ".bubble p.li .mk+span{min-width:0;}",
      ".bubble code{font:400 13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(15,23,42,.08);padding:1px 5px;border-radius:5px;}",
      ".row.me .bubble code{background:rgba(255,255,255,.22);}",
      ".meta{align-self:flex-end;font:400 11px/1 system-ui;color:" + color + ";margin-top:-4px;}",
      ".aname{font:600 12px/1 system-ui;color:#64748b;margin:2px 0 -4px 32px;}",
      ".jump{position:absolute;right:14px;bottom:14px;width:34px;height:34px;border:0;border-radius:50%;background:#fff;color:" + color + ";cursor:pointer;box-shadow:0 4px 14px rgba(15,23,42,.18);display:flex;align-items:center;justify-content:center;}",
      ".jump[hidden]{display:none;}",
      ".jump svg{width:20px;height:20px;fill:currentColor;}",
      ".foot{position:relative;padding:10px 12px 8px;background:#fff;border-top:1px solid #eef1f4;flex-shrink:0;}",
      // Crisp-style composer: the text sits on its own line, tools and send
      // share the row underneath, so long messages get the full width.
      ".box{border:1.5px solid " + color + ";border-radius:14px;padding:8px 10px 6px;background:#fff;}",
      "textarea{display:block;width:100%;border:0;outline:0;resize:none;font:400 15px/1.45 system-ui;min-height:22px;max-height:120px;color:#0f172a;background:transparent;}",
      ".row2{display:flex;align-items:center;justify-content:space-between;margin-top:4px;}",
      ".tools{display:flex;gap:2px;}",
      ".icon{width:30px;height:30px;border:0;background:transparent;cursor:pointer;border-radius:8px;color:#64748b;display:flex;align-items:center;justify-content:center;}",
      ".icon:hover{background:#f1f5f9;}",
      ".icon svg{width:19px;height:19px;fill:currentColor;}",
      ".send{width:32px;height:32px;border:0;background:transparent;color:#94a3b8;cursor:pointer;border-radius:8px;display:flex;align-items:center;justify-content:center;}",
      ".send.on{color:" + color + ";}",
      ".send svg{width:19px;height:19px;fill:currentColor;}",
      ".brand{display:block;text-align:center;font:500 11px/1.4 system-ui;color:#94a3b8;padding:8px 0 2px;text-decoration:none;cursor:pointer;}",
      ".brand b{color:" + color + ";font-weight:700;}",
      ".brand:hover b{text-decoration:underline;}",
      ".emoji{position:absolute;bottom:100%;left:12px;right:12px;margin-bottom:8px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:8px;display:flex;flex-wrap:wrap;gap:4px;box-shadow:0 8px 24px rgba(15,23,42,.12);}",
      ".emoji button{width:32px;height:32px;border:0;background:transparent;font-size:18px;cursor:pointer;border-radius:8px;}",
      ".emoji button:hover{background:#f1f5f9;}",
      ".toast{position:absolute;left:14px;right:14px;bottom:14px;background:#0f172a;color:#fff;font:500 12px/1.35 system-ui;padding:9px 11px;border-radius:9px;text-align:center;}",
      // Full screen on phones. The wrap is an opaque cover pinned to the
      // layout viewport and must never be 100lvh: that is the large viewport
      // and stays tall while Chrome shrinks the layout around the keyboard,
      // so the header jumps and the composer sits under the keys. It is
      // position:absolute at the document's top, NOT fixed: on iOS 26 Chrome
      // mis-places fixed layers by its toolbar height (WebKit 297779 /
      // Chromium 446714234). The page is locked at scroll 0, so top:0 is the
      // viewport top. Height is 100dvh so the engine tracks the layout
      // viewport, including Chrome's keyboard frame change. Do not put
      // overflow:hidden on the wrap — iOS scroll-into-view treats that as a
      // scrollport and can push the chat out of view.
      "@media(max-width:520px){",
      ".wrap.open{position:absolute;top:0;left:0;width:100%;height:100vh;height:100dvh;background:#fff;z-index:2147483000;}",
      ".wrap.open .panel{position:absolute;inset:0;width:100%;height:100%;min-height:0;border-radius:0;transform:none;transition:none;}",
      ".panel{right:0;left:0;top:0;bottom:0;width:100%;min-height:0;height:100%;border-radius:0;transform:none;transition:none;}",
      ".wrap.open .fab{display:none;}",
      ".head{padding-top:calc(12px + env(safe-area-inset-top,0px));}",
      ".foot{padding-bottom:calc(8px + env(safe-area-inset-bottom,0px));}",
      // Keyboard up: the home-indicator inset now sits under the keys, so
      // keeping it would float the composer above them. The top inset is
      // untouched: a keyboard never covers the status bar, and toggling the
      // header's padding moved its contents on every keyboard transition.
      ".panel.kb .foot{padding-bottom:8px;}",
      "textarea{font-size:16px;}",
      ".fab{right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));}",
      // Thumb-sized controls: 32px buttons are easy to miss on a phone.
      ".min{width:40px;height:40px;}",
      ".icon,.send{width:40px;height:40px;}",
      ".icon svg,.send svg{width:22px;height:22px;}",
      ".jump{width:40px;height:40px;bottom:16px;}",
      ".emoji button{width:40px;height:40px;font-size:22px;}",
      ".bubble{font-size:16px;}",
      ".act button{padding:10px 16px;font-size:15px;}",
      "}",
    ].join("");
  };

  var ICONS = {
    chat: '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>',
    // Robot head: the avatar shown when the bot is the one answering.
    bot: '<svg viewBox="0 0 24 24"><path d="M12 2a1 1 0 0 1 1 1v1.06A6 6 0 0 1 18 10v1h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1.1A6 6 0 0 1 12 22a6 6 0 0 1-5.9-4H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h1v-1a6 6 0 0 1 5-5.94V3a1 1 0 0 1 1-1zm0 4a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0v-6a4 4 0 0 0-4-4zm-2.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM10 16h4a1 1 0 0 1 0 2h-4a1 1 0 0 1 0-2z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M18.3 5.71L12 12.01l-6.3-6.3-1.4 1.41 6.29 6.3-6.3 6.29 1.42 1.41 6.29-6.29 6.3 6.3 1.41-1.42-6.29-6.29 6.3-6.3z"/></svg>',
    min: '<svg viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 16.5L5.5 10l1.42-1.41L12 13.67l5.08-5.08L18.5 10z"/></svg>',
    smile: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm-4-7c.5 1.7 2.1 3 4 3s3.5-1.3 4-3H8zm-1-3a1.25 1.25 0 112.5 0A1.25 1.25 0 017 10zm7.5 0a1.25 1.25 0 112.5 0 1.25 1.25 0 01-2.5 0z"/></svg>',
    clip: '<svg viewBox="0 0 24 24"><path d="M16.5 6.5v10.2a4.5 4.5 0 11-9 0V5.8a3.3 3.3 0 016.6 0v10.2a2.1 2.1 0 11-4.2 0V7.4h1.6v8.6a.5.5 0 101 0V5.8a1.7 1.7 0 00-3.4 0v10.9a2.9 2.9 0 105.8 0V6.5h1.6z"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>',
  };

  function boot(siteId) {
    var host = document.createElement("div");
    host.id = "relay-root";
    var shadow = host.attachShadow({ mode: "open" });
    // Outside <body> so lockPage's body{position:fixed} cannot trap
    // position:fixed descendants (iOS then mis-places the cover).
    document.documentElement.appendChild(host);

    var style = document.createElement("style");
    shadow.appendChild(style);

    var wrap = document.createElement("div");
    wrap.className = "wrap";
    wrap.innerHTML =
      '<button class="fab" type="button" aria-label="Open chat">' + ICONS.chat + '<span class="badge" hidden>0</span></button>' +
      '<div class="panel">' +
        '<div class="head">' +
          '<div class="chip">' + ICONS.chat + "<span></span></div>" +
          '<div class="agent">' +
            '<div class="av">C<span class="dot"></span></div>' +
            '<div class="who"><b></b><span></span></div>' +
            '<button class="min" type="button" aria-label="Minimize chat">' + ICONS.min + "</button>" +
          "</div>" +
        "</div>" +
        '<div class="mid">' +
          '<div class="msgs"></div>' +
          '<button class="jump" type="button" hidden aria-label="Jump to latest message">' + ICONS.down + "</button>" +
        "</div>" +
        '<div class="foot">' +
          '<div class="box">' +
            '<textarea rows="1"></textarea>' +
            '<div class="row2">' +
              '<div class="tools">' +
                '<button class="icon smile" type="button" aria-label="Insert emoji">' + ICONS.smile + "</button>" +
                '<button class="icon clip" type="button" aria-label="Attach file">' + ICONS.clip + "</button>" +
              "</div>" +
              '<button class="send" type="button" aria-label="Send message">' + ICONS.send + "</button>" +
            "</div>" +
          "</div>" +
          '<a class="brand" href="' + BRAND_URL + '" target="_blank" rel="noopener noreferrer"></a>' +
        "</div>" +
      "</div>";
    shadow.appendChild(wrap);

    var fab = wrap.querySelector(".fab");
    var badge = wrap.querySelector(".badge");
    var panel = wrap.querySelector(".panel");
    var msgsEl = wrap.querySelector(".msgs");
    var jumpBtn = wrap.querySelector(".jump");
    var input = wrap.querySelector("textarea");
    var sendBtn = wrap.querySelector(".send");
    var minBtn = wrap.querySelector(".min");
    var smileBtn = wrap.querySelector(".smile");
    var clipBtn = wrap.querySelector(".clip");
    var avEl = wrap.querySelector(".agent .av");
    var nameEl = wrap.querySelector(".who b");
    var subEl = wrap.querySelector(".who span");
    var dotEl = wrap.querySelector(".dot");
    var chipEl = wrap.querySelector(".chip span");
    var brandEl = wrap.querySelector(".brand");

    var preview = window.RELAY_PREVIEW === true;
    var lastHtml = "";
    var langObserver = null;

    isZh = resolveZh("auto");

    var state = {
      siteId: siteId,
      token: localStorage.getItem(storageKey(siteId)) || "",
      open: false,
      messages: [],
      config: {
        name: "Support",
        color: "#1972F5",
        agentName: "Support",
        botName: "",
        botAvatar: "",
        agentAvatar: "",
        welcomeMessage: "",
        online: false,
        botActive: false,
        locale: "auto",
        enabled: true,
      },
      lastReadAt: null,
      takenOver: false,
      awaitingBot: 0,
      stopped: false,
      emojiOpen: false,
    };

    var pageLock = null;

    function pinHostScroll(y) {
      try {
        window.scrollTo({ top: y, left: 0, behavior: "auto" });
      } catch (e) {
        window.scrollTo(0, y);
      }
    }

    function holdHostScroll() {
      document.documentElement.style.scrollBehavior = "auto";
    }

    function releaseHostScroll() {
      document.documentElement.style.scrollBehavior = "";
    }

    function isPhone() {
      return window.matchMedia("(max-width: 520px)").matches;
    }

    var keepKb = false;
    var hostLockStyle = null;
    try { sessionStorage.removeItem("relay_kb"); } catch (e) {}

    // ── Phone layout ─────────────────────────────────────────────────────
    // The WRAP is a white cover over the layout viewport (absolute at the
    // document's top, 100dvh). The PANEL fills it, except when Safari reports
    // a keyboard inset:
    //
    //   kb = innerHeight - visualViewport.height - visualViewport.offsetTop
    //
    // Safari keeps the layout viewport and shrinks the visual one
    // (714 - 376 - 0 = 338) — the panel is then ih - kb tall. Chrome for iOS
    // shrinks the layout viewport itself (414 - 414 = 0) — the wrap already
    // is the band and the panel fills it. The panel is never translated.
    // Measure on viewport events and on a 100ms poll while focused (Chrome
    // delivers resize late). Any window scroll while open is undone.
    //
    // After 完成 Chrome expands the layout viewport while the visual one is
    // still the keyboard band (ih 741, vv 414 → inset 327). That looks like
    // a Safari keyboard. Applying it shrinks the panel (composer jumps up).
    // Ignore every inset until the next real focus.
    var KB_SETTLE_MS = 80;
    var KB_ANIM_MS = 250;
    var KB_POLL_MS = 100;
    var kb = 0;          // committed keyboard inset
    var kbPending = -1;
    var kbSince = 0;
    var kbTimer = 0;
    var kbFrame = 0;
    var kbPoll = 0;
    var lastSnap = 0;
    var kbClosed = false;
    var blurAt = 0;

    function resetShellScroll() {
      try {
        if (wrap.scrollTop) wrap.scrollTop = 0;
        if (wrap.scrollLeft) wrap.scrollLeft = 0;
        if (panel.scrollTop) panel.scrollTop = 0;
        if (panel.scrollLeft) panel.scrollLeft = 0;
      } catch (e) {}
    }

    function clearPanelInline() {
      panel.style.height = "";
      panel.style.maxHeight = "";
      panel.style.transition = "";
      panel.classList.remove("kb");
    }

    function keyboardInset(vv, innerHeight) {
      var ih = Math.round(innerHeight);
      if (!vv) return 0;
      var h = Math.round(vv.height);
      if (h < 160 || h > ih) return 0;
      var top = Math.max(0, Math.round(vv.offsetTop || 0));
      var inset = ih - h - top;
      return inset < 40 ? 0 : inset;
    }

    function applyKb(value, animate, why) {
      kb = kbClosed ? 0 : value;
      if (!state.open || !isPhone()) { clearPanelInline(); return; }
      var ih = Math.round(window.innerHeight);
      panel.style.transition = animate ? "height " + KB_ANIM_MS + "ms ease-out" : "";
      if (kb <= 0) {
        // Fill the wrap. On Chrome the wrap is already the keyboard band
        // (100dvh == innerHeight). A pixel height here is what put the
        // composer under the keys when 100lvh / a stale floor won.
        panel.style.height = "";
        panel.style.maxHeight = "";
        panel.classList.remove("kb");
      } else {
        var height = Math.max(160, ih - kb);
        panel.style.height = height + "px";
        panel.style.maxHeight = height + "px";
        panel.classList.add("kb");
      }
      noteDock(why || "apply");
    }

    // The page is locked while the panel is open, so any scroll the engine
    // performed to "reveal" the composer is wrong and undone. Throttled to a
    // frame so a stubborn engine cannot turn this into jitter.
    function snapScroll() {
      var sy = window.scrollY || window.pageYOffset || 0;
      var vv = window.visualViewport;
      var panned = vv && Math.round(vv.offsetTop || 0) > 0;
      if ((sy > 0 || panned) && Date.now() - lastSnap > 16) {
        lastSnap = Date.now();
        try { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); } catch (e) { window.scrollTo(0, 0); }
        if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      }
      resetShellScroll();
    }

    function measure() {
      if (!state.open || !isPhone()) { clearPanelInline(); return; }
      snapScroll();
      if (kbClosed) {
        if (kb > 0) applyKb(0, true, "hold");
        else noteDock("hold");
        return;
      }
      var next = keyboardInset(window.visualViewport, window.innerHeight);
      var now = Date.now();
      if (next === kb) {
        if (kbPending !== -1) { kbPending = -1; clearTimeout(kbTimer); kbTimer = 0; }
        noteDock("same");
        return;
      }
      if (next !== kbPending) { kbPending = next; kbSince = now; }
      var held = now - kbSince;
      if (held >= KB_SETTLE_MS) {
        kbPending = -1;
        applyKb(next, true, "settle");
      } else {
        clearTimeout(kbTimer);
        kbTimer = setTimeout(measure, KB_SETTLE_MS - held + 1);
        noteDock("wait");
      }
    }

    // Coalesce the burst of viewport events during the keyboard animation.
    function scheduleMeasure() {
      if (kbFrame) return;
      kbFrame = requestAnimationFrame(function () { kbFrame = 0; measure(); });
    }

    // Events are not enough on Chrome for iOS: poll while the composer is
    // focused, and for a second after it loses focus so the close is caught.
    var pollUntil = 0;
    function startPoll(ms) {
      pollUntil = Math.max(pollUntil, Date.now() + (ms || 0));
      if (kbPoll) return;
      kbPoll = setInterval(function () {
        if (!state.open || !isPhone()) { stopPoll(); return; }
        var focused = shadow.activeElement === input;
        if (!focused && Date.now() > pollUntil) { stopPoll(); return; }
        measure();
      }, KB_POLL_MS);
    }
    function stopPoll() {
      if (kbPoll) clearInterval(kbPoll);
      kbPoll = 0;
    }

    // Keyboard going away. Latch closed even when kb was already 0
    // (Chrome's shrink model) so the mid-close "ih grew, vv hasn't"
    // reading cannot lift the composer.
    function releaseLift() {
      if (!state.open || !isPhone()) return;
      kbClosed = true;
      blurAt = Date.now();
      kbPending = -1;
      clearTimeout(kbTimer);
      kbTimer = 0;
      if (kb > 0) applyKb(0, true, "release");
    }

    var lastEvent = "";
    function onViewportChange() { lastEvent = "resize"; scheduleMeasure(); }
    function onViewportScroll() { lastEvent = "scroll"; scheduleMeasure(); }

    // Opt-in readout for chasing keyboard bugs on a phone without a debugger:
    // open the page with ?relaydebug=1 and screenshot. Header line shows the
    // latest reading; the grey box keeps the last ten.
    var DOCK_DEBUG = /(?:[?&#])relaydebug=1/.test(location.search + location.hash);
    var dockDebugText = "";
    var dockLog = [];
    var dockLogEl = null;
    var lastLogKey = "";
    var dockT0 = Date.now();
    function noteDock(why) {
      if (!DOCK_DEBUG) return;
      var vv = window.visualViewport;
      dockDebugText =
        "ih " + Math.round(window.innerHeight) +
        " vv " + (vv ? Math.round(vv.height) + "@" + Math.round(vv.offsetTop) : "-") +
        " sy " + Math.round(window.scrollY || 0) +
        " kb " + kb + (kbClosed ? " closed" : "") +
        (kbPending >= 0 && kbPending !== kb ? "→" + kbPending : "") +
        " h " + (panel.style.height || "auto");
      subEl.textContent = dockDebugText;
      var tag = (why || "") + (lastEvent ? "/" + lastEvent : "");
      lastEvent = "";
      // The poll repeats unchanged readings ten times a second; log a line
      // only when the reading or the decision changed.
      var key = tag + " " + dockDebugText;
      if (key !== lastLogKey) {
        lastLogKey = key;
        dockLog.push(((Date.now() - dockT0) / 1000).toFixed(2) + " " + key);
        if (dockLog.length > 20) dockLog.shift();
      }
      if (!dockLogEl) {
        dockLogEl = document.createElement("pre");
        dockLogEl.style.cssText = "position:absolute;left:6px;right:6px;top:6px;z-index:9;margin:0;padding:6px 8px;background:rgba(17,24,39,.85);color:#fff;font:9px/1.3 ui-monospace,Menlo,monospace;border-radius:8px;white-space:pre-wrap;pointer-events:none;";
        wrap.querySelector(".mid").appendChild(dockLogEl);
      }
      dockLogEl.textContent = dockLog.join("\n");
    }

    function setOpenFlag(open) {
      document.documentElement.classList.toggle("relay-open", open);
      document.documentElement.dataset.relayOpen = open ? "1" : "";
      try {
        window.dispatchEvent(new CustomEvent("relay:open", { detail: { open: open } }));
      } catch (e) {}
    }

    function lockPage() {
      if (pageLock || !isPhone()) return;
      pageLock = {
        overflow: document.documentElement.style.overflow,
        bodyOverflow: document.body.style.overflow,
        bodyPosition: document.body.style.position,
        bodyTop: document.body.style.top,
        bodyWidth: document.body.style.width,
        scrollY: window.scrollY || window.pageYOffset || 0,
      };
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = "-" + pageLock.scrollY + "px";
      document.body.style.width = "100%";
      if (!hostLockStyle) {
        hostLockStyle = document.createElement("style");
        hostLockStyle.textContent = "html,html body{scroll-behavior:auto!important;}";
        document.head.appendChild(hostLockStyle);
      }
    }

    function unlockPage() {
      if (!pageLock) return;
      document.documentElement.style.overflow = pageLock.overflow;
      document.body.style.overflow = pageLock.bodyOverflow;
      document.body.style.position = pageLock.bodyPosition;
      document.body.style.top = pageLock.bodyTop;
      document.body.style.width = pageLock.bodyWidth;
      var y = pageLock.scrollY;
      pageLock = null;
      pinHostScroll(y);
      if (hostLockStyle) {
        hostLockStyle.remove();
        hostLockStyle = null;
      }
    }

    function focusComposer() {
      try {
        input.focus({ preventScroll: true });
      } catch (e) {
        input.focus();
      }
    }

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onViewportChange);
      window.visualViewport.addEventListener("scroll", onViewportScroll);
    }
    window.addEventListener("resize", onViewportChange);
    wrap.addEventListener("scroll", resetShellScroll);
    panel.addEventListener("scroll", resetShellScroll);
    try {
      if (navigator.virtualKeyboard) {
        navigator.virtualKeyboard.overlaysContent = true;
        navigator.virtualKeyboard.addEventListener("geometrychange", onViewportChange);
      }
    } catch (e) {}

    function teardown() {
      state.stopped = true;
      if (kbFrame) cancelAnimationFrame(kbFrame);
      clearTimeout(kbTimer);
      stopPoll();
      if (langObserver) langObserver.disconnect();
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      window.removeEventListener("wheel", onWidgetWheel, true);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", onViewportChange);
        window.visualViewport.removeEventListener("scroll", onViewportScroll);
      }
      window.removeEventListener("resize", onViewportChange);
      kb = 0;
      clearPanelInline();
      wrap.style.height = "";
      try {
        if (navigator.virtualKeyboard) {
          navigator.virtualKeyboard.removeEventListener("geometrychange", onViewportChange);
        }
      } catch (e) {}
      setOpenFlag(false);
      unlockPage();
      host.remove();
    }

    // Clicking anywhere outside the widget collapses the panel, like the
    // mainstream desktop widgets. Events from inside the shadow root retarget
    // to the host element by the time they reach the document, so checking
    // the host covers the whole widget (bubble, panel, emoji picker).
    // On phones the panel is full-screen, so there is no outside to click.
    // Capture phase, so host pages that stopPropagation() can't swallow it.
    function onDocPointerDown(e) {
      if (!state.open) return;
      var inside = e.composedPath
        ? e.composedPath().indexOf(host) !== -1
        : host.contains(e.target);
      if (!inside) closePanel();
    }
    document.addEventListener("pointerdown", onDocPointerDown, true);

    // Wheel events from the widget retarget to #relay-root by the time they
    // reach the document. A header/footer wheel (not a scrollport) then
    // scrolls the landing page behind the panel. Contain that here.
    function onWidgetWheel(e) {
      if (!state.open) return;
      var path = e.composedPath ? e.composedPath() : [];
      if (path.indexOf(host) === -1 && path.indexOf(wrap) === -1) return;
      var overMsgs = path.indexOf(msgsEl) !== -1;
      if (overMsgs && msgsEl.scrollHeight > msgsEl.clientHeight + 1) {
        var dy = e.deltaY;
        var atTop = msgsEl.scrollTop <= 0;
        var atBottom = msgsEl.scrollTop + msgsEl.clientHeight >= msgsEl.scrollHeight - 1;
        if (!((dy < 0 && atTop) || (dy > 0 && atBottom))) return;
      }
      e.preventDefault();
    }
    window.addEventListener("wheel", onWidgetWheel, { capture: true, passive: false });

    function relocalize() {
      applyLocale();
      applyTheme();
      lastHtml = "";
      render();
    }

    function applyLocale() {
      T = strings(isZh);
      chipEl.textContent = T.chat;
      input.placeholder = T.placeholder;
      brandEl.innerHTML = T.brand;
      fab.setAttribute("aria-label", T.chat);
      minBtn.setAttribute("aria-label", T.minimize);
      smileBtn.setAttribute("aria-label", T.emoji);
      jumpBtn.setAttribute("aria-label", T.jump);
    }

    // Who the visitor is talking to right now: the owner when they are online,
    // otherwise the bot (if it is switched on). The header carries that name,
    // and "online" means someone — human or bot — will answer.
    function speaker() {
      if (!state.config.online && state.config.botActive) {
        return { name: state.config.botName || state.config.agentName, bot: true, online: true };
      }
      return { name: state.config.agentName, bot: false, online: !!state.config.online };
    }

    // The bot's face: the owner's upload (a data: URL) or the default shipped
    // with the site. Falls back to the inline robot if the image cannot load.
    function botImg() {
      var src = state.config.botAvatar || (BASE + "/bot-avatar.png");
      return '<img class="botimg" alt="" src="' + escapeHtml(src) + '" onerror="this.outerHTML=' +
        escapeHtml(JSON.stringify(ICONS.bot)) + '">';
    }

    // The owner's face: their upload or X profile picture from the config,
    // else the default shipped with the site; initials if the image 404s.
    function agentImg(name) {
      var src = state.config.agentAvatar || (BASE + "/agent-avatar.jpg");
      return '<img class="botimg" alt="" src="' + escapeHtml(src) + '" onerror="this.outerHTML=' +
        escapeHtml(JSON.stringify(escapeHtml(initials(name)))) + '">';
    }

    function applyTheme() {
      style.textContent = css(state.config.color || "#1972F5");
      var who = speaker();
      avEl.innerHTML = (who.bot ? botImg() : agentImg(who.name)) + '<span class="dot"></span>';
      dotEl = wrap.querySelector(".dot");
      avEl.classList.toggle("bot", who.bot);
      avEl.classList.toggle("pic", true);
      nameEl.textContent = who.name + " " + T.from + " " + state.config.name;
      subEl.textContent = dockDebugText || (who.online ? (who.bot ? T.botOnline : T.online) : T.offline);
      dotEl.classList.toggle("off", !who.online);
    }

    // A single place to absorb server config so the locale switch, the theme
    // and the owner's on/off switch stay in sync wherever the payload arrives.
    function applyConfig(cfg) {
      if (!cfg) return;
      state.config = Object.assign(state.config, cfg);
      if (state.config.enabled === false && !preview) {
        teardown();
        return;
      }
      var nextZh = resolveZh(state.config.locale);
      if (nextZh !== isZh) {
        isZh = nextZh;
        applyLocale();
        lastHtml = "";
      }
      applyTheme();
    }

    // The host page may switch language at runtime — our own site's toggle
    // rewrites <html lang> without reloading — so the bubble tracks it.
    function watchPageLang() {
      if (typeof MutationObserver !== "function") return;
      langObserver = new MutationObserver(function () {
        if ((state.config.locale || "auto") !== "auto") return;
        var next = resolveZh("auto");
        if (next === isZh) return;
        isZh = next;
        relocalize();
      });
      langObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["lang"],
      });
    }

    function nearBottom() {
      return msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 48;
    }

    function scrollToBottom() {
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function updateJump() {
      jumpBtn.hidden = nearBottom();
    }

    // What the visitor has seen is a per-device stamp: the newest message that
    // was on screen while the panel was open. The badge used to count against
    // the OWNER's read stamp, so it never cleared after the visitor read the
    // replies and closed the panel.
    function seenKey() {
      return "relay_seen_" + state.siteId;
    }

    function markSeen() {
      var newest = "";
      for (var i = 0; i < state.messages.length; i++) {
        if (state.messages[i].createdAt > newest) newest = state.messages[i].createdAt;
      }
      if (!newest) return;
      try { localStorage.setItem(seenKey(), newest); } catch (e) {}
    }

    function unreadCount() {
      var seen = "";
      try { seen = localStorage.getItem(seenKey()) || ""; } catch (e) {}
      var n = 0;
      for (var i = 0; i < state.messages.length; i++) {
        var m = state.messages[i];
        if (m.author === "visitor" || m.recalledAt) continue;
        if (!seen || m.createdAt > seen) n++;
      }
      return n;
    }

    function updateBadge() {
      if (state.open) {
        badge.hidden = true;
        return;
      }
      var n = unreadCount();
      badge.hidden = n === 0;
      badge.textContent = n > 9 ? "9+" : String(n);
    }

    /**
     * Polling used to rewrite the thread and force-scroll to the bottom every
     * cycle, which yanked the reader back down mid-scroll and killed touch
     * momentum. Now the DOM is only touched when the markup actually changed,
     * and the viewport is restored unless the reader was already at the end
     * (or just sent something).
     */
    function render(force) {
      var html = [];
      var list = state.messages.slice();
      var welcome = (state.config.welcomeMessage || "").trim() || T.welcome;
      // Welcome is client-only and never persisted. Keep it as the first
      // bubble after the visitor replies, but do not duplicate if the
      // server later returns the same line from the agent or bot.
      if (welcome) {
        var hasWelcome = false;
        for (var w = 0; w < list.length; w++) {
          var wm = list[w];
          if (wm.id === "welcome") { hasWelcome = true; break; }
          if (wm.author !== "visitor" && (wm.text || "").trim() === welcome) {
            hasWelcome = true;
            break;
          }
        }
        if (!hasWelcome) {
          list = [{
            id: "welcome",
            author: "bot",
            text: welcome,
            createdAt: list.length ? list[0].createdAt : new Date().toISOString(),
          }].concat(list);
        }
      }
      var lastStamp = 0;
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        var ts = new Date(m.createdAt).getTime();
        if (!lastStamp || ts - lastStamp > 8 * 60 * 1000) {
          html.push('<div class="time">' + relativeTime(m.createdAt) + "</div>");
          lastStamp = ts;
        }
        var mine = m.author === "visitor";
        if (m.recalledAt) {
          html.push('<div class="recalled">' + (mine ? T.recalledMine : T.recalledTheirs) + "</div>");
          continue;
        }
        // Each bubble is labelled by who wrote it, not by who is online now:
        // a bot answer stays the bot's after the owner comes back.
        // The synthetic welcome belongs to whoever is answering right now; real
        // messages keep their author.
        var fromBot = m.id === "welcome" ? speaker().bot : m.author === "bot";
        var authorName = fromBot ? (state.config.botName || state.config.agentName) : state.config.agentName;
        if (!mine) html.push('<div class="aname">' + escapeHtml(authorName) + "</div>");
        html.push(
          '<div class="row ' + (mine ? "me" : "them") + '" data-id="' + escapeHtml(m.id) + '">' +
            (mine ? "" : '<div class="av pic' + (fromBot ? " bot" : "") + '">' + (fromBot ? botImg() : agentImg(authorName)) + "</div>") +
            '<div class="bubble">' + formatMessage(m.text) + "</div>" +
          "</div>"
        );
        if (mine && i === list.length - 1 && state.lastReadAt && state.lastReadAt >= m.createdAt) {
          html.push('<div class="meta">✓✓ ' + T.seen + "</div>");
        }
      }
      if (typingVisible()) {
        html.push('<div class="row them typing-row"><div class="av bot">' + botImg() + '</div><div class="bubble typing"><i></i><i></i><i></i></div></div>');
      }
      var joined = html.join("") || '<div class="time">' + T.empty + "</div>";
      if (joined !== lastHtml) {
        var keepTop = msgsEl.scrollTop;
        var stick = force || nearBottom();
        msgsEl.innerHTML = joined;
        lastHtml = joined;
        if (stick) scrollToBottom();
        else msgsEl.scrollTop = keepTop;
      } else if (force) {
        scrollToBottom();
      }
      if (state.open) markSeen();
      updateJump();
      updateBadge();
    }

    // Three bouncing dots while the bot is composing. The model takes 5–20 s;
    // with nothing on screen a visitor on a phone assumes the message was
    // lost and taps send again. Shown only when the bot will actually answer.
    var TYPING_MAX_MS = 30000;
    var typingTimer = null;
    function typingVisible() {
      if (!state.awaitingBot) return false;
      if (Date.now() - state.awaitingBot > TYPING_MAX_MS) {
        state.awaitingBot = 0;
        return false;
      }
      for (var i = 0; i < state.messages.length; i++) {
        var m = state.messages[i];
        if (m.author !== "visitor" && new Date(m.createdAt).getTime() >= state.awaitingBot - 2000) {
          state.awaitingBot = 0;
          return false;
        }
      }
      return true;
    }
    function expectBotReply() {
      if (!state.config.botActive || state.takenOver) return;
      state.awaitingBot = Date.now();
      clearTimeout(typingTimer);
      typingTimer = setTimeout(function () {
        state.awaitingBot = 0;
        render();
      }, TYPING_MAX_MS + 100);
    }

    function mergeMessages(incoming) {
      var map = {};
      for (var i = 0; i < state.messages.length; i++) map[state.messages[i].id] = state.messages[i];
      for (i = 0; i < incoming.length; i++) map[incoming[i].id] = incoming[i];
      state.messages = Object.keys(map)
        .map(function (k) { return map[k]; })
        .sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    }

    // Newest timestamp we hold, counting recalls: the server sends anything
    // created or recalled after this, so a recall must advance the cursor or
    // every long poll would return the same recalled row immediately.
    function messageCursor() {
      var max = "";
      for (var i = 0; i < state.messages.length; i++) {
        var m = state.messages[i];
        if (m.createdAt > max) max = m.createdAt;
        if (m.recalledAt && m.recalledAt > max) max = m.recalledAt;
      }
      return max;
    }

    async function api(path, opts) {
      var res = await fetch(BASE + path, opts);
      if (!res.ok) throw new Error("http " + res.status);
      return res.json();
    }

    // Host sites with their own accounts can hand us the logged-in user so
    // the owner sees a real name and avatar instead of an anonymous visitor.
    // Either set window.$relayUser before the script loads or call
    // window.$relay.identify({ name, email, avatar }) after login.
    function identityMeta() {
      var u = window.$relayUser;
      if (!u || typeof u !== "object") return {};
      var meta = {};
      if (typeof u.name === "string" && u.name) meta.name = u.name.slice(0, 120);
      if (typeof u.email === "string" && u.email) meta.email = u.email.slice(0, 255);
      if (typeof u.avatar === "string" && /^https?:\/\//.test(u.avatar)) meta.avatar = u.avatar.slice(0, 500);
      return meta;
    }

    // JSON of the identity last delivered to the server. Lets us detect an
    // identify() that landed while a session POST was already in flight (its
    // body was built without the identity) and sync once more.
    var sentIdentity = null;

    async function ensureSession() {
      var meta = identityMeta();
      var data = await api("/api/livechat/widget/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({
          site: state.siteId,
          token: state.token,
          pageUrl: location.href,
        }, meta)),
      });
      state.token = data.token;
      localStorage.setItem(storageKey(state.siteId), data.token);
      sentIdentity = JSON.stringify(meta);
      applyConfig(data.config);
      if (state.stopped) return;
      state.lastReadAt = data.lastReadAt;
      mergeMessages(data.messages || []);
      render(true);
      if (JSON.stringify(identityMeta()) !== sentIdentity) {
        ensureSession().catch(function () {});
      }
    }

    function sleep(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    async function poll(wait) {
      if (!state.token) return;
      try {
        var after = messageCursor();
        var q = "/api/livechat/widget/messages?site=" + encodeURIComponent(state.siteId) +
          "&token=" + encodeURIComponent(state.token) +
          (after ? "&after=" + encodeURIComponent(after) : "") +
          (wait ? "&wait=1" : "");
        var data = await api(q);
        applyConfig(data.config);
        if (state.stopped) return;
        state.lastReadAt = data.lastReadAt;
        mergeMessages(data.messages || []);
        render();
      } catch (e) {}
    }

    async function listen() {
      while (!state.stopped) {
        if (!state.token) {
          await sleep(1500);
          continue;
        }
        var started = Date.now();
        await poll(true);
        var pad = 800 - (Date.now() - started);
        if (pad > 0) await sleep(pad);
      }
    }

    async function send() {
      var text = (input.value || "").trim();
      if (!text) return;
      input.value = "";
      resize();
      sendBtn.classList.remove("on");
      // Send on iOS blurs the field and starts the keyboard hide. Put
      // focus back so the next line stays on the keyboard; 完成 is what
      // dismisses, and that path is now a single expand.
      if (isPhone()) focusComposer();
      try {
        if (!state.token) await ensureSession();
        // Identity rides along on every message too: whatever ordering the
        // host page set window.$relayUser in, the conversation picks the
        // name/email/avatar up no later than the visitor's next message.
        var data = await api("/api/livechat/widget/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign({
            site: state.siteId,
            token: state.token,
            text: text,
            pageUrl: location.href,
          }, identityMeta())),
        });
        if (typeof data.takenOver === "boolean") state.takenOver = data.takenOver;
        if (data.message) mergeMessages([data.message]);
        expectBotReply();
        render(true);
        setTimeout(poll, 600);
      } catch (e) {
        input.value = text;
      }
    }

    function resize() {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    }

    function openPanel() {
      state.open = true;
      panel.classList.add("open");
      wrap.classList.add("open");
      fab.innerHTML = ICONS.close;
      setOpenFlag(true);
      lockPage();
      kb = 0;
      kbClosed = false;
      kbPending = -1;
      blurAt = 0;
      clearTimeout(kbTimer);
      kbTimer = 0;
      clearPanelInline();
      scheduleMeasure();
      updateBadge();
      render(true);
      ensureSession().then(function () {
        if (state.stopped || !state.open) return;
        if (!isPhone()) focusComposer();
      });
    }

    function closePanel() {
      if (!state.open) return;
      // html { scroll-behavior: smooth } would animate unlockPage's restore
      // into a visible homepage roll. Blurring the composer can also make
      // the browser scroll-into-view the host page behind the panel.
      holdHostScroll();
      var y = pageLock ? pageLock.scrollY : (window.scrollY || window.pageYOffset || 0);
      try { input.blur(); } catch (e) {}
      try {
        var ae = shadow.activeElement;
        if (ae && typeof ae.blur === "function") ae.blur();
      } catch (e) {}
      try { if (document.activeElement === host) host.blur(); } catch (e) {}
      pinHostScroll(y);

      state.open = false;
      panel.classList.remove("open");
      wrap.classList.remove("open");
      fab.innerHTML = ICONS.chat + '<span class="badge" hidden>0</span>';
      badge = wrap.querySelector(".badge");
      setOpenFlag(false);
      unlockPage();
      kb = 0;
      kbClosed = false;
      kbPending = -1;
      clearTimeout(kbTimer);
      kbTimer = 0;
      stopPoll();
      clearPanelInline();
      wrap.style.height = "";
      resetShellScroll();
      updateBadge();
      hideEmoji();
      pinHostScroll(y);
      requestAnimationFrame(function () {
        pinHostScroll(y);
        releaseHostScroll();
      });
    }

    function hideEmoji() {
      var el = wrap.querySelector(".emoji");
      if (el) el.remove();
      state.emojiOpen = false;
    }

    fab.addEventListener("click", function () {
      if (state.open) closePanel();
      else openPanel();
    });
    minBtn.addEventListener("click", closePanel);
    msgsEl.addEventListener("scroll", updateJump);
    jumpBtn.addEventListener("click", function () {
      scrollToBottom();
      updateJump();
    });

    // ── Unsend: hold one of your own bubbles (or right-click on desktop) ──
    var RECALL_WINDOW_MS = 2 * 60 * 1000;
    var midEl = wrap.querySelector(".mid");
    var actEl = null;
    var holdTimer = null;
    var holdStart = null;

    function messageById(id) {
      for (var i = 0; i < state.messages.length; i++) {
        if (state.messages[i].id === id) return state.messages[i];
      }
      return null;
    }

    function hideActions() {
      if (actEl) {
        actEl.remove();
        actEl = null;
      }
      var held = msgsEl.querySelector(".row.held");
      if (held) held.classList.remove("held");
    }

    function toast(text) {
      var el = document.createElement("div");
      el.className = "toast";
      el.textContent = text;
      midEl.appendChild(el);
      setTimeout(function () { el.remove(); }, 1800);
    }

    function showActions(row) {
      hideActions();
      var m = messageById(row.getAttribute("data-id"));
      if (!m || m.author !== "visitor" || m.recalledAt) return;
      if (Date.now() - new Date(m.createdAt).getTime() > RECALL_WINDOW_MS) {
        toast(T.recallExpired);
        return;
      }
      row.classList.add("held");
      var br = row.querySelector(".bubble").getBoundingClientRect();
      var mr = midEl.getBoundingClientRect();
      actEl = document.createElement("div");
      actEl.className = "act";
      actEl.innerHTML = '<button type="button">' + T.recall + "</button>";
      actEl.querySelector("button").addEventListener("click", function () {
        var id = m.id;
        hideActions();
        recall(id);
      });
      midEl.appendChild(actEl);
      var ar = actEl.getBoundingClientRect();
      var left = br.left + br.width / 2 - mr.left;
      left = Math.max(ar.width / 2 + 8, Math.min(mr.width - ar.width / 2 - 8, left));
      actEl.style.left = left + "px";
      // Above the bubble unless it sits under the header, then below it.
      var top = br.top - mr.top - 8;
      if (top - ar.height < 4) {
        top = br.bottom - mr.top + 12;
        actEl.style.transform = "translate(-50%,0)";
      }
      actEl.style.top = top + "px";
    }

    function cancelHold() {
      clearTimeout(holdTimer);
      holdTimer = null;
      holdStart = null;
    }

    async function recall(id) {
      try {
        var data = await api(
          "/api/livechat/widget/messages?site=" + encodeURIComponent(state.siteId) +
            "&token=" + encodeURIComponent(state.token) +
            "&id=" + encodeURIComponent(id),
          { method: "DELETE" }
        );
        if (data.message) mergeMessages([data.message]);
        render();
      } catch (e) {
        if (/410/.test(String(e && e.message))) toast(T.recallExpired);
      }
    }

    msgsEl.addEventListener("pointerdown", function (e) {
      var row = e.target && e.target.closest ? e.target.closest(".row.me") : null;
      // Any tap in the thread dismisses an open menu.
      hideActions();
      if (!row || (e.pointerType === "mouse" && e.button !== 0)) return;
      holdStart = { x: e.clientX, y: e.clientY };
      holdTimer = setTimeout(function () {
        holdTimer = null;
        showActions(row);
      }, 450);
    });
    msgsEl.addEventListener("pointermove", function (e) {
      if (!holdTimer || !holdStart) return;
      if (Math.abs(e.clientX - holdStart.x) > 8 || Math.abs(e.clientY - holdStart.y) > 8) cancelHold();
    });
    msgsEl.addEventListener("pointerup", cancelHold);
    msgsEl.addEventListener("pointercancel", cancelHold);
    msgsEl.addEventListener("scroll", hideActions);
    msgsEl.addEventListener("contextmenu", function (e) {
      var row = e.target && e.target.closest ? e.target.closest(".row.me") : null;
      if (!row) return;
      e.preventDefault();
      cancelHold();
      showActions(row);
    });
    sendBtn.addEventListener("click", send);
    function armKeepKb() { keepKb = true; }
    sendBtn.addEventListener("pointerdown", armKeepKb);
    smileBtn.addEventListener("pointerdown", armKeepKb);
    input.addEventListener("touchend", function (e) {
      // Inside a shadow root document.activeElement is the host, never the
      // textarea, so the old check never matched: every tap on an already
      // focused composer was swallowed and the caret could not be moved.
      if (shadow.activeElement === input) return;
      // 完成's leftover tap lands on this field. Swallow it so we do not
      // refocus mid-close. A later tap opens the keyboard normally.
      if (kbClosed && blurAt && Date.now() - blurAt < 450) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      focusComposer();
    });
    input.addEventListener("focus", function () {
      keepKb = false;
      // Do not blur() here when a keyboard inset is already showing: that
      // left the keys up and the panel full-height, covering the composer.
      // A leftover 完成 focus keeps kbClosed so the fake inset is ignored.
      if (kbClosed && blurAt && Date.now() - blurAt < 450) {
        startPoll(450);
        return;
      }
      kbClosed = false;
      snapScroll();
      scheduleMeasure();
      startPoll(0);
    });
    input.addEventListener("blur", function () {
      if (keepKb) {
        keepKb = false;
        return;
      }
      releaseLift();
      startPoll(1200);
    });
    input.addEventListener("input", function () {
      resize();
      sendBtn.classList.toggle("on", !!(input.value || "").trim());
    });
    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.shiftKey) return;
      // Enter inside an IME (pinyin candidates) confirms the composition; it
      // must not send half a word. On phones the return key inserts a line
      // break and the send button sends, like every messaging app.
      if (e.isComposing || e.keyCode === 229 || isPhone()) return;
      e.preventDefault();
      send();
    });
    smileBtn.addEventListener("click", function () {
      if (state.emojiOpen) { hideEmoji(); return; }
      var box = document.createElement("div");
      box.className = "emoji";
      EMOJIS.forEach(function (em) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = em;
        b.addEventListener("click", function () {
          input.value += em;
          sendBtn.classList.add("on");
          input.focus();
        });
        box.appendChild(b);
      });
      wrap.querySelector(".foot").appendChild(box);
      state.emojiOpen = true;
    });
    clipBtn.addEventListener("click", function () {
      var t = document.createElement("div");
      t.className = "toast";
      t.textContent = T.attach;
      wrap.querySelector(".mid").appendChild(t);
      setTimeout(function () { t.remove(); }, 1800);
    });

    applyLocale();
    applyTheme();
    render(true);
    watchPageLang();

    api("/api/livechat/widget/config?site=" + encodeURIComponent(siteId))
      .then(function (cfg) {
        applyConfig(cfg);
        if (!state.stopped) render();
      })
      .catch(function () {});

    if (localStorage.getItem(storageKey(siteId))) {
      ensureSession().catch(function () {});
    }

    listen();

    // Host pages may have stubbed $relay as a command queue before this
    // script loaded (window.$relay = window.$relay || []; $relay.push([...])).
    // Swap the real API in, then replay whatever was queued.
    var queued = window.$relay;
    window.$relay = {
      open: openPanel,
      close: closePanel,
      siteId: siteId,
      identify: function (user) {
        window.$relayUser = user;
        // Re-post the session so the console picks the identity up right away.
        // Without a token there is nothing to update yet — the identity is
        // read fresh from window.$relayUser whenever a session is created.
        if (state.token) ensureSession().catch(function () {});
      },
    };
    if (Array.isArray(queued)) {
      for (var qi = 0; qi < queued.length; qi++) {
        var cmd = queued[qi];
        if (!cmd || !cmd.length) continue;
        if (cmd[0] === "identify") window.$relay.identify(cmd[1]);
        else if (cmd[0] === "open") openPanel();
        else if (cmd[0] === "close") closePanel();
      }
    }
  }

  function start() {
    var id = siteIdFromPage();
    if (id) boot(id);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
