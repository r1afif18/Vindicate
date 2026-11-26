import { type VariantProps, cva } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

const skeletonVariants = cva("animate-shimmer bg-shimmer", {
  variants: { shape: { line: "", circle: "rounded-full" } },
  defaultVariants: { shape: "line" },
})

/** Loading placeholder. Size it with layout classes; it shimmers unless motion is reduced. */
export function Skeleton({
  className,
  shape,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof skeletonVariants>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(skeletonVariants({ shape }), className)}
      {...props}
    />
  )
}
