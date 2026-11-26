import type { Icon } from "@phosphor-icons/react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/*
 * Building blocks for the landing page's node diagrams. Everything paints with theme colors
 * through classes (fill-*, stroke-*, text-* with currentColor) so the lint rules hold.
 */

/** Pointy-top hexagon path centred on (cx, cy), matching the mark's silhouette. */
export function hexPath(cx: number, cy: number, r: number) {
  const points = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2
    return `${Math.round((cx + r * Math.cos(a)) * 100) / 100},${Math.round((cy + r * Math.sin(a)) * 100) / 100}`
  })
  return `M${points.join("L")}Z`
}

/** Soft halo filter. Reference with `filter={`url(#${id})`}`. */
export function GlowFilter({ id, blur = 10 }: { id: string; blur?: number }) {
  return (
    <filter id={id} x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation={blur} />
    </filter>
  )
}

interface NodeProps {
  x: number
  y: number
  size?: number
  icon: Icon
  /** `core` is the glowing brand node; `muted` is a quiet satellite; `alert` marks a threat. */
  tone?: "core" | "muted" | "alert"
  glowId?: string
}

/** Hexagonal node with an icon, used for wallets, contracts and threats. */
export function HexNode({
  x,
  y,
  size = 22,
  icon: IconComponent,
  tone = "muted",
  glowId,
}: NodeProps) {
  const iconSize = size * (tone === "core" ? 0.85 : 0.8)
  return (
    <g>
      {tone === "core" && glowId ? (
        <path
          d={hexPath(x, y, size * 1.15)}
          className="fill-primary opacity-50"
          filter={`url(#${glowId})`}
        />
      ) : null}
      <path
        d={hexPath(x, y, size)}
        strokeWidth="1"
        className={cn(
          tone === "core" && "fill-primary stroke-primary",
          tone === "muted" && "fill-card stroke-input",
          tone === "alert" && "fill-card stroke-destructive",
        )}
      />
      <IconComponent
        x={x - iconSize / 2}
        y={y - iconSize / 2}
        width={iconSize}
        height={iconSize}
        weight={tone === "core" ? "fill" : "regular"}
        className={cn(
          tone === "core"
            ? "text-primary-foreground"
            : tone === "alert"
              ? "text-destructive"
              : "text-muted-foreground",
        )}
      />
    </g>
  )
}

/** Round node, for people and wallets. */
export function RoundNode({
  x,
  y,
  size = 16,
  icon: IconComponent,
  tone = "muted",
  glowId,
}: NodeProps) {
  const iconSize = size * 1.05
  return (
    <g>
      {tone === "core" && glowId ? (
        <circle
          cx={x}
          cy={y}
          r={size * 1.3}
          className="fill-primary opacity-50"
          filter={`url(#${glowId})`}
        />
      ) : null}
      <circle
        cx={x}
        cy={y}
        r={size}
        strokeWidth="1"
        className={cn(
          tone === "core" && "fill-primary stroke-primary",
          tone === "muted" && "fill-card stroke-input",
          tone === "alert" && "fill-card stroke-destructive",
        )}
      />
      <IconComponent
        x={x - iconSize / 2}
        y={y - iconSize / 2}
        width={iconSize}
        height={iconSize}
        weight={tone === "core" ? "fill" : "regular"}
        className={cn(
          tone === "core"
            ? "text-primary-foreground"
            : tone === "alert"
              ? "text-destructive"
              : "text-muted-foreground",
        )}
      />
    </g>
  )
}

/** Connector between nodes. Dashed for links that may be cut, solid for active ones. */
export function Link({
  d,
  dashed = false,
  tone = "muted",
}: {
  d: string
  dashed?: boolean
  tone?: "muted" | "primary" | "alert"
}) {
  return (
    <path
      d={d}
      fill="none"
      strokeWidth="1"
      strokeDasharray={dashed ? "3 4" : undefined}
      className={cn(
        tone === "muted" && "stroke-input",
        tone === "primary" && "stroke-primary",
        tone === "alert" && "stroke-destructive",
      )}
    />
  )
}

/** Fixed-ratio SVG frame for a diagram. */
export function Diagram({
  viewBox,
  label,
  children,
  className,
}: {
  viewBox: string
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <svg viewBox={viewBox} role="img" aria-label={label} className={cn("h-auto w-full", className)}>
      {children}
    </svg>
  )
}
