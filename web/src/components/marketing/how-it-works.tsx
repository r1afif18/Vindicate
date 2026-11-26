import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { RESCUE_KINDS, RescueMapDiagram } from "@/components/marketing/illustrations/iso"
import { Section } from "@/components/marketing/section"
import { ArrowLink, Tag } from "@/components/marketing/tag"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const steps = [
  {
    title: "Scan the drained wallet",
    body: "BNB, well-known tokens and delegations are read from the chain. The copilot looks for the rest.",
  },
  {
    title: "Choose what to save",
    body: "Tokens, BNB, NFTs, a claim or unstake to run first, and approvals to cut off.",
  },
  {
    title: "Sign in your browser",
    body: "The leaked key signs one instruction, locked to your safe wallet, your gas wallet and a 10-minute window.",
  },
  {
    title: "Send one transaction",
    body: "A separate gas wallet pays. Everything lands in one block, or nothing moves.",
  },
] as const

export function HowItWorks() {
  return (
    <Section
      id="rescue"
      label="The rescue"
      title="One transaction. Everything you pick."
      lead="Revokes, claims, NFT moves and sweeps run in order, in one block. If a step fails, nothing moves."
    >
      <div className="grid gap-12">
        <RescueMapDiagram className="mx-auto hidden max-w-4xl sm:block" />
        {/* The diagram's labels are too small to read on a phone, so the same list is spelled out. */}
        <ul className="flex flex-wrap gap-2 sm:hidden">
          {RESCUE_KINDS.map((k) => (
            <li key={k.label}>
              <Tag>{k.label}</Tag>
            </li>
          ))}
        </ul>
        <Accordion type="single" collapsible defaultValue={steps[0].title}>
          {steps.map((s, i) => (
            <AccordionItem key={s.title} value={s.title}>
              <AccordionTrigger>
                <span className="flex items-baseline gap-5">
                  <span className="font-mono text-xs tracking-normal text-muted-foreground tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.title}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-4 pl-10">
                  <p className="text-pretty">{s.body}</p>
                  <Link href="/app" className="text-sm text-foreground hover:text-primary">
                    <ArrowLink>
                      Start a rescue
                      <ArrowUpRightIcon weight="bold" className="size-3.5" />
                    </ArrowLink>
                  </Link>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  )
}
