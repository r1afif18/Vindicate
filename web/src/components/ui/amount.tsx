import { type VariantProps, cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const amountVariants = cva("font-mono tabular-nums", {
  variants: {
    size: { xs: "text-xs", sm: "text-sm", base: "text-base", lg: "text-lg" },
    tone: { default: "text-foreground", muted: "text-muted-foreground", success: "text-success" },
  },
  defaultVariants: { size: "sm", tone: "default" },
})

interface AmountProps extends VariantProps<typeof amountVariants> {
  /** A formatted number such as "1,240.5" (see lib/format). */
  value: string
  sign?: "+" | "−"
  unit?: string
  className?: string
}

/** Tabular figure with the fraction dimmed, so the part that matters reads first. */
export function Amount({ value, sign, unit, size, tone, className }: AmountProps) {
  const [whole, fraction] = value.split(".")
  return (
    <span className={cn(amountVariants({ size, tone }), className)}>
      {sign}
      {whole}
      {fraction ? <span className="opacity-50">.{fraction}</span> : null}
      {unit ? <span className="ml-1 opacity-50">{unit}</span> : null}
    </span>
  )
}
