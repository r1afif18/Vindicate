import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Oxanium } from "next/font/google"
import { headers } from "next/headers"

import { CspNonce } from "@/components/csp-nonce"

import "./globals.css"

const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" })
const display = Oxanium({ subsets: ["latin"], variable: "--font-oxanium", display: "swap" })
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" })

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vindicate.app"
const SITE_NAME = "Vindicate"
const SITE_DESCRIPTION =
  "Move what is left in a compromised BNB Chain wallet to a safe one in a single transaction, before a drainer or sweeper bot takes it. Keys never leave your browser."

export const metadata: Metadata = {
  title: { default: "Vindicate | Rescue a Drained BNB Chain Wallet", template: "%s | Vindicate" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  referrer: "no-referrer",
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, address: false, email: false },
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  keywords: [
    "BNB Chain",
    "wallet rescue",
    "drained wallet",
    "sweeper bot",
    "EIP-7702",
    "token recovery",
    "crypto wallet",
    "BNB",
    "BSC",
    "drainer",
    "approval revoke",
    "wallet security",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Vindicate | Rescue a Drained BNB Chain Wallet",
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vindicate | Rescue a Drained BNB Chain Wallet",
    description: SITE_DESCRIPTION,
  },
  other: {
    "google-site-verification": process.env.NEXT_PUBLIC_GSV ?? "",
  },
}

export const viewport: Viewport = {
  themeColor: "#04080b",
  colorScheme: "dark",
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the request makes every page render per request, which the nonce CSP needs
  // (see src/proxy.ts).
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body>
        <CspNonce nonce={nonce} />
        {children}
      </body>
    </html>
  )
}
