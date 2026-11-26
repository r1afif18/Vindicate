import { bscTestnet } from "viem/chains"
import { bsc } from "viem/chains"
import { describe, expect, it } from "vitest"

import { type Network, explorerTxUrl, isLocalRpc, isPracticeChain } from "@/lib/chains"

const on = (rpcUrl: string): Network => ({
  id: "bsc-testnet",
  name: "x",
  chain: bscTestnet,
  rpcUrl,
  delegate: undefined,
})

describe("local chain", () => {
  it("recognises a node on this machine and nothing else", () => {
    expect(isLocalRpc("http://127.0.0.1:8545")).toBe(true)
    expect(isLocalRpc("http://localhost:8545")).toBe(true)
    expect(isLocalRpc("https://bsc-testnet-dataseed.bnbchain.org")).toBe(false)
    expect(isLocalRpc("https://localhost.example.com")).toBe(false)
    expect(isLocalRpc("not a url")).toBe(false)
  })

  it("links to the explorer on a real network only", () => {
    expect(explorerTxUrl(on("https://bsc-testnet-dataseed.bnbchain.org"), "0xabc")).toBe(
      "https://testnet.bscscan.com/tx/0xabc",
    )
    // A practice transaction exists on no explorer, so no link is offered for it.
    expect(explorerTxUrl(on("http://127.0.0.1:8545"), "0xabc")).toBeNull()
  })

  it("never calls mainnet practice, even through a node on this machine", () => {
    const ownNode: Network = { ...on("http://127.0.0.1:8545"), id: "bsc", chain: bsc }

    expect(isPracticeChain(ownNode)).toBe(false)
    expect(explorerTxUrl(ownNode, "0xabc")).toBe("https://bscscan.com/tx/0xabc")
    expect(isPracticeChain(on("http://127.0.0.1:8545"))).toBe(true)
  })
})
