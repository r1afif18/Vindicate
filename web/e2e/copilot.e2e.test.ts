/**
 * The copilot's investigation, end to end on a local chain: it is given nothing but a wallet
 * address (and two contract addresses the owner "mentions"), must find everything worth
 * rescuing by reading the chain, and the plan built from its findings must then actually rescue
 * the wallet. No model is involved here: this covers the part that has to be right regardless
 * of which model, or no model, picks among the steps.
 *
 * Run: pnpm vitest run --config e2e/vitest.config.ts
 */
import { type ChildProcess, spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
  type Abi,
  type Address,
  type Hex,
  createTestClient,
  createWalletClient,
  erc20Abi,
  erc721Abi,
  getAddress,
  http,
  maxUint256,
  parseAbi,
  parseEther,
} from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { bscTestnet } from "viem/chains"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { type Network, publicClientFor } from "@/lib/chains"
import { addressesIn, investigate } from "@/lib/copilot/investigate"
import { buildCandidates, resolvePlan, rulePlan } from "@/lib/copilot/plan"
import type { CopilotAction } from "@/lib/copilot/types"
import {
  confirmRecovery,
  prepareRecovery,
  sendRecovery,
  waitForRecovery,
} from "@/lib/recovery/execute"
import { scanWallet } from "@/lib/recovery/scan"
import type { RecoveryAction } from "@/lib/recovery/types"

const PORT = 8_755
const RPC = `http://127.0.0.1:${PORT}`
const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11"
const chain = { ...bscTestnet, rpcUrls: { default: { http: [RPC] } } }
const outDir = fileURLToPath(new URL("../../contracts/out", import.meta.url))
const mockAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function freeze(address holder)",
  "function stake() payable",
])
const tokenVaultAbi = parseAbi(["function stake(address token, uint256 amount)"])
const spammerAbi = parseAbi(["function spam(address victim)"])
const itemsAbi = parseAbi([
  "function mint(address to, uint256 id, uint256 amount)",
  "function setApprovalForAll(address operator, bool approved)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
])

interface Actor {
  key: Hex
  address: Address
}
const actor = (): Actor => {
  const key = generatePrivateKey()
  return { key, address: privateKeyToAccount(key).address }
}
const artifact = (file: string, name: string) => {
  const json = JSON.parse(readFileSync(`${outDir}/${file}/${name}.json`, "utf8"))
  return {
    abi: json.abi as Abi,
    bytecode: json.bytecode.object as Hex,
    runtime: json.deployedBytecode.object as Hex,
  }
}
const mock = (name: string) => artifact("E2EScenarios.sol", name)

let node: ChildProcess
let network: Network
const ops = actor()
const client = publicClientFor({
  id: "bsc-testnet",
  name: "Anvil",
  chain,
  rpcUrl: RPC,
  delegate: undefined,
})
const anvil = createTestClient({ mode: "anvil", chain, transport: http(RPC) })
const walletOf = (who: Actor) =>
  createWalletClient({ account: privateKeyToAccount(who.key), chain, transport: http(RPC) })

async function deploy(art: ReturnType<typeof artifact>, args: readonly unknown[] = []) {
  const hash = await walletOf(ops).deployContract({ abi: art.abi, bytecode: art.bytecode, args })
  const receipt = await client.waitForTransactionReceipt({ hash })
  return getAddress(receipt.contractAddress as Address)
}
async function send(
  from: Actor,
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
  value = 0n,
) {
  const hash = await walletOf(from).writeContract({ address, abi, functionName, args, value })
  const receipt = await client.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`)
}
const fund = (who: Address, bnb: string) =>
  anvil.setBalance({ address: who, value: parseEther(bnb) })
const tokensOf = (token: Address, who: Address) =>
  client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] })

/** The same translation the browser does when the owner presses "Use this plan". */
function toRecoveryActions(actions: readonly CopilotAction[]): RecoveryAction[] {
  return actions.flatMap((a): RecoveryAction[] => {
    switch (a.kind) {
      case "sweep-native":
        return [{ kind: "sweep-native" }]
      case "sweep-token":
        return [{ kind: "sweep-token", token: a.token }]
      case "revoke-allowance":
        return [
          { kind: "revoke-allowance", token: a.allowance.token, spender: a.allowance.spender },
        ]
      case "revoke-operator":
        return [{ kind: "revoke-operator", collection: a.collection, operator: a.operator }]
      case "transfer-erc721":
        return [{ kind: "transfer-erc721", collection: a.collection, tokenId: BigInt(a.tokenId) }]
      case "transfer-erc1155":
        return [
          {
            kind: "transfer-erc1155",
            collection: a.collection,
            tokenId: BigInt(a.tokenId),
            amount: BigInt(a.amount),
          },
        ]
      case "custom-call":
        return [
          { kind: "custom-call", target: a.target, data: a.data, value: 0n },
          ...a.receives.map((token) => ({ kind: "sweep-token" as const, token })),
        ]
    }
  })
}

beforeAll(async () => {
  node = spawn("anvil", [
    "--hardfork",
    "prague",
    "--chain-id",
    String(chain.id),
    "--port",
    String(PORT),
    "--silent",
  ])
  for (let i = 0; i < 100; i++) {
    try {
      await client.getChainId()
      break
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  await anvil.setCode({
    address: MULTICALL3,
    bytecode: artifact("Multicall3.sol", "Multicall3").runtime,
  })
  await fund(ops.address, "1000")
  const delegate = await deploy(artifact("VindicateDelegate.sol", "VindicateDelegate"), [
    actor().address,
    1_000,
  ])
  network = { id: "bsc-testnet", name: "Anvil", chain, rpcUrl: RPC, delegate }
})

afterAll(() => {
  node?.kill()
})

describe("copilot investigation", () => {
  it("finds what a wallet holds, what it approved and what it can still claim, from the address alone", async () => {
    const victim = actor()
    const sponsor = actor()
    const safe = actor().address
    await fund(sponsor.address, "1")

    const gold = await deploy(mock("E2EToken"), ["Gold", "GLD", 18])
    const frozen = await deploy(mock("E2EFreezableToken"))
    const drop = await deploy(mock("E2EToken"), ["Drop", "DROP", 18])
    const airdrop = await deploy(mock("E2EAirdrop"), [drop])
    const vault = await deploy(mock("E2EVault"))
    const apes = await deploy(mock("E2ENft"))
    const items = await deploy(mock("E2EItems"))
    const drainer = await deploy(mock("E2EDrainer"))

    await send(ops, gold, mockAbi, "mint", [victim.address, parseEther("1000")])
    await send(ops, frozen, mockAbi, "mint", [victim.address, parseEther("50")])
    await send(ops, frozen, mockAbi, "freeze", [victim.address])
    await send(ops, apes, mockAbi, "mint", [victim.address, 7n])
    await send(ops, items, itemsAbi, "mint", [victim.address, 3n, 40n])
    await fund(victim.address, "5")
    await send(victim, gold, erc20Abi, "approve", [drainer, maxUint256])
    await send(victim, apes, erc721Abi, "setApprovalForAll", [drainer, true])
    await send(victim, vault, mockAbi, "stake", [], parseEther("2"))
    await fund(victim.address, "0") // the sweeper took the BNB

    // The owner's note names the two contracts that leave no token trail in the wallet's history.
    const note = `Wallet saya kena drain. Masih ada stake di ${vault} dan airdrop di ${airdrop}.`
    const { findings, log } = await investigate({
      network,
      owner: victim.address,
      mentioned: addressesIn(note),
      recipient: safe,
    })

    expect(findings.historyComplete).toBe(true)
    expect(findings.nativeBalance).toBe("0")
    expect(findings.tokens.map((t) => [t.symbol, t.transferable])).toEqual(
      expect.arrayContaining([
        ["GLD", true],
        ["FRZ", false],
      ]),
    )
    expect(findings.tokens).toHaveLength(2)
    expect(findings.nfts).toEqual(
      expect.arrayContaining([
        { standard: "erc721", collection: apes, tokenId: "7", amount: "1" },
        { standard: "erc1155", collection: items, tokenId: "3", amount: "40" },
      ]),
    )
    expect(findings.allowances).toEqual([
      expect.objectContaining({ token: gold, spender: drainer, unlimited: true }),
    ])
    expect(findings.operators).toEqual([{ collection: apes, operator: drainer }])
    expect(findings.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: vault, label: "unstake()", source: "mentioned" }),
        expect.objectContaining({ target: airdrop, label: "claim()", pays: [drop] }),
      ]),
    )
    expect(findings.calls).toHaveLength(2)
    expect(log.join(" ")).toContain("FRZ cannot be transferred")

    // The plan built from those findings, with no model involved, rescues the wallet.
    const candidates = buildCandidates(findings)
    const plan = resolvePlan(rulePlan(candidates), candidates)
    expect(plan.skipped.map((s) => s.title)).toEqual(["Sweep FRZ"])
    // The vault names no token, and the wallet only ever sent it BNB: the owner is told so.
    const unstake = plan.steps.find((s) => s.title.startsWith("Call unstake()"))
    expect(unstake?.caution).toContain("not known what this call pays")
    expect(plan.steps.find((s) => s.title.startsWith("Call claim()"))?.caution).toBeNull()

    const report = await scanWallet(network, victim.address)
    const prepared = await prepareRecovery({
      network,
      ownerKey: victim.key,
      sponsorKey: sponsor.key,
      recipient: safe,
      recoveryNonce: report.recoveryNonce,
      actions: toRecoveryActions(plan.steps.map((s) => s.action)),
    })
    const receipt = await waitForRecovery(network, await sendRecovery(prepared, sponsor.key))
    confirmRecovery(prepared, receipt)

    expect(await tokensOf(gold, safe)).toBe(parseEther("900"))
    expect(await tokensOf(drop, safe)).toBe(parseEther("450"))
    expect(await client.getBalance({ address: safe })).toBe(parseEther("1.8"))
    expect(
      await client.readContract({
        address: apes,
        abi: erc721Abi,
        functionName: "ownerOf",
        args: [7n],
      }),
    ).toBe(safe)
    expect(
      await client.readContract({
        address: items,
        abi: itemsAbi,
        functionName: "balanceOf",
        args: [safe, 3n],
      }),
    ).toBe(40n)
    expect(
      await client.readContract({
        address: gold,
        abi: erc20Abi,
        functionName: "allowance",
        args: [victim.address, drainer],
      }),
    ).toBe(0n)
    // The frozen token stays behind, as the plan said it would.
    expect(await tokensOf(frozen, victim.address)).toBe(parseEther("50"))
  })

  it("rescues a token staked in a vault that never says which token it holds", async () => {
    const victim = actor()
    const sponsor = actor()
    const safe = actor().address
    await fund(sponsor.address, "1")
    await fund(victim.address, "1")

    const gold = await deploy(mock("E2EToken"), ["Gold", "GLD", 18])
    const vault = await deploy(mock("E2ETokenVault"))
    await send(ops, gold, mockAbi, "mint", [victim.address, parseEther("1000")])
    await send(victim, gold, erc20Abi, "approve", [vault, parseEther("1000")])
    // Everything is staked, so the wallet holds no GLD and a plain scan would never list it.
    await send(victim, vault, tokenVaultAbi, "stake", [gold, parseEther("1000")])
    await fund(victim.address, "0")
    expect(await tokensOf(gold, victim.address)).toBe(0n)

    // Nothing is named: the vault is found from the wallet's own transfer to it.
    const { findings } = await investigate({ network, owner: victim.address, recipient: safe })

    expect(findings.tokens).toEqual([])
    expect(findings.calls).toEqual([
      { target: vault, label: "unstake()", data: "0x2def6620", source: "history", pays: [gold] },
    ])

    const candidates = buildCandidates(findings)
    const plan = resolvePlan(rulePlan(candidates), candidates)
    expect(plan.steps.map((s) => s.action.kind)).toEqual(["custom-call", "sweep-native"])
    expect(plan.steps[0]?.caution).toBeNull()

    const report = await scanWallet(network, victim.address)
    const prepared = await prepareRecovery({
      network,
      ownerKey: victim.key,
      sponsorKey: sponsor.key,
      recipient: safe,
      recoveryNonce: report.recoveryNonce,
      actions: toRecoveryActions(plan.steps.map((s) => s.action)),
    })
    const receipt = await waitForRecovery(network, await sendRecovery(prepared, sponsor.key))
    confirmRecovery(prepared, receipt)

    // What the exit paid did not stay in the compromised wallet.
    expect(await tokensOf(gold, victim.address)).toBe(0n)
    expect(await tokensOf(gold, vault)).toBe(0n)
    expect(await tokensOf(gold, safe)).toBe(parseEther("900"))
  })

  it("is not taken down by a log anyone can forge with this wallet's name on it", async () => {
    const victim = actor()
    const gold = await deploy(mock("E2EToken"), ["Gold", "GLD", 18])
    const spammer = await deploy(mock("E2ELogSpammer"))
    await send(ops, gold, mockAbi, "mint", [victim.address, parseEther("3")])
    await send(ops, spammer, spammerAbi, "spam", [victim.address])

    // Also given in lower case, as a caller that skips checksumming would send it.
    const { findings } = await investigate({
      network,
      owner: victim.address.toLowerCase() as Address,
    })

    expect(findings.owner).toBe(victim.address)
    expect(findings.tokens.map((t) => [t.symbol, t.balance])).toEqual([
      ["GLD", parseEther("3").toString()],
    ])
    expect(findings.nfts).toEqual([])
  })

  it("leaves out a token that refuses a transfer by returning false instead of reverting", async () => {
    const victim = actor()
    const sponsor = actor()
    const safe = actor().address
    await fund(sponsor.address, "1")
    const liar = await deploy(mock("E2EFalseReturnToken"))
    await send(ops, liar, mockAbi, "mint", [victim.address, parseEther("10")])

    const { findings } = await investigate({
      network,
      owner: victim.address,
      mentioned: [liar],
      recipient: safe,
    })

    expect(findings.tokens).toEqual([
      expect.objectContaining({
        symbol: "FLS",
        transferable: false,
        blocker: "the token reports the transfer as failed",
      }),
    ])
    // It is a token, so it is not also offered as a contract to call.
    expect(findings.calls).toEqual([])
    const candidates = buildCandidates(findings)
    const plan = resolvePlan(rulePlan(candidates), candidates)
    expect(plan.steps).toEqual([])
    expect(plan.skipped.map((s) => s.title)).toEqual(["Sweep FLS"])

    // The verdict is right: forcing it into a rescue does cancel the rescue.
    const report = await scanWallet(network, victim.address, [liar])
    const forced = async () => {
      const prepared = await prepareRecovery({
        network,
        ownerKey: victim.key,
        sponsorKey: sponsor.key,
        recipient: safe,
        recoveryNonce: report.recoveryNonce,
        actions: [{ kind: "sweep-token", token: liar }],
      })
      const receipt = await waitForRecovery(network, await sendRecovery(prepared, sponsor.key))
      confirmRecovery(prepared, receipt)
    }
    await expect(forced()).rejects.toThrow()
    expect(await tokensOf(liar, victim.address)).toBe(parseEther("10"))
  })

  it("offers no exit on a contract that accepts every call and pays nothing", async () => {
    const victim = actor()
    const sink = await deploy(mock("E2EDrainerDelegate"), [actor().address])

    const { findings, log } = await investigate({
      network,
      owner: victim.address,
      mentioned: [sink],
    })

    expect(findings.calls).toEqual([])
    expect(log.join(" ")).toContain("nothing would go through right now")
  })

  it("offers nothing to call on a contract that would not pay this wallet", async () => {
    const stranger = actor()
    const vault = await deploy(mock("E2EVault"))
    const { findings } = await investigate({
      network,
      owner: stranger.address,
      mentioned: [vault],
    })

    expect(findings.calls).toEqual([])
    expect(buildCandidates(findings)).toEqual([])
  })
})
