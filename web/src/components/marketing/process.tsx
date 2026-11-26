import { type PinnedStep, PinnedSteps } from "@/components/effects/pinned-steps"
import { Tag } from "@/components/marketing/tag"

const steps: readonly PinnedStep[] = [
  {
    title: "Paste the leaked key",
    body: "Only a key that has already leaked. It never leaves this tab.",
  },
  {
    title: "Scan",
    body: "See the BNB, tokens and delegation the scan can read.",
  },
  {
    title: "Build the plan",
    body: "Pick what to save by hand, or let the copilot read the wallet's history and propose steps.",
  },
  {
    title: "Review",
    body: "The whole transaction is simulated first. A step that would fail is named before anything is sent.",
  },
  {
    title: "Send",
    body: "One transaction. The receipt lists what actually arrived.",
  },
]

const heading = (
  <>
    From leaked key
    <br />
    to safe wallet
  </>
)

/** The five steps of a rescue. Pinned and scroll-driven on wide screens, a plain list on narrow ones. */
export function Process() {
  return (
    <section id="process" aria-label="Process" className="relative scroll-mt-16">
      <div className="hidden md:block">
        <PinnedSteps heading={heading} steps={steps} />
      </div>
      <div className="px-5 py-20 md:hidden">
        <div className="grid gap-10 border-t border-foreground/10 pt-20">
          <div className="grid gap-5">
            <Tag>Process</Tag>
            <h2 className="font-flow text-3xl leading-none">{heading}</h2>
          </div>
          <ol className="grid gap-8">
            {steps.map((s, i) => (
              <li key={s.title} className="grid gap-2">
                <span className="font-flow text-4xl leading-none tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-medium">{s.title}</h3>
                <p className="text-sm text-pretty text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
