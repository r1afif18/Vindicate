import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { IsoVault } from "@/components/marketing/illustrations/iso"
import { ArrowLink } from "@/components/marketing/tag"

/**
 * One screen over the moving field: the vault where the two axes cross, the promise to its
 * left, and the way in at the bottom right.
 */
export function Hero() {
  return (
    <section
      id="home"
      className="relative flex min-h-svh flex-col overflow-hidden px-5 pt-24 pb-8 md:px-8"
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-foreground/10" />
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 hidden w-px bg-foreground/10 lg:block"
      />
      <IsoVault className="absolute top-1/2 left-1/2 hidden size-40 -translate-x-1/2 -translate-y-1/2 lg:block" />

      <div className="relative flex flex-1 animate-rise flex-col justify-center gap-6">
        <IsoVault className="size-24 lg:hidden" />
        <p className="text-sm text-muted-foreground">Drained wallet on BNB Chain?</p>
        <h1 className="max-w-md font-flow text-4xl leading-none text-balance xl:max-w-lg xl:text-5xl">
          Move what&apos;s left before the sweeper bot does.
        </h1>
      </div>

      <div className="relative flex animate-rise flex-wrap items-end justify-between gap-6">
        <div className="grid max-w-xs gap-3 bg-background/55 p-3 text-sm text-pretty text-foreground/85 backdrop-blur-sm">
          <p>
            One transaction moves what you pick to a clean wallet. The drained one never receives
            BNB for a bot to catch.
          </p>
          <p>Testnet preview. Mainnet is not live yet, and the contract has not been audited.</p>
        </div>
        <Link href="/app" className="text-lg text-primary hover:text-foreground">
          <ArrowLink>
            Start a rescue
            <ArrowUpRightIcon
              weight="bold"
              className="size-4 transition-transform duration-quick group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </ArrowLink>
        </Link>
      </div>
    </section>
  )
}
