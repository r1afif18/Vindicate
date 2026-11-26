import { Section } from "@/components/marketing/section"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const faqs = [
  {
    q: "Is it safe to paste my private key?",
    a: "Only paste a key that has already leaked. It signs in your browser and is never sent anywhere. If you prefer, run Vindicate from the source code on your own machine.",
  },
  {
    q: "What does it cost?",
    a: "10% of the tokens and BNB you move. Revoking approvals, moving NFTs and clearing the delegation are free. Network gas is usually a few cents on BNB Chain.",
  },
  {
    q: "Can a bot still beat me?",
    a: "Yes, it still can. No BNB is ever sent to the drained wallet, so a bot has nothing to react to until the rescue itself is broadcast. From that moment a bot holding your key can race it, and if it wins, the rescue does nothing and you try again. A private-transaction RPC narrows that window.",
  },
  {
    q: "My seed phrase leaked, not a private key.",
    a: "Export the private key of the affected account from any wallet app first. Vindicate only accepts a 64-character private key.",
  },
  {
    q: "What about the wallet afterwards?",
    a: "Treat it as burned. If more tokens or an airdrop arrive later, run another rescue.",
  },
] as const

export function Faq() {
  return (
    <Section id="faq" label="FAQ" title="Questions" layout="split" lead="Still unsure? Start here.">
      <Accordion type="single" collapsible>
        {faqs.map((f) => (
          <AccordionItem key={f.q} value={f.q}>
            <AccordionTrigger>{f.q}</AccordionTrigger>
            <AccordionContent>{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  )
}
