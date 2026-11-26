import { describe, expect, it } from "vitest"

import { parseDemo } from "@/lib/demo"

const a = (n: number) => `0x${String(n).repeat(40)}`
const valid = {
  wallet: a(1),
  token: a(2),
  drainer: a(3),
  claim: { target: a(4), data: "0x4e71d92d", token: a(5) },
  unstake: { target: a(6), data: "0x2def6620" },
  nft: { collection: a(7), tokenId: "7" },
  items: { collection: a(8), tokenId: "3", amount: "40" },
}

describe("parseDemo", () => {
  it("is off when nothing is configured", () => {
    expect(parseDemo(undefined)).toBeNull()
    expect(parseDemo("")).toBeNull()
  })

  it("reads a complete scenario", () => {
    const demo = parseDemo(JSON.stringify(valid))
    expect(demo?.claim.data).toBe("0x4e71d92d")
    expect(demo?.items.amount).toBe("40")
  })

  it("rejects a scenario with a bad address or calldata", () => {
    expect(() => parseDemo(JSON.stringify({ ...valid, token: "0x123" }))).toThrow()
    expect(() =>
      parseDemo(JSON.stringify({ ...valid, claim: { ...valid.claim, data: "claim()" } })),
    ).toThrow()
    expect(() => parseDemo("not json")).toThrow()
  })
})
