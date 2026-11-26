"use client"

import { XIcon } from "@phosphor-icons/react"
import { Dialog as Primitive } from "radix-ui"
import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

export const Dialog = Primitive.Root
export const DialogTrigger = Primitive.Trigger
export const DialogClose = Primitive.Close

interface DialogContentProps extends ComponentProps<typeof Primitive.Content> {
  title: string
  description?: ReactNode
}

/** Centered modal with a required title for screen readers. Inherits the theme of the app root. */
export function DialogContent({
  title,
  description,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
      <Primitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg -translate-1/2 gap-5 border border-border bg-card p-6 text-card-foreground duration-quick chamfer data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in",
          className,
        )}
        {...props}
      >
        <div className="grid gap-1 pr-8">
          <Primitive.Title className="text-lg font-semibold tracking-heading">
            {title}
          </Primitive.Title>
          {description ? (
            <Primitive.Description className="text-sm text-muted-foreground">
              {description}
            </Primitive.Description>
          ) : null}
        </div>
        {children}
        <Primitive.Close
          aria-label="Close"
          className="absolute top-4 right-4 grid size-8 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors duration-quick hover:bg-accent hover:text-foreground"
        >
          <XIcon className="size-4" />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  )
}
