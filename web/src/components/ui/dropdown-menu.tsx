"use client"

import { DropdownMenu as Primitive } from "radix-ui"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

export const DropdownMenu = Primitive.Root
export const DropdownMenuTrigger = Primitive.Trigger

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-56 border border-border bg-popover p-1 text-popover-foreground chamfer-sm data-[side=bottom]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  )
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm outline-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-highlighted:bg-accent",
        className,
      )}
      {...props}
    />
  )
}
