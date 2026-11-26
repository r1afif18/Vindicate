import { describe, expect, it } from "vitest"

import { normalizePrivateKey } from "@/lib/keys"

const key = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

describe("normalizePrivateKey", () => {
  it("accepts keys with or without 0x and surrounding space", () => {
    expect(normalizePrivateKey(key)).toBe(`0x${key}`)
    expect(normalizePrivateKey(`  0x${key.toUpperCase()} `)).toBe(`0x${key}`)
  })
  it("rejects anything that is not 32 bytes of hex", () => {
    expect(normalizePrivateKey(key.slice(1))).toBeNull()
    expect(normalizePrivateKey(`${key}00`)).toBeNull()
    expect(normalizePrivateKey("word ".repeat(12))).toBeNull()
  })
})
