import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  WarningOctagonIcon,
} from "@phosphor-icons/react/dist/ssr"
import { type VariantProps, cva } from "class-variance-authority"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const noticeVariants = cva(
  "flex gap-3 border p-4 text-sm chamfer-sm [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        info: "border-border bg-muted text-foreground [&_svg]:text-muted-foreground",
        success: "border-success/30 bg-success/8 text-foreground [&_svg]:text-success",
        warning: "border-warning/30 bg-warning/8 text-foreground [&_svg]:text-warning",
        danger: "border-destructive/30 bg-destructive/8 text-foreground [&_svg]:text-destructive",
      },
    },
    defaultVariants: { tone: "info" },
  },
)

const icons = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: WarningIcon,
  danger: WarningOctagonIcon,
}

interface NoticeProps extends VariantProps<typeof noticeVariants> {
  title?: ReactNode
  children?: ReactNode
  className?: string
}

/** Inline status message. Danger and warning are announced to screen readers. */
export function Notice({ tone = "info", title, children, className }: NoticeProps) {
  const Icon = icons[tone ?? "info"]
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn(noticeVariants({ tone }), className)}
    >
      <Icon />
      <div className="grid gap-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  )
}
