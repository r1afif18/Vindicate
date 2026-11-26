"use client"

import { type Address, isAddressEqual } from "viem"

import {
  allowanceKey,
  listedTokens,
  sweepableNative,
  sweepsNative,
  useRecovery,
} from "@/components/recovery/recovery-provider"
import { useFeeBps } from "@/hooks/use-fee-bps"
import { formatAmount } from "@/lib/format"
import type { SweptAsset } from "@/lib/recovery/execute"
import { feeOf } from "@/lib/recovery/plan"
import { shortAddress } from "@/lib/utils"

export interface AssetMove {
  key: string
  symbol: string
  /** What leaves the compromised wallet. */
  sent: string
  /** What arrives in the safe wallet after the fee. */
  received: string
  fee: string | null
  /** Set for swept assets: the token contract, or null for BNB. Undefined for NFTs. */
  token?: Address | null
  decimals?: number
  /** Nothing to sweep yet: the balance only appears once a call in this rescue has run. */
  pending?: boolean
}

export interface Operation {
  key: string
  label: string
  kind: "authorize" | "revoke" | "call" | "transfer" | "sweep"
  /** For sweeps: the token contract, or null for BNB. */
  token?: Address | null
}

/** What the contract reported sweeping for one asset (null is BNB), or undefined if nothing. */
export function findSwept(token: Address | null, swept: readonly SweptAsset[]) {
  return swept.find((s) =>
    token === null || s.token === null ? s.token === token : isAddressEqual(s.token, token),
  )
}

/**
 * Derives the human view of the plan from the selections: asset moves with fee applied, and the
 * operations in the exact order the contract runs them (mirrors buildRecovery in lib/recovery/plan).
 */
export function usePlanSummary() {
  const { state, network } = useRecovery()
  const fee = useFeeBps(network)
  const bps = fee.data ?? 0
  const report = state.report

  const moves: AssetMove[] = []
  if (report && sweepsNative(state)) {
    const left = sweepableNative(state)
    const f = feeOf(left, bps)
    moves.push({
      key: "native",
      symbol: "BNB",
      sent: formatAmount(left, 18),
      received: formatAmount(left - f, 18),
      fee: formatAmount(f, 18),
      token: null,
      decimals: 18,
      pending: left === 0n,
    })
  }
  for (const t of listedTokens(state)) {
    if (!state.sweepTokens.includes(t.address.toLowerCase())) continue
    const f = feeOf(t.balance, bps)
    moves.push({
      key: t.address,
      symbol: t.symbol,
      sent: formatAmount(t.balance, t.decimals),
      received: formatAmount(t.balance - f, t.decimals),
      fee: formatAmount(f, t.decimals),
      token: t.address,
      decimals: t.decimals,
      pending: t.balance === 0n,
    })
  }
  for (const n of state.nfts) {
    const label = `${n.standard === "erc1155" ? `${n.amount}× ` : ""}#${n.tokenId}`
    moves.push({
      key: `${n.collection}-${n.tokenId}`,
      symbol: label,
      sent: shortAddress(n.collection),
      received: "NFT",
      fee: null,
    })
  }

  const operations: Operation[] = [
    {
      key: "auth",
      kind: "authorize",
      // The delegation outlives the transaction. It is inert without a new signature, and the
      // receipt offers to clear it.
      label: "Delegate the wallet to Vindicate (stays until you clear it)",
    },
  ]
  for (const a of state.allowances) {
    if (!state.revokes.includes(allowanceKey(a))) continue
    operations.push({
      key: `r-${allowanceKey(a)}`,
      kind: "revoke",
      label: `Revoke ${a.symbol} allowance of ${shortAddress(a.spender)}`,
    })
  }
  state.operators.forEach((o, i) =>
    operations.push({
      key: `o-${i}`,
      kind: "revoke",
      label: `Revoke NFT operator ${shortAddress(o.operator)}`,
    }),
  )
  state.calls.forEach((c, i) =>
    operations.push({ key: `c-${i}`, kind: "call", label: `Call ${shortAddress(c.target)}` }),
  )
  // The contract moves NFTs first, then sweeps tokens, then BNB last.
  const sweeps = moves.filter((m) => m.fee !== null)
  for (const m of moves) {
    if (m.fee === null) {
      operations.push({ key: `t-${m.key}`, kind: "transfer", label: `Move NFT ${m.symbol}` })
    }
  }
  for (const m of [
    ...sweeps.filter((s) => s.token !== null),
    ...sweeps.filter((s) => s.token === null),
  ]) {
    operations.push({
      key: `s-${m.key}`,
      kind: "sweep",
      label: `Sweep ${m.symbol}`,
      token: m.token ?? null,
    })
  }

  return { moves, operations, feeBps: fee.data, hasWork: operations.length > 1 }
}
