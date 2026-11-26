// Puts practice assets on BNB testnet so every kind of rescue can be tried on a real network:
// mock tokens, an airdrop, two vaults and two NFT collections, plus four throwaway "compromised"
// wallets that hold them. Writes the wallets (with their keys) to a file OUTSIDE the repository
// and points .env.local at the testnet.
//
//   TESTNET_FUNDER_KEY=0x… node scripts/testnet-practice.mjs [output.json]
//
// Testnet only: it refuses any chain but 97. The funder pays roughly 0.05 tBNB in all.
// Requires `forge build` in contracts/ (the mocks come from contracts/test/e2e).
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { createPublicClient, createWalletClient, getAddress, http, parseEther } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { bscTestnet } from "viem/chains"

const RPC = process.env.TESTNET_RPC ?? "https://bsc-testnet-rpc.publicnode.com"
const DELEGATE = process.env.TESTNET_DELEGATE ?? "0xbe0C880AB5AF238b798D384355AdB7BE29d7F1EB"
const DRAINER = "0x000000000000000000000000000000000000dEaD"
const funderKey = process.env.TESTNET_FUNDER_KEY
if (!funderKey) throw new Error("Set TESTNET_FUNDER_KEY to a testnet wallet that holds tBNB.")

const outFile =
  process.argv[2] ?? fileURLToPath(new URL("../../../testnet-practice.json", import.meta.url))
// The output holds private keys, even if only of throwaway wallets. It must not land in the repo.
const repo = fileURLToPath(new URL("../..", import.meta.url))
if (resolve(outFile).startsWith(resolve(repo) + sep)) {
  throw new Error("Choose an output file outside the repository: it will contain private keys.")
}
const out = fileURLToPath(new URL("../../contracts/out", import.meta.url))
const mock = (name) => JSON.parse(readFileSync(`${out}/E2EScenarios.sol/${name}.json`, "utf8"))

const client = createPublicClient({ chain: bscTestnet, transport: http(RPC) })
if ((await client.getChainId()) !== 97) throw new Error("This script only runs on BNB testnet.")

// One sender at a time, with its nonce counted here: a load-balanced public RPC can answer
// "what is my nonce" from a node that has not seen the last transaction yet.
function sender(key) {
  const account = privateKeyToAccount(key)
  const wallet = createWalletClient({ account, chain: bscTestnet, transport: http(RPC) })
  let nonce = null
  const next = async () => {
    if (nonce === null) nonce = await client.getTransactionCount({ address: account.address })
    return nonce++
  }
  const mined = async (hash) => {
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 })
    if (receipt.status !== "success") throw new Error(`Transaction ${hash} reverted.`)
    return receipt
  }
  return {
    address: account.address,
    key,
    deploy: async (art, args = []) => {
      const hash = await wallet.deployContract({
        abi: art.abi,
        bytecode: art.bytecode.object,
        args,
        nonce: await next(),
      })
      return getAddress((await mined(hash)).contractAddress)
    },
    write: async (address, abi, functionName, args = [], value = 0n) =>
      mined(
        await wallet.writeContract({
          address,
          abi,
          functionName,
          args,
          value,
          nonce: await next(),
        }),
      ),
    pay: async (to, bnb) =>
      mined(await wallet.sendTransaction({ to, value: parseEther(bnb), nonce: await next() })),
  }
}

const funder = sender(funderKey)
const fresh = () => sender(generatePrivateKey())
const safe = () => {
  const key = generatePrivateKey()
  return { key, address: privateKeyToAccount(key).address }
}
const step = (text) => console.log(`· ${text}`)

const tokenArt = mock("E2EToken")
const nftArt = mock("E2ENft")
const itemsArt = mock("E2EItems")
const vaultArt = mock("E2EVault")
const tokenVaultArt = mock("E2ETokenVault")
const frozenArt = mock("E2EFreezableToken")

step("deploying practice contracts")
const token = await funder.deploy(tokenArt, ["Mock", "MOCK", 18])
const drop = await funder.deploy(tokenArt, ["Drop", "DROP", 18])
const airdrop = await funder.deploy(mock("E2EAirdrop"), [drop])
const vault = await funder.deploy(vaultArt)
const apes = await funder.deploy(nftArt)
const items = await funder.deploy(itemsArt)
const frozen = await funder.deploy(frozenArt)
const staked = await funder.deploy(tokenArt, ["Staked Gold", "SGLD", 18])
const tokenVault = await funder.deploy(tokenVaultArt)

const everything = 2n ** 256n - 1n
const wallets = { demo: fresh(), manual: fresh(), copilot: fresh(), failures: fresh() }
const gas = fresh()

/** A wallet with a token the drainer is approved for, an NFT, items, a stake and an open claim. */
async function full(who, { mint, nftId, itemCount, stake, bnb }) {
  await funder.pay(who.address, bnb)
  await funder.write(token, tokenArt.abi, "mint", [who.address, parseEther(mint)])
  await funder.write(apes, nftArt.abi, "mint", [who.address, nftId])
  await funder.write(items, itemsArt.abi, "mint", [who.address, 3n, itemCount])
  await who.write(token, tokenArt.abi, "approve", [DRAINER, everything])
  await who.write(apes, nftArt.abi, "setApprovalForAll", [DRAINER, true])
  await who.write(vault, vaultArt.abi, "stake", [], parseEther(stake))
}

step("wallet 1: one-click demo")
await full(wallets.demo, { mint: "1240", nftId: 7n, itemCount: 40n, stake: "0.001", bnb: "0.004" })

step("wallet 2: filled in by hand")
await full(wallets.manual, {
  mint: "1000",
  nftId: 8n,
  itemCount: 25n,
  stake: "0.0005",
  bnb: "0.003",
})

step("wallet 3: left to the copilot")
const guided = wallets.copilot
await funder.pay(guided.address, "0.002")
await funder.write(token, tokenArt.abi, "mint", [guided.address, parseEther("800")])
await funder.write(frozen, frozenArt.abi, "mint", [guided.address, parseEther("50")])
await funder.write(frozen, frozenArt.abi, "freeze", [guided.address])
await funder.write(staked, tokenArt.abi, "mint", [guided.address, parseEther("300")])
await funder.write(apes, nftArt.abi, "mint", [guided.address, 9n])
await guided.write(token, tokenArt.abi, "approve", [DRAINER, everything])
await guided.write(staked, tokenArt.abi, "approve", [tokenVault, parseEther("300")])
await guided.write(tokenVault, tokenVaultArt.abi, "stake", [staked, parseEther("300")])
await guided.write(vault, vaultArt.abi, "stake", [], parseEther("0.0005"))

step("wallet 4: for the refusals")
const faulty = wallets.failures
await funder.pay(faulty.address, "0.002")
await funder.write(token, tokenArt.abi, "mint", [faulty.address, parseEther("500")])
await funder.write(items, itemsArt.abi, "mint", [faulty.address, 3n, 10n])
await faulty.write(token, tokenArt.abi, "approve", [DRAINER, everything])

step("gas wallet")
await funder.pay(gas.address, "0.02")

const demo = {
  wallet: wallets.demo.address,
  token,
  drainer: DRAINER,
  claim: { target: airdrop, data: "0x4e71d92d", token: drop },
  unstake: { target: vault, data: "0x2def6620" },
  nft: { collection: apes, tokenId: "7" },
  items: { collection: items, tokenId: "3", amount: "40" },
}

const pick = (w) => ({ address: w.address, key: w.key })
writeFileSync(
  outFile,
  JSON.stringify(
    {
      network: "BNB testnet (chain 97)",
      rpc: RPC,
      delegate: DELEGATE,
      contracts: { token, drop, airdrop, vault, apes, items, frozen, staked, tokenVault },
      drainer: DRAINER,
      calldata: { claim: "0x4e71d92d", unstake: "0x2def6620", closed: "0x597e1fb5" },
      wallets: Object.fromEntries(Object.entries(wallets).map(([k, w]) => [k, pick(w)])),
      gasWallet: pick(gas),
      safeWallets: { demo: safe(), manual: safe(), copilot: safe(), failures: safe() },
    },
    null,
    2,
  ) + "\n",
)

// Point the app at the testnet. Only the three variables this script owns are rewritten.
const envFile = new URL("../.env.local", import.meta.url)
const owned = [
  "NEXT_PUBLIC_DELEGATE_BSC_TESTNET",
  "NEXT_PUBLIC_RPC_BSC_TESTNET",
  "NEXT_PUBLIC_DEMO_BSC_TESTNET",
]
const kept = existsSync(envFile)
  ? readFileSync(envFile, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "" && !owned.some((name) => line.startsWith(`${name}=`)))
  : []
writeFileSync(
  envFile,
  [
    ...kept,
    `NEXT_PUBLIC_DELEGATE_BSC_TESTNET=${DELEGATE}`,
    `NEXT_PUBLIC_RPC_BSC_TESTNET=${RPC}`,
    `NEXT_PUBLIC_DEMO_BSC_TESTNET='${JSON.stringify(demo)}'`,
  ].join("\n") + "\n",
)

console.log(`
Practice assets are on BNB testnet. .env.local now points the app at ${RPC}.
Wallets and their throwaway keys were written to:
  ${outFile}
Restart \`pnpm dev\` to pick up the new settings.`)
