"use client"

import { SignOutIcon } from "@phosphor-icons/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"

import { Logo } from "@/components/brand/logo"
import { FlowStage } from "@/components/effects/flow-stage"
import { Tag } from "@/components/marketing/tag"
import { ChainStatus } from "@/components/recovery/chain-status"
import { NetworkSelect } from "@/components/recovery/network-select"
import { RecoveryCard } from "@/components/recovery/recovery-card"
import { RecoveryProvider, useRecovery } from "@/components/recovery/recovery-provider"
import { StepRail } from "@/components/recovery/step-rail"
import { WalletScan } from "@/components/recovery/wallet-scan"
import { Button } from "@/components/ui/button"

export function RecoveryApp() {
  const [queryClient] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <RecoveryProvider>
        <Shell />
      </RecoveryProvider>
    </QueryClientProvider>
  )
}

function Shell() {
  const { state, dispatch } = useRecovery()
  const holdsKeys = Boolean(state.ownerKey || state.sponsorKey)

  return (
    // Isolated, so the fixed stage sits behind the content and in front of the page background.
    <div className="relative isolate flex min-h-dvh flex-col">
      {/* The same field as the landing page, held well back: this is a place to work. */}
      <FlowStage shade={0.8} />
      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
          <Link href="/" aria-label="Vindicate home" className="flex items-center gap-2.5">
            <Logo className="h-7" />
            <span className="hidden font-flow text-lg sm:inline">Vindicate</span>
          </Link>
          <div className="flex items-center gap-2">
            {holdsKeys ? (
              <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "reset" })}>
                Forget keys
              </Button>
            ) : null}
            <NetworkSelect />
            <Button asChild variant="ghost" size="icon" aria-label="Back to the home page">
              <Link href="/">
                <SignOutIcon />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative flex-1">
        {/* Remounted on reset so any form state is dropped with the keys. */}
        <div
          key={state.session}
          className="relative mx-auto grid max-w-6xl gap-8 px-4 py-10 md:px-6 md:py-14"
        >
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="grid gap-4 lg:col-span-7">
              <Tag>Rescue terminal</Tag>
              <h1 className="font-flow text-3xl leading-none text-balance md:text-4xl">
                Rescue a drained wallet
              </h1>
              <p className="max-w-xl text-pretty text-muted-foreground">
                Paste the leaked key, choose what to save, and send it to a clean wallet in one
                transaction. Don&apos;t send BNB to the drained wallet first: a sweeper bot will
                take it.
              </p>
            </div>
            <div className="lg:col-span-5">
              <StepRail />
            </div>
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <RecoveryCard />
            </div>
            <div className="lg:sticky lg:top-24 lg:col-span-5">
              <WalletScan />
            </div>
          </div>
        </div>
      </main>

      <ChainStatus />
    </div>
  )
}
