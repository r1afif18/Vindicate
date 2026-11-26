import { type Address, type Chain, http, createPublicClient } from "viem"
import { bsc, bscTestnet } from "viem/chains"

import { env } from "@/lib/env"

export type NetworkId = "bsc" | "bsc-testnet"

export interface Network {
  id: NetworkId
  name: string
  chain: Chain
  rpcUrl: string
  /** VindicateDelegate deployment. Undefined until deployed on this network. */
  delegate: Address | undefined
}

/**
 * True for a node on this machine: the practice chain from `pnpm dev:chain`, which borrows the
 * testnet's chain id. Nothing sent to it exists on the real network or on its explorer.
 */
export function isLocalRpc(rpcUrl: string) {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpcUrl).hostname)
  } catch {
    return false
  }
}

export const networks: Record<NetworkId, Network> = {
  bsc: {
    id: "bsc",
    name: "BNB Smart Chain",
    chain: bsc,
    rpcUrl: env.NEXT_PUBLIC_RPC_BSC,
    delegate: env.NEXT_PUBLIC_DELEGATE_BSC,
  },
  "bsc-testnet": {
    id: "bsc-testnet",
    // Named for what it is, so a practice rescue is never mistaken for one on the testnet.
    name: isLocalRpc(env.NEXT_PUBLIC_RPC_BSC_TESTNET) ? "Local practice chain" : "BNB Testnet",
    chain: bscTestnet,
    rpcUrl: env.NEXT_PUBLIC_RPC_BSC_TESTNET,
    delegate: env.NEXT_PUBLIC_DELEGATE_BSC_TESTNET,
  },
}

export const networkList = Object.values(networks)

export function publicClientFor(network: Network) {
  return createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) })
}

/**
 * The practice chain is the testnet slot pointed at this machine. Mainnet through a node of your
 * own is still mainnet, and must never be described as practice.
 */
export function isPracticeChain(network: Pick<Network, "id" | "rpcUrl">) {
  return network.id === "bsc-testnet" && isLocalRpc(network.rpcUrl)
}

/** Null on the practice chain: no public explorer has its transactions. */
export function explorerTxUrl(network: Network, hash: string) {
  const explorer = network.chain.blockExplorers?.default.url
  return explorer && !isPracticeChain(network) ? `${explorer}/tx/${hash}` : null
}

export function explorerAddressUrl(network: Network, address: string) {
  return `${network.chain.blockExplorers?.default.url}/address/${address}`
}
