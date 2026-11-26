import { isAddress } from "viem"
import { z } from "zod"

const address = z
  .string()
  .refine((v) => isAddress(v, { strict: false }), "must be a 0x address")
  .transform((v) => v as `0x${string}`)

/** HTTPS everywhere; plain HTTP only for a local dev chain. */
const rpcUrl = z.url().refine((v) => {
  const { protocol, hostname } = new URL(v)
  return (
    protocol === "https:" ||
    (protocol === "http:" && (hostname === "127.0.0.1" || hostname === "localhost"))
  )
}, "must be an https URL")

const schema = z.object({
  NEXT_PUBLIC_DELEGATE_BSC: address.optional(),
  NEXT_PUBLIC_DELEGATE_BSC_TESTNET: address.optional(),
  NEXT_PUBLIC_RPC_BSC: rpcUrl.default("https://bsc-dataseed.bnbchain.org"),
  NEXT_PUBLIC_RPC_BSC_TESTNET: rpcUrl.default("https://bsc-testnet-dataseed.bnbchain.org"),
  /** JSON describing practice assets on testnet. Parsed and validated in lib/demo.ts. */
  NEXT_PUBLIC_DEMO_BSC_TESTNET: z.string().optional(),
})

const empty = (v: string | undefined) => (v === "" ? undefined : v)

/**
 * Public runtime config. Each variable is read by its literal name so Next.js can inline it.
 * Parsing fails the build on a malformed value instead of shipping a broken app.
 */
export const env = schema.parse({
  NEXT_PUBLIC_DELEGATE_BSC: empty(process.env.NEXT_PUBLIC_DELEGATE_BSC),
  NEXT_PUBLIC_DELEGATE_BSC_TESTNET: empty(process.env.NEXT_PUBLIC_DELEGATE_BSC_TESTNET),
  NEXT_PUBLIC_RPC_BSC: empty(process.env.NEXT_PUBLIC_RPC_BSC),
  NEXT_PUBLIC_RPC_BSC_TESTNET: empty(process.env.NEXT_PUBLIC_RPC_BSC_TESTNET),
  NEXT_PUBLIC_DEMO_BSC_TESTNET: empty(process.env.NEXT_PUBLIC_DEMO_BSC_TESTNET),
})
