import { Closing } from "@/components/marketing/closing"
import { Copilot } from "@/components/marketing/copilot"
import { Faq } from "@/components/marketing/faq"
import { Hero } from "@/components/marketing/hero"
import { HowItWorks } from "@/components/marketing/how-it-works"
import { Options } from "@/components/marketing/options"
import { Problems } from "@/components/marketing/problems"
import { Process } from "@/components/marketing/process"
import { Results } from "@/components/marketing/results"
import { Security } from "@/components/marketing/security"

export default function HomePage() {
  return (
    <main>
      <Hero />
      <Problems />
      <HowItWorks />
      <Results />
      <Process />
      <Copilot />
      <Options />
      <Security />
      <Faq />
      <Closing />
    </main>
  )
}
