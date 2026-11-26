import { describe, expect, it } from "vitest"

import { formatAmount } from "@/lib/format"

describe("formatAmount", () => {
  it("groups thousands and trims trailing zeros", () => {
    expect(formatAmount(1_240_500_000_000_000_000_000n, 18)).toBe("1,240.5")
  })
  it("shows dust instead of zero", () => {
    expect(formatAmount(1n, 18)).toBe("<0.000001")
  })
  it("handles zero and small decimals", () => {
    expect(formatAmount(0n, 18)).toBe("0")
    expect(formatAmount(1_234_567n, 6)).toBe("1.234567")
  })
})
