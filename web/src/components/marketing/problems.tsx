import type { ReactNode } from "react"

import {
  ApprovalsDiagram,
  DelegationDiagram,
  SweeperDiagram,
} from "@/components/marketing/illustrations/problem-diagrams"
import { Section } from "@/components/marketing/section"

interface Problem {
  title: string
  body: string
  figure: ReactNode
  source?: { label: string; href: string }
}

const problems: Problem[] = [
  {
    title: "Approvals don't expire",
    body: "A drainer can pull any approved token the moment it lands.",
    figure: <ApprovalsDiagram />,
  },
  {
    title: "Bots beat manual rescues",
    body: "Send BNB in for gas and it is gone in the same block.",
    figure: <SweeperDiagram />,
  },
  {
    title: "97% of early 7702 delegations were sweepers",
    body: "Measured weeks after Ethereum's Pectra upgrade.",
    figure: <DelegationDiagram />,
    source: {
      label: "Wintermute via Cointelegraph",
      href: "https://cointelegraph.com/news/wintermute-crimeenjoyor-flags-malicious-ethereum-contracts",
    },
  },
]

export function Problems() {
  return (
    <Section
      id="problem"
      label="The problem"
      title="A drain doesn't stop at the first transaction."
      lead={
        <>
          About 158,000 personal wallets were compromised in 2025, hitting at least 80,000 people.{" "}
          <a
            href="https://www.theblock.co/post/382477/crypto-hack-2025-chainalysis"
            className="underline decoration-input underline-offset-4 hover:decoration-primary"
          >
            Chainalysis, via The Block
          </a>
        </>
      }
    >
      <ol className="grid gap-4 lg:grid-cols-3">
        {problems.map((p, i) => (
          <li
            key={p.title}
            className="corner-ticks grid content-start gap-6 border border-border bg-card/55 p-6 backdrop-blur-md"
          >
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="grid min-h-40 place-items-center">{p.figure}</div>
            <div className="grid gap-2">
              <h3 className="font-flow text-xl leading-tight">{p.title}</h3>
              <p className="text-sm text-pretty text-muted-foreground">{p.body}</p>
              {p.source ? (
                <a
                  href={p.source.href}
                  className="w-fit text-xs text-muted-foreground underline decoration-input underline-offset-4 hover:decoration-primary"
                >
                  Source: {p.source.label}
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}
