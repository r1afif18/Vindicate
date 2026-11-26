import type { Address, Hex } from "viem"

/**
 * One step of a recovery plan. Every action compiles to calls run by the delegate inside the
 * compromised wallet, or to a sweep. New kinds plug in by adding a case here and in plan.ts.
 */
export type RecoveryAction =
  /** Move the whole balance of an ERC-20 to the safe wallet (fee applies). */
  | { kind: "sweep-token"; token: Address }
  /** Move the whole BNB balance to the safe wallet (fee applies). */
  | { kind: "sweep-native" }
  /** Set an ERC-20 allowance back to zero, cutting off a drainer contract. */
  | { kind: "revoke-allowance"; token: Address; spender: Address }
  /** Remove an operator approved for every NFT in a collection. */
  | { kind: "revoke-operator"; collection: Address; operator: Address }
  /** Move one ERC-721 to the safe wallet (no fee). */
  | { kind: "transfer-erc721"; collection: Address; tokenId: bigint }
  /** Move an ERC-1155 balance to the safe wallet (no fee). */
  | { kind: "transfer-erc1155"; collection: Address; tokenId: bigint; amount: bigint }
  /** Any call the owner wants made first, such as claiming an airdrop or unstaking. */
  | { kind: "custom-call"; target: Address; data: Hex; value: bigint }

export type RecoveryActionKind = RecoveryAction["kind"]

export interface Call {
  target: Address
  value: bigint
  data: Hex
}

/** Mirrors VindicateDelegate.Recovery. */
export interface RecoveryMessage {
  calls: readonly Call[]
  tokens: readonly Address[]
  sweepNative: boolean
  recipient: Address
  executor: Address
  nonce: bigint
  deadline: bigint
}
