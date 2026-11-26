import { type VariantProps, cva } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

const fieldVariants = cva(
  "w-full min-w-0 border border-input bg-background px-3 text-base text-foreground tactile-recessed transition duration-quick ease-out-quart outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/15 md:text-sm",
  {
    variants: {
      /** `mono` for addresses, keys and calldata. */
      font: { sans: "font-sans", mono: "font-mono" },
      /** `end` leaves room for an icon button inside the right edge. */
      adornment: { none: "", end: "pr-11" },
    },
    defaultVariants: { font: "sans", adornment: "none" },
  },
)

type FieldVariants = VariantProps<typeof fieldVariants>

export function Input({
  className,
  font,
  adornment,
  ...props
}: ComponentProps<"input"> & FieldVariants) {
  return (
    <input
      data-slot="input"
      className={cn(fieldVariants({ font, adornment }), "h-10", className)}
      {...props}
    />
  )
}

export function Textarea({
  className,
  font,
  ...props
}: ComponentProps<"textarea"> & Omit<FieldVariants, "adornment">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldVariants({ font }), "min-h-24 resize-y py-2", className)}
      {...props}
    />
  )
}
