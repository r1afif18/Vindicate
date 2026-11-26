import { BaseError, ContractFunctionRevertedError, InsufficientFundsError } from "viem"

import { RecoveryPlanError } from "@/lib/recovery/plan"

const contractErrors: Record<string, string> = {
  Expired: "The signed rescue expired before it was mined. Review and send it again.",
  InvalidNonce: "This rescue was already used or replaced. Scan the wallet again to refresh it.",
  UnauthorizedExecutor: "Only the gas wallet chosen at signing can send this rescue.",
  InvalidSignature: "The signature does not match the compromised wallet's key.",
  ZeroAddress: "Enter a safe wallet address.",
}

/**
 * Names the step that failed. The contract counts its calls from zero; the plan shown under
 * "In one transaction" counts from one and opens with the authorization, so call 0 is step 2.
 */
function callFailed(index: unknown) {
  return typeof index === "bigint"
    ? `Step ${Number(index) + 2} under "In one transaction" would fail, so nothing was moved. Fix or remove that step, then review again.`
    : "One of the steps in the plan would fail, so nothing was moved. Remove it and review again."
}

/** Turns any thrown value into one sentence that says what happened and what to do. */
export function explainError(error: unknown): string {
  if (error instanceof RecoveryPlanError) return error.message
  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      if (name === "CallFailed") return callFailed(reverted.data?.args?.[0])
      if (name && name in contractErrors) return contractErrors[name] as string
      if (reverted.reason) return `The transaction would revert: ${reverted.reason}.`
    }
    if (error.walk((e) => e instanceof InsufficientFundsError)) {
      return "The gas wallet does not have enough BNB for gas. Top it up and try again."
    }
    return error.shortMessage
  }
  if (error instanceof Error) return error.message
  return "Something went wrong. Check your connection and try again."
}
