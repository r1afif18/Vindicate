import { type VariantProps, cva } from "class-variance-authority"
import { Slot } from "radix-ui"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 font-medium whitespace-nowrap transition duration-quick ease-out-quart select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** The one main action on a screen. Brand cyan, cut corners. */
        primary:
          "bg-primary text-primary-foreground tactile-primary chamfer-sm hover:brightness-110",
        secondary:
          "bg-secondary text-secondary-foreground tactile-raised chamfer-sm hover:brightness-105",
        outline:
          "border border-input bg-card text-foreground tactile-raised hover:border-primary/60 hover:bg-accent",
        ghost: "bg-transparent text-foreground hover:bg-accent",
        danger: "bg-destructive text-destructive-foreground chamfer-sm hover:bg-destructive/85",
        link: "text-foreground underline decoration-input underline-offset-4 hover:decoration-primary",
      },
      size: {
        sm: "h-8 px-3.5 text-sm [&_svg]:size-4",
        md: "h-10 px-5 text-sm [&_svg]:size-4.5",
        lg: "h-12 px-7 text-base [&_svg]:size-5",
        icon: "size-9 [&_svg]:size-4.5",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
)

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { buttonVariants }
