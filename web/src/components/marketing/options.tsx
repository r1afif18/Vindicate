import { CheckIcon, MinusIcon } from "@phosphor-icons/react/dist/ssr"

import { Section } from "@/components/marketing/section"
import { cn } from "@/lib/utils"

const options = [
  {
    name: "Do it yourself",
    detail: "Build a private bundle by hand.",
    rows: ["Scripting skills", "Gas only", "Hours"],
    highlight: false,
  },
  {
    name: "Whitehat service",
    detail: "A team rescues it for you.",
    rows: ["$1,000 minimum", "5 to 10% fee", "Wait for a reply"],
    highlight: false,
  },
  {
    name: "Vindicate",
    detail: "You run it in your browser.",
    rows: ["No minimum", "10% of swept assets, revokes free", "Minutes"],
    highlight: true,
  },
] as const

export function Options() {
  return (
    <Section
      label="Compare"
      title="Your options after a drain."
      lead="Both older options work. One needs scripting skills, the other a minimum and a wait."
    >
      <div className="grid gap-3 md:grid-cols-3">
        {options.map((o) => (
          <article
            key={o.name}
            className={cn("p-px chamfer", o.highlight ? "bg-primary" : "bg-border")}
          >
            <div className="grid h-full content-start gap-5 bg-card p-6 chamfer">
              <div className="grid gap-1.5">
                <h3 className={cn("font-display text-xl", o.highlight && "text-primary")}>
                  {o.name}
                </h3>
                <p className="text-sm text-muted-foreground">{o.detail}</p>
              </div>
              <ul className="grid gap-3 border-t border-border pt-5 text-sm">
                {o.rows.map((r) => (
                  <li key={r} className="flex gap-3">
                    {o.highlight ? (
                      <CheckIcon weight="bold" className="mt-0.5 size-4 shrink-0 text-primary" />
                    ) : (
                      <MinusIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    )}
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Service terms as described in{" "}
        <a
          href="https://support.metamask.io/stay-safe/protect-yourself/fighting-back-against-sweeper-bots"
          target="_blank"
          rel="noreferrer noopener"
          className="underline decoration-input underline-offset-4 hover:text-foreground"
        >
          MetaMask&apos;s guide to sweeper bots
        </a>
        .
      </p>
    </Section>
  )
}
