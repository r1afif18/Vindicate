import { type VariantProps, cva } from "class-variance-authority"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const chipVariants = cva("inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-xs", {
  variants: {
    tone: {
      neutral: "border-border text-muted-foreground",
      live: "border-primary/30 text-primary",
      success: "border-success/30 text-success",
      danger: "border-destructive/30 text-destructive",
    },
  },
  defaultVariants: { tone: "neutral" },
})

/** Small status tag with an optional dot. Mono, for machine states only. */
export function Chip({
  tone,
  dot = false,
  children,
  className,
}: VariantProps<typeof chipVariants> & { dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn(chipVariants({ tone }), className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}
