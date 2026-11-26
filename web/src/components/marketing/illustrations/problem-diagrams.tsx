import {
  CoinsIcon,
  CurrencyBtcIcon,
  CurrencyDollarIcon,
  GasPumpIcon,
  ImageSquareIcon,
  LightningIcon,
  RobotIcon,
  SignatureIcon,
  SkullIcon,
  TreeStructureIcon,
  TrendDownIcon,
  WalletIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useId } from "react"

import {
  Diagram,
  GlowFilter,
  HexNode,
  Link,
  RoundNode,
} from "@/components/marketing/illustrations/node-kit"

function useGlowId() {
  return `glow-${useId().replace(/:/g, "")}`
}

/** Money leaving a wallet toward a drainer. */
export function LossesDiagram() {
  const glow = useGlowId()
  return (
    <Diagram viewBox="0 0 360 170" label="A wallet drained through a single transaction">
      <defs>
        <GlowFilter id={glow} blur={14} />
      </defs>
      <Link d="M84 79 H146" />
      <Link d="M84 85 H146" />
      <Link d="M84 91 H146" />
      <Link d="M214 85 H272" dashed tone="alert" />
      <RoundNode x={66} y={85} size={16} icon={WalletIcon} />
      <RoundNode x={180} y={85} size={34} icon={TrendDownIcon} tone="core" glowId={glow} />
      <HexNode x={292} y={85} size={18} icon={SkullIcon} tone="alert" />
    </Diagram>
  )
}

/** One signature fanning out into every token the drainer may pull. */
export function ApprovalsDiagram() {
  const glow = useGlowId()
  const satellites = [
    { x: 70, y: 46, icon: CurrencyDollarIcon },
    { x: 46, y: 112, icon: CoinsIcon },
    { x: 108, y: 140, icon: ImageSquareIcon },
    { x: 290, y: 46, icon: CurrencyBtcIcon },
    { x: 314, y: 112, icon: CoinsIcon },
    { x: 252, y: 140, icon: WalletIcon },
  ] as const
  return (
    <Diagram viewBox="0 0 360 180" label="A single approval connected to many tokens">
      <defs>
        <GlowFilter id={glow} blur={14} />
      </defs>
      {satellites.map((s) => (
        <Link key={`${s.x}-${s.y}`} d={`M180 92 L${s.x} ${s.y}`} />
      ))}
      {satellites.map((s) => (
        <HexNode key={`n-${s.x}-${s.y}`} x={s.x} y={s.y} size={15} icon={s.icon} />
      ))}
      <HexNode x={180} y={92} size={34} icon={SignatureIcon} tone="core" glowId={glow} />
    </Diagram>
  )
}

/** A bot forwarding anything that lands in the wallet. */
export function SweeperDiagram() {
  const glow = useGlowId()
  const spokes = [
    { x: 68, y: 50, icon: GasPumpIcon, d: "M68 50 V86 H150" },
    { x: 68, y: 128, icon: CoinsIcon, d: "M68 128 V98 H150" },
    { x: 292, y: 50, icon: LightningIcon, d: "M292 50 V86 H210" },
    { x: 292, y: 128, icon: WalletIcon, d: "M292 128 V98 H210" },
  ] as const
  return (
    <Diagram viewBox="0 0 360 180" label="A sweeper bot connected to gas, tokens and wallets">
      <defs>
        <GlowFilter id={glow} blur={14} />
      </defs>
      {spokes.map((s) => (
        <Link key={s.d} d={s.d} dashed />
      ))}
      {spokes.map((s) => (
        <RoundNode key={`n-${s.x}-${s.y}`} x={s.x} y={s.y} size={14} icon={s.icon} />
      ))}
      <rect
        x="150"
        y="62"
        width="60"
        height="60"
        className="fill-primary opacity-50"
        filter={`url(#${glow})`}
      />
      <rect
        x="150"
        y="62"
        width="60"
        height="60"
        strokeWidth="1"
        className="fill-primary stroke-primary"
      />
      <RobotIcon
        x={164}
        y={76}
        width={32}
        height={32}
        weight="fill"
        className="text-primary-foreground"
      />
    </Diagram>
  )
}

/** Many wallets pointed at the same sweeper contract. */
export function DelegationDiagram() {
  const glow = useGlowId()
  const ring = [0, 72, 144, 216, 288].map((deg) => {
    const a = (deg * Math.PI) / 180 - Math.PI / 2
    return {
      x: Math.round((180 + 68 * Math.cos(a)) * 100) / 100,
      y: Math.round((95 + 68 * Math.sin(a)) * 100) / 100,
      deg,
    }
  })
  return (
    <Diagram viewBox="0 0 360 190" label="Wallets delegated to one sweeper contract">
      <defs>
        <GlowFilter id={glow} blur={14} />
      </defs>
      <circle
        cx="180"
        cy="95"
        r="68"
        fill="none"
        strokeWidth="1"
        strokeDasharray="2 5"
        className="stroke-input"
      />
      <circle cx="180" cy="95" r="44" fill="none" strokeWidth="1" className="stroke-border" />
      {ring.map((p) => (
        <RoundNode
          key={p.deg}
          x={p.x}
          y={p.y}
          size={11}
          icon={p.deg % 144 === 0 ? WarningIcon : WalletIcon}
          tone={p.deg % 144 === 0 ? "alert" : "muted"}
        />
      ))}
      <RoundNode x={180} y={95} size={28} icon={TreeStructureIcon} tone="core" glowId={glow} />
    </Diagram>
  )
}
