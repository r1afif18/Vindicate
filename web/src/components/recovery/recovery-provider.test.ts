import type { Address, Hex } from "viem"
import { describe, expect, it } from "vitest"

import { planEvents, plannedTokens } from "@/components/recovery/copilot-apply"
import {
  type RecoveryState,
  initialState,
  listedTokens,
  reducer,
  selectActions,
  sweepableNative,
} from "@/components/recovery/recovery-provider"
import { currentStep } from "@/components/recovery/step-rail"
import type { CopilotResponse } from "@/lib/copilot/types"
import type { PreparedRecovery } from "@/lib/recovery/execute"
import type { WalletReport } from "@/lib/recovery/scan"

const KEY: Hex = `0x${"11".repeat(32)}`
const OTHER_KEY: Hex = `0x${"22".repeat(32)}`
const GAS_KEY: Hex = `0x${"33".repeat(32)}`
const OWNER: Address = "0x1111111111111111111111111111111111111111"
const SAFE: Address = "0x9999999999999999999999999999999999999999"
const HELD: Address = "0x2222222222222222222222222222222222222222"
const WATCHED: Address = "0x3333333333333333333333333333333333333333"
const CLAIMABLE: Address = "0x4444444444444444444444444444444444444444"
const VAULT: Address = "0x5555555555555555555555555555555555555555"

const token = (address: Address, balance: bigint) => ({
  address,
  symbol: "TKN",
  decimals: 18,
  balance,
})

function report(tokens: WalletReport["tokens"], nativeBalance = 0n): WalletReport {
  return {
    address: OWNER,
    nativeBalance,
    delegation: null,
    delegatedToVindicate: false,
    recoveryNonce: 0n,
    tokens,
  }
}

/** A session with the compromised key pasted, which is where every scan starts. */
const started = () => reducer(initialState, { type: "ownerKey", key: KEY })

/** Applies a scan of the wallet the state currently points at. */
function scanned(state: RecoveryState, tokens: WalletReport["tokens"], nativeBalance = 0n) {
  return reducer(state, {
    type: "scanned",
    report: report(tokens, nativeBalance),
    ownerKey: state.ownerKey as Hex,
    networkId: state.networkId,
  })
}

const sweeps = (state: RecoveryState) =>
  selectActions(state).flatMap((a) => (a.kind === "sweep-token" ? [a.token] : []))
const sweepsBnb = (state: RecoveryState) =>
  selectActions(state).some((a) => a.kind === "sweep-native")
const prepared = {} as PreparedRecovery

describe("token selection", () => {
  it("sweeps tokens that hold a balance and leaves empty watch-list tokens out", () => {
    const state = scanned(started(), [token(HELD, 5n), token(WATCHED, 0n)])

    expect(listedTokens(state).map((t) => t.address)).toEqual([HELD])
    expect(sweeps(state)).toEqual([HELD])
  })

  it("sweeps a hand-added token that is still empty, so a claim's proceeds are not left behind", () => {
    let state = scanned(started(), [token(HELD, 5n)])
    state = reducer(state, { type: "addToken", token: CLAIMABLE })
    state = scanned(state, [token(HELD, 5n), token(CLAIMABLE, 0n)])

    expect(listedTokens(state).map((t) => t.address)).toEqual([HELD, CLAIMABLE])
    expect(sweeps(state)).toEqual([HELD, CLAIMABLE])
  })

  it("lets the user leave a hand-added token out again", () => {
    let state = reducer(started(), { type: "addToken", token: CLAIMABLE })
    state = scanned(state, [token(CLAIMABLE, 0n)])
    state = reducer(state, { type: "toggleToken", token: CLAIMABLE, on: false })

    expect(listedTokens(state).map((t) => t.address)).toEqual([CLAIMABLE])
    expect(sweeps(state)).toEqual([])
  })

  it("selects a watched token that only gains a balance on a later scan", () => {
    let state = scanned(started(), [token(WATCHED, 0n)])
    expect(sweeps(state)).toEqual([])

    state = scanned(state, [token(WATCHED, 7n)])
    expect(sweeps(state)).toEqual([WATCHED])
  })

  it("keeps a token unticked across a rescan", () => {
    let state = scanned(started(), [token(HELD, 5n)])
    state = reducer(state, { type: "toggleToken", token: HELD, on: false })
    state = scanned(state, [token(HELD, 5n)])

    expect(sweeps(state)).toEqual([])
  })
})

describe("BNB left to sweep", () => {
  it("leaves out what the plan's own calls send along", () => {
    let state = scanned(started(), [], 10n)
    state = reducer(state, {
      type: "addCall",
      item: { target: VAULT, data: "0x4e71d92d", value: 3n },
    })

    expect(sweepableNative(state)).toBe(7n)
  })

  it("is zero, not negative, when the calls need more than the wallet holds", () => {
    let state = scanned(started(), [], 2n)
    state = reducer(state, {
      type: "addCall",
      item: { target: VAULT, data: "0x4e71d92d", value: 3n },
    })

    expect(sweepableNative(state)).toBe(0n)
  })
})

describe("BNB selection", () => {
  it("sweeps BNB the wallet holds", () => {
    expect(sweepsBnb(scanned(started(), [], 10n))).toBe(true)
  })

  it("plans nothing for an empty wallet with no calls", () => {
    expect(selectActions(scanned(started(), [], 0n))).toEqual([])
  })

  it("sweeps BNB that a call brings into an empty wallet", () => {
    let state = scanned(started(), [], 0n)
    state = reducer(state, {
      type: "addCall",
      item: { target: VAULT, data: "0x2def6620", value: 0n },
    })

    expect(sweepsBnb(state)).toBe(true)
  })

  it("lets the user leave BNB out", () => {
    let state = scanned(started(), [], 10n)
    state = reducer(state, { type: "toggleNative", on: false })

    expect(sweepsBnb(state)).toBe(false)
  })
})

describe("the step rail", () => {
  it("follows a rescue from the key to the receipt", () => {
    expect(currentStep(initialState)).toBe(0)

    const keyed = started()
    expect(currentStep(keyed)).toBe(1)
    expect(currentStep({ ...keyed, phase: { name: "checking", task: "scan" } })).toBe(1)

    const planned = scanned(keyed, [token(HELD, 5n)])
    expect(currentStep(planned)).toBe(2)
    expect(currentStep({ ...planned, phase: { name: "checking", task: "review" } })).toBe(3)
    expect(currentStep({ ...planned, phase: { name: "checked", prepared } })).toBe(3)
    expect(currentStep({ ...planned, phase: { name: "sending", prepared } })).toBe(4)
    expect(
      currentStep({ ...planned, phase: { name: "done", hash: `0x${"ab".repeat(32)}`, swept: [] } }),
    ).toBe(5)
  })
})

describe("a copilot plan put into the rescue plan", () => {
  const GOLD = HELD
  const TRAP = WATCHED
  const PAID = CLAIMABLE
  const NOT_A_TOKEN: Address = "0x7777777777777777777777777777777777777777"
  const DRAINER: Address = "0x8888888888888888888888888888888888888888"
  const step = (action: CopilotResponse["steps"][number]["action"], id: string) => ({
    id,
    title: id,
    reason: "r",
    action,
    caution: null,
  })
  const plan: CopilotResponse = {
    mode: "ai",
    notice: null,
    summary: "",
    threat: "",
    questions: [],
    log: [],
    steps: [
      step(
        {
          kind: "revoke-allowance",
          allowance: {
            token: GOLD,
            symbol: "GLD",
            decimals: 18,
            spender: DRAINER,
            amount: "5",
            unlimited: false,
          },
        },
        "allowance:0",
      ),
      step(
        { kind: "custom-call", target: VAULT, data: "0x2def6620", receives: [PAID, NOT_A_TOKEN] },
        "call:0",
      ),
      step({ kind: "transfer-erc721", collection: DRAINER, tokenId: "7" }, "nft:0"),
      step({ kind: "sweep-token", token: GOLD }, "token:0"),
      step({ kind: "sweep-native" }, "bnb"),
    ],
    skipped: [
      {
        id: "token:1",
        title: "Sweep TRAP",
        reason: "frozen",
        action: { kind: "sweep-token", token: TRAP },
      },
    ],
  }
  // What a scan that included the plan's tokens returns: the call's payout is a token with no
  // balance yet, and the other address the call named is not a token at all.
  const scan = report([token(GOLD, 100n), token(TRAP, 5n), token(PAID, 0n)], 0n)
  const apply = (state: RecoveryState) =>
    planEvents(plan, scan, { ownerKey: KEY, networkId: state.networkId }).reduce(reducer, state)

  it("signs exactly what the plan says, in the contract's order", () => {
    // The earlier scan had ticked both held tokens, the frozen one included.
    const state = apply(scanned(started(), [token(GOLD, 100n), token(TRAP, 5n)]))

    expect(selectActions(state)).toEqual([
      { kind: "revoke-allowance", token: GOLD, spender: DRAINER },
      { kind: "custom-call", target: VAULT, data: "0x2def6620", value: 0n },
      { kind: "transfer-erc721", collection: DRAINER, tokenId: 7n },
      { kind: "sweep-token", token: GOLD },
      { kind: "sweep-token", token: PAID },
      { kind: "sweep-native" },
    ])
  })

  it("leaves out the token the copilot refused, even though the scan had ticked it", () => {
    const state = apply(scanned(started(), [token(GOLD, 100n), token(TRAP, 5n)]))

    expect(sweeps(state)).not.toContain(TRAP)
  })

  it("never adds an address the chain does not confirm as a token", () => {
    const state = apply(scanned(started(), []))

    expect(state.extraTokens).toEqual([PAID, GOLD])
    expect(state.extraTokens).not.toContain(NOT_A_TOKEN)
    expect(sweeps(state)).not.toContain(NOT_A_TOKEN)
  })

  it("changes nothing when the same plan is applied again", () => {
    const once = apply(scanned(started(), []))

    expect(selectActions(apply(once))).toEqual(selectActions(once))
  })

  it("names the tokens the scan must include", () => {
    expect(plannedTokens(plan)).toEqual([PAID, NOT_A_TOKEN, GOLD])
  })
})

describe("the same step added twice", () => {
  // Pressing "Use this plan" twice, or adding by hand what the copilot already added, must not
  // run a step twice: the second transfer or withdrawal reverts and cancels the whole rescue.
  const count = (state: RecoveryState, kind: string) =>
    selectActions(state).filter((a) => a.kind === kind).length

  it("keeps one copy of a call, whatever the case of the address", () => {
    const call = { target: VAULT, data: "0x2def6620" as Hex, value: 0n }
    let state = scanned(started(), [])
    state = reducer(state, { type: "addCall", item: call })
    state = reducer(state, {
      type: "addCall",
      item: { ...call, target: VAULT.toUpperCase().replace("0X", "0x") as Address },
    })

    expect(count(state, "custom-call")).toBe(1)
  })

  it("keeps two different calls to the same contract", () => {
    let state = scanned(started(), [])
    state = reducer(state, {
      type: "addCall",
      item: { target: VAULT, data: "0x2def6620", value: 0n },
    })
    state = reducer(state, {
      type: "addCall",
      item: { target: VAULT, data: "0x4e71d92d", value: 0n },
    })

    expect(count(state, "custom-call")).toBe(2)
  })

  it("keeps one copy of an NFT, and both of two different ids", () => {
    const nft = { standard: "erc721" as const, collection: HELD, tokenId: 7n, amount: 1n }
    let state = scanned(started(), [])
    state = reducer(state, { type: "addNft", item: nft })
    state = reducer(state, { type: "addNft", item: nft })
    state = reducer(state, { type: "addNft", item: { ...nft, tokenId: 8n } })

    expect(count(state, "transfer-erc721")).toBe(2)
  })

  it("treats the same ERC-1155 item with another quantity as a correction", () => {
    const item = { standard: "erc1155" as const, collection: HELD, tokenId: 3n, amount: 10n }
    let state = scanned(started(), [])
    state = reducer(state, { type: "addNft", item })
    state = reducer(state, { type: "addNft", item: { ...item, amount: 40n } })

    expect(selectActions(state)).toEqual([
      { kind: "transfer-erc1155", collection: HELD, tokenId: 3n, amount: 40n },
    ])
  })

  it("keeps one copy of an operator revoke", () => {
    const item = { collection: HELD, operator: VAULT }
    let state = scanned(started(), [])
    state = reducer(state, { type: "addOperator", item })
    state = reducer(state, { type: "addOperator", item })

    expect(count(state, "revoke-operator")).toBe(1)
  })

  it("leaves a token out when it is unticked after being added", () => {
    let state = scanned(started(), [token(HELD, 5n), token(CLAIMABLE, 0n)])
    state = reducer(state, { type: "addToken", token: CLAIMABLE })
    state = reducer(state, { type: "toggleToken", token: HELD, on: false })

    expect(sweeps(state)).toEqual([CLAIMABLE])
  })
})

describe("results that arrive late", () => {
  it("drops a review that finished after the plan was edited", () => {
    const reviewing = scanned(started(), [], 10n)
    const edited = reducer(reviewing, { type: "recipient", address: SAFE })
    const late = reducer(edited, {
      type: "phase",
      phase: { name: "checked", prepared },
      revision: reviewing.revision,
    })

    expect(late.phase.name).toBe("idle")
    expect(late).toBe(edited)
  })

  it("accepts a review of the current plan", () => {
    const reviewing = reducer(scanned(started(), [], 10n), { type: "recipient", address: SAFE })
    const done = reducer(reviewing, {
      type: "phase",
      phase: { name: "checked", prepared },
      revision: reviewing.revision,
    })

    expect(done.phase.name).toBe("checked")
  })

  it("drops a scan of a wallet that has since been replaced", () => {
    const first = started()
    const replaced = reducer(first, { type: "ownerKey", key: OTHER_KEY })
    const late = reducer(replaced, {
      type: "scanned",
      report: report([token(HELD, 5n)], 10n),
      ownerKey: KEY,
      networkId: first.networkId,
    })

    expect(late.report).toBeNull()
  })

  it("drops a scan made on another network", () => {
    const first = started()
    const switched = reducer(first, { type: "network", networkId: "bsc-testnet" })
    const other = switched.networkId === first.networkId ? "bsc" : first.networkId
    const late = reducer(switched, {
      type: "scanned",
      report: report([], 10n),
      ownerKey: KEY,
      networkId: other,
    })

    expect(late.report).toBeNull()
  })

  it("does not resurrect a rescue after the keys were forgotten mid-send", () => {
    let sending = reducer(scanned(started(), [], 10n), { type: "recipient", address: SAFE })
    sending = reducer(sending, { type: "phase", phase: { name: "sending", prepared } })
    const forgotten = reducer(sending, { type: "reset" })
    const late = reducer(forgotten, {
      type: "phase",
      phase: { name: "done", hash: "0xabc", swept: [] },
      revision: sending.revision,
    })

    expect(late.phase.name).toBe("idle")
    expect(late.ownerKey).toBeNull()
  })

  it("returns a stale review to idle with a fresh scan and the reason", () => {
    let sending = reducer(scanned(started(), [], 10n), { type: "recipient", address: SAFE })
    sending = reducer(sending, { type: "phase", phase: { name: "sending", prepared } })
    const stale = reducer(sending, {
      type: "stale",
      report: report([], 4n),
      message: "review again",
      revision: sending.revision,
    })

    expect(stale.phase.name).toBe("idle")
    expect(stale.error).toBe("review again")
    expect(stale.report?.nativeBalance).toBe(4n)
    expect(stale.recipient).toBe(SAFE)
  })
})

describe("what survives a change of wallet or network", () => {
  const funded = () => {
    let state = reducer(started(), { type: "sponsor", key: GAS_KEY, source: "generated" })
    state = reducer(state, { type: "recipient", address: SAFE })
    return scanned(state, [token(HELD, 5n)], 10n)
  }

  it("keeps the gas wallet and the safe wallet when the compromised key is replaced", () => {
    const state = reducer(funded(), { type: "ownerKey", key: OTHER_KEY })

    expect(state.sponsorKey).toBe(GAS_KEY)
    expect(state.recipient).toBe(SAFE)
    expect(state.report).toBeNull()
  })

  it("keeps them when the network is switched", () => {
    const before = funded()
    const state = reducer(before, {
      type: "network",
      networkId: before.networkId === "bsc" ? "bsc-testnet" : "bsc",
    })

    expect(state.sponsorKey).toBe(GAS_KEY)
    expect(state.recipient).toBe(SAFE)
    expect(state.ownerKey).toBe(KEY)
    expect(state.report).toBeNull()
  })

  it("keeps only the gas wallet for another rescue", () => {
    const state = reducer(funded(), { type: "again" })

    expect(state.sponsorKey).toBe(GAS_KEY)
    expect(state.ownerKey).toBeNull()
    expect(state.recipient).toBeNull()
  })

  it("forgets everything on reset", () => {
    const state = reducer(funded(), { type: "reset" })

    expect(state.sponsorKey).toBeNull()
    expect(state.ownerKey).toBeNull()
    expect(state.recipient).toBeNull()
  })
})
