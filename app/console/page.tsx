import type { Metadata } from "next";
import { Console } from "@/components/console";

export const metadata: Metadata = {
  title: "ConnectBot console",
  robots: { index: false, follow: false },
};

export default function ConsolePage() {
  return <Console />;
}
