import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { Logo } from "@/components/brand/logo"
import { ArrowLink } from "@/components/marketing/tag"

const navigation = [
  { href: "/#home", label: "Home" },
  { href: "/#rescue", label: "The rescue" },
  { href: "/#process", label: "Process" },
  { href: "/#copilot", label: "Copilot" },
  { href: "/#security", label: "Security" },
  { href: "/#faq", label: "FAQ" },
] as const

export function SiteFooter() {
  return (
    <footer className="relative bg-background/80 px-5 backdrop-blur-md md:px-8">
      <div className="mx-auto grid max-w-page gap-12 border-t border-foreground/10 py-16 md:grid-cols-12">
        <div className="grid content-start gap-5 md:col-span-6">
          <span className="flex items-center gap-2.5">
            <Logo className="h-7" />
            <span className="font-flow text-lg">Vindicate</span>
          </span>
          <p className="max-w-xs text-sm text-pretty text-muted-foreground">
            Rescue tooling for BNB Chain. Vindicate never sees your keys and cannot move your assets
            without your signature.
          </p>
          <Link href="/app" className="text-primary hover:text-foreground">
            <ArrowLink>
              Launch app
              <ArrowUpRightIcon weight="bold" className="size-4" />
            </ArrowLink>
          </Link>
        </div>
        <nav aria-label="Footer" className="grid content-start gap-3 text-sm md:col-span-3">
          <p className="text-xs text-muted-foreground">Navigation</p>
          {navigation.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="w-fit transition-colors duration-quick hover:text-primary"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="grid content-start gap-3 text-sm md:col-span-3">
          <p className="text-xs text-muted-foreground">Project</p>
          <a
            href="https://github.com/r1afif18/Vindicate"
            className="w-fit transition-colors duration-quick hover:text-primary"
          >
            Source code
          </a>
          <Link href="/app" className="w-fit transition-colors duration-quick hover:text-primary">
            Rescue app
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-page border-t border-foreground/10 py-6 text-xs text-pretty text-muted-foreground">
        Experimental software that has not been independently audited. Testnet preview. Use at your
        own risk.
      </div>
    </footer>
  )
}
