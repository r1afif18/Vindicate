"use client"

import { RadioGroup as RadioGroupPrimitive } from "radix-ui"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

export function RadioGroup({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  )
}

/** A whole-card radio option. Content goes in children. */
export function RadioCard({
  className,
  children,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-card"
      className={cn(
        "group flex cursor-pointer items-start gap-3 border border-border bg-muted p-4 text-left transition duration-quick ease-out-quart hover:border-input disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full border border-input transition-colors duration-instant group-data-[state=checked]:border-primary">
        <RadioGroupPrimitive.Indicator className="size-2.5 animate-in rounded-full bg-primary duration-instant zoom-in-50" />
      </span>
      <span className="grid gap-1">{children}</span>
    </RadioGroupPrimitive.Item>
  )
}
