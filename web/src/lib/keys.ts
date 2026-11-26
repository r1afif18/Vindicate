import type { Hex } from "viem"

/** Accepts a 32-byte private key with or without 0x. Returns null when malformed. */
export function normalizePrivateKey(input: string): Hex | null {
  const trimmed = input.trim()
  const hex = trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed
  return /^[0-9a-fA-F]{64}$/.test(hex) ? (`0x${hex.toLowerCase()}` as Hex) : null
}
