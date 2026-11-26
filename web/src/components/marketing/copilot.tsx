import { CopilotDiagram } from "@/components/marketing/illustrations/iso"
import { Section } from "@/components/marketing/section"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const parts = [
  {
    title: "Reads the chain",
    body: "It reads as much of the wallet's history as the network allows: tokens, NFTs, approvals, and contracts the wallet sent tokens to.",
  },
  {
    title: "Builds a menu of steps",
    body: "Code, not the model, builds every step and checks each one against the chain. A token that cannot move is left out.",
  },
  {
    title: "A model picks and explains",
    body: "The model only chooses from that menu and says why. It cannot write an address, an amount or calldata.",
  },
  {
    title: "You review and sign",
    body: "The plan lands in the app for you to edit. Nothing is sent until you review it and sign in your browser.",
  },
] as const

export function Copilot() {
  return (
    <Section
      id="copilot"
      label="Rescue copilot"
      title="An AI that finds what you forgot. You still sign."
      lead="Most victims do not know which contract holds their stake or their unclaimed airdrop. The copilot looks, and proposes a plan you can change."
    >
      <div className="grid items-start gap-10 lg:grid-cols-2">
        <Accordion type="single" collapsible defaultValue={parts[0].title}>
          {parts.map((p) => (
            <AccordionItem key={p.title} value={p.title}>
              <AccordionTrigger>{p.title}</AccordionTrigger>
              <AccordionContent>
                <p className="text-pretty">{p.body}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <div className="corner-ticks grid gap-4 border border-border bg-card/55 p-6 backdrop-blur-md">
          <CopilotDiagram />
          <p className="text-sm text-pretty text-muted-foreground">
            The copilot is sent wallet addresses and your note, never a key.
          </p>
        </div>
      </div>
    </Section>
  )
}
