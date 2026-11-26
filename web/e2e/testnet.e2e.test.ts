/**
 * Smoke test on the real BSC testnet: one rescue through the deployed delegate, then a delegation
 * reset. It proves the EIP-7702 flow against a live network rather than a local node.
 *
 * Skipped unless both variables are set, so the normal suite never touches a real network:
 *   TESTNET_DELEGATE     the deployed VindicateDelegate address
 *   TESTNET_FUNDER_KEY   a testnet wallet that pays for two tiny top-ups (about 0.005 tBNB)
 *
 * Every other wallet is generated fresh for the run.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
  type Abi,
  type Address,
  type Hex,
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
import { describe, expect, it } from "vitest"

import { type Network, publicClientFor } from "@/lib/chains"
import { investigate } from "@/lib/copilot/investigate"
import { buildCandidates, resolvePlan, rulePlan } from "@/lib/copilot/plan"
import {
  confirmRecovery,
  prepareRecovery,
  revokeDelegation,
  sendRecovery,
  waitForRecovery,
} from "@/lib/recovery/execute"
import { scanWallet } from "@/lib/recovery/scan"
import type { RecoveryAction } from "@/lib/recovery/types"

const delegate = process.env.TESTNET_DELEGATE as Address | undefined
const funderKey = process.env.TESTNET_FUNDER_KEY as Hex | undefined
const rpcUrl = process.env.TESTNET_RPC ?? "https://bsc-testnet-dataseed.bnbchain.org"

describe.skipIf(!delegate || !funderKey)("rescue on BSC testnet", () => {
  it("sweeps a fresh wallet through the deployed delegate and clears the delegation", async () => {
    const network: Network = {
      id: "bsc-testnet",
      name: "BNB Testnet",
      chain: bscTestnet,
      rpcUrl,
      delegate,
    }
    const client = publicClientFor(network)
    const funder = createWalletClient({
      account: privateKeyToAccount(funderKey as Hex),
      chain: bscTestnet,
      transport: http(rpcUrl),
    })
    const victimKey = generatePrivateKey()
    const sponsorKey = generatePrivateKey()
    const victim = privateKeyToAccount(victimKey).address
    const sponsor = privateKeyToAccount(sponsorKey).address
    const safe = privateKeyToAccount(generatePrivateKey()).address
    const treasury = (await client.readContract({
      address: delegate as Address,
      abi: [
        {
          type: "function",
          name: "treasury",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "address" }],
        },
      ],
      functionName: "treasury",
    })) as Address

    for (const [to, amount] of [
      [victim, "0.003"],
      [sponsor, "0.002"],
    ] as const) {
      const hash = await funder.sendTransaction({ to, value: parseEther(amount) })
      await client.waitForTransactionReceipt({ hash, timeout: 120_000 })
    }
    const treasuryBefore = await client.getBalance({ address: treasury })

    const report = await scanWallet(network, victim)
    expect(report.nativeBalance).toBe(parseEther("0.003"))
    const prepared = await prepareRecovery({
      network,
      ownerKey: victimKey,
      sponsorKey,
      recipient: safe,
      recoveryNonce: report.recoveryNonce,
      actions: [{ kind: "sweep-native" }],
    })
    const hash = await sendRecovery(prepared, sponsorKey)
    const receipt = await waitForRecovery(network, hash)
    const swept = confirmRecovery(prepared, receipt)
    console.log(`rescue tx ${hash} in block ${receipt.blockNumber}`)

    expect(swept).toEqual([
      { token: null, amount: parseEther("0.0027"), fee: parseEther("0.0003") },
    ])
    expect(await client.getBalance({ address: victim })).toBe(0n)
    expect(await client.getBalance({ address: safe })).toBe(parseEther("0.0027"))
    expect((await client.getBalance({ address: treasury })) - treasuryBefore).toBe(
      parseEther("0.0003"),
    )
    // Public RPCs are load-balanced: a node can answer a read before it has the block that the
    // receipt came from. Wait for the delegation to show rather than trusting the first read.
    console.log(`victim ${victim}, code ${await client.getCode({ address: victim })}`)
    await expect
      .poll(async () => (await scanWallet(network, victim)).delegatedToVindicate, {
        timeout: 30_000,
        interval: 1_500,
      })
      .toBe(true)

    await waitForRecovery(network, await revokeDelegation(network, victimKey, sponsorKey))
    await expect
      .poll(async () => (await scanWallet(network, victim)).delegation, {
        timeout: 30_000,
        interval: 1_500,
      })
      .toBeNull()
    expect((await scanWallet(network, victim)).recoveryNonce).toBe(1n)
  }, 300_000)

  it("lets the copilot find and rescue every kind of asset on a live network", async () => {
    // A public RPC that answers log queries for named contracts. The default dataseed RPC
    // refuses eth_getLogs outright, so on it the copilot can only check what the owner names.
    const logsRpc = process.env.TESTNET_LOGS_RPC ?? "https://bsc-testnet-rpc.publicnode.com"
    const network: Network = {
      id: "bsc-testnet",
      name: "BNB Testnet",
      chain: bscTestnet,
      rpcUrl: logsRpc,
      delegate,
    }
    const client = publicClientFor(network)
    const transport = http(logsRpc)
    const outDir = fileURLToPath(new URL("../../contracts/out", import.meta.url))
    const mock = (name: string) => {
      const json = JSON.parse(readFileSync(`${outDir}/E2EScenarios.sol/${name}.json`, "utf8"))
      return { abi: json.abi as Abi, bytecode: json.bytecode.object as Hex }
    }
    const mockAbi = parseAbi([
      "function mint(address to, uint256 amount)",
      "function freeze(address holder)",
      "function stake() payable",
    ])
    const itemsAbi = parseAbi([
      "function mint(address to, uint256 id, uint256 amount)",
      "function balanceOf(address account, uint256 id) view returns (uint256)",
      "function isApprovedForAll(address account, address operator) view returns (bool)",
    ])

    const funder = createWalletClient({
      account: privateKeyToAccount(funderKey as Hex),
      chain: bscTestnet,
      transport,
    })
    const victimKey = generatePrivateKey()
    const sponsorKey = generatePrivateKey()
    const victimAccount = privateKeyToAccount(victimKey)
    const victim = victimAccount.address
    const victimWallet = createWalletClient({
      account: victimAccount,
      chain: bscTestnet,
      transport,
    })
    const safe = privateKeyToAccount(generatePrivateKey()).address
    const mined = (hash: Hex) => client.waitForTransactionReceipt({ hash, timeout: 120_000 })
    const deploy = async (name: string, args: readonly unknown[] = []) => {
      const art = mock(name)
      const receipt = await mined(
        await funder.deployContract({ abi: art.abi, bytecode: art.bytecode, args }),
      )
      return getAddress(receipt.contractAddress as Address)
    }

    // Assets and adversaries, deployed fresh for this run.
    const gold = await deploy("E2EToken", ["Gold", "GLD", 18])
    const frozen = await deploy("E2EFreezableToken")
    const drop = await deploy("E2EToken", ["Drop", "DROP", 18])
    const airdrop = await deploy("E2EAirdrop", [drop])
    const vault = await deploy("E2EVault")
    const apes = await deploy("E2ENft")
    const items = await deploy("E2EItems")
    const drainer = await deploy("E2EDrainer")

    await mined(await funder.sendTransaction({ to: victim, value: parseEther("0.01") }))
    await mined(
      await funder.sendTransaction({
        to: privateKeyToAccount(sponsorKey).address,
        value: parseEther("0.003"),
      }),
    )
    const give = async (address: Address, abi: Abi, functionName: string, args: unknown[]) =>
      mined(await funder.writeContract({ address, abi, functionName, args }))
    await give(gold, mockAbi, "mint", [victim, parseEther("1000")])
    await give(frozen, mockAbi, "mint", [victim, parseEther("50")])
    await give(frozen, mockAbi, "freeze", [victim])
    await give(apes, mockAbi, "mint", [victim, 7n])
    await give(items, itemsAbi, "mint", [victim, 3n, 40n])
    await mined(
      await victimWallet.writeContract({
        address: gold,
        abi: erc20Abi,
        functionName: "approve",
        args: [drainer, maxUint256],
      }),
    )
    await mined(
      await victimWallet.writeContract({
        address: apes,
        abi: erc721Abi,
        functionName: "setApprovalForAll",
        args: [drainer, true],
      }),
    )
    await mined(
      await victimWallet.writeContract({
        address: vault,
        abi: mockAbi,
        functionName: "stake",
        value: parseEther("0.002"),
      }),
    )

    // The copilot gets the wallet address and the contracts the owner would name. It has to
    // work out, from the live chain, what is held, approved and claimable in them.
    const named = [gold, frozen, apes, items, vault, airdrop]
    let findings = (
      await investigate({ network, owner: victim, mentioned: named, recipient: safe })
    ).findings
    for (let i = 0; i < 10 && (findings.nfts.length < 2 || findings.allowances.length < 1); i++) {
      await new Promise((r) => setTimeout(r, 3_000)) // the RPC may trail the setup by a block
      findings = (await investigate({ network, owner: victim, mentioned: named, recipient: safe }))
        .findings
    }

    expect(findings.tokens.map((t) => [t.symbol, t.transferable]).sort()).toEqual([
      ["FRZ", false],
      ["GLD", true],
    ])
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
        expect.objectContaining({ target: vault, label: "unstake()" }),
        expect.objectContaining({ target: airdrop, label: "claim()", pays: [drop] }),
      ]),
    )

    const candidates = buildCandidates(findings)
    const plan = resolvePlan(rulePlan(candidates), candidates)
    expect(plan.skipped.map((s) => s.title)).toEqual(["Sweep FRZ"])
    const actions = plan.steps.flatMap((s): RecoveryAction[] => {
      const a = s.action
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

    const before = await client.getBalance({ address: victim })
    const report = await scanWallet(network, victim)
    const prepared = await prepareRecovery({
      network,
      ownerKey: victimKey,
      sponsorKey,
      recipient: safe,
      recoveryNonce: report.recoveryNonce,
      actions,
    })
    const hash = await sendRecovery(prepared, sponsorKey)
    const receipt = await waitForRecovery(network, hash)
    const swept = confirmRecovery(prepared, receipt)
    console.log(`full rescue tx ${hash} block ${receipt.blockNumber} gas ${receipt.gasUsed}`)

    // What the transaction itself reports, then what the chain says independently.
    const total = before + parseEther("0.002")
    expect(swept).toEqual(
      expect.arrayContaining([
        { token: gold, amount: parseEther("900"), fee: parseEther("100") },
        { token: drop, amount: parseEther("450"), fee: parseEther("50") },
        { token: null, amount: total - total / 10n, fee: total / 10n },
      ]),
    )
    const read = <T>(fn: () => Promise<T>) => expect.poll(fn, { timeout: 30_000, interval: 1_500 })
    const balanceOf = (token: Address, who: Address) =>
      client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] })
    await read(() => balanceOf(gold, safe)).toBe(parseEther("900"))
    await read(() => balanceOf(drop, safe)).toBe(parseEther("450"))
    await read(() => client.getBalance({ address: safe })).toBe(total - total / 10n)
    await read(() => client.getBalance({ address: victim })).toBe(0n)
    await read(() => balanceOf(gold, victim)).toBe(0n)
    await read(() =>
      client.readContract({ address: apes, abi: erc721Abi, functionName: "ownerOf", args: [7n] }),
    ).toBe(safe)
    await read(() =>
      client.readContract({
        address: items,
        abi: itemsAbi,
        functionName: "balanceOf",
        args: [safe, 3n],
      }),
    ).toBe(40n)
    await read(() =>
      client.readContract({
        address: gold,
        abi: erc20Abi,
        functionName: "allowance",
        args: [victim, drainer],
      }),
    ).toBe(0n)
    await read(() =>
      client.readContract({
        address: apes,
        abi: itemsAbi,
        functionName: "isApprovedForAll",
        args: [victim, drainer],
      }),
    ).toBe(false)
    // The frozen token stays behind, exactly as the plan said.
    await read(() => balanceOf(frozen, victim)).toBe(parseEther("50"))

    // A signed rescue cannot be replayed on the live network either.
    const replay = await waitForRecovery(network, await sendRecovery(prepared, sponsorKey))
    expect(replay.status).toBe("reverted")
  }, 900_000)
})
