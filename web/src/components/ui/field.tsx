import { Label as LabelPrimitive } from "radix-ui"
import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn("text-sm font-medium text-foreground select-none", className)}
      {...props}
    />
  )
}

interface FieldProps {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}

/** Label, control, then either the error or the hint. The control must use `id` and `aria-describedby`. */
export function Field({ id, label, hint, error, children, className }: FieldProps) {
  return (
    <div data-slot="field" className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-message`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-message`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
