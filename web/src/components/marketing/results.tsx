import { CubeIcon, GasPumpIcon, KeyIcon, PercentIcon } from "@phosphor-icons/react/dist/ssr"

import { Section } from "@/components/marketing/section"

const results = [
  {
    icon: <KeyIcon />,
    title: "Your key stays in the tab",
    body: "Keys sign in the browser and are sent to no server.",
  },
  {
    icon: <GasPumpIcon />,
    title: "No BNB for a bot to catch",
    body: "A separate gas wallet pays, so the drained wallet never receives BNB.",
  },
  {
    icon: <CubeIcon />,
    title: "One block, in order",
    body: "Revokes first, then claims, NFTs and sweeps. A failed step cancels all of it.",
  },
  {
    icon: <PercentIcon />,
    title: "No minimum",
    body: "10% of swept tokens and BNB. Revokes and NFT moves carry no fee.",
  },
] as const

export function Results() {
  return (
    <Section label="What you keep" title="Built for the worst hour of your wallet.">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {results.map((r) => (
          <li
            key={r.title}
            className="corner-ticks grid min-h-52 content-between gap-8 border border-border bg-card/55 p-5 backdrop-blur-md"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-flow text-lg leading-tight text-balance">{r.title}</h3>
              <span className="shrink-0 text-muted-foreground [&_svg]:size-5">{r.icon}</span>
            </div>
            <p className="text-sm text-pretty text-muted-foreground">{r.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
