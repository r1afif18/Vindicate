import { type Hex, getAddress, isAddress, isHex } from "viem"
import { z } from "zod"

import type { NetworkId } from "@/lib/chains"
import { env } from "@/lib/env"

const address = z
  .string()
  .refine((v) => isAddress(v, { strict: false }), "must be a 0x address")
  .transform((v) => getAddress(v))
const calldata = z
  .string()
  .refine((v) => isHex(v, { strict: true }) && v.length >= 10, "must be hex calldata")
  .transform((v) => v as Hex)
const integer = z.string().regex(/^\d+$/, "must be a whole number")
const call = z.object({ target: address, data: calldata })

/**
 * A set of practice assets on one network: a wallet whose key is public on purpose, holding a
 * token a drainer is approved for, an unclaimed airdrop, a stake and two NFTs. It lets someone
 * try every kind of rescue without first losing a wallet. Addresses only, never a key.
 */
const schema = z.object({
  wallet: address,
  token: address,
  drainer: address,
  claim: call.extend({ token: address }),
  unstake: call,
  nft: z.object({ collection: address, tokenId: integer }),
  items: z.object({ collection: address, tokenId: integer, amount: integer }),
})

export type DemoScenario = z.infer<typeof schema>

/** Throws on a malformed value, so a bad demo config fails the build instead of the demo. */
export function parseDemo(raw: string | undefined): DemoScenario | null {
  if (!raw) return null
  return schema.parse(JSON.parse(raw))
}

// There is deliberately no mainnet entry: practice assets do not belong next to real ones.
const scenarios: Record<NetworkId, DemoScenario | null> = {
  bsc: null,
  "bsc-testnet": parseDemo(env.NEXT_PUBLIC_DEMO_BSC_TESTNET),
}

export const demoFor = (network: NetworkId) => scenarios[network]
