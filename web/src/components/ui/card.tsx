import { type VariantProps, cva } from "class-variance-authority"
import type { ComponentProps } from "react"

import { BorderBeam } from "@/components/effects/border-beam"
import { cn } from "@/lib/utils"

/** The outer layer is the outline: a 1px inset of a chamfered plate in the border color. */
const frameVariants = cva("p-px transition-colors duration-base chamfer", {
  variants: {
    /** `draft` for a plan not yet sent, `active` while it is in flight, `success` once mined. */
    status: {
      default: "bg-border",
      draft: "bg-input",
      active: "bg-primary",
      success: "bg-success",
    },
  },
  defaultVariants: { status: "default" },
})

export function Card({
  className,
  status,
  beam = false,
  children,
  ...props
}: ComponentProps<"section"> &
  VariantProps<typeof frameVariants> & {
    /** A light that travels along the outline, for work in progress. */
    beam?: boolean
  }) {
  return (
    <section data-slot="card" className={cn(frameVariants({ status }), className)} {...props}>
      {beam ? (
        <BorderBeam
          size={120}
          duration={3}
          colorFrom="var(--primary)"
          colorTo="transparent"
          borderWidth={1}
        />
      ) : null}
      <div className="flex h-full flex-col bg-card text-card-foreground tactile-raised chamfer">
        {children}
      </div>
    </section>
  )
}

export function CardHeader({ className, ...props }: ComponentProps<"header">) {
  return (
    <header
      data-slot="card-header"
      className={cn("flex items-start justify-between gap-4 p-5 pb-0", className)}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2 data-slot="card-title" className={cn("text-base font-semibold", className)} {...props} />
  )
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm text-pretty text-muted-foreground", className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("grid gap-5 p-5", className)} {...props} />
}
