import { LOGO_PATHS, LOGO_VIEWBOX } from "@/components/brand/logo"
import { cn } from "@/lib/utils"

const round = (v: number) => Math.round(v * 100) / 100

/** Corner points of a flat-topped-sideways hexagon: the outline of a cube seen on its corner. */
function hexPoints(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    return [round(cx + r * Math.cos(angle)), round(cy + r * Math.sin(angle))] as const
  })
}

/**
 * The mark as a wireframe: a cube on its corner draws the same hexagon as the shield, so the
 * vault is a cube's outline with the filled mark sitting inside it.
 */
export function IsoVault({ className }: { className?: string }) {
  const outer = hexPoints(100, 100, 78)
  const [top, , rightLow, , leftLow] = outer
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" className={cn("fill-none", className)}>
      <circle cx="100" cy="100" r="96" className="stroke-foreground/10" strokeDasharray="2 6" />
      <polygon
        points={outer.map((p) => p.join(",")).join(" ")}
        className="fill-background/60 stroke-foreground/50"
        strokeWidth="1"
      />
      {/* The three edges that meet at the corner facing the viewer. */}
      {[top, rightLow, leftLow].map((p) =>
        p ? (
          <line
            key={p.join("-")}
            x1="100"
            y1="100"
            x2={p[0]}
            y2={p[1]}
            className="stroke-foreground/20"
            strokeWidth="1"
          />
        ) : null,
      )}
      <svg x="64" y="54" width="72" height="92" viewBox={LOGO_VIEWBOX} className="fill-primary">
        {LOGO_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </svg>
  )
}

export const RESCUE_KINDS = [
  { label: "Tokens", angle: -152 },
  { label: "BNB", angle: -118 },
  { label: "Airdrop claim", angle: -64 },
  { label: "Unstake", angle: -28 },
  { label: "NFTs (ERC-721)", angle: 18 },
  { label: "Items (ERC-1155)", angle: 54 },
  { label: "Token approvals", angle: 124 },
  { label: "NFT operators", angle: 160 },
] as const

/**
 * Everything one rescue can carry, drawn as spokes into a single hub: the one transaction.
 * Labels are real text, so the diagram can be read by a screen reader as a list.
 */
export function RescueMapDiagram({ className }: { className?: string }) {
  const [cx, cy] = [400, 250]
  return (
    <svg
      viewBox="0 0 800 500"
      role="img"
      aria-label="One transaction in the middle, connected to everything it can rescue: tokens, BNB, an airdrop claim, an unstake, NFTs, ERC-1155 items, token approvals and NFT operators."
      className={cn("h-auto w-full fill-none", className)}
    >
      <circle cx={cx} cy={cy} r="232" className="stroke-primary/25" />
      <circle cx={cx} cy={cy} r="150" className="stroke-primary/15" />
      <circle cx={cx} cy={cy} r="70" className="fill-primary/5 stroke-primary/30" />
      {RESCUE_KINDS.map((s) => {
        const rad = (s.angle * Math.PI) / 180
        const x = round(cx + 196 * Math.cos(rad))
        const y = round(cy + 196 * Math.sin(rad))
        const width = s.label.length * 6.4 + 14
        return (
          <g key={s.label}>
            <line
              x1={round(cx + 46 * Math.cos(rad))}
              y1={round(cy + 46 * Math.sin(rad))}
              x2={x}
              y2={y}
              className="stroke-foreground/40"
              strokeDasharray="3 4"
            />
            <rect
              x={round(x - width / 2)}
              y={y - 11}
              width={round(width)}
              height="22"
              className="fill-background stroke-foreground/60"
            />
            <text
              x={x}
              y={y + 4}
              textAnchor="middle"
              className="fill-foreground text-xs font-medium"
            >
              {s.label}
            </text>
          </g>
        )
      })}
      <svg x={cx - 44} y={cy - 44} width="88" height="88" viewBox="0 0 200 200">
        <polygon
          points={hexPoints(100, 100, 90)
            .map((p) => p.join(","))
            .join(" ")}
          className="fill-background stroke-primary"
          strokeWidth="2"
        />
        <svg x="62" y="50" width="76" height="100" viewBox={LOGO_VIEWBOX} className="fill-primary">
          {LOGO_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </svg>
    </svg>
  )
}

/** The copilot's boundary: the chain and a model on one side of the line, the signer on the other. */
export function CopilotDiagram({ className }: { className?: string }) {
  const stages = [
    { x: 110, label: "Chain history" },
    { x: 290, label: "Menu of steps" },
    { x: 470, label: "Model picks" },
    { x: 650, label: "You sign" },
  ] as const
  return (
    <svg
      viewBox="0 0 760 420"
      role="img"
      aria-label="The copilot reads chain history, code builds a menu of steps, a model picks from the menu, and you sign."
      className={cn("h-auto w-full fill-none", className)}
    >
      <line x1="0" y1="210" x2="760" y2="210" className="stroke-foreground/15" />
      <line
        x1="560"
        y1="40"
        x2="560"
        y2="380"
        className="stroke-primary/50"
        strokeDasharray="4 6"
      />
      <text x="548" y="56" textAnchor="end" className="fill-muted-foreground text-xs">
        addresses and your note
      </text>
      <text x="572" y="56" className="fill-primary text-xs">
        your key
      </text>
      {stages.map((s, i) => (
        <g key={s.label}>
          <circle cx={s.x} cy="210" r="46" className="stroke-foreground/15" strokeDasharray="2 5" />
          <polygon
            points={hexPoints(s.x, 210, 28)
              .map((p) => p.join(","))
              .join(" ")}
            className={
              i === stages.length - 1
                ? "fill-primary/15 stroke-primary"
                : "fill-background stroke-foreground/60"
            }
          />
          <text
            x={s.x}
            y="215"
            textAnchor="middle"
            className="fill-foreground font-mono text-xs tabular-nums"
          >
            {String(i + 1).padStart(2, "0")}
          </text>
          <rect
            x={round(s.x - (s.label.length * 6.4 + 14) / 2)}
            y="278"
            width={round(s.label.length * 6.4 + 14)}
            height="22"
            className="fill-background stroke-foreground/60"
          />
          <text x={s.x} y="293" textAnchor="middle" className="fill-foreground text-xs font-medium">
            {s.label}
          </text>
          {i < stages.length - 1 ? (
            <line
              x1={s.x + 34}
              y1="210"
              x2={s.x + 146}
              y2="210"
              className="stroke-foreground/50"
              strokeDasharray="3 4"
            />
          ) : null}
        </g>
      ))}
    </svg>
  )
}
