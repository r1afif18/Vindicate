// Helper for driving the rescue UI by hand (or by a browser agent) against `pnpm dev:chain`.
// It creates brand-new wallets and assets on the local chain and reports on-chain state, so a
// run through the real UI can be checked against the chain instead of against the UI's own claims.
//
//   E2E_FIXTURE=/path/fixture.json node e2e/ui-chain.mjs seed
//   E2E_FIXTURE=... node e2e/ui-chain.mjs fund <address> <bnb>
//   E2E_FIXTURE=... node e2e/ui-chain.mjs attacker-tx <a|b>   # a tx from the leaked key
//   E2E_FIXTURE=... node e2e/ui-chain.mjs state
//
// Local chain only: it relies on anvil_setBalance.
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  erc20Abi,
  erc721Abi,
  formatEther,
  getAddress,
  http,
  maxUint256,
  parseAbi,
  parseEther,
} from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { bscTestnet } from "viem/chains"

const RPC = "http://127.0.0.1:8545"
const fixturePath = process.env.E2E_FIXTURE
if (!fixturePath) throw new Error("Set E2E_FIXTURE to a file path outside the repository.")

const out = fileURLToPath(new URL("../../contracts/out", import.meta.url))
const chain = { ...bscTestnet, rpcUrls: { default: { http: [RPC] } } }
const client = createPublicClient({ chain, transport: http(RPC) })
const anvil = createTestClient({ mode: "anvil", chain, transport: http(RPC) })

const mockAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function claimed(address who) view returns (bool)",
  "function stake() payable",
  "function staked(address who) view returns (uint256)",
  "function pull(address token, address from, uint256 amount)",
])
const itemsAbi = parseAbi([
  "function mint(address to, uint256 id, uint256 amount)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
])

const actor = () => {
  const key = generatePrivateKey()
  return { key, address: privateKeyToAccount(key).address }
}
const walletOf = (who) =>
  createWalletClient({ account: privateKeyToAccount(who.key), chain, transport: http(RPC) })
const mock = (name) => JSON.parse(readFileSync(`${out}/E2EScenarios.sol/${name}.json`, "utf8"))
const fund = (address, bnb) => anvil.setBalance({ address, value: parseEther(bnb) })

async function seed() {
  const ops = actor()
  await fund(ops.address, "100")
  const opsWallet = walletOf(ops)
  const deploy = async (name, args = []) => {
    const art = mock(name)
    const hash = await opsWallet.deployContract({
      abi: art.abi,
      bytecode: art.bytecode.object,
      args,
    })
    return getAddress((await client.waitForTransactionReceipt({ hash })).contractAddress)
  }
  const send = async (who, request) => {
    const hash = await walletOf(who).writeContract(request)
    const receipt = await client.waitForTransactionReceipt({ hash })
    if (receipt.status !== "success") throw new Error(`${request.functionName} reverted`)
  }

  const victimA = actor() // full rescue through the UI
  const victimB = actor() // race: the attacker moves between review and send
  const safeA = actor().address
  const safeB = actor().address
  const gasWallet = actor() // for the "My own" gas wallet path
  await fund(gasWallet.address, "0.05")

  const gold = await deploy("E2EToken", ["Gold", "GLD", 18])
  const drop = await deploy("E2EToken", ["Drop", "DROP", 18])
  const airdrop = await deploy("E2EAirdrop", [drop])
  const apes = await deploy("E2ENft")
  const items = await deploy("E2EItems")
  const drainer = await deploy("E2EDrainer")
  const vault = await deploy("E2EVault")

  await send(ops, {
    address: gold,
    abi: mockAbi,
    functionName: "mint",
    args: [victimA.address, parseEther("1000")],
  })
  await send(ops, {
    address: apes,
    abi: mockAbi,
    functionName: "mint",
    args: [victimA.address, 7n],
  })
  await send(ops, {
    address: items,
    abi: itemsAbi,
    functionName: "mint",
    args: [victimA.address, 3n, 40n],
  })
  await fund(victimA.address, "1")
  await send(victimA, {
    address: gold,
    abi: erc20Abi,
    functionName: "approve",
    args: [drainer, maxUint256],
  })
  await send(victimA, {
    address: apes,
    abi: erc721Abi,
    functionName: "setApprovalForAll",
    args: [drainer, true],
  })
  await send(victimA, {
    address: vault,
    abi: mockAbi,
    functionName: "stake",
    value: parseEther("0.5"),
  })
  await fund(victimA.address, "0.75")

  // Victim B: BNB plus a token the drainer is approved to pull.
  await send(ops, {
    address: gold,
    abi: mockAbi,
    functionName: "mint",
    args: [victimB.address, parseEther("500")],
  })
  await fund(victimB.address, "1")
  await send(victimB, {
    address: gold,
    abi: erc20Abi,
    functionName: "approve",
    args: [drainer, maxUint256],
  })
  await fund(victimB.address, "2")

  const fixture = {
    victimA,
    victimB,
    safeA,
    safeB,
    gasWallet,
    gold,
    drop,
    airdrop,
    apes,
    items,
    drainer,
    vault,
    ops,
    claimCalldata: "0x4e71d92d",
    unstakeCalldata: "0x2def6620",
    closedCalldata: "0x597e1fb5",
  }
  writeFileSync(fixturePath, JSON.stringify(fixture, null, 2))
  console.log(`Seeded. Fixture written to ${fixturePath}`)
}

async function state() {
  const f = JSON.parse(readFileSync(fixturePath, "utf8"))
  const bnb = async (a) => formatEther(await client.getBalance({ address: a }))
  const erc20 = async (token, who) =>
    formatEther(
      await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [who],
      }),
    )
  const row = async (label, who) => ({
    who: label,
    bnb: await bnb(who),
    gold: await erc20(f.gold, who),
    drop: await erc20(f.drop, who),
    items: String(
      await client.readContract({
        address: f.items,
        abi: itemsAbi,
        functionName: "balanceOf",
        args: [who, 3n],
      }),
    ),
    code: (await client.getCode({ address: who })) ?? "none",
  })
  console.table([
    await row("victimA", f.victimA.address),
    await row("safeA", f.safeA),
    await row("victimB", f.victimB.address),
    await row("safeB", f.safeB),
  ])
  const apeOwner = await client.readContract({
    address: f.apes,
    abi: erc721Abi,
    functionName: "ownerOf",
    args: [7n],
  })
  console.log("ape #7 owner:", apeOwner === f.safeA ? "safeA" : "victimA or other", apeOwner)
  console.log(
    "GLD allowance to drainer:",
    String(
      await client.readContract({
        address: f.gold,
        abi: erc20Abi,
        functionName: "allowance",
        args: [f.victimA.address, f.drainer],
      }),
    ),
  )
  console.log(
    "ape operator still approved:",
    await client.readContract({
      address: f.apes,
      abi: erc721Abi,
      functionName: "isApprovedForAll",
      args: [f.victimA.address, f.drainer],
    }),
  )
  console.log(
    "victimA still staked in vault (BNB):",
    formatEther(
      await client.readContract({
        address: f.vault,
        abi: mockAbi,
        functionName: "staked",
        args: [f.victimA.address],
      }),
    ),
  )
  console.log(
    "airdrop claimed by victimA:",
    await client.readContract({
      address: f.airdrop,
      abi: mockAbi,
      functionName: "claimed",
      args: [f.victimA.address],
    }),
  )
}

const [command, ...args] = process.argv.slice(2)
if (command === "seed") {
  await seed()
} else if (command === "fund") {
  await fund(getAddress(args[0]), args[1] ?? "1")
  console.log(`Funded ${args[0]}`)
} else if (command === "attacker-tx") {
  const f = JSON.parse(readFileSync(fixturePath, "utf8"))
  const victim = args[0] === "a" ? f.victimA : f.victimB
  const hash = await walletOf(victim).sendTransaction({ to: victim.address, value: 0n })
  await client.waitForTransactionReceipt({ hash })
  console.log("A transaction was sent from the leaked key.")
} else if (command === "drainer-pull") {
  // The drainer uses its allowance to take victim B's GLD, as it would on seeing a rescue coming.
  const f = JSON.parse(readFileSync(fixturePath, "utf8"))
  const amount = await client.readContract({
    address: f.gold,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [f.victimB.address],
  })
  const hash = await walletOf(f.ops).writeContract({
    address: f.drainer,
    abi: mockAbi,
    functionName: "pull",
    args: [f.gold, f.victimB.address, amount],
  })
  await client.waitForTransactionReceipt({ hash })
  console.log("The drainer pulled victim B's GLD through its allowance.")
} else if (command === "state") {
  await state()
} else {
  throw new Error(
    "Usage: ui-chain.mjs seed | fund <address> <bnb> | attacker-tx <a|b> | drainer-pull | state",
  )
}
