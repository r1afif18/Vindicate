"use client"

import { PlusIcon } from "@phosphor-icons/react/dist/ssr"
import { Accordion as AccordionPrimitive } from "radix-ui"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

export function Accordion({ className, ...props }: ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root className={cn("border-t border-border", className)} {...props} />
}

export function AccordionItem({
  className,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item className={cn("border-b border-border", className)} {...props} />
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          "group flex flex-1 cursor-pointer items-center justify-between gap-6 py-5 text-left text-lg font-medium tracking-heading",
          className,
        )}
        {...props}
      >
        {children}
        <PlusIcon className="size-5 shrink-0 text-muted-foreground transition-transform duration-base ease-out-quart group-data-[state=open]:rotate-45" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

export function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cn("max-w-prose pb-6 text-muted-foreground", className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}
