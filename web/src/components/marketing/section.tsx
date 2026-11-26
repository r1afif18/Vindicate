import type { ReactNode } from "react"

import { Tag } from "@/components/marketing/tag"
import { cn } from "@/lib/utils"

interface SectionProps {
  id?: string
  /** The small boxed name above the heading. */
  label?: string
  title: ReactNode
  lead?: ReactNode
  children: ReactNode
  className?: string
  /** `split` puts the heading in a left column beside the content on wide screens. */
  layout?: "stacked" | "split"
}

/** A band of the page, floating over the stage: a hairline, a boxed name, a tight heading. */
export function Section({
  id,
  label,
  title,
  lead,
  children,
  className,
  layout = "stacked",
}: SectionProps) {
  return (
    <section id={id} className={cn("relative scroll-mt-16 px-5 md:px-8", className)}>
      <div className="mx-auto max-w-page border-t border-foreground/10 py-20 md:py-28">
        <div
          className={cn(
            layout === "split" ? "grid gap-12 lg:grid-cols-12" : "grid gap-12 md:gap-16",
          )}
        >
          <div
            className={cn(
              "grid content-start gap-5",
              layout === "split" ? "lg:col-span-4" : "max-w-3xl",
            )}
          >
            {label ? <Tag>{label}</Tag> : null}
            <h2 className="font-flow text-3xl leading-none text-balance md:text-4xl">{title}</h2>
            {lead ? <p className="max-w-prose text-pretty text-muted-foreground">{lead}</p> : null}
          </div>
          <div className={cn(layout === "split" && "lg:col-span-8")}>{children}</div>
        </div>
      </div>
    </section>
  )
}
