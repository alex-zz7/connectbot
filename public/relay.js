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
  // API base = wherever this script was served from. Same-origin embeds fall
  // back to the page's own origin.
  var BASE = (function () {
    try {
      if (script && script.src) return new URL(script.src).origin;
    } catch (e) {}
    return location.origin;
  })();

  var REPO_URL = "https://github.com/alex-zz7/connectbot";

  // Language follows the site's own setting ("auto" | "en" | "zh"), which the
  // owner picks in the console. Only "auto" falls back to the embedding page.
  var isZh = /zh/i.test(navigator.language || "");
  var T;

  function strings(zh) {
    return {
      chat: zh ? "聊天" : "Chat",
      placeholder: zh ? "输入你的信息..." : "Enter your message...",
      seen: zh ? "已读" : "Seen",
      from: zh ? "来自" : "from",
      online: zh ? "在线" : "Online",
      offline: zh ? "离线" : "Away",
      attach: zh ? "附件即将推出" : "Attachments coming soon",
      empty: zh ? "发一条消息开始对话" : "Send a message to start",
      minimize: zh ? "收起" : "Minimize",
      emoji: zh ? "表情" : "Emoji",
      jump: zh ? "回到最新" : "Jump to latest",
      brand: zh ? "由 <b>ConnectBot</b> 提供" : "We run on <b>ConnectBot</b>",
    };
  }

  // "auto" follows the page the widget is embedded in rather than the
  // visitor's browser: the host declares its language in <html lang>, which is
  // also what a site's own language switcher updates. The browser locale is
  // only the fallback for pages that declare nothing.
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
    return "default";
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

  function linkify(s) {
    return escapeHtml(s).replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
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
      ".who{flex:1;min-width:0;}",
      ".who b{display:block;font:700 15px/1.25 system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".who span{display:block;font:400 12px/1.35 system-ui;opacity:.85;}",
      ".min{width:32px;height:32px;border:0;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;border-radius:9px;display:flex;align-items:center;justify-content:center;}",
      ".min:hover{background:rgba(255,255,255,.24);}",
      ".min svg{width:20px;height:20px;fill:currentColor;}",
      ".mid{position:relative;flex:1;min-height:0;display:flex;background:#f7f8fa;}",
      // overscroll-behavior stops the wheel/touch from chaining to the host
      // page once the thread hits an edge. The scrollbar is styled so the
      // thread reads as scrollable.
      ".msgs{flex:1;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:16px 14px 12px;display:flex;flex-direction:column;gap:10px;}",
      ".msgs::-webkit-scrollbar{width:6px;}",
      ".msgs::-webkit-scrollbar-thumb{background:rgba(15,23,42,.18);border-radius:999px;}",
      ".msgs::-webkit-scrollbar-track{background:transparent;}",
      ".time{align-self:center;background:#e8eaef;color:#64748b;font:500 11px/1 system-ui;padding:5px 9px;border-radius:999px;}",
      ".row{display:flex;gap:8px;align-items:flex-end;max-width:88%;}",
      ".row.me{align-self:flex-end;flex-direction:row-reverse;}",
      ".row .av{width:24px;height:24px;font-size:10px;background:#e2e8f0;color:#334155;}",
      ".bubble{padding:11px 14px;border-radius:16px;font:400 15px/1.5 system-ui;color:#0f172a;background:#e9edf2;word-break:break-word;white-space:pre-wrap;}",
      ".row.me .bubble{background:" + color + ";color:#fff;border-bottom-right-radius:5px;}",
      ".row.them .bubble{border-bottom-left-radius:5px;}",
      ".bubble a{color:inherit;text-decoration:underline;}",
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
      // Full screen on phones, respecting notches and home bars. The 16px
      // input font stops iOS from zooming the page when the field is focused.
      "@media(max-width:520px){",
      ".panel{right:0;left:0;bottom:0;width:100%;min-height:0;height:100%;height:100dvh;border-radius:0;}",
      ".head{padding-top:calc(12px + env(safe-area-inset-top,0px));}",
      ".foot{padding-bottom:calc(8px + env(safe-area-inset-bottom,0px));}",
      "textarea{font-size:16px;}",
      ".fab{right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));}",
      "}",
    ].join("");
  };

  var ICONS = {
    chat: '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>',
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
    document.body.appendChild(host);

    var style = document.createElement("style");
    shadow.appendChild(style);

    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<button class="fab" type="button">' + ICONS.chat + '<span class="badge" hidden>0</span></button>' +
      '<div class="panel">' +
        '<div class="head">' +
          '<div class="chip">' + ICONS.chat + "<span></span></div>" +
          '<div class="agent">' +
            '<div class="av">C<span class="dot"></span></div>' +
            '<div class="who"><b></b><span></span></div>' +
            '<button class="min" type="button">' + ICONS.min + "</button>" +
          "</div>" +
        "</div>" +
        '<div class="mid">' +
          '<div class="msgs"></div>' +
          '<button class="jump" type="button" hidden>' + ICONS.down + "</button>" +
        "</div>" +
        '<div class="foot">' +
          '<div class="box">' +
            '<textarea rows="1"></textarea>' +
            '<div class="row2">' +
              '<div class="tools">' +
                '<button class="icon smile" type="button">' + ICONS.smile + "</button>" +
                '<button class="icon clip" type="button">' + ICONS.clip + "</button>" +
              "</div>" +
              '<button class="send" type="button">' + ICONS.send + "</button>" +
            "</div>" +
          "</div>" +
          '<a class="brand" href="' + REPO_URL + '" target="_blank" rel="noopener noreferrer"></a>' +
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
        welcomeMessage: "",
        online: false,
        locale: "auto",
        enabled: true,
      },
      lastReadAt: null,
      stopped: false,
      emojiOpen: false,
    };

    function teardown() {
      state.stopped = true;
      if (langObserver) langObserver.disconnect();
      document.removeEventListener("pointerdown", onDocPointerDown, true);
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

    function applyTheme() {
      style.textContent = css(state.config.color || "#1972F5");
      avEl.firstChild.textContent = initials(state.config.agentName);
      nameEl.textContent = state.config.agentName + " " + T.from + " " + state.config.name;
      subEl.textContent = state.config.online ? T.online : T.offline;
      dotEl.classList.toggle("off", !state.config.online);
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

    // The host page may switch language at runtime, so the bubble tracks
    // <html lang> while the owner keeps the widget on "auto".
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

    function unreadCount() {
      var n = 0;
      var i;
      for (i = 0; i < state.messages.length; i++) {
        if (state.messages[i].author === "visitor") continue;
        n++;
      }
      if (!state.lastReadAt) return n;
      var t = new Date(state.lastReadAt).getTime();
      n = 0;
      for (i = 0; i < state.messages.length; i++) {
        var m = state.messages[i];
        if (m.author !== "visitor" && new Date(m.createdAt).getTime() > t) n++;
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
     * The DOM is only touched when the markup actually changed, and the
     * viewport is restored unless the reader was already at the end (or just
     * sent something) — so polling never yanks the reader mid-scroll.
     */
    function render(force) {
      var html = [];
      var list = state.messages.slice();
      if (list.length === 0 && state.config.welcomeMessage) {
        list = [{ id: "welcome", author: "bot", text: state.config.welcomeMessage, createdAt: new Date().toISOString() }];
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
        if (!mine) html.push('<div class="aname">' + escapeHtml(state.config.agentName) + "</div>");
        html.push(
          '<div class="row ' + (mine ? "me" : "them") + '">' +
            (mine ? "" : '<div class="av">' + escapeHtml(initials(state.config.agentName)) + "</div>") +
            '<div class="bubble">' + linkify(m.text) + "</div>" +
          "</div>"
        );
        if (mine && i === list.length - 1 && state.lastReadAt) {
          html.push('<div class="meta">✓✓ ' + T.seen + "</div>");
        }
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
      updateJump();
      updateBadge();
    }

    function mergeMessages(incoming) {
      var map = {};
      for (var i = 0; i < state.messages.length; i++) map[state.messages[i].id] = state.messages[i];
      for (i = 0; i < incoming.length; i++) map[incoming[i].id] = incoming[i];
      state.messages = Object.keys(map)
        .map(function (k) { return map[k]; })
        .sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
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
        var after = state.messages.length ? state.messages[state.messages.length - 1].createdAt : "";
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
        if (data.message) mergeMessages([data.message]);
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
      fab.innerHTML = ICONS.close;
      updateBadge();
      render(true);
      ensureSession().then(function () {
        if (!state.stopped) input.focus();
      });
    }

    function closePanel() {
      state.open = false;
      panel.classList.remove("open");
      fab.innerHTML = ICONS.chat + '<span class="badge" hidden>0</span>';
      badge = wrap.querySelector(".badge");
      updateBadge();
      hideEmoji();
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
    sendBtn.addEventListener("click", send);
    input.addEventListener("input", function () {
      resize();
      sendBtn.classList.toggle("on", !!(input.value || "").trim());
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
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
    boot(siteIdFromPage());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
