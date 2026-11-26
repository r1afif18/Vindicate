import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  erc721Abi,
  getAddress,
  isAddressEqual,
  zeroAddress,
} from "viem"

import type { Call, RecoveryAction, RecoveryMessage } from "@/lib/recovery/types"

const erc1155Abi = [
  {
    type: "function",
    name: "safeTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "id", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const

export class RecoveryPlanError extends Error {
  override name = "RecoveryPlanError"
}

export interface PlanInput {
  owner: Address
  recipient: Address
  /** Wallet that will submit the transaction. Bound into the signature. */
  executor: Address
  actions: readonly RecoveryAction[]
  nonce: bigint
  /** Unix seconds. */
  deadline: bigint
}

/**
 * Orders actions so a single transaction is safe and useful:
 * revocations first, then owner-requested calls (claims), then NFT moves, then sweeps.
 * Sweeps run last so tokens received from a claim are included.
 */
export function buildRecovery(input: PlanInput): RecoveryMessage {
  const { owner, recipient, executor, actions } = input

  if (isAddressEqual(recipient, zeroAddress)) {
    throw new RecoveryPlanError("Enter a safe wallet address.")
  }
  if (isAddressEqual(recipient, owner)) {
    throw new RecoveryPlanError("The safe wallet must be different from the compromised wallet.")
  }
  if (actions.length === 0) throw new RecoveryPlanError("Add at least one asset or action.")

  const flagged = new Set<string>()
  for (const a of actions) {
    if (a.kind === "revoke-allowance") flagged.add(a.spender.toLowerCase())
    if (a.kind === "revoke-operator") flagged.add(a.operator.toLowerCase())
  }
  if (flagged.has(recipient.toLowerCase())) {
    throw new RecoveryPlanError("The safe wallet is one of the addresses being revoked.")
  }
  // A token, collection or call target pasted into the wrong field would swallow everything.
  const contracts = new Set<string>()
  for (const a of actions) {
    if (a.kind === "sweep-token" || a.kind === "revoke-allowance") contracts.add(a.token)
    if (a.kind === "revoke-operator" || a.kind === "transfer-erc721") contracts.add(a.collection)
    if (a.kind === "transfer-erc1155") contracts.add(a.collection)
    if (a.kind === "custom-call") contracts.add(a.target)
  }
  if ([...contracts].some((c) => isAddressEqual(c as Address, recipient))) {
    throw new RecoveryPlanError(
      "The safe wallet is a contract this rescue acts on. Use a wallet address.",
    )
  }

  const revokes: Call[] = []
  const custom: Call[] = []
  const nfts: Call[] = []
  const tokens = new Map<string, Address>()
  let sweepNative = false

  for (const action of actions) {
    switch (action.kind) {
      case "revoke-allowance":
        revokes.push({
          target: action.token,
          value: 0n,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [action.spender, 0n],
          }),
        })
        break
      case "revoke-operator":
        revokes.push({
          target: action.collection,
          value: 0n,
          data: encodeFunctionData({
            abi: erc1155Abi,
            functionName: "setApprovalForAll",
            args: [action.operator, false],
          }),
        })
        break
      case "custom-call":
        custom.push({ target: action.target, value: action.value, data: action.data })
        break
      case "transfer-erc721":
        nfts.push({
          target: action.collection,
          value: 0n,
          data: encodeFunctionData({
            abi: erc721Abi,
            functionName: "safeTransferFrom",
            args: [owner, recipient, action.tokenId],
          }),
        })
        break
      case "transfer-erc1155":
        nfts.push({
          target: action.collection,
          value: 0n,
          data: encodeFunctionData({
            abi: erc1155Abi,
            functionName: "safeTransferFrom",
            args: [owner, recipient, action.tokenId, action.amount, "0x"],
          }),
        })
        break
      case "sweep-token":
        tokens.set(action.token.toLowerCase(), getAddress(action.token))
        break
      case "sweep-native":
        sweepNative = true
        break
      default:
        action satisfies never
    }
  }

  return {
    calls: [...revokes, ...custom, ...nfts],
    tokens: [...tokens.values()],
    sweepNative,
    recipient: getAddress(recipient),
    executor: getAddress(executor),
    nonce: input.nonce,
    deadline: input.deadline,
  }
}

/** Fee in the asset's own units, rounded down exactly like the contract. */
export function feeOf(amount: bigint, feeBps: number) {
  return (amount * BigInt(feeBps)) / 10_000n
}
