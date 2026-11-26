import type { Address, Hex } from "viem"

import type { NetworkId } from "@/lib/chains"

// Everything here crosses the wire between the copilot route and the browser, so amounts are
// decimal strings rather than bigints.

export interface TokenFinding {
  address: Address
  symbol: string
  decimals: number
  balance: string
  /** False when a transfer of the whole balance reverts in simulation (frozen, honeypot). */
  transferable: boolean
  /** Why it is not transferable, when the chain says. */
  blocker: string | null
}

export interface NftFinding {
  standard: "erc721" | "erc1155"
  collection: Address
  tokenId: string
  amount: string
}

export interface AllowanceFinding {
  token: Address
  symbol: string
  decimals: number
  spender: Address
  amount: string
  unlimited: boolean
}

export interface OperatorFinding {
  collection: Address
  operator: Address
}

/** A no-argument exit on a contract, proven callable from this wallet by simulation. */
export interface CallFinding {
  target: Address
  /** Human signature, e.g. "unstake()". */
  label: string
  data: Hex
  /** Where the contract came from: the wallet's own history, or an address the user gave. */
  source: "history" | "mentioned"
  /**
   * Tokens the exit is expected to pay: any the contract names, and any this wallet sent to it.
   * Empty means unknown, in which case only returned BNB is certain to be swept.
   */
  pays: Address[]
}

export interface Findings {
  owner: Address
  nativeBalance: string
  delegation: Address | null
  delegatedToVindicate: boolean
  tokens: TokenFinding[]
  nfts: NftFinding[]
  allowances: AllowanceFinding[]
  operators: OperatorFinding[]
  calls: CallFinding[]
  /** How far back the wallet's history was read, and whether that reached the chain's start. */
  blocksScanned: number
  historyComplete: boolean
}

/** What the browser needs to put one step into the rescue plan. */
export type CopilotAction =
  | { kind: "sweep-native" }
  | { kind: "sweep-token"; token: Address }
  | { kind: "revoke-allowance"; allowance: AllowanceFinding }
  | { kind: "revoke-operator"; collection: Address; operator: Address }
  | { kind: "transfer-erc721"; collection: Address; tokenId: string }
  | { kind: "transfer-erc1155"; collection: Address; tokenId: string; amount: string }
  | { kind: "custom-call"; target: Address; data: Hex; receives: Address[] }

/**
 * One thing the rescue could do, built by code from what the chain shows. The model only ever
 * refers to candidates by `id`; it never writes an address or calldata of its own.
 */
export interface Candidate {
  id: string
  title: string
  /** Facts for the model and the user: balances, counterparties, where it was found. */
  detail: string
  action: CopilotAction
  /** Null when the step is fine to include. Otherwise why it must be left out. */
  blocker: string | null
  /** Something the owner must know before trusting this step. Shown with it, never dropped. */
  caution: string | null
}

export interface CopilotStep {
  id: string
  title: string
  reason: string
  action: CopilotAction
  caution: string | null
}

export interface SkippedStep {
  id: string
  title: string
  reason: string
  /** Kept so the browser can make sure a left-out asset is not swept anyway. */
  action: CopilotAction
}

export interface CopilotRequest {
  networkId: NetworkId
  owner: Address
  /** The user's own words about what happened. Optional. */
  story?: string
  /** The safe wallet, if already entered. Used only to test that tokens can reach it. */
  recipient?: Address
}

export interface CopilotResponse {
  /** "ai": a model chose and explained the steps. "rules": no model was available. */
  mode: "ai" | "rules"
  /** Set in "rules" mode: why the model was not used. */
  notice: string | null
  summary: string
  threat: string
  steps: CopilotStep[]
  skipped: SkippedStep[]
  questions: string[]
  /** What the investigation actually did, in order. */
  log: string[]
}
