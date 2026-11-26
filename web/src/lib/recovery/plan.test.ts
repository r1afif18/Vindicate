import { decodeFunctionData, erc20Abi, erc721Abi } from "viem"
import { describe, expect, it } from "vitest"

import { RecoveryPlanError, buildRecovery, feeOf } from "@/lib/recovery/plan"

const owner = "0x1111111111111111111111111111111111111111"
const safe = "0x2222222222222222222222222222222222222222"
const sponsor = "0x3333333333333333333333333333333333333333"
const drainer = "0x4444444444444444444444444444444444444444"
const usdt = "0x55d398326f99059fF775485246999027B3197955"
const nft = "0x5555555555555555555555555555555555555555"

const base = { owner, recipient: safe, executor: sponsor, nonce: 0n, deadline: 1_000n } as const

describe("buildRecovery", () => {
  it("orders revocations, custom calls and NFT moves before sweeps", () => {
    const recovery = buildRecovery({
      ...base,
      actions: [
        { kind: "sweep-token", token: usdt },
        { kind: "transfer-erc721", collection: nft, tokenId: 7n },
        { kind: "custom-call", target: drainer, data: "0xdeadbeef", value: 0n },
        { kind: "revoke-allowance", token: usdt, spender: drainer },
        { kind: "sweep-native" },
      ],
    })

    expect(recovery.calls.map((c) => c.target)).toEqual([usdt, drainer, nft])
    expect(decodeFunctionData({ abi: erc20Abi, data: recovery.calls[0]!.data })).toMatchObject({
      functionName: "approve",
      args: [drainer, 0n],
    })
    expect(decodeFunctionData({ abi: erc721Abi, data: recovery.calls[2]!.data })).toMatchObject({
      functionName: "safeTransferFrom",
      args: [owner, safe, 7n],
    })
    expect(recovery.tokens).toEqual([usdt])
    expect(recovery.sweepNative).toBe(true)
  })

  it("deduplicates tokens regardless of address casing", () => {
    const recovery = buildRecovery({
      ...base,
      actions: [
        { kind: "sweep-token", token: usdt },
        { kind: "sweep-token", token: usdt.toLowerCase() as `0x${string}` },
      ],
    })
    expect(recovery.tokens).toHaveLength(1)
  })

  it("rejects sending assets back to the compromised wallet", () => {
    expect(() =>
      buildRecovery({ ...base, recipient: owner, actions: [{ kind: "sweep-native" }] }),
    ).toThrow(RecoveryPlanError)
  })

  it("rejects a safe wallet that is also being revoked", () => {
    expect(() =>
      buildRecovery({
        ...base,
        recipient: drainer,
        actions: [{ kind: "revoke-allowance", token: usdt, spender: drainer }],
      }),
    ).toThrow(/being revoked/)
  })

  it("rejects the zero address as the safe wallet", () => {
    expect(() =>
      buildRecovery({
        ...base,
        recipient: "0x0000000000000000000000000000000000000000",
        actions: [{ kind: "sweep-native" }],
      }),
    ).toThrow(RecoveryPlanError)
  })

  it("rejects a safe wallet that is a contract the rescue acts on", () => {
    const plans = [
      [{ kind: "sweep-token", token: safe }],
      [{ kind: "transfer-erc721", collection: safe, tokenId: 1n }],
      [{ kind: "transfer-erc1155", collection: safe, tokenId: 1n, amount: 2n }],
      [{ kind: "custom-call", target: safe, data: "0xdeadbeef", value: 0n }],
    ] as const
    for (const actions of plans) {
      expect(() => buildRecovery({ ...base, actions })).toThrow(/contract this rescue acts on/)
    }
  })

  it("rejects an empty plan", () => {
    expect(() => buildRecovery({ ...base, actions: [] })).toThrow(RecoveryPlanError)
  })
})

describe("feeOf", () => {
  it("rounds down like the contract", () => {
    expect(feeOf(999n, 1_000)).toBe(99n)
    expect(feeOf(0n, 1_000)).toBe(0n)
    expect(feeOf(10_000n, 0)).toBe(0n)
  })
})
