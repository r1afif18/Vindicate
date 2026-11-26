// Local demo chain: anvil posing as BNB testnet (chain 97) with Vindicate deployed, a demo token,
// a funded "compromised" wallet and a drainer allowance to revoke. Writes .env.local for `pnpm dev`.
// Requires Foundry (anvil, forge) and `forge build` in contracts/. Uses anvil's public dev keys only.
import { spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { createPublicClient, createWalletClient, http, parseEther } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { bscTestnet } from "viem/chains"

const PORT = 8545
const RPC = `http://127.0.0.1:${PORT}`
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11"
const out = fileURLToPath(new URL("../../contracts/out", import.meta.url))
const keys = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  victim: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  gas: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
}
// Three more wallets for trying the app by hand, one per kind of test, so rescuing one does not
// use up the others. Anvil's public dev keys 5, 6 and 7.
const practice = {
  manual: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  copilot: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  failures: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
}
const drainer = "0x000000000000000000000000000000000000dEaD"
const treasury = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"

const art = (file, name) => JSON.parse(readFileSync(`${out}/${file}/${name}.json`, "utf8"))
const chain = { ...bscTestnet, rpcUrls: { default: { http: [RPC] } } }

const anvil = spawn("anvil", ["--hardfork", "prague", "--chain-id", "97", "--port", String(PORT)], {
  stdio: ["ignore", "ignore", "inherit"],
})
// The block ticker at the end keeps this process alive, so stopping has to be explicit.
const stop = () => {
  anvil.kill()
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
anvil.on("exit", () => process.exit(0))

const client = createPublicClient({ chain, transport: http(RPC) })
for (let i = 0; i < 50; i++) {
  try {
    await client.getChainId()
    break
  } catch {
    await new Promise((r) => setTimeout(r, 100))
  }
}

await client.request({
  method: "anvil_setCode",
  params: [MULTICALL3, art("Multicall3.sol", "Multicall3").deployedBytecode.object],
})

const wallet = (key) =>
  createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(RPC) })
const deployer = wallet(keys.deployer)
const deploy = async (a, args) => {
  const hash = await deployer.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args })
  return (await client.waitForTransactionReceipt({ hash })).contractAddress
}

const delegateArt = art("VindicateDelegate.sol", "VindicateDelegate")
const tokenArt = art("VindicateDelegate.t.sol", "MockToken")
const delegate = await deploy(delegateArt, [treasury, 1000])
const token = await deploy(tokenArt, [])
const victim = privateKeyToAccount(keys.victim).address

await client.waitForTransactionReceipt({
  hash: await deployer.writeContract({
    address: token,
    abi: tokenArt.abi,
    functionName: "mint",
    args: [victim, parseEther("1240")],
  }),
})
await client.waitForTransactionReceipt({
  hash: await wallet(keys.victim).writeContract({
    address: token,
    abi: tokenArt.abi,
    functionName: "approve",
    args: [drainer, 2n ** 256n - 1n],
  }),
})

// Practice assets for every kind of rescue: an unclaimed airdrop, a stake and two NFTs, on top
// of the token and allowance above. The app offers them through NEXT_PUBLIC_DEMO_BSC_TESTNET.
// They come from the scenario mocks, so this part is skipped if those are not built.
let demo = null
if (existsSync(`${out}/E2EScenarios.sol/E2EAirdrop.json`)) {
  const mock = (name) => art("E2EScenarios.sol", name)
  const send = async (from, address, abi, functionName, args = [], value = 0n) =>
    client.waitForTransactionReceipt({
      hash: await wallet(from).writeContract({ address, abi, functionName, args, value }),
    })
  const dropArt = mock("E2EToken")
  const drop = await deploy(dropArt, ["Drop", "DROP", 18])
  const airdrop = await deploy(mock("E2EAirdrop"), [drop])
  const apesArt = mock("E2ENft")
  const apes = await deploy(apesArt, [])
  const itemsArt = mock("E2EItems")
  const items = await deploy(itemsArt, [])
  const vaultArt = mock("E2EVault")
  const vault = await deploy(vaultArt, [])
  await send(keys.deployer, apes, apesArt.abi, "mint", [victim, 7n])
  await send(keys.deployer, items, itemsArt.abi, "mint", [victim, 3n, 40n])
  await send(keys.victim, apes, apesArt.abi, "setApprovalForAll", [drainer, true])
  await send(keys.victim, vault, vaultArt.abi, "stake", [], parseEther("2"))
  demo = {
    wallet: victim,
    token,
    drainer,
    claim: { target: airdrop, data: "0x4e71d92d", token: drop },
    unstake: { target: vault, data: "0x2def6620" },
    nft: { collection: apes, tokenId: "7" },
    items: { collection: items, tokenId: "3", amount: "40" },
  }

  const setBalance = (address, bnb) =>
    client.request({
      method: "anvil_setBalance",
      params: [address, `0x${parseEther(bnb).toString(16)}`],
    })
  const everything = 2n ** 256n - 1n
  const [manual, guided, faulty] = Object.values(practice).map(
    (k) => privateKeyToAccount(k).address,
  )

  // Filled in by hand: one of every kind, on the same contracts as the demo wallet.
  await send(keys.deployer, token, tokenArt.abi, "mint", [manual, parseEther("1000")])
  await send(practice.manual, token, tokenArt.abi, "approve", [drainer, everything])
  await send(keys.deployer, apes, apesArt.abi, "mint", [manual, 8n])
  await send(practice.manual, apes, apesArt.abi, "setApprovalForAll", [drainer, true])
  await send(keys.deployer, items, itemsArt.abi, "mint", [manual, 3n, 25n])
  await send(practice.manual, vault, vaultArt.abi, "stake", [], parseEther("0.5"))
  await setBalance(manual, "0.75")

  // Left to the copilot: no BNB left, a token it must refuse (frozen), and a token staked in a
  // vault that it can only find from this wallet's own history.
  const frozenArt = mock("E2EFreezableToken")
  const frozen = await deploy(frozenArt, [])
  const staked = await deploy(dropArt, ["Staked Gold", "SGLD", 18])
  const tokenVaultArt = mock("E2ETokenVault")
  const tokenVault = await deploy(tokenVaultArt, [])
  await send(keys.deployer, token, tokenArt.abi, "mint", [guided, parseEther("800")])
  await send(practice.copilot, token, tokenArt.abi, "approve", [drainer, everything])
  await send(keys.deployer, frozen, frozenArt.abi, "mint", [guided, parseEther("50")])
  await send(keys.deployer, frozen, frozenArt.abi, "freeze", [guided])
  await send(keys.deployer, staked, dropArt.abi, "mint", [guided, parseEther("300")])
  await send(practice.copilot, staked, dropArt.abi, "approve", [tokenVault, parseEther("300")])
  await send(practice.copilot, tokenVault, tokenVaultArt.abi, "stake", [staked, parseEther("300")])
  await send(keys.deployer, apes, apesArt.abi, "mint", [guided, 9n])
  await send(practice.copilot, vault, vaultArt.abi, "stake", [], parseEther("0.5"))
  await setBalance(guided, "0")

  // For the ways a rescue is refused: a little of everything that can be entered wrongly.
  await send(keys.deployer, token, tokenArt.abi, "mint", [faulty, parseEther("500")])
  await send(practice.failures, token, tokenArt.abi, "approve", [drainer, everything])
  await send(keys.deployer, items, itemsArt.abi, "mint", [faulty, 3n, 10n])
  await setBalance(faulty, "2")

  demo.practice = { manual, guided, faulty, frozen, staked, tokenVault }
}

// Rewrite only the three variables this script owns. Anything else already in .env.local, such
// as the copilot's model credential, is kept.
const envFile = new URL("../.env.local", import.meta.url)
const owned = [
  "NEXT_PUBLIC_DELEGATE_BSC_TESTNET",
  "NEXT_PUBLIC_RPC_BSC_TESTNET",
  "NEXT_PUBLIC_DEMO_BSC_TESTNET",
]
// If the app was pointed at a real network, keep that setup: it holds addresses of practice
// assets that cost testnet funds to recreate.
if (existsSync(envFile)) {
  const current = readFileSync(envFile, "utf8")
  if (/^NEXT_PUBLIC_RPC_BSC_TESTNET=https:/m.test(current)) {
    writeFileSync(new URL("../.env.local.before-dev-chain", import.meta.url), current)
    console.log("Saved the previous .env.local as .env.local.before-dev-chain.")
  }
}
const kept = existsSync(envFile)
  ? readFileSync(envFile, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "" && !owned.some((name) => line.startsWith(`${name}=`)))
  : []
writeFileSync(
  envFile,
  [
    ...kept,
    `NEXT_PUBLIC_DELEGATE_BSC_TESTNET=${delegate}`,
    `NEXT_PUBLIC_RPC_BSC_TESTNET=${RPC}`,
    ...(demo
      ? [`NEXT_PUBLIC_DEMO_BSC_TESTNET='${JSON.stringify({ ...demo, practice: undefined })}'`]
      : []),
  ].join("\n") + "\n",
)

console.log(`
Local chain ready on ${RPC} (chain 97, shown in the app as "Local practice chain"). .env.local written; restart \`pnpm dev\`.

  Delegate            ${delegate}
  Demo token (MOCK)   ${token}   add it in "Add a token"
  Drainer allowance   ${drainer}
  Compromised key     ${keys.victim}
  Gas wallet key      ${keys.gas}
  Safe wallet         any fresh address, e.g. 0x90F79bf6EB2c4f870365E785982E1f101E93b906
${
  demo
    ? `
  Demo rescue         paste the compromised key, scan, then press "Load the demo rescue"
    airdrop           ${demo.claim.target}   claim() pays out DROP ${demo.claim.token}
    vault             ${demo.unstake.target}   2 BNB staked, unstake() returns it
    NFT (ERC-721)     ${demo.nft.collection}   #7
    NFT (ERC-1155)    ${demo.items.collection}   #3 x40

  Practice wallets    the same on every start; each is used up by one rescue
    by hand           ${practice.manual}
                      0.75 BNB, 1000 MOCK, NFT #8, 25x item #3, 0.5 BNB staked, airdrop unclaimed
    with the copilot  ${practice.copilot}
                      800 MOCK, 50 frozen FRZ ${demo.practice.frozen}, NFT #9,
                      300 SGLD ${demo.practice.staked} staked in ${demo.practice.tokenVault}
    refusals          ${practice.failures}
                      2 BNB, 500 MOCK, 10x item #3
`
    : ""
}
Ctrl+C to stop.`)

// A real network produces a block every few seconds. An idle local chain does not, so the time
// of its latest block falls behind the clock, and a rescue signed against it (valid for ten
// minutes of chain time) is already expired when it is simulated. Tick like a real chain does.
setInterval(() => {
  client.request({ method: "evm_mine" }).catch(() => {})
}, 3_000)
