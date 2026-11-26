// Makes extra practice "compromised" wallets on BNB testnet whose tokens are ones that already
// exist on the network (WBNB, plus any USDT, BUSD, USDC, DAI or CAKE the funder holds), instead
// of mock tokens. The stake, the airdrop and the NFT still use practice contracts: the vaults and
// the NFT collection from testnet-practice.mjs, and a small airdrop that pays out WBNB.
//
//   TESTNET_FUNDER_KEY=0x… node scripts/testnet-wallets.mjs make <count> [output.json]
//   TESTNET_FUNDER_KEY=0x… node scripts/testnet-wallets.mjs topup [output.json]
//
// `topup` shares out whatever faucet tokens the funder holds among the wallets already in the
// file. Testnet only: it refuses any chain but 97. A wallet costs the funder about 0.0075 tBNB.
// Requires `forge build` in contracts/ and the file written by testnet-practice.mjs.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatEther,
  getAddress,
  http,
  maxUint256,
  parseAbi,
  parseEther,
} from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { bscTestnet } from "viem/chains"

const RPC = process.env.TESTNET_RPC ?? "https://bsc-testnet-rpc.publicnode.com"
const DRAINER = "0x000000000000000000000000000000000000dEaD"
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd"
/** Tokens the official BNB testnet faucet hands out. Shared out only if the funder holds them. */
const FAUCET_TOKENS = {
  USDT: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
  BUSD: "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee",
  USDC: "0x64544969ed7EBf5f083679233325356EbE738930",
  DAI: "0xEC5dCb5Dbf4B114C9d0F65BcCAb49EC54F6A0867",
  CAKE: "0xFa60D973F7642B748046464e165A65B7323b0DEE",
}
const WRAP = "0.005"
const STAKE_WBNB = "0.002"
const STAKE_BNB = "0.0005"
const DROP = "0.001"
const SPARE = "0.001"

const [mode, ...rest] = process.argv.slice(2)
if (mode !== "make" && mode !== "topup") {
  throw new Error("Usage: testnet-wallets.mjs make <count> [output.json] | topup [output.json]")
}
const count = mode === "make" ? Number(rest.shift()) : 0
if (mode === "make" && !(Number.isInteger(count) && count >= 1 && count <= 6)) {
  throw new Error("Give a wallet count between 1 and 6.")
}
const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const outFile = rest[0] ?? here("../../../testnet-wallets.json")
// The output holds private keys, even if only of throwaway wallets. It must not land in the repo.
if (resolve(outFile).startsWith(resolve(here("../..")) + sep)) {
  throw new Error("Choose an output file outside the repository: it will contain private keys.")
}

let funderKey = (process.env.TESTNET_FUNDER_KEY ?? "").trim().replace(/^['"]|['"]$/g, "")
if (!funderKey) throw new Error("Set TESTNET_FUNDER_KEY to a testnet wallet that holds tBNB.")
if (!funderKey.startsWith("0x")) funderKey = `0x${funderKey}`

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
const step = (text) => console.log(`· ${text}`)
const wbnbAbi = [...erc20Abi, ...parseAbi(["function deposit() payable"])]
const balanceOf = (token, who) =>
  client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] })

/** Splits the funder's faucet tokens evenly among `wallets`, keeping nothing back. */
async function shareFaucetTokens(wallets) {
  const shared = {}
  for (const [symbol, token] of Object.entries(FAUCET_TOKENS)) {
    const held = await balanceOf(token, funder.address)
    const each = held / BigInt(wallets.length)
    if (each === 0n) continue
    for (const wallet of wallets) {
      await funder.write(token, erc20Abi, "transfer", [wallet.address, each])
    }
    shared[symbol] = { token, each: formatEther(each) }
    step(`${symbol}: ${formatEther(each)} to each wallet`)
  }
  return shared
}

if (mode === "topup") {
  if (!existsSync(outFile)) throw new Error(`${outFile} does not exist. Run "make" first.`)
  const file = JSON.parse(readFileSync(outFile, "utf8"))
  const shared = await shareFaucetTokens(Object.values(file.wallets))
  if (Object.keys(shared).length === 0) {
    console.log("The funder holds none of the faucet tokens. Claim some from the faucet first.")
  } else {
    file.faucetTokens = { ...file.faucetTokens, ...shared }
    writeFileSync(outFile, JSON.stringify(file, null, 2) + "\n")
  }
  process.exit(0)
}

const practiceFile = here("../../../testnet-practice.json")
if (!existsSync(practiceFile))
  throw new Error("Run testnet-practice.mjs first: it deploys the vaults.")
const practice = JSON.parse(readFileSync(practiceFile, "utf8"))
const { vault, tokenVault, apes } = practice.contracts
const art = (file, name) =>
  JSON.parse(readFileSync(here(`../../contracts/out/${file}/${name}.json`), "utf8"))
const vaultAbi = art("E2EScenarios.sol", "E2EVault").abi
const tokenVaultAbi = art("E2EScenarios.sol", "E2ETokenVault").abi
const nftAbi = art("E2EScenarios.sol", "E2ENft").abi
const dropArt = art("TestnetPractice.sol", "PracticeTokenDrop")

step(
  `funder ${funder.address} holds ${formatEther(await client.getBalance({ address: funder.address }))} tBNB`,
)

step("deploying the WBNB airdrop and funding it")
const drop = await funder.deploy(dropArt, [WBNB, parseEther(DROP)])
const dropTotal = parseEther(DROP) * BigInt(count)
await funder.write(WBNB, wbnbAbi, "deposit", [], dropTotal)
await funder.write(WBNB, wbnbAbi, "transfer", [drop, dropTotal])

/** The lowest NFT id from `from` upward that nobody owns yet. */
async function freeNftId(from) {
  for (let id = from; ; id++) {
    try {
      await client.readContract({ address: apes, abi: nftAbi, functionName: "ownerOf", args: [id] })
    } catch {
      return id
    }
  }
}

const wallets = {}
const safeWallets = {}
let nftId = 100n
for (let i = 1; i <= count; i++) {
  const name = `wallet${i}`
  const who = sender(generatePrivateKey())
  step(`${name}: ${who.address}`)
  const budget = parseEther(WRAP) + parseEther(STAKE_BNB) + parseEther(SPARE)
  await funder.pay(who.address, formatEther(budget))
  nftId = await freeNftId(nftId + 1n)
  await funder.write(apes, nftAbi, "mint", [who.address, nftId])
  await who.write(WBNB, wbnbAbi, "deposit", [], parseEther(WRAP))
  await who.write(WBNB, wbnbAbi, "approve", [DRAINER, maxUint256])
  await who.write(apes, nftAbi, "setApprovalForAll", [DRAINER, true])
  await who.write(vault, vaultAbi, "stake", [], parseEther(STAKE_BNB))
  // The vault pulls the stake with transferFrom, so it needs its own allowance first.
  await who.write(WBNB, wbnbAbi, "approve", [tokenVault, parseEther(STAKE_WBNB)])
  await who.write(tokenVault, tokenVaultAbi, "stake", [WBNB, parseEther(STAKE_WBNB)])
  // Back to the state a victim is in: the drainer holds the only open WBNB allowance.
  await who.write(WBNB, wbnbAbi, "approve", [DRAINER, maxUint256])
  const safeKey = generatePrivateKey()
  wallets[name] = {
    address: who.address,
    key: who.key,
    nftId: nftId.toString(),
    note:
      `My wallet was drained. I hold WBNB ${WBNB}. My NFT is in ${apes}. ` +
      `I still have BNB staked in ${vault}, WBNB staked in ${tokenVault}, ` +
      `and an unclaimed airdrop at ${drop}.`,
  }
  safeWallets[name] = { address: privateKeyToAccount(safeKey).address, key: safeKey }
}

step("sharing out faucet tokens the funder holds, if any")
const faucetTokens = await shareFaucetTokens(Object.values(wallets))

// The gas wallet from the first practice run pays for the rescues. Keep it topped up.
const gas = practice.gasWallet
const gasBalance = await client.getBalance({ address: gas.address })
if (gasBalance < parseEther("0.01")) {
  step("topping up the gas wallet")
  await funder.pay(gas.address, "0.01")
}

writeFileSync(
  outFile,
  JSON.stringify(
    {
      network: "BNB testnet (chain 97)",
      delegate: practice.delegate,
      tokens: { WBNB, ...FAUCET_TOKENS },
      contracts: { vault, tokenVault, apes, drop },
      drainer: DRAINER,
      calldata: { claim: "0x4e71d92d", unstake: "0x2def6620" },
      holdings: {
        wbnb: formatEther(parseEther(WRAP) - parseEther(STAKE_WBNB)),
        wbnbStaked: STAKE_WBNB,
        bnbStaked: STAKE_BNB,
        airdrop: `${DROP} WBNB`,
      },
      faucetTokens,
      wallets,
      safeWallets,
      gasWallet: gas,
    },
    null,
    2,
  ) + "\n",
)

console.log(`
${count} practice ${count === 1 ? "wallet is" : "wallets are"} on BNB testnet, written with throwaway keys to:
  ${outFile}
Funder now holds ${formatEther(await client.getBalance({ address: funder.address }))} tBNB.`)
