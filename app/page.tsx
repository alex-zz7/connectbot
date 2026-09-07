import { siteId } from "@/lib/db";

const REPO_URL = "https://github.com/alex-zz7/connectbot";

/**
 * Minimal home page. It embeds this deployment's own widget (bottom-right),
 * so opening the root URL doubles as a live test of the install.
 */
export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full">
        <h1 className="text-3xl font-bold tracking-tight mb-3">ConnectBot</h1>
        <p className="text-muted leading-relaxed mb-8">
          Self-hosted live chat. This page is running the widget — the bubble at
          the bottom-right talks to this very deployment. Messages land in the
          console.
        </p>

        <div className="space-y-3 text-sm">
          <a
            href="/console"
            className="block rounded-xl border border-border px-4 py-3 font-semibold hover:bg-card-elevated transition-colors"
          >
            Open the console →
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-border px-4 py-3 font-semibold hover:bg-card-elevated transition-colors"
          >
            Source & docs on GitHub →
          </a>
        </div>

        <div className="mt-10 rounded-xl bg-card-elevated border border-border p-4">
          <p className="text-xs font-semibold text-muted mb-2">
            Embed on any site
          </p>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all">
            {`<script src="https://your-domain.com/relay.js" data-site="${siteId()}" async></script>`}
          </pre>
        </div>

        <p className="mt-8 text-center text-xs text-muted/70">
          Open source (MIT) · made by the team behind{" "}
          <a href="https://sent2x.com?from=connectbot-home" className="underline hover:text-foreground">
            Sent2X
          </a>
          , an AI growth tool for X.
        </p>
      </div>

      {/* The exact snippet from the README, running on this very page. */}
      <script src="/relay.js" data-site={siteId()} async />
    </main>
  );
}
