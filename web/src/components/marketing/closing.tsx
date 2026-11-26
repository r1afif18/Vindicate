import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { ArrowLink } from "@/components/marketing/tag"

export function Closing() {
  return (
    <section className="relative overflow-hidden px-5 md:px-8">
      <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-foreground/10" />
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 hidden w-px bg-foreground/10 md:block"
      />
      <div className="relative mx-auto grid max-w-page justify-items-center gap-10 py-32 text-center md:py-44">
        <h2 className="max-w-2xl bg-background/70 px-4 font-flow text-4xl leading-none text-balance md:text-5xl">
          Still something left? Move it now.
        </h2>
        <Link
          href="/app"
          className="bg-background/70 px-3 text-xl text-primary hover:text-foreground"
        >
          <ArrowLink>
            Start a rescue
            <ArrowUpRightIcon
              weight="bold"
              className="size-5 transition-transform duration-quick group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </ArrowLink>
        </Link>
      </div>
    </section>
  )
}
