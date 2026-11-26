"use client"

import { useQuery } from "@tanstack/react-query"

import { useRecovery } from "@/components/recovery/recovery-provider"
import { publicClientFor } from "@/lib/chains"
import { cn } from "@/lib/utils"

/** Live chain heartbeat: latest block and RPC round-trip, like a terminal footer. */
export function ChainStatus() {
  const { network } = useRecovery()
  const head = useQuery({
    queryKey: ["head", network.id],
    queryFn: async () => {
      const started = performance.now()
      const block = await publicClientFor(network).getBlockNumber({ cacheTime: 0 })
      return { block, latency: Math.round(performance.now() - started) }
    },
    refetchInterval: 3_000,
  })

  const state = head.isError ? "down" : head.data ? "up" : "pending"
  return (
    <footer className="flex h-9 items-center justify-between gap-4 border-t border-border bg-background/70 px-4 font-mono text-xs text-muted-foreground md:px-6">
      <span className="inline-flex items-center gap-2" aria-live="polite">
        <span
          className={cn(
            "size-1.5 rounded-full",
            state === "up" && "bg-success",
            state === "down" && "bg-destructive",
            state === "pending" && "bg-muted-foreground",
          )}
        />
        {state === "up" && head.data
          ? `Block ${head.data.block.toLocaleString("en-US")}`
          : state === "down"
            ? "RPC unreachable"
            : "Reading the chain…"}
      </span>
      <span className="hidden items-center gap-4 sm:inline-flex">
        {head.data ? <span>{head.data.latency} ms</span> : null}
        <span>{network.name}</span>
      </span>
    </footer>
  )
}
