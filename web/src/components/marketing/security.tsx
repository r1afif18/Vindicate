import { KeyBoundary } from "@/components/marketing/illustrations/key-boundary"
import { Section } from "@/components/marketing/section"

const points = [
  {
    title: "No key on any server",
    body: "Keys sign inside this tab. The optional copilot is sent a wallet address and your note, never a key.",
  },
  {
    title: "One-time signature",
    body: "Locked to your safe wallet, gas wallet, and a 10-minute window.",
  },
  { title: "Nothing left open", body: "The contract can't act without a new signature from you." },
  {
    title: "Locked-down page",
    body: "Only this site's scripts run. It talks to BNB Chain and, for the copilot, to this site.",
  },
] as const

export function Security() {
  return (
    <Section id="security" label="Security" title="Your key never leaves the tab.">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div className="bg-border p-px chamfer">
          <div className="bg-card p-6 chamfer md:p-10">
            <KeyBoundary />
          </div>
        </div>
        <ul className="grid gap-px bg-border sm:grid-cols-2">
          {points.map((p) => (
            <li key={p.title} className="grid content-start gap-2 bg-background p-6">
              <h3 className="font-display text-lg">{p.title}</h3>
              <p className="text-sm text-muted-foreground">{p.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
