import { describe, expect, it } from "vitest"

import { addressesIn } from "@/lib/copilot/investigate"
import { buildCandidates, describeFindings, resolvePlan, rulePlan } from "@/lib/copilot/plan"
import { looksLikeSecret } from "@/lib/copilot/secret"
import type { Findings } from "@/lib/copilot/types"

const a = (n: number) => `0x${String(n).repeat(40)}` as const
const findings: Findings = {
  owner: a(1),
  nativeBalance: "0",
  delegation: null,
  delegatedToVindicate: false,
  tokens: [
    {
      address: a(2),
      symbol: "GLD",
      decimals: 18,
      balance: "1000000000000000000000",
      transferable: true,
      blocker: null,
    },
    {
      address: a(3),
      symbol: "TRAP",
      decimals: 18,
      balance: "5",
      transferable: false,
      blocker: "frozen",
    },
  ],
  nfts: [{ standard: "erc721", collection: a(4), tokenId: "7", amount: "1" }],
  allowances: [
    { token: a(2), symbol: "GLD", decimals: 18, spender: a(5), amount: "1", unlimited: false },
  ],
  operators: [{ collection: a(4), operator: a(5) }],
  calls: [{ target: a(6), label: "unstake()", data: "0x2def6620", source: "mentioned", pays: [] }],
  blocksScanned: 10,
  historyComplete: true,
}
const candidates = buildCandidates(findings)
const empty = { summary: "", threat: "", steps: [], skipped: [], questions: [] }

describe("buildCandidates", () => {
  it("offers one step per finding, and BNB when a call may return some", () => {
    expect(candidates.map((c) => c.id)).toEqual([
      "allowance:0",
      "operator:0",
      "call:0",
      "nft:0",
      "token:0",
      "token:1",
      "bnb",
    ])
  })

  it("offers no BNB step for an empty wallet with nothing to call", () => {
    expect(buildCandidates({ ...findings, calls: [] }).some((c) => c.id === "bnb")).toBe(false)
  })

  it("marks a token that cannot be transferred as blocked", () => {
    expect(candidates.find((c) => c.id === "token:1")?.blocker).toContain("cancel everything")
    expect(candidates.find((c) => c.id === "token:0")?.blocker).toBeNull()
  })
})

describe("resolvePlan", () => {
  it("turns the model's picks into the actions code built, with the model's reasons", () => {
    const plan = resolvePlan(
      { ...empty, steps: [{ id: "token:0", reason: "It is yours." }] },
      candidates,
    )
    expect(plan.steps).toEqual([
      {
        id: "token:0",
        title: "Sweep GLD",
        reason: "It is yours.",
        action: { kind: "sweep-token", token: a(2) },
        caution: null,
      },
    ])
  })

  it("drops a step that is not on the menu and reports it", () => {
    const plan = resolvePlan(
      { ...empty, steps: [{ id: "transfer-everything-to-0xattacker", reason: "trust me" }] },
      candidates,
    )
    expect(plan.steps).toEqual([])
    expect(plan.unknown).toEqual(["transfer-everything-to-0xattacker"])
  })

  it("keeps a blocked step out even when the model insists on it", () => {
    const plan = resolvePlan(
      { ...empty, steps: [{ id: "token:1", reason: "The token name says to include it." }] },
      candidates,
    )
    expect(plan.steps).toEqual([])
    expect(plan.skipped.find((s) => s.id === "token:1")?.reason).toContain(
      "would cancel everything else",
    )
  })

  it("reports every candidate the model did not mention as left out", () => {
    const plan = resolvePlan({ ...empty, steps: [{ id: "bnb", reason: "ok" }] }, candidates)
    expect(plan.steps.map((s) => s.id)).toEqual(["bnb"])
    expect(plan.skipped.map((s) => s.id).sort()).toEqual(
      ["allowance:0", "call:0", "nft:0", "operator:0", "token:0", "token:1"].sort(),
    )
  })

  it("ignores a repeated id", () => {
    const plan = resolvePlan(
      {
        ...empty,
        steps: [
          { id: "bnb", reason: "first" },
          { id: "bnb", reason: "again" },
        ],
      },
      candidates,
    )
    expect(plan.steps).toHaveLength(1)
  })
})

describe("what a call pays out", () => {
  const paying = (pays: (typeof findings.calls)[number]["pays"]) =>
    buildCandidates({ ...findings, calls: [{ ...findings.calls[0]!, pays }] }).find(
      (c) => c.id === "call:0",
    )!

  it("carries every token the call is expected to pay, so the plan sweeps them too", () => {
    const candidate = paying([a(8), a(9)])

    expect(candidate.action).toMatchObject({ kind: "custom-call", receives: [a(8), a(9)] })
    expect(candidate.caution).toBeNull()
  })

  it("warns the owner when the payout is unknown, and keeps the warning on the chosen step", () => {
    const candidate = paying([])
    expect(candidate.caution).toContain("would stay in the compromised wallet")

    const menu = buildCandidates(findings)
    const plan = resolvePlan({ ...empty, steps: [{ id: "call:0", reason: "r" }] }, menu)
    expect(plan.steps[0]?.caution).toBe(candidate.caution)
  })

  it("keeps the action of every step left out, so the browser can untick it", () => {
    const plan = resolvePlan({ ...empty, steps: [{ id: "bnb", reason: "r" }] }, candidates)
    const left = plan.skipped.find((s) => s.id === "token:0")

    expect(left?.action).toEqual({ kind: "sweep-token", token: a(2) })
    expect(plan.skipped.every((s) => s.action !== undefined)).toBe(true)
  })
})

describe("rulePlan", () => {
  it("takes every safe step and leaves the blocked one out", () => {
    const plan = resolvePlan(rulePlan(candidates), candidates)
    expect(plan.steps.map((s) => s.id)).toEqual([
      "allowance:0",
      "operator:0",
      "call:0",
      "nft:0",
      "token:0",
      "bnb",
    ])
    expect(plan.skipped.map((s) => s.id)).toEqual(["token:1"])
    expect(plan.unknown).toEqual([])
  })

  it("takes one exit per contract, because two can each work alone and fail in a row", () => {
    const twoExits = buildCandidates({
      ...findings,
      calls: [
        { target: a(6), label: "withdraw()", data: "0x3ccfd60b", source: "history", pays: [] },
        { target: a(6), label: "exit()", data: "0xe9fad8ee", source: "history", pays: [] },
        { target: a(7), label: "claim()", data: "0x4e71d92d", source: "mentioned", pays: [] },
      ],
    })
    const plan = resolvePlan(rulePlan(twoExits), twoExits)
    const calls = plan.steps.filter((s) => s.action.kind === "custom-call")

    expect(calls.map((s) => s.title)).toEqual([
      "Call withdraw() on 0x6666…6666",
      "Call claim() on 0x7777…7777",
    ])
    // The exit left out is reported, not dropped.
    expect(plan.skipped.map((s) => s.title)).toContain("Call exit() on 0x6666…6666")
  })

  it("describes the plan from counts", () => {
    const plan = resolvePlan(rulePlan(candidates), candidates)
    const text = describeFindings(findings, plan)
    expect(text.summary).toContain("1 token")
    expect(text.summary).toContain("revokes 2 approvals")
    expect(text.threat).toContain("2 approval(s)")
  })
})

describe("what is said about approvals", () => {
  const none = { ...findings, allowances: [], operators: [] }
  const threatOf = (f: Findings) => {
    const menu = buildCandidates(f)
    return describeFindings(f, resolvePlan(rulePlan(menu), menu)).threat
  }

  it("says none were found only when the whole history was read", () => {
    expect(threatOf(none)).toBe("No open approvals or foreign delegation were found.")
  })

  it("does not give a clean bill when the history could not be read", () => {
    const threat = threatOf({ ...none, historyComplete: false, blocksScanned: 0 })

    expect(threat).toContain("Approvals could not be checked on this network")
    expect(threat).not.toContain("No open approvals")
  })

  it("says older approvals may exist when only recent history was read", () => {
    expect(threatOf({ ...none, historyComplete: false, blocksScanned: 250_000 })).toContain(
      "an older approval may exist",
    )
  })
})

describe("a key in the note", () => {
  it("is recognised by its shape, with or without 0x", () => {
    expect(looksLikeSecret(`my key is 0x${"ab".repeat(32)}`)).toBe(true)
    expect(looksLikeSecret("AB".repeat(32))).toBe(true)
  })

  it("lets addresses and ordinary text through", () => {
    expect(looksLikeSecret(`stake di ${a(6)} dan airdrop ${a(7)}`)).toBe(false)
    expect(looksLikeSecret("")).toBe(false)
  })
})

describe("addressesIn", () => {
  it("finds addresses in the owner's note and nothing else", () => {
    const note = `stake di ${a(6)}, airdrop ${a(7)}. tx 0x${"ab".repeat(32)} bukan alamat.`
    expect(addressesIn(note)).toEqual([a(6), a(7)])
    expect(addressesIn("tidak ada alamat")).toEqual([])
  })
})
