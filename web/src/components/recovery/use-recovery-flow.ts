"use client"

import { useQuery } from "@tanstack/react-query"
import { isAddressEqual } from "viem"

import { useRecovery } from "@/components/recovery/recovery-provider"
import { publicClientFor } from "@/lib/chains"
import { explainError } from "@/lib/recovery/errors"
import {
  type PreparedRecovery,
  StaleRecoveryError,
  prepareRecovery,
  sendRecovery,
  settleRecovery,
} from "@/lib/recovery/execute"
import { scanWallet } from "@/lib/recovery/scan"

export type PrimaryAction =
  | { kind: "blocked"; label: string }
  | { kind: "scan"; label: string }
  | { kind: "check"; label: string }
  | { kind: "send"; label: string; disabled: boolean }
  | { kind: "busy"; label: string }
  | { kind: "reset"; label: string }

/**
 * Moves the recovery forward: scan, sign and simulate, send. `primary` always names the next step
 * or what is still missing, so one button can drive the whole flow.
 */
export function useRecoveryFlow() {
  const { state, dispatch, network, owner, sponsor, actions } = useRecovery()
  const phase = state.phase
  // Shares its cache entry with the gas wallet panel, so a top-up shows up here too.
  const sponsorBalance = useQuery({
    queryKey: ["balance", network.id, sponsor],
    queryFn: () => publicClientFor(network).getBalance({ address: sponsor as `0x${string}` }),
    enabled: Boolean(sponsor),
    refetchInterval: 4_000,
  })

  const primary: PrimaryAction = (() => {
    if (phase.name === "done") return { kind: "reset", label: "Start another rescue" }
    if (phase.name === "checking")
      return { kind: "busy", label: phase.task === "scan" ? "Scanning" : "Signing and simulating" }
    if (phase.name === "sending")
      return { kind: "busy", label: phase.hash ? "Waiting for the block" : "Sending" }
    if (phase.name === "checked") {
      const balance = sponsorBalance.data ?? phase.prepared.sponsorBalance
      const short = balance < phase.prepared.maxCost
      return {
        kind: "send",
        label: short ? "Top up the gas wallet" : "Send rescue",
        disabled: short,
      }
    }
    if (!state.ownerKey) return { kind: "blocked", label: "Paste the compromised key" }
    if (!state.report) return { kind: "scan", label: "Scan wallet" }
    if (actions.length === 0) return { kind: "blocked", label: "Select what to rescue" }
    if (!state.recipient) return { kind: "blocked", label: "Add your safe wallet" }
    if (!sponsor) return { kind: "blocked", label: "Set up a gas wallet" }
    if (owner && isAddressEqual(owner, sponsor))
      return { kind: "blocked", label: "Use a different gas wallet" }
    return { kind: "check", label: "Review rescue" }
  })()

  // Each step below remembers the plan revision it started from. The reducer drops a result
  // whose revision is no longer current, so an edit, a key change or a reset made while a
  // request is in flight can never be overwritten by that request's answer.

  async function scan() {
    if (!owner || !state.ownerKey) return
    const { revision, ownerKey, networkId } = state
    dispatch({ type: "phase", phase: { name: "checking", task: "scan" } })
    try {
      const report = await scanWallet(network, owner, state.extraTokens)
      dispatch({ type: "phase", phase: { name: "idle" }, revision })
      dispatch({ type: "scanned", report, ownerKey, networkId })
    } catch (e) {
      dispatch({ type: "phase", phase: { name: "idle" }, revision })
      dispatch({ type: "error", message: explainError(e), revision })
    }
  }

  async function check() {
    if (!state.ownerKey || !state.sponsorKey || !state.recipient || !state.report) return
    const { revision } = state
    dispatch({ type: "phase", phase: { name: "checking" } })
    try {
      const prepared = await prepareRecovery({
        network,
        ownerKey: state.ownerKey,
        sponsorKey: state.sponsorKey,
        recipient: state.recipient,
        actions,
        recoveryNonce: state.report.recoveryNonce,
      })
      dispatch({ type: "phase", phase: { name: "checked", prepared }, revision })
    } catch (e) {
      dispatch({ type: "phase", phase: { name: "idle" }, revision })
      dispatch({ type: "error", message: explainError(e), revision })
    }
  }

  async function send(prepared: PreparedRecovery) {
    if (!state.sponsorKey) return
    const { revision } = state
    dispatch({ type: "phase", phase: { name: "sending", prepared } })
    try {
      const hash = await sendRecovery(prepared, state.sponsorKey)
      dispatch({ type: "phase", phase: { name: "sending", prepared, hash }, revision })
      const swept = await settleRecovery(prepared, hash)
      dispatch({ type: "phase", phase: { name: "done", hash, swept }, revision })
    } catch (e) {
      if (e instanceof StaleRecoveryError) {
        // The signed review can no longer be trusted: the wallet changed, the review aged out,
        // or the transaction's fate is unknown. Drop it and show what is there now.
        const report = await scanWallet(network, prepared.owner, state.extraTokens).catch(
          () => null,
        )
        dispatch({ type: "stale", report, message: explainError(e), revision })
      } else {
        dispatch({ type: "phase", phase: { name: "checked", prepared }, revision })
        dispatch({ type: "error", message: explainError(e), revision })
      }
    }
  }

  function run() {
    switch (primary.kind) {
      case "scan":
        return scan()
      case "check":
        return check()
      case "send":
        return phase.name === "checked" ? send(phase.prepared) : undefined
      case "reset":
        return dispatch({ type: "again" })
      default:
        return undefined
    }
  }

  const busy = phase.name === "checking" || phase.name === "sending"
  return { primary, run, scan, busy, scanning: phase.name === "checking" && !state.report }
}
