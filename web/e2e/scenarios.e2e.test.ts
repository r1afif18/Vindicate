/**
 * End-to-end rescue scenarios against a local Prague anvil node posing as BNB testnet.
 *
 * Everything is created fresh on every run: the node, every private key (victim, gas wallet, safe
 * wallet, treasury, attacker), the Vindicate delegate and all assets. Each scenario drives the same
 * functions the UI calls (scan, prepare, send) and then checks balances on chain.
 *
 * Needs `anvil` on PATH and `forge build` output in contracts/out (including test/e2e mocks).
 * Run: pnpm vitest run --config e2e/vitest.config.ts
 * On a fork of BSC testnet: E2E_FORK_URL=https://bsc-testnet-dataseed.bnbchain.org pnpm vitest ...
 */
import { type ChildProcess, spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
  type Abi,
  type Address,
  type Hex,
  type TransactionReceipt,
  createTestClient,
  createWalletClient,
  erc20Abi,
  erc721Abi,
  getAddress,
  http,
  maxUint256,
  parseAbi,
  parseEther,
  parseEventLogs,
  parseUnits,
} from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { bscTestnet } from "viem/chains"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { type Network, publicClientFor } from "@/lib/chains"
import { vindicateDelegateAbi } from "@/lib/contracts/vindicate-delegate"
import { explainError } from "@/lib/recovery/errors"
import {
  type PreparedRecovery,
  StaleRecoveryError,
  confirmRecovery,
  prepareRecovery,
  delegationCleared,
  revokeDelegation,
  sendRecovery,
  waitForRecovery,
} from "@/lib/recovery/execute"
import { buildRecovery } from "@/lib/recovery/plan"
import { readAllowances, readFeeBps, scanWallet } from "@/lib/recovery/scan"
import { recoveryDomain, recoveryTypes } from "@/lib/recovery/typed-data"
import type { RecoveryAction } from "@/lib/recovery/types"

const PORT = 8_745
const RPC = `http://127.0.0.1:${PORT}`
const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11"
const FEE_BPS = 1_000
const chain = { ...bscTestnet, rpcUrls: { default: { http: [RPC] } } }
const outDir = fileURLToPath(new URL("../../contracts/out", import.meta.url))

const mockAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function safeMint(address to, uint256 id)",
  "function approve(address spender, uint256 amount)",
  "function freeze(address holder)",
  "function claim()",
  "function closed()",
  "function claimed(address who) view returns (bool)",
  "function stake() payable",
  "function unstake()",
  "function staked(address who) view returns (uint256)",
  "function pull(address token, address from, uint256 amount)",
])
const itemsAbi = parseAbi([
  "function mint(address to, uint256 id, uint256 amount)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
])

interface Actor {
  key: Hex
  address: Address
}

/** A brand-new keypair. Nothing in this suite reuses a well-known dev key. */
function actor(): Actor {
  const key = generatePrivateKey()
  return { key, address: privateKeyToAccount(key).address }
}

function artifact(file: string, name: string) {
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
const ops = actor() // deploys and mints; stands in for token issuers and the drainer's boss
const treasury = actor().address
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

/** Sends a transaction from `from` and waits for it. Throws if it reverts. */
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
  return receipt
}

const fund = (who: Address, bnb: string) =>
  anvil.setBalance({ address: who, value: parseEther(bnb) })
const bnbOf = (who: Address) => client.getBalance({ address: who })
const tokensOf = (token: Address, who: Address) =>
  client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] })
const allowanceOf = (token: Address, owner: Address, spender: Address) =>
  client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  })
const ownerOfNft = (collection: Address, id: bigint) =>
  client.readContract({ address: collection, abi: erc721Abi, functionName: "ownerOf", args: [id] })
const itemsOf = (collection: Address, who: Address, id: bigint) =>
  client.readContract({
    address: collection,
    abi: itemsAbi,
    functionName: "balanceOf",
    args: [who, id],
  })
const approvedForAll = (collection: Address, who: Address, operator: Address) =>
  client.readContract({
    address: collection,
    abi: itemsAbi,
    functionName: "isApprovedForAll",
    args: [who, operator],
  })

const newToken = (name: string, symbol: string, decimals = 18) =>
  deploy(mock("E2EToken"), [name, symbol, decimals])
const mint = (token: Address, to: Address, amount: bigint) =>
  send(ops, token, mockAbi, "mint", [to, amount])

/** A victim with no BNB, a funded gas wallet and a safe wallet nobody has ever used. */
async function party() {
  const victim = actor()
  const sponsor = actor()
  const safe = actor().address
  await fund(sponsor.address, "1")
  return { victim, sponsor, safe }
}

/** Lets the victim act before the "compromise" (approve, stake), then leaves it with `after` BNB. */
async function asVictim(victim: Actor, after: string, act: () => Promise<unknown>) {
  await fund(victim.address, "10")
  await act()
  await fund(victim.address, after)
}

async function review(
  victim: Actor,
  sponsor: Actor,
  recipient: Address,
  actions: readonly RecoveryAction[],
  net: Network = network,
) {
  const report = await scanWallet(net, victim.address)
  return prepareRecovery({
    network: net,
    ownerKey: victim.key,
    sponsorKey: sponsor.key,
    recipient,
    actions,
    recoveryNonce: report.recoveryNonce,
  })
}

async function submit(prepared: PreparedRecovery, sponsor: Actor) {
  return waitForRecovery(prepared.network, await sendRecovery(prepared, sponsor.key))
}

async function rescue(
  victim: Actor,
  sponsor: Actor,
  recipient: Address,
  actions: readonly RecoveryAction[],
  net: Network = network,
) {
  const prepared = await review(victim, sponsor, recipient, actions, net)
  const receipt = await submit(prepared, sponsor)
  return { prepared, receipt, swept: confirmRecovery(prepared, receipt) }
}

/**
 * Broadcasts exactly what sendRecovery would, minus its last-moment check. Stands in for the
 * attacker's transaction landing in the gap between that check and the rescue being mined.
 */
async function submitUnchecked(prepared: PreparedRecovery, sponsor: Actor) {
  const hash = await walletOf(sponsor).writeContract({
    address: prepared.owner,
    abi: vindicateDelegateAbi,
    functionName: "execute",
    args: [prepared.message, prepared.signature],
    authorizationList: [prepared.authorization],
    gas: prepared.gas,
    maxFeePerGas: prepared.maxFeePerGas,
    maxPriorityFeePerGas: prepared.maxPriorityFeePerGas,
  })
  return waitForRecovery(prepared.network, hash)
}

const eventsOf = (receipt: TransactionReceipt) =>
  parseEventLogs({ abi: vindicateDelegateAbi, logs: receipt.logs }).map((l) => l.eventName)

/** The sentence the UI would show for this failure. */
async function failure(attempt: Promise<unknown>) {
  try {
    await attempt
  } catch (e) {
    return explainError(e)
  }
  throw new Error("expected the attempt to fail, but it went through")
}

/** Points the victim's EIP-7702 delegation at `target` through a relayed authorization. */
async function delegateTo(victim: Actor, target: Address) {
  const relay = walletOf(ops)
  const authorization = await relay.signAuthorization({
    account: privateKeyToAccount(victim.key),
    contractAddress: target,
  })
  const hash = await relay.sendTransaction({
    to: ops.address,
    value: 0n,
    authorizationList: [authorization],
  })
  await client.waitForTransactionReceipt({ hash })
}

/** What a bot holding the leaked key does: any transaction from the wallet bumps its nonce. */
async function attackerSendsFromVictim(victim: Actor) {
  const hash = await walletOf(victim).sendTransaction({ to: victim.address, value: 0n })
  await client.waitForTransactionReceipt({ hash })
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
    // E2E_FORK_URL=<rpc> runs every scenario on top of that network's real state.
    ...(process.env.E2E_FORK_URL ? ["--fork-url", process.env.E2E_FORK_URL] : []),
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
    treasury,
    FEE_BPS,
  ])
  network = { id: "bsc-testnet", name: "Anvil", chain, rpcUrl: RPC, delegate }
})

afterAll(() => {
  node?.kill()
})

describe("rescues", () => {
  it("moves BNB out in one transaction paid by the gas wallet", async () => {
    const { victim, sponsor, safe } = await party()
    await fund(victim.address, "3")
    const treasuryBefore = await bnbOf(treasury)

    const { receipt } = await rescue(victim, sponsor, safe, [{ kind: "sweep-native" }])

    expect(receipt.status).toBe("success")
    expect(receipt.from.toLowerCase()).toBe(sponsor.address.toLowerCase())
    expect(eventsOf(receipt)).toEqual(["Recovered", "Swept"])
    expect(await bnbOf(victim.address)).toBe(0n)
    expect(await bnbOf(safe)).toBe(parseEther("2.7"))
    expect((await bnbOf(treasury)) - treasuryBefore).toBe(parseEther("0.3"))
    expect(await bnbOf(sponsor.address)).toBeLessThan(parseEther("1"))
    const report = await scanWallet(network, victim.address)
    expect(report.delegatedToVindicate).toBe(true)
    expect(report.recoveryNonce).toBe(1n)
  })

  it("rescues tokens from a wallet that holds no BNB at all", async () => {
    const { victim, sponsor, safe } = await party()
    const gold = await newToken("Gold", "GLD")
    const usd = await newToken("Dollar", "USDX", 6)
    await mint(gold, victim.address, parseEther("1000"))
    await mint(usd, victim.address, parseUnits("250", 6))

    const report = await scanWallet(network, victim.address, [gold, usd])
    expect(report.nativeBalance).toBe(0n)
    expect(report.tokens.map((t) => [t.symbol, t.decimals])).toEqual([
      ["GLD", 18],
      ["USDX", 6],
    ])

    const { receipt } = await rescue(victim, sponsor, safe, [
      { kind: "sweep-token", token: gold },
      { kind: "sweep-token", token: usd },
    ])

    expect(receipt.status).toBe("success")
    expect(await tokensOf(gold, safe)).toBe(parseEther("900"))
    expect(await tokensOf(gold, treasury)).toBe(parseEther("100"))
    expect(await tokensOf(usd, safe)).toBe(parseUnits("225", 6))
    expect(await tokensOf(usd, treasury)).toBe(parseUnits("25", 6))
    expect(await tokensOf(gold, victim.address)).toBe(0n)
    expect(await bnbOf(victim.address)).toBe(0n)
  })

  it("revokes and sweeps a USDT-style token that returns no value", async () => {
    const { victim, sponsor, safe } = await party()
    const drainer = await deploy(mock("E2EDrainer"))
    const legacy = await deploy(mock("E2ENoReturnToken"))
    await mint(legacy, victim.address, parseUnits("10000", 6))
    await asVictim(victim, "0", () =>
      send(victim, legacy, mockAbi, "approve", [drainer, maxUint256]),
    )

    const { receipt } = await rescue(victim, sponsor, safe, [
      { kind: "revoke-allowance", token: legacy, spender: drainer },
      { kind: "sweep-token", token: legacy },
    ])

    expect(receipt.status).toBe("success")
    expect(await allowanceOf(legacy, victim.address, drainer)).toBe(0n)
    expect(await tokensOf(legacy, safe)).toBe(parseUnits("9000", 6))
    expect(await tokensOf(legacy, treasury)).toBe(parseUnits("1000", 6))
  })

  it("sweeps a fee-on-transfer token completely", async () => {
    const { victim, sponsor, safe } = await party()
    const taxed = await deploy(mock("E2EFeeOnTransferToken"))
    await mint(taxed, victim.address, parseEther("1000"))

    const { receipt, swept } = await rescue(victim, sponsor, safe, [
      { kind: "sweep-token", token: taxed },
    ])

    expect(receipt.status).toBe("success")
    expect(await tokensOf(taxed, victim.address)).toBe(0n)
    // The token burns 5% of each leg: 100 to the treasury and 900 to the safe wallet.
    expect(await tokensOf(taxed, treasury)).toBe(parseEther("95"))
    expect(await tokensOf(taxed, safe)).toBe(parseEther("855"))
    // The receipt reports what arrived, not the 900 the contract sent.
    expect(swept).toEqual([{ token: taxed, amount: parseEther("855"), fee: parseEther("100") }])
  })

  it("sweeps a token whose symbol cannot be read", async () => {
    const { victim, sponsor, safe } = await party()
    const old = await deploy(mock("E2EBytes32SymbolToken"))
    await mint(old, victim.address, parseEther("40"))

    const report = await scanWallet(network, victim.address, [old])
    expect(report.tokens).toHaveLength(1)
    expect(report.tokens[0]?.symbol).toBe("Unknown")

    await rescue(victim, sponsor, safe, [{ kind: "sweep-token", token: old }])
    expect(await tokensOf(old, safe)).toBe(parseEther("36"))
  })

  it("takes no fee on dust too small to split", async () => {
    const { victim, sponsor, safe } = await party()
    const usd = await newToken("Dust", "DST", 6)
    await mint(usd, victim.address, 9n)

    await rescue(victim, sponsor, safe, [{ kind: "sweep-token", token: usd }])

    expect(await tokensOf(usd, safe)).toBe(9n)
    expect(await tokensOf(usd, treasury)).toBe(0n)
  })

  it("cuts off a drainer's allowance before sweeping", async () => {
    const { victim, sponsor, safe } = await party()
    const drainer = await deploy(mock("E2EDrainer"))
    const gold = await newToken("Gold", "GLD")
    await mint(gold, victim.address, parseEther("1000"))
    await asVictim(victim, "0", () =>
      send(victim, gold, erc20Abi, "approve", [drainer, maxUint256]),
    )

    const report = await scanWallet(network, victim.address, [gold])
    const found = await readAllowances(network, victim.address, report.tokens, [drainer])
    expect(found).toHaveLength(1)
    expect(found[0]?.amount).toBe(maxUint256)

    await rescue(victim, sponsor, safe, [
      { kind: "revoke-allowance", token: gold, spender: drainer },
      { kind: "sweep-token", token: gold },
    ])

    expect(await allowanceOf(gold, victim.address, drainer)).toBe(0n)
    expect(await tokensOf(gold, safe)).toBe(parseEther("900"))
    // Tokens that land later are out of the drainer's reach.
    await mint(gold, victim.address, parseEther("5"))
    await expect(
      send(ops, drainer, mockAbi, "pull", [gold, victim.address, parseEther("5")]),
    ).rejects.toThrow()
    expect(await tokensOf(gold, victim.address)).toBe(parseEther("5"))
  })

  it("revokes NFT operators and moves ERC-721 and ERC-1155 assets with no fee", async () => {
    const { victim, sponsor, safe } = await party()
    const operator = actor().address
    const apes = await deploy(mock("E2ENft"))
    const items = await deploy(mock("E2EItems"))
    await send(ops, apes, mockAbi, "mint", [victim.address, 7n])
    await send(ops, items, itemsAbi, "mint", [victim.address, 3n, 40n])
    await asVictim(victim, "0", async () => {
      await send(victim, apes, erc721Abi, "setApprovalForAll", [operator, true])
      await send(victim, items, itemsAbi, "setApprovalForAll", [operator, true])
    })
    const treasuryBefore = await bnbOf(treasury)

    const { receipt } = await rescue(victim, sponsor, safe, [
      { kind: "revoke-operator", collection: apes, operator },
      { kind: "revoke-operator", collection: items, operator },
      { kind: "transfer-erc721", collection: apes, tokenId: 7n },
      { kind: "transfer-erc1155", collection: items, tokenId: 3n, amount: 40n },
    ])

    expect(receipt.status).toBe("success")
    expect(eventsOf(receipt)).toEqual(["Recovered"])
    expect(await ownerOfNft(apes, 7n)).toBe(safe)
    expect(await itemsOf(items, safe, 3n)).toBe(40n)
    expect(await itemsOf(items, victim.address, 3n)).toBe(0n)
    expect(await approvedForAll(apes, victim.address, operator)).toBe(false)
    expect(await approvedForAll(items, victim.address, operator)).toBe(false)
    expect(await bnbOf(treasury)).toBe(treasuryBefore)
  })

  it("claims an airdrop and sweeps the claimed tokens in the same transaction", async () => {
    const { victim, sponsor, safe } = await party()
    const drop = await newToken("Drop", "DROP")
    const airdrop = await deploy(mock("E2EAirdrop"), [drop])
    expect(await tokensOf(drop, victim.address)).toBe(0n)

    const { receipt } = await rescue(victim, sponsor, safe, [
      { kind: "sweep-token", token: drop },
      { kind: "custom-call", target: airdrop, data: "0x4e71d92d", value: 0n }, // claim()
    ])

    expect(receipt.status).toBe("success")
    expect(
      await client.readContract({
        address: airdrop,
        abi: mockAbi,
        functionName: "claimed",
        args: [victim.address],
      }),
    ).toBe(true)
    expect(await tokensOf(drop, safe)).toBe(parseEther("450"))
    expect(await tokensOf(drop, treasury)).toBe(parseEther("50"))
    expect(await tokensOf(drop, victim.address)).toBe(0n)
  })

  it("reports exactly what was swept, per asset", async () => {
    const { victim, sponsor, safe } = await party()
    const gold = await newToken("Gold", "GLD")
    const empty = await newToken("Empty", "NIL")
    await fund(victim.address, "2")
    await mint(gold, victim.address, parseEther("10"))

    const { swept } = await rescue(victim, sponsor, safe, [
      { kind: "sweep-token", token: gold },
      { kind: "sweep-token", token: empty }, // nothing there: skipped, and not reported
      { kind: "sweep-native" },
    ])

    expect(swept).toEqual([
      { token: gold, amount: parseEther("9"), fee: parseEther("1") },
      { token: null, amount: parseEther("1.8"), fee: parseEther("0.2") },
    ])
  })

  it("unstakes BNB from a vault and sweeps it", async () => {
    const { victim, sponsor, safe } = await party()
    const vault = await deploy(mock("E2EVault"))
    await asVictim(victim, "0", () => send(victim, vault, mockAbi, "stake", [], parseEther("2")))
    const treasuryBefore = await bnbOf(treasury)

    const { receipt } = await rescue(victim, sponsor, safe, [
      { kind: "custom-call", target: vault, data: "0x2def6620", value: 0n }, // unstake()
      { kind: "sweep-native" },
    ])

    expect(receipt.status).toBe("success")
    expect(await bnbOf(vault)).toBe(0n)
    expect(await bnbOf(victim.address)).toBe(0n)
    expect(await bnbOf(safe)).toBe(parseEther("1.8"))
    expect((await bnbOf(treasury)) - treasuryBefore).toBe(parseEther("0.2"))
  })

  it("runs a full rescue in the documented order: revoke, call, NFT, sweep", async () => {
    const { victim, sponsor, safe } = await party()
    const drainer = await deploy(mock("E2EDrainer"))
    const gold = await newToken("Gold", "GLD")
    const drop = await newToken("Drop", "DROP")
    const airdrop = await deploy(mock("E2EAirdrop"), [drop])
    const vault = await deploy(mock("E2EVault"))
    const apes = await deploy(mock("E2ENft"))
    await mint(gold, victim.address, parseEther("1000"))
    await send(ops, apes, mockAbi, "mint", [victim.address, 1n])
    await asVictim(victim, "0.5", async () => {
      await send(victim, gold, erc20Abi, "approve", [drainer, maxUint256])
      await send(victim, apes, erc721Abi, "setApprovalForAll", [drainer, true])
      await send(victim, vault, mockAbi, "stake", [], parseEther("1"))
    })
    const treasuryBefore = await bnbOf(treasury)

    // Deliberately listed backwards: the plan must reorder them.
    const { prepared, receipt } = await rescue(victim, sponsor, safe, [
      { kind: "sweep-native" },
      { kind: "sweep-token", token: gold },
      { kind: "sweep-token", token: drop },
      { kind: "transfer-erc721", collection: apes, tokenId: 1n },
      { kind: "custom-call", target: vault, data: "0x2def6620", value: 0n },
      { kind: "custom-call", target: airdrop, data: "0x4e71d92d", value: 0n },
      { kind: "revoke-operator", collection: apes, operator: drainer },
      { kind: "revoke-allowance", token: gold, spender: drainer },
    ])

    expect(prepared.message.calls.map((c) => c.target)).toEqual([
      apes, // revoke operator
      gold, // revoke allowance
      vault, // unstake
      airdrop, // claim
      apes, // move NFT
    ])
    expect(receipt.status).toBe("success")
    expect(await allowanceOf(gold, victim.address, drainer)).toBe(0n)
    expect(await approvedForAll(apes, victim.address, drainer)).toBe(false)
    expect(await ownerOfNft(apes, 1n)).toBe(safe)
    expect(await tokensOf(gold, safe)).toBe(parseEther("900"))
    expect(await tokensOf(drop, safe)).toBe(parseEther("450"))
    expect(await bnbOf(victim.address)).toBe(0n)
    expect(await bnbOf(safe)).toBe(parseEther("1.35")) // 0.5 held + 1 unstaked, less 10%
    expect((await bnbOf(treasury)) - treasuryBefore).toBe(parseEther("0.15"))
  })

  it("delivers to a safe wallet that is a contract", async () => {
    const { victim, sponsor } = await party()
    const safe = await deploy(mock("E2EContractSafe"))
    const gold = await newToken("Gold", "GLD")
    const apes = await deploy(mock("E2ENft"))
    const items = await deploy(mock("E2EItems"))
    await fund(victim.address, "1")
    await mint(gold, victim.address, parseEther("10"))
    await send(ops, apes, mockAbi, "mint", [victim.address, 5n])
    await send(ops, items, itemsAbi, "mint", [victim.address, 1n, 2n])

    const { receipt } = await rescue(victim, sponsor, safe, [
      { kind: "transfer-erc721", collection: apes, tokenId: 5n },
      { kind: "transfer-erc1155", collection: items, tokenId: 1n, amount: 2n },
      { kind: "sweep-token", token: gold },
      { kind: "sweep-native" },
    ])

    expect(receipt.status).toBe("success")
    expect(await ownerOfNft(apes, 5n)).toBe(safe)
    expect(await itemsOf(items, safe, 1n)).toBe(2n)
    expect(await tokensOf(gold, safe)).toBe(parseEther("9"))
    expect(await bnbOf(safe)).toBe(parseEther("0.9"))
  })

  it("rescues again later, including assets that arrived while delegated", async () => {
    const { victim, sponsor, safe } = await party()
    const gold = await newToken("Gold", "GLD")
    const apes = await deploy(mock("E2ENft"))
    await fund(victim.address, "1")
    await rescue(victim, sponsor, safe, [{ kind: "sweep-native" }])

    // The wallet is still delegated. A plain BNB transfer and a safeMint must both land.
    const hash = await walletOf(ops).sendTransaction({
      to: victim.address,
      value: parseEther("2"),
    })
    expect((await client.waitForTransactionReceipt({ hash })).status).toBe("success")
    await send(ops, apes, mockAbi, "safeMint", [victim.address, 99n])
    await mint(gold, victim.address, parseEther("20"))

    const report = await scanWallet(network, victim.address, [gold])
    expect(report.delegatedToVindicate).toBe(true)
    expect(report.recoveryNonce).toBe(1n)

    const { receipt } = await rescue(victim, sponsor, safe, [
      { kind: "transfer-erc721", collection: apes, tokenId: 99n },
      { kind: "sweep-token", token: gold },
      { kind: "sweep-native" },
    ])

    expect(receipt.status).toBe("success")
    expect(await ownerOfNft(apes, 99n)).toBe(safe)
    expect(await tokensOf(gold, safe)).toBe(parseEther("18"))
    expect(await bnbOf(safe)).toBe(parseEther("0.9") + parseEther("1.8"))
    expect((await scanWallet(network, victim.address)).recoveryNonce).toBe(2n)
  })

  it("charges nothing on a zero-fee deployment", async () => {
    const { victim, sponsor, safe } = await party()
    const freeTreasury = actor().address
    const delegate = await deploy(artifact("VindicateDelegate.sol", "VindicateDelegate"), [
      freeTreasury,
      0,
    ])
    const free: Network = { ...network, delegate }
    expect(await readFeeBps(free)).toBe(0)
    expect(await readFeeBps(network)).toBe(FEE_BPS)
    await fund(victim.address, "1")

    await rescue(victim, sponsor, safe, [{ kind: "sweep-native" }], free)

    expect(await bnbOf(safe)).toBe(parseEther("1"))
    expect(await bnbOf(freeTreasury)).toBe(0n)
  })

  it("takes over a wallet the drainer already delegated to its own contract", async () => {
    const { victim, sponsor, safe } = await party()
    const boss = actor().address
    const drainerDelegate = await deploy(mock("E2EDrainerDelegate"), [boss])
    await fund(victim.address, "1")
    await delegateTo(victim, drainerDelegate)

    const before = await scanWallet(network, victim.address)
    expect(before.delegation).toBe(drainerDelegate)
    expect(before.delegatedToVindicate).toBe(false)

    const { receipt } = await rescue(victim, sponsor, safe, [{ kind: "sweep-native" }])

    expect(receipt.status).toBe("success")
    expect(await bnbOf(safe)).toBe(parseEther("0.9"))
    expect(await bnbOf(boss)).toBe(0n)
    expect((await scanWallet(network, victim.address)).delegatedToVindicate).toBe(true)
  })

  it("clears the delegation, and the nonce survives for the next rescue", async () => {
    const { victim, sponsor, safe } = await party()
    const gold = await newToken("Gold", "GLD")
    await fund(victim.address, "1")
    await rescue(victim, sponsor, safe, [{ kind: "sweep-native" }])
    // "Cleared" is read from the chain, not assumed from a mined transaction.
    expect(await delegationCleared(network, victim.address, 1)).toBe(false)

    await waitForRecovery(network, await revokeDelegation(network, victim.key, sponsor.key))
    expect(await delegationCleared(network, victim.address)).toBe(true)
    const cleared = await scanWallet(network, victim.address)
    expect(cleared.delegation).toBeNull()
    expect(cleared.recoveryNonce).toBe(1n)
    expect(await client.getCode({ address: victim.address })).toBeUndefined()

    await mint(gold, victim.address, parseEther("10"))
    const { receipt } = await rescue(victim, sponsor, safe, [{ kind: "sweep-token", token: gold }])
    expect(receipt.status).toBe("success")
    expect(await tokensOf(gold, safe)).toBe(parseEther("9"))
    expect((await scanWallet(network, victim.address)).recoveryNonce).toBe(2n)
  })
})

describe("checks before anything is signed", () => {
  it("refuses the compromised wallet as its own safe wallet", async () => {
    const { victim, sponsor } = await party()
    await fund(victim.address, "1")
    expect(await failure(review(victim, sponsor, victim.address, [{ kind: "sweep-native" }]))).toBe(
      "The safe wallet must be different from the compromised wallet.",
    )
  })

  it("refuses a safe wallet that is one of the revoked addresses", async () => {
    const { victim, sponsor } = await party()
    const gold = await newToken("Gold", "GLD")
    const drainer = actor().address
    expect(
      await failure(
        review(victim, sponsor, drainer, [
          { kind: "revoke-allowance", token: gold, spender: drainer },
        ]),
      ),
    ).toBe("The safe wallet is one of the addresses being revoked.")
  })

  it("refuses a token contract pasted as the safe wallet", async () => {
    const { victim, sponsor } = await party()
    const gold = await newToken("Gold", "GLD")
    await mint(gold, victim.address, parseEther("10"))
    expect(
      await failure(review(victim, sponsor, gold, [{ kind: "sweep-token", token: gold }])),
    ).toBe("The safe wallet is a contract this rescue acts on. Use a wallet address.")
  })

  it("refuses the Vindicate contract as the safe wallet", async () => {
    const { victim, sponsor } = await party()
    await fund(victim.address, "1")
    expect(
      await failure(
        review(victim, sponsor, network.delegate as Address, [{ kind: "sweep-native" }]),
      ),
    ).toBe("The safe wallet is the Vindicate contract. Use a wallet address.")
  })

  it("refuses an empty plan", async () => {
    const { victim, sponsor, safe } = await party()
    expect(await failure(review(victim, sponsor, safe, []))).toBe(
      "Add at least one asset or action.",
    )
  })

  it("refuses to pay gas from the compromised wallet", async () => {
    const { victim, safe } = await party()
    await fund(victim.address, "1")
    expect(await failure(review(victim, victim, safe, [{ kind: "sweep-native" }]))).toBe(
      "Use a different wallet to pay gas. The compromised wallet is watched.",
    )
  })

  it("refuses a network where the delegate is not deployed", async () => {
    const { victim, sponsor, safe } = await party()
    const undeployed: Network = { ...network, delegate: undefined }
    expect(
      await failure(review(victim, sponsor, safe, [{ kind: "sweep-native" }], undeployed)),
    ).toBe("Vindicate is not deployed on Anvil yet.")
  })
})

describe("failures move nothing", () => {
  it("stops at review when a custom call would revert", async () => {
    const { victim, sponsor, safe } = await party()
    const drop = await newToken("Drop", "DROP")
    const airdrop = await deploy(mock("E2EAirdrop"), [drop])
    await fund(victim.address, "1")

    const message = await failure(
      review(victim, sponsor, safe, [
        { kind: "custom-call", target: airdrop, data: "0x597e1fb5", value: 0n }, // closed()
        { kind: "sweep-native" },
      ]),
    )

    expect(message).toBe(
      'Step 2 under "In one transaction" would fail, so nothing was moved. Fix or remove that step, then review again.',
    )
    expect(await bnbOf(victim.address)).toBe(parseEther("1"))
    expect(await bnbOf(safe)).toBe(0n)
    const report = await scanWallet(network, victim.address)
    expect(report.delegation).toBeNull()
    expect(report.recoveryNonce).toBe(0n)
  })

  it("names the step that would fail when more is asked for than the wallet holds", async () => {
    const { victim, sponsor, safe } = await party()
    const gold = await newToken("Gold", "GLD")
    const items = await deploy(mock("E2EItems"))
    const apes = await deploy(mock("E2ENft"))
    const drainer = await deploy(mock("E2EDrainer"))
    await mint(gold, victim.address, parseEther("10"))
    await send(ops, apes, mockAbi, "mint", [victim.address, 1n])
    await send(ops, items, itemsAbi, "mint", [victim.address, 3n, 40n])
    await fund(victim.address, "1")
    await send(victim, gold, erc20Abi, "approve", [drainer, maxUint256])

    // Step 1 authorizes, 2 revokes, 3 moves the NFT, 4 asks for 140 items out of 40.
    const message = await failure(
      review(victim, sponsor, safe, [
        { kind: "revoke-allowance", token: gold, spender: drainer },
        { kind: "transfer-erc721", collection: apes, tokenId: 1n },
        { kind: "transfer-erc1155", collection: items, tokenId: 3n, amount: 140n },
        { kind: "sweep-token", token: gold },
      ]),
    )

    expect(message).toContain('Step 4 under "In one transaction" would fail')
    expect(await tokensOf(gold, victim.address)).toBe(parseEther("10"))
    expect(await ownerOfNft(apes, 1n)).toBe(victim.address)
  })

  it("stops at review when a swept token is frozen, and works once it is left out", async () => {
    const { victim, sponsor, safe } = await party()
    const frozen = await deploy(mock("E2EFreezableToken"))
    const gold = await newToken("Gold", "GLD")
    await mint(frozen, victim.address, parseEther("100"))
    await mint(gold, victim.address, parseEther("100"))
    await send(ops, frozen, mockAbi, "freeze", [victim.address])

    const message = await failure(
      review(victim, sponsor, safe, [
        { kind: "sweep-token", token: frozen },
        { kind: "sweep-token", token: gold },
      ]),
    )
    expect(message).toContain("frozen")
    expect(await tokensOf(gold, victim.address)).toBe(parseEther("100"))

    await rescue(victim, sponsor, safe, [{ kind: "sweep-token", token: gold }])
    expect(await tokensOf(gold, safe)).toBe(parseEther("90"))
    expect(await tokensOf(frozen, victim.address)).toBe(parseEther("100"))
  })

  it("stops at review when the safe wallet cannot receive BNB", async () => {
    const { victim, sponsor } = await party()
    const rejecting = await deploy(mock("E2ERejectingSafe"))
    await fund(victim.address, "1")

    await failure(review(victim, sponsor, rejecting, [{ kind: "sweep-native" }]))

    expect(await bnbOf(victim.address)).toBe(parseEther("1"))
    expect(await bnbOf(rejecting)).toBe(0n)
  })

  it("stops at review when the safe wallet cannot receive an NFT", async () => {
    const { victim, sponsor } = await party()
    const rejecting = await deploy(mock("E2ERejectingSafe"))
    const apes = await deploy(mock("E2ENft"))
    await send(ops, apes, mockAbi, "mint", [victim.address, 1n])

    const message = await failure(
      review(victim, sponsor, rejecting, [
        { kind: "transfer-erc721", collection: apes, tokenId: 1n },
      ]),
    )

    expect(message).toBe(
      'Step 2 under "In one transaction" would fail, so nothing was moved. Fix or remove that step, then review again.',
    )
    expect(await ownerOfNft(apes, 1n)).toBe(victim.address)
  })

  it("does not send when the gas wallet is empty", async () => {
    const { victim, safe } = await party()
    const broke = actor()
    await fund(victim.address, "1")

    const message = await failure(rescue(victim, broke, safe, [{ kind: "sweep-native" }]))

    expect(message).toBe(
      "The gas wallet does not have enough BNB for gas. Top it up and try again.",
    )
    expect(await bnbOf(victim.address)).toBe(parseEther("1"))
    expect(await bnbOf(safe)).toBe(0n)
  })
})

describe("a signed rescue cannot be misused", () => {
  it("cannot be replayed", async () => {
    const { victim, sponsor, safe } = await party()
    const gold = await newToken("Gold", "GLD")
    await mint(gold, victim.address, parseEther("100"))
    const { prepared } = await rescue(victim, sponsor, safe, [{ kind: "sweep-token", token: gold }])
    await mint(gold, victim.address, parseEther("50"))

    const replay = await submit(prepared, sponsor)

    expect(replay.status).toBe("reverted")
    expect(await tokensOf(gold, victim.address)).toBe(parseEther("50"))
    expect(await tokensOf(gold, safe)).toBe(parseEther("90"))
  })

  it("cannot be sent by anyone but the gas wallet it names", async () => {
    const { victim, sponsor, safe } = await party()
    const stranger = actor()
    await fund(stranger.address, "1")
    await fund(victim.address, "1")
    const prepared = await review(victim, sponsor, safe, [{ kind: "sweep-native" }])

    const message = await failure(
      walletOf(stranger).writeContract({
        address: victim.address,
        abi: vindicateDelegateAbi,
        functionName: "execute",
        args: [prepared.message, prepared.signature],
        authorizationList: [prepared.authorization],
      }),
    )

    expect(message).toBe("Only the gas wallet chosen at signing can send this rescue.")
    expect(await bnbOf(victim.address)).toBe(parseEther("1"))
  })

  it("cannot be redirected to another recipient", async () => {
    const { victim, sponsor, safe } = await party()
    const thief = actor().address
    await fund(victim.address, "1")
    const prepared = await review(victim, sponsor, safe, [{ kind: "sweep-native" }])

    const message = await failure(
      walletOf(sponsor).writeContract({
        address: victim.address,
        abi: vindicateDelegateAbi,
        functionName: "execute",
        args: [{ ...prepared.message, recipient: thief }, prepared.signature],
        authorizationList: [prepared.authorization],
      }),
    )

    expect(message).toBe("The signature does not match the compromised wallet's key.")
    expect(await bnbOf(thief)).toBe(0n)
    expect(await bnbOf(victim.address)).toBe(parseEther("1"))
  })

  it("expires after ten minutes, by the chain's clock", async () => {
    const { victim, sponsor, safe } = await party()
    await fund(victim.address, "1")
    const prepared = await review(victim, sponsor, safe, [{ kind: "sweep-native" }])

    await anvil.increaseTime({ seconds: 601 })
    await anvil.mine({ blocks: 1 })

    // The app refuses to send it, going by block time rather than this machine's clock.
    await expect(sendRecovery(prepared, sponsor.key)).rejects.toBeInstanceOf(StaleRecoveryError)
    // And the contract refuses it too if it is sent anyway.
    const receipt = await submitUnchecked(prepared, sponsor)
    expect(receipt.status).toBe("reverted")
    expect(await bnbOf(victim.address)).toBe(parseEther("1"))
    expect(await bnbOf(safe)).toBe(0n)
  })

  it("sends once the gas wallet is topped up after the review", async () => {
    const { victim, safe } = await party()
    const sponsor = actor()
    await fund(victim.address, "1")
    await fund(sponsor.address, "0.000001") // enough to exist, not enough for gas
    const prepared = await review(victim, sponsor, safe, [{ kind: "sweep-native" }])
    expect(prepared.sponsorBalance).toBeLessThan(prepared.maxCost)
    expect(await failure(sendRecovery(prepared, sponsor.key))).toBe(
      "The gas wallet does not have enough BNB for gas. Top it up and try again.",
    )

    await fund(sponsor.address, "1")
    const receipt = await submit(prepared, sponsor)

    expect(receipt.status).toBe("success")
    expect(await bnbOf(safe)).toBe(parseEther("0.9"))
  })

  it("leaves a delegated wallet inert to a stranger's signature", async () => {
    const { victim, sponsor, safe } = await party()
    const stranger = actor()
    await fund(stranger.address, "1")
    await fund(victim.address, "1")
    await rescue(victim, sponsor, safe, [{ kind: "sweep-native" }])
    await fund(victim.address, "5") // more BNB lands on the still-delegated wallet

    const block = await client.getBlock()
    const forged = buildRecovery({
      owner: victim.address,
      recipient: stranger.address,
      executor: stranger.address,
      actions: [{ kind: "sweep-native" }],
      nonce: 1n,
      deadline: block.timestamp + 600n,
    })
    const signature = await privateKeyToAccount(stranger.key).signTypedData({
      domain: recoveryDomain(chain.id, victim.address),
      types: recoveryTypes,
      primaryType: "Recovery",
      message: forged,
    })

    const message = await failure(
      walletOf(stranger).writeContract({
        address: victim.address,
        abi: vindicateDelegateAbi,
        functionName: "execute",
        args: [forged, signature],
      }),
    )

    expect(message).toBe("The signature does not match the compromised wallet's key.")
    expect(await bnbOf(victim.address)).toBe(parseEther("5"))
  })

  it("still lands when a stranger relays the authorization first", async () => {
    const { victim, sponsor, safe } = await party()
    await fund(victim.address, "1")
    const prepared = await review(victim, sponsor, safe, [{ kind: "sweep-native" }])

    const hash = await walletOf(ops).sendTransaction({
      to: ops.address,
      value: 0n,
      authorizationList: [prepared.authorization],
    })
    await client.waitForTransactionReceipt({ hash })
    expect((await scanWallet(network, victim.address)).delegatedToVindicate).toBe(true)

    const receipt = await submit(prepared, sponsor)
    expect(receipt.status).toBe("success")
    expect(await bnbOf(safe)).toBe(parseEther("0.9"))
  })
})

describe("races between review and send", () => {
  it("still works after the attacker moves first, when the wallet is already delegated to Vindicate", async () => {
    const { victim, sponsor, safe } = await party()
    await fund(victim.address, "1")
    await rescue(victim, sponsor, safe, [{ kind: "sweep-native" }])
    await fund(victim.address, "2")

    const prepared = await review(victim, sponsor, safe, [{ kind: "sweep-native" }])
    await attackerSendsFromVictim(victim)
    const left = await bnbOf(victim.address)
    const receipt = await submit(prepared, sponsor)

    expect(receipt.status).toBe("success")
    expect(eventsOf(receipt)).toEqual(["Recovered", "Swept"])
    expect(await bnbOf(victim.address)).toBe(0n)
    expect(await bnbOf(safe)).toBe(parseEther("0.9") + left - left / 10n)
  })

  it("refuses to send once a transaction from the leaked key has cancelled the authorization", async () => {
    const { victim, sponsor, safe } = await party()
    await fund(victim.address, "1")

    const prepared = await review(victim, sponsor, safe, [{ kind: "sweep-native" }])
    await attackerSendsFromVictim(victim)
    const sponsorBefore = await bnbOf(sponsor.address)

    const attempt = sendRecovery(prepared, sponsor.key)
    await expect(attempt).rejects.toBeInstanceOf(StaleRecoveryError)
    expect(await failure(attempt)).toBe(
      "The compromised wallet sent a transaction after this review, which cancels the signed authorization. Nothing was sent. Review the rescue again.",
    )
    // Nothing was broadcast, so the gas wallet paid nothing.
    expect(await bnbOf(sponsor.address)).toBe(sponsorBefore)

    // A fresh review picks up the new state and the rescue goes through.
    const left = await bnbOf(victim.address)
    const { receipt, swept } = await rescue(victim, sponsor, safe, [{ kind: "sweep-native" }])
    expect(receipt.status).toBe("success")
    expect(swept).toEqual([{ token: null, amount: left - left / 10n, fee: left / 10n }])
  })

  it("does not report success when the cancelling transaction lands after the last check", async () => {
    const { victim, sponsor, safe } = await party()
    await fund(victim.address, "1")

    const prepared = await review(victim, sponsor, safe, [{ kind: "sweep-native" }])
    await attackerSendsFromVictim(victim)
    const left = await bnbOf(victim.address)
    const receipt = await submitUnchecked(prepared, sponsor)

    // On chain this looks fine: the call reached a wallet with no code and did nothing.
    expect(receipt.status).toBe("success")
    expect(receipt.logs).toHaveLength(0)
    expect(await bnbOf(safe)).toBe(0n)
    expect(await bnbOf(victim.address)).toBe(left)
    expect(() => confirmRecovery(prepared, receipt)).toThrow(StaleRecoveryError)
    expect(() => confirmRecovery(prepared, receipt)).toThrow(/the rescue did not run/)
  })

  it("does not report success when a drainer's delegate swallows the cancelled rescue", async () => {
    const { victim, sponsor, safe } = await party()
    const boss = actor().address
    const drainerDelegate = await deploy(mock("E2EDrainerDelegate"), [boss])
    await fund(victim.address, "1")
    await delegateTo(victim, drainerDelegate)

    const prepared = await review(victim, sponsor, safe, [{ kind: "sweep-native" }])
    await attackerSendsFromVictim(victim)
    await expect(sendRecovery(prepared, sponsor.key)).rejects.toBeInstanceOf(StaleRecoveryError)

    const left = await bnbOf(victim.address)
    const receipt = await submitUnchecked(prepared, sponsor)

    expect(receipt.status).toBe("success")
    expect(await bnbOf(safe)).toBe(0n)
    expect(await bnbOf(victim.address)).toBe(left)
    expect((await scanWallet(network, victim.address)).delegation).toBe(drainerDelegate)
    expect(() => confirmRecovery(prepared, receipt)).toThrow(StaleRecoveryError)
  })

  it("reports an asset as not swept when a drainer pulled it first", async () => {
    const { victim, sponsor, safe } = await party()
    const drainer = await deploy(mock("E2EDrainer"))
    const gold = await newToken("Gold", "GLD")
    await fund(victim.address, "1")
    await mint(gold, victim.address, parseEther("1000"))
    await asVictim(victim, "1", () =>
      send(victim, gold, erc20Abi, "approve", [drainer, maxUint256]),
    )

    const prepared = await review(victim, sponsor, safe, [
      { kind: "revoke-allowance", token: gold, spender: drainer },
      { kind: "sweep-token", token: gold },
      { kind: "sweep-native" },
    ])
    await send(ops, drainer, mockAbi, "pull", [gold, victim.address, parseEther("1000")])
    const receipt = await submit(prepared, sponsor)

    // The rescue ran, but only the BNB was still there: the outcome must not list GLD.
    expect(receipt.status).toBe("success")
    expect(confirmRecovery(prepared, receipt)).toEqual([
      { token: null, amount: parseEther("0.9"), fee: parseEther("0.1") },
    ])
    expect(await tokensOf(gold, safe)).toBe(0n)
    expect(await tokensOf(gold, ops.address)).toBe(parseEther("1000"))
  })
})

describe("scanning", () => {
  it("ignores addresses that are not tokens", async () => {
    const { victim } = await party()
    const vault = await deploy(mock("E2EVault"))
    const gold = await newToken("Gold", "GLD")
    await mint(gold, victim.address, parseEther("1"))

    const report = await scanWallet(network, victim.address, [actor().address, vault, gold])

    expect(report.tokens.map((t) => t.address)).toEqual([gold])
  })
})
