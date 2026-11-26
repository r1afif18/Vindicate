import type { Address, TypedDataDomain } from "viem"

/** EIP-712 types. Must match RECOVERY_TYPEHASH and CALL_TYPEHASH in VindicateDelegate.sol. */
export const recoveryTypes = {
  Call: [
    { name: "target", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
  ],
  Recovery: [
    { name: "calls", type: "Call[]" },
    { name: "tokens", type: "address[]" },
    { name: "sweepNative", type: "bool" },
    { name: "recipient", type: "address" },
    { name: "executor", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const

/** Under EIP-7702 the delegate runs at the owner's address, so that is the verifying contract. */
export function recoveryDomain(chainId: number, owner: Address): TypedDataDomain {
  return { name: "Vindicate", version: "1", chainId, verifyingContract: owner }
}
