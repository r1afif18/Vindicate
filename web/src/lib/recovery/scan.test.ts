import { describe, expect, it } from "vitest"

import { parseDelegation } from "@/lib/recovery/scan"

describe("parseDelegation", () => {
  it("reads the delegate from an EIP-7702 designator", () => {
    expect(parseDelegation("0xef0100a0cb889707d426a7a386870a03bc70d1b0697598")).toBe(
      "0xa0Cb889707d426A7A386870A03bc70d1b0697598",
    )
  })

  it("ignores empty accounts and ordinary contracts", () => {
    expect(parseDelegation(undefined)).toBeNull()
    expect(parseDelegation("0x")).toBeNull()
    expect(parseDelegation("0x6080604052")).toBeNull()
  })
})
