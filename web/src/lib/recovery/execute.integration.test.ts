/**
 * End-to-end check against a local Prague-enabled anvil node: the browser-side signing code must
 * produce signatures, authorizations and calldata the real contract accepts.
 * Needs `anvil` on PATH and `forge build` output in contracts/out. Skips otherwise.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
  type Abi,
  type Address,
  type Hex,
  createWalletClient,
  erc20Abi,
  http,
  parseEther,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { foundry as anvilChain } from "viem/chains"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { type Network, publicClientFor } from "@/lib/chains"
import {
  prepareRecovery,
  revokeDelegation,
  sendRecovery,
  waitForRecovery,
} from "@/lib/recovery/execute"
import { scanWallet } from "@/lib/recovery/scan"

const outDir = fileURLToPath(new URL("../../../../contracts/out", import.meta.url))
const hasAnvil = (() => {
  try {
    execFileSync("anvil", ["--version"], { stdio: "ignore" })
    return existsSync(outDir)
  } catch {
    return false
  }
})()

// Well-known anvil dev keys. Never funded anywhere real.
const DEPLOYER: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
const OWNER: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
const SPONSOR: Hex = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
const SAFE: Address = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
const TREASURY: Address = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
const PORT = 8_645
const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11"
const foundry = { ...anvilChain, contracts: { multicall3: { address: MULTICALL3 } } }

function artifact(file: string, name: string) {
  const json = JSON.parse(readFileSync(`${outDir}/${file}/${name}.json`, "utf8"))
  return {
    abi: json.abi as Abi,
    bytecode: json.bytecode.object as Hex,
    runtime: json.deployedBytecode.object as Hex,
  }
}

describe.skipIf(!hasAnvil)("recovery against a local chain", () => {
  let node: ChildProcess
  let network: Network
  let token: Address

  beforeAll(async () => {
    node = spawn("anvil", ["--hardfork", "prague", "--port", String(PORT), "--silent"])
    const rpcUrl = `http://127.0.0.1:${PORT}`
    const base = { id: "bsc-testnet", name: "Anvil", chain: foundry, rpcUrl } as const
    const client = publicClientFor({ ...base, delegate: undefined })
    for (let i = 0; i < 50; i++) {
      try {
        await client.getChainId()
        break
      } catch {
        await new Promise((r) => setTimeout(r, 100))
      }
    }

    await client.request({
      method: "anvil_setCode" as never,
      params: [MULTICALL3, artifact("Multicall3.sol", "Multicall3").runtime] as never,
    })

    const deployer = createWalletClient({
      account: privateKeyToAccount(DEPLOYER),
      chain: foundry,
      transport: http(rpcUrl),
    })
    const delegateArt = artifact("VindicateDelegate.sol", "VindicateDelegate")
    const tokenArt = artifact("VindicateDelegate.t.sol", "MockToken")

    const deploy = async (art: ReturnType<typeof artifact>, args: readonly unknown[]) => {
      const hash = await deployer.deployContract({ abi: art.abi, bytecode: art.bytecode, args })
      const receipt = await client.waitForTransactionReceipt({ hash })
      return receipt.contractAddress as Address
    }

    const delegate = await deploy(delegateArt, [TREASURY, 1_000])
    token = await deploy(tokenArt, [])
    const owner = privateKeyToAccount(OWNER).address
    await client.waitForTransactionReceipt({
      hash: await deployer.writeContract({
        address: token,
        abi: tokenArt.abi,
        functionName: "mint",
        args: [owner, parseEther("1000")],
      }),
    })
    network = { ...base, delegate }
  })

  afterAll(() => {
    node?.kill()
  })

  it("sweeps tokens and BNB to the safe wallet in one transaction", async () => {
    const owner = privateKeyToAccount(OWNER).address
    const report = await scanWallet(network, owner, [token])
    expect(report.tokens[0]?.balance).toBe(parseEther("1000"))

    const prepared = await prepareRecovery({
      network,
      ownerKey: OWNER,
      sponsorKey: SPONSOR,
      recipient: SAFE,
      recoveryNonce: report.recoveryNonce,
      actions: [{ kind: "sweep-token", token }, { kind: "sweep-native" }],
    })
    const receipt = await waitForRecovery(network, await sendRecovery(prepared, SPONSOR))
    expect(receipt.status).toBe("success")

    const client = publicClientFor(network)
    const balanceOf = (account: Address) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      })
    expect(await balanceOf(SAFE)).toBe(parseEther("900"))
    expect(await balanceOf(TREASURY)).toBe(parseEther("100"))
    expect(await client.getBalance({ address: owner })).toBe(0n)

    const after = await scanWallet(network, owner, [token])
    expect(after.delegatedToVindicate).toBe(true)
    expect(after.recoveryNonce).toBe(1n)
  })

  it("clears the delegation on request", async () => {
    const owner = privateKeyToAccount(OWNER).address
    await waitForRecovery(network, await revokeDelegation(network, OWNER, SPONSOR))
    const report = await scanWallet(network, owner)
    expect(report.delegation).toBeNull()
    expect(report.recoveryNonce).toBe(1n)
  })
})
