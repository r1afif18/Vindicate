"use client"

import { useQuery } from "@tanstack/react-query"

import type { Network } from "@/lib/chains"
import { readFeeBps } from "@/lib/recovery/scan"

/** Protocol fee of the delegate on this network, read once and cached. */
export function useFeeBps(network: Network) {
  return useQuery({
    queryKey: ["feeBps", network.id, network.delegate],
    queryFn: () => readFeeBps(network),
    enabled: Boolean(network.delegate),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
