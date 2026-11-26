import type { Address, Hex } from "viem"

import type { RecoveryEvent } from "@/components/recovery/recovery-provider"
import type { NetworkId } from "@/lib/chains"
import type { CopilotResponse } from "@/lib/copilot/types"
import type { WalletReport } from "@/lib/recovery/scan"

/** Tokens a plan sweeps: the ones it names, and the ones its calls are expected to pay. */
export function plannedTokens(plan: CopilotResponse): Address[] {
  return plan.steps.flatMap((s) =>
    s.action.kind === "sweep-token"
      ? [s.action.token]
      : s.action.kind === "custom-call"
        ? s.action.receives
        : [],
  )
}

/**
 * Turns a copilot plan into the events that put it into the rescue plan. This is the only path
 * from what a model picked to what gets signed, so it is a pure function: the same events, in the
 * same order, for the same plan and scan.
 *
 * `report` must be a scan that included `plannedTokens(plan)`: only what the chain confirms is a
 * token is added. Applying a plan twice changes nothing, because the reducer ignores a step it
 * already holds.
 */
export function planEvents(
  plan: CopilotResponse,
  report: WalletReport,
  scope: { ownerKey: Hex; networkId: NetworkId },
): RecoveryEvent[] {
  const events: RecoveryEvent[] = []
  const actions = plan.steps.map((s) => s.action)
  const isToken = (address: string) =>
    report.tokens.some((t) => t.address.toLowerCase() === address.toLowerCase())
  const wanted = plannedTokens(plan).filter(isToken)

  for (const token of wanted) events.push({ type: "addToken", token })
  events.push({ type: "scanned", report, ...scope })
  // What the copilot left out must not ride along because an earlier scan ticked it.
  for (const skipped of plan.skipped) {
    if (skipped.action.kind === "sweep-token") {
      events.push({ type: "toggleToken", token: skipped.action.token, on: false })
    }
  }
  for (const token of wanted) events.push({ type: "toggleToken", token, on: true })
  if (actions.some((a) => a.kind === "sweep-native")) {
    events.push({ type: "toggleNative", on: true })
  } else if (plan.skipped.some((s) => s.action.kind === "sweep-native")) {
    events.push({ type: "toggleNative", on: false })
  }

  const allowances = actions.flatMap((a) =>
    a.kind === "revoke-allowance" ? [{ ...a.allowance, amount: BigInt(a.allowance.amount) }] : [],
  )
  if (allowances.length > 0) events.push({ type: "allowances", allowances })
  for (const a of actions) {
    if (a.kind === "revoke-operator") {
      events.push({ type: "addOperator", item: { collection: a.collection, operator: a.operator } })
    } else if (a.kind === "custom-call") {
      events.push({ type: "addCall", item: { target: a.target, data: a.data, value: 0n } })
    } else if (a.kind === "transfer-erc721") {
      events.push({
        type: "addNft",
        item: {
          standard: "erc721",
          collection: a.collection,
          tokenId: BigInt(a.tokenId),
          amount: 1n,
        },
      })
    } else if (a.kind === "transfer-erc1155") {
      events.push({
        type: "addNft",
        item: {
          standard: "erc1155",
          collection: a.collection,
          tokenId: BigInt(a.tokenId),
          amount: BigInt(a.amount),
        },
      })
    }
  }
  return events
}
