import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Rescue App",
  description:
    "Scan a compromised BNB Chain wallet, choose assets to save, and move them to safety in one transaction.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/app" },
}

export default function DappLayout({ children }: LayoutProps<"/">) {
  return children
}
