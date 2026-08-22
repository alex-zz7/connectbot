import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConnectBot — self-hosted live chat",
  description:
    "Open-source live chat for your website: one embeddable widget, one admin console, optional AI auto-reply. Self-hosted on your own Postgres.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
