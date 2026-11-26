"use client"

import { ArrowUpRightIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { Logo } from "@/components/brand/logo"

const links = [
  { href: "/#rescue", label: "The rescue" },
  { href: "/#process", label: "Process" },
  { href: "/#copilot", label: "Copilot" },
  { href: "/#security", label: "Security" },
  { href: "/#faq", label: "FAQ" },
] as const

/**
 * Floats over the stage, and above the opening curtain, so the way into the app is there from
 * the first frame. It only takes on a surface once the page has scrolled under it.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  return (
    <header
      data-scrolled={scrolled}
      className="fixed inset-x-0 top-0 z-50 border-b border-transparent transition-colors duration-slow data-[scrolled=true]:border-border data-[scrolled=true]:bg-background/70 data-[scrolled=true]:backdrop-blur-md"
    >
      <div className="relative flex h-16 items-center justify-between gap-6 px-5 md:px-8">
        <Link href="/" aria-label="Vindicate home" className="flex items-center gap-2.5">
          <Logo className="h-7" />
          <span className="font-flow text-lg">Vindicate</span>
        </Link>
        <nav
          aria-label="Main"
          className="pointer-events-none absolute inset-x-0 hidden items-center justify-center gap-7 text-sm text-foreground/80 lg:flex"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="pointer-events-auto transition-colors duration-quick hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/app"
          className="group inline-flex items-center gap-2 border-b border-primary pb-0.5 font-medium text-primary transition-colors duration-quick hover:border-foreground hover:text-foreground"
        >
          Launch app
          <ArrowUpRightIcon
            weight="bold"
            className="size-4 transition-transform duration-quick group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </Link>
      </div>
    </header>
  )
}
