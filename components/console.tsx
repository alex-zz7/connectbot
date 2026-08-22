"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Loader2,
  LogOut,
  Menu,
  Send,
  Settings,
  Trash2,
  X,
} from "lucide-react";

type Conversation = {
  id: string;
  visitorName: string;
  visitorEmail?: string;
  visitorAvatar?: string;
  pageUrl?: string;
  lastMessagePreview: string;
  lastMessageAt?: string;
  unread: number;
};

type Message = { id: string; author: string; text: string; createdAt: string };

type Site = {
  publicId: string;
  name: string;
  color: string;
  agentName: string;
  welcomeMessage: string;
  aiEnabled: boolean;
  aiPrompt: string;
  aiConfigured: boolean;
  locale: string;
  enabled: boolean;
  snippet: string;
};

function initials(name: string) {
  return (name || "V").trim().slice(0, 1).toUpperCase();
}

/** Anonymous visitors get a stable, readable handle derived from the conversation id. */
function visitorLabel(c: { id: string; visitorName: string }) {
  return c.visitorName || `Visitor ${c.id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

function VisitorAvatar({
  conversation,
  className,
}: {
  conversation: { visitorName: string; visitorAvatar?: string } | null;
  className?: string;
}) {
  const base = `w-7 h-7 rounded-full shrink-0 ${className || ""}`;
  if (conversation?.visitorAvatar) {
    return (
      // External visitor avatar; next/image would only proxy it.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={conversation.visitorAvatar}
        alt={conversation.visitorName || "Visitor"}
        className={`${base} object-cover ring-1 ring-border`}
      />
    );
  }
  return (
    <div
      className={`${base} bg-accent/15 flex items-center justify-center text-[11px] font-bold text-accent`}
    >
      {initials(conversation?.visitorName || "")}
    </div>
  );
}

function shortTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dividerLabel(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString([], { month: "long", day: "numeric", weekday: "short" });
  return `${day} ${timeOf(iso)}`;
}

/** New divider when the day changes or the conversation pauses for a while. */
function needsDivider(prev: Message | null, next: Message) {
  if (!prev) return true;
  const a = new Date(prev.createdAt);
  const b = new Date(next.createdAt);
  return b.toDateString() !== a.toDateString() || b.getTime() - a.getTime() > 30 * 60_000;
}

// ── Login ────────────────────────────────────────────────────────────────

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <h1 className="text-xl font-bold mb-1">ConnectBot console</h1>
        <p className="text-[13px] text-muted mb-5">
          Enter the admin password (the <code className="font-mono">ADMIN_PASSWORD</code> env var).
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm mb-3"
        />
        {error && <p className="text-[13px] text-danger mb-3">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent text-white px-4 py-2.5 text-sm font-semibold hover:bg-accent-hover disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Sign in
        </button>
      </form>
    </div>
  );
}

// ── Settings drawer ──────────────────────────────────────────────────────

const COLORS = ["#1972F5", "#07C160", "#111827", "#7C3AED", "#E11D48", "#0F766E"];

function SettingsPanel({
  site,
  onSaved,
  onClose,
}: {
  site: Site;
  onSaved: (next: Site) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(site.name);
  const [agentName, setAgentName] = useState(site.agentName);
  const [color, setColor] = useState(site.color || "#1972F5");
  const [welcome, setWelcome] = useState(site.welcomeMessage);
  const [locale, setLocale] = useState(site.locale || "auto");
  const [enabled, setEnabled] = useState(site.enabled);
  const [aiEnabled, setAiEnabled] = useState(site.aiEnabled);
  const [aiPrompt, setAiPrompt] = useState(site.aiPrompt);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/livechat/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          agentName,
          color,
          welcomeMessage: welcome,
          locale,
          enabled,
          aiEnabled,
          aiPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(data.site);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (on: boolean, set: (v: boolean) => void) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => set(!on)}
      className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${on ? "bg-success" : "bg-border"}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-[left] ${on ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="flex-1 bg-black/40" onClick={onClose} aria-label="Close" />
      <aside className="w-full max-w-md h-full bg-background border-l border-border overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">Widget settings</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-border/40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <section className="rounded-2xl border border-border p-4 space-y-3">
            <h3 className="text-[13px] font-bold">Embed snippet</h3>
            <pre className="text-[12px] font-mono bg-card-elevated border border-border rounded-xl p-3 whitespace-pre-wrap break-all">
              {site.snippet}
            </pre>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-1.5 text-[12px] font-semibold hover:opacity-85"
              onClick={async () => {
                await navigator.clipboard.writeText(site.snippet);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy snippet"}
            </button>
          </section>

          <section className="rounded-2xl border border-border p-4 space-y-3">
            <h3 className="text-[13px] font-bold">Appearance</h3>
            <label className="block">
              <span className="text-[12px] font-semibold">Agent name</span>
              <input
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px]"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                maxLength={80}
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold">Shown as “from”</span>
              <input
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
              />
            </label>
            <div>
              <p className="text-[12px] font-semibold mb-2">Widget color</p>
              <div className="flex flex-wrap items-center gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
                <input
                  type="color"
                  value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#1972F5"}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                />
              </div>
            </div>
            <label className="block">
              <span className="text-[12px] font-semibold">Welcome message</span>
              <textarea
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] min-h-[64px]"
                value={welcome}
                onChange={(e) => setWelcome(e.target.value)}
                maxLength={500}
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold">Widget language</span>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px]"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
              >
                <option value="auto">Follow the page it sits on</option>
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-[14px] cursor-pointer pt-1">
              <span className="font-semibold">Widget is live</span>
              {toggle(enabled, setEnabled)}
            </label>
            <p className="text-[12px] text-muted leading-relaxed">
              Off means relay.js renders nothing for visitors — the snippet can stay on the site.
            </p>
          </section>

          <section className="rounded-2xl border border-border p-4 space-y-3">
            <h3 className="text-[13px] font-bold">AI auto-reply</h3>
            {!site.aiConfigured && (
              <p className="text-[12px] text-muted bg-card-elevated border border-border rounded-xl px-3 py-2">
                Set <code className="font-mono">OPENAI_API_KEY</code> on the server to enable AI
                replies (any OpenAI-compatible API works via{" "}
                <code className="font-mono">OPENAI_BASE_URL</code>).
              </p>
            )}
            <label className="flex items-center justify-between gap-3 text-[14px] cursor-pointer">
              <span>AI replies until you join the conversation</span>
              {toggle(aiEnabled, setAiEnabled)}
            </label>
            {aiEnabled && (
              <label className="block">
                <span className="text-[12px] font-semibold">Extra instructions for the AI</span>
                <textarea
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] min-h-[80px]"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  maxLength={4000}
                  placeholder="e.g. We sell Acme. Never invent pricing. Hand off billing questions."
                />
              </label>
            )}
          </section>

          {error && (
            <p className="text-[13px] text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-accent text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-60"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </form>
      </aside>
    </div>
  );
}

// ── Console ──────────────────────────────────────────────────────────────

export function Console() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadInbox = useCallback(async () => {
    const res = await fetch("/api/livechat/inbox");
    if (!res.ok) return;
    const data = await res.json();
    setConversations(data.conversations || []);
  }, []);

  // Auth probe + initial load. A 401 on settings means "show the login form".
  useEffect(() => {
    if (authed === false) return;
    let live = true;
    Promise.all([fetch("/api/livechat/settings"), fetch("/api/livechat/inbox")])
      .then(async ([settingsRes, inboxRes]) => {
        if (!live) return;
        if (settingsRes.status === 401) {
          setAuthed(false);
          return;
        }
        setAuthed(true);
        const settings = settingsRes.ok ? await settingsRes.json() : null;
        const inbox = inboxRes.ok ? await inboxRes.json() : null;
        if (settings?.site) setSite(settings.site);
        if (inbox) {
          const convos = (inbox.conversations || []) as Conversation[];
          setConversations(convos);
          if (convos[0]) setActiveId((cur) => cur ?? convos[0].id);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [authed]);

  // Inbox long-poll: refresh the conversation list when anything moves.
  useEffect(() => {
    if (!authed) return;
    const ac = new AbortController();
    let since = new Date(0).toISOString();
    async function loop() {
      await loadInbox();
      while (!ac.signal.aborted) {
        try {
          const res = await fetch(
            `/api/livechat/inbox?wait=1&since=${encodeURIComponent(since)}`,
            { signal: ac.signal },
          );
          if (!res.ok) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          const data = await res.json();
          const convos = (data.conversations || []) as Conversation[];
          setConversations(convos);
          const newest = convos[0]?.lastMessageAt;
          if (newest) since = newest;
        } catch {
          if (ac.signal.aborted) return;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    loop();
    return () => ac.abort();
  }, [authed, loadInbox]);

  // Active thread long-poll.
  useEffect(() => {
    if (!authed || !activeId) return;
    const ac = new AbortController();
    let since = new Date(0).toISOString();
    async function pull(wait: boolean) {
      const q = wait
        ? `/api/livechat/inbox?id=${encodeURIComponent(activeId!)}&wait=1&since=${encodeURIComponent(since)}`
        : `/api/livechat/inbox?id=${encodeURIComponent(activeId!)}`;
      const res = await fetch(q, { signal: ac.signal });
      if (!res.ok) return;
      const data = await res.json();
      const next = (data.messages || []) as Message[];
      setMessages(next);
      since = next.length ? next[next.length - 1].createdAt : new Date().toISOString();
    }
    async function loop() {
      await pull(false);
      while (!ac.signal.aborted) {
        try {
          await pull(true);
        } catch {
          if (ac.signal.aborted) return;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    loop();
    return () => ac.abort();
  }, [authed, activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function sendReply() {
    const text = draft.trim();
    if (!text || !activeId) return;
    setDraft("");
    const res = await fetch("/api/livechat/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: activeId, text }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages || []);
    await loadInbox();
  }

  async function deleteConversation(id: string) {
    setConfirmDeleteId(null);
    const res = await fetch(`/api/livechat/inbox?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    const next = conversations.filter((c) => c.id !== id);
    setConversations(next);
    if (activeId === id) {
      setActiveId(next[0]?.id ?? null);
      setMessages([]);
    }
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    location.reload();
  }

  if (authed === false) {
    return <Login onDone={() => setAuthed(null)} />;
  }

  const active = conversations.find((c) => c.id === activeId) || null;

  const conversationList = (
    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
      {conversations.length === 0 && (
        <p className="text-xs text-muted/60 text-center mt-8 px-3 leading-relaxed">
          No conversations yet. Install the widget — the next visitor will show up here.
        </p>
      )}
      {conversations.map((c) => {
        const confirming = confirmDeleteId === c.id;
        const selectRow = () => {
          setActiveId(c.id);
          setRailOpen(false);
        };
        return (
          // A div, not a button: the delete affordance nests inside the row.
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={selectRow}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectRow();
              }
            }}
            onMouseLeave={() => {
              if (confirming) setConfirmDeleteId(null);
            }}
            className={`group w-full cursor-pointer text-left px-2.5 py-2 rounded-xl transition-colors ${
              activeId === c.id
                ? "bg-border/60 text-foreground"
                : "text-muted/80 hover:bg-border/30 hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-[13px] font-medium text-foreground">
                {visitorLabel(c)}
              </span>
              {!confirming && (
                <span className="text-[10px] text-muted/50 shrink-0 group-hover:hidden group-focus-within:hidden">
                  {shortTime(c.lastMessageAt)}
                </span>
              )}
              {c.unread > 0 && !confirming && (
                <span className="text-[10px] font-bold bg-accent text-white rounded-full min-w-4 h-4 px-1 text-center leading-4 group-hover:hidden group-focus-within:hidden">
                  {c.unread}
                </span>
              )}
              {confirming ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(c.id);
                  }}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md bg-danger/10 text-danger px-1.5 py-0.5 text-[10px] font-semibold hover:bg-danger/20"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(c.id);
                  }}
                  aria-label="Delete conversation"
                  className="hidden group-hover:flex group-focus-within:flex shrink-0 w-5 h-5 items-center justify-center rounded-md text-muted/60 hover:text-danger hover:bg-danger/10"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
            <p className="text-[12px] text-muted/70 truncate mt-0.5">{c.lastMessagePreview}</p>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {railOpen && (
          <div onClick={() => setRailOpen(false)} className="absolute inset-0 z-20 bg-black/20 lg:hidden" />
        )}

        <aside
          className={`${
            railOpen ? "flex absolute inset-y-0 left-0 z-30 w-64 max-w-[85%] shadow-xl" : "hidden"
          } lg:flex lg:static lg:w-64 xl:w-72 lg:shadow-none shrink-0 border-r border-border bg-background lg:bg-foreground/[0.02] flex-col`}
        >
          <div className="shrink-0 flex items-center gap-2 px-3.5 pt-3.5 pb-2">
            <span className="text-sm font-semibold leading-tight">ConnectBot</span>
            {site && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  site.enabled ? "text-success bg-success/10" : "text-muted bg-border/40"
                }`}
              >
                {site.enabled ? "Live" : "Paused"}
              </span>
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setRailOpen(false)}
              className="lg:hidden w-6 h-6 flex items-center justify-center rounded-lg text-muted/60 hover:text-foreground"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {conversationList}
          <div className="shrink-0 border-t border-border px-2 py-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex-1 inline-flex items-center gap-2 px-2.5 py-2 rounded-xl text-[13px] font-medium text-muted/80 hover:bg-border/30 hover:text-foreground"
            >
              <Settings className="w-4 h-4" />
              Settings & snippet
            </button>
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-muted/60 hover:text-foreground hover:bg-border/30"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          <header className="lg:hidden shrink-0 flex items-center gap-2.5 px-3 py-2.5 border-b border-border">
            <button
              type="button"
              onClick={() => setRailOpen(true)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/70 hover:text-foreground hover:bg-border/50 transition-colors shrink-0"
              aria-label="Inbox"
            >
              <Menu className="w-5 h-5" />
            </button>
            <p className="text-sm font-semibold truncate">
              {active ? visitorLabel(active) : "ConnectBot"}
            </p>
          </header>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : !activeId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-[13px] text-muted/70 max-w-[360px] leading-relaxed">
                {conversations.length === 0
                  ? "No conversations yet. Install the widget — the next visitor will show up here."
                  : "Select a conversation"}
              </p>
              {conversations.length === 0 && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-full bg-foreground text-background px-4 py-2 text-[13px] font-semibold hover:opacity-85"
                >
                  Get the embed snippet
                </button>
              )}
            </div>
          ) : (
            <>
              {active && (
                <div className="hidden lg:block shrink-0 border-b border-border/60 px-4 sm:px-6 py-2.5">
                  <div className="max-w-3xl mx-auto flex items-center gap-2.5 min-w-0">
                    <VisitorAvatar conversation={active} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold leading-tight truncate">
                        {visitorLabel(active)}
                      </p>
                      {(active.visitorEmail || active.pageUrl) && (
                        <p className="text-[11px] text-muted/60 leading-tight truncate">
                          {active.visitorEmail || active.pageUrl}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto py-5 px-4 sm:px-6">
                <div className="max-w-3xl mx-auto w-full space-y-1.5">
                  {messages.map((m, i) => {
                    const prev = i > 0 ? messages[i - 1] : null;
                    const mine = m.author !== "visitor";
                    const divider = needsDivider(prev, m) && (
                      <p className="text-center text-[11px] text-muted/50 pt-4 pb-2">
                        {dividerLabel(m.createdAt)}
                      </p>
                    );
                    if (mine) {
                      return (
                        <div key={m.id}>
                          {divider}
                          <div className="flex flex-col items-end">
                            <div className="max-w-[80%] sm:max-w-[72%] bg-foreground text-background rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                              {m.text}
                            </div>
                            <span className="text-[10px] text-muted/40 mt-0.5 mr-1">
                              {m.author === "bot" ? "AI · " : ""}
                              {timeOf(m.createdAt)}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={m.id}>
                        {divider}
                        <div className="flex gap-3">
                          <VisitorAvatar conversation={active} className="mt-0.5" />
                          <div className="flex flex-col items-start min-w-0 max-w-[80%] sm:max-w-[72%]">
                            <div className="bg-foreground/5 border border-border rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                              {m.text}
                            </div>
                            <span className="text-[10px] text-muted/40 mt-0.5 ml-1">{timeOf(m.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </div>

              <div className="px-4 sm:px-6 pb-4 pt-2 shrink-0">
                <form
                  className="max-w-3xl mx-auto relative flex items-end border border-border rounded-2xl bg-background shadow-sm focus-within:border-accent/50 focus-within:shadow-md transition-[border-color,box-shadow] duration-150 ease-out"
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendReply();
                  }}
                >
                  <input
                    className="flex-1 bg-transparent px-4 py-3 text-sm placeholder:text-muted/40 focus:outline-none"
                    placeholder="Write a reply…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <div className="flex items-end px-2 pb-2 shrink-0">
                    <button
                      type="submit"
                      disabled={!draft.trim()}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-foreground text-background hover:opacity-85 transition-opacity disabled:opacity-25 disabled:cursor-not-allowed"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </main>
      </div>

      {settingsOpen && site && (
        <SettingsPanel
          site={site}
          onSaved={(next) => setSite(next)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
