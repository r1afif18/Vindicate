import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** A small boxed label: section names, step names, diagram captions. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center border border-foreground/60 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A text link that reads as the action: underlined, with an arrow that leans out on hover. */
export function ArrowLink({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "group inline-flex w-fit items-center gap-2 border-b border-current pb-0.5 font-medium transition-colors duration-quick",
        className,
      )}
    >
      {children}
    </span>
  )
}
