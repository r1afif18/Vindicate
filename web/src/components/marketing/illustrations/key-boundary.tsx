import { CloudIcon, CubeIcon, KeyIcon, SignatureIcon, XIcon } from "@phosphor-icons/react/dist/ssr"
import { useId } from "react"

import { GlowFilter, HexNode, RoundNode } from "@/components/marketing/illustrations/node-kit"

/** Where a key can go: it signs inside the tab; only the signed transaction leaves, never the key. */
export function KeyBoundary() {
  const glow = `glow-${useId().replace(/:/g, "")}`
  return (
    <svg
      viewBox="0 0 520 360"
      className="h-auto w-full"
      role="img"
      aria-label="The key signs inside the browser tab. Only the signed transaction goes to BNB Chain; the key goes to no server."
    >
      <defs>
        <GlowFilter id={glow} blur={18} />
      </defs>

      {/* Browser tab boundary. */}
      <rect
        x="20"
        y="40"
        width="300"
        height="280"
        strokeWidth="1"
        className="fill-card stroke-input"
      />
      <path d="M20 72 H320" strokeWidth="1" className="stroke-border" />
      {[38, 52, 66].map((x) => (
        <circle key={x} cx={x} cy="56" r="3.5" className="fill-accent" />
      ))}
      <text x="96" y="60" className="fill-muted-foreground font-mono text-xs">
        your browser tab
      </text>

      <path d="M170 178 V232" strokeWidth="1.5" className="stroke-primary" />
      <HexNode x={170} y={150} size={36} icon={KeyIcon} tone="core" glowId={glow} />
      <RoundNode x={170} y={258} size={22} icon={SignatureIcon} />
      <text x="170" y="206" textAnchor="middle" className="fill-muted-foreground text-xs">
        signs
      </text>

      {/* Allowed: the signed transaction to the chain. */}
      <path d="M192 258 H430" strokeWidth="1.5" className="stroke-primary" />
      <HexNode x={452} y={258} size={24} icon={CubeIcon} />
      <text x="452" y="304" textAnchor="middle" className="fill-muted-foreground text-xs">
        BNB Chain
      </text>

      {/* Blocked: anything to a server. */}
      <path
        d="M200 140 C 300 130, 360 110, 430 100"
        fill="none"
        strokeWidth="1"
        strokeDasharray="3 5"
        className="stroke-destructive"
      />
      <circle
        cx="330"
        cy="120"
        r="11"
        strokeWidth="1"
        className="fill-background stroke-destructive"
      />
      <XIcon x={322} y={112} width={16} height={16} weight="bold" className="text-destructive" />
      <RoundNode x={452} y={96} size={22} icon={CloudIcon} tone="alert" />
      <text x="452" y="140" textAnchor="middle" className="fill-muted-foreground text-xs">
        any server
      </text>
    </svg>
  )
}
