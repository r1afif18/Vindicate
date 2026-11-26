// Read-only: prints what each practice wallet from testnet-wallets.mjs holds on BNB testnet right
// now, and what its safe wallet holds. Use it to see which wallets are still unused, and to check
// a rescue against the chain instead of against the app's own receipt. Prints no keys.
//
//   node scripts/testnet-wallets-state.mjs [testnet-wallets.json]
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { createPublicClient, erc20Abi, erc721Abi, formatEther, http, parseAbi } from "viem"
import { bscTestnet } from "viem/chains"

const file =
  process.argv[2] ?? fileURLToPath(new URL("../../../testnet-wallets.json", import.meta.url))
const data = JSON.parse(readFileSync(file, "utf8"))
const client = createPublicClient({
  chain: bscTestnet,
  transport: http(process.env.TESTNET_RPC ?? "https://bsc-testnet-rpc.publicnode.com"),
})
const { vault, tokenVault, apes, drop } = data.contracts
const WBNB = data.tokens.WBNB
const read = (address, abi, functionName, args) =>
  client.readContract({ address, abi, functionName, args })
const vaultAbi = parseAbi(["function staked(address) view returns (uint256)"])
const tokenVaultAbi = parseAbi(["function staked(address, address) view returns (uint256)"])
const dropAbi = parseAbi(["function claimed(address) view returns (bool)"])

for (const [name, wallet] of Object.entries(data.wallets)) {
  const safe = data.safeWallets[name].address
  const [bnb, wbnb, allowance, stakedWbnb, stakedBnb, claimed, nftOwner, code, safeBnb, safeWbnb] =
    await Promise.all([
      client.getBalance({ address: wallet.address }),
      read(WBNB, erc20Abi, "balanceOf", [wallet.address]),
      read(WBNB, erc20Abi, "allowance", [wallet.address, data.drainer]),
      read(tokenVault, tokenVaultAbi, "staked", [wallet.address, WBNB]),
      read(vault, vaultAbi, "staked", [wallet.address]).catch(() => null),
      read(drop, dropAbi, "claimed", [wallet.address]),
      read(apes, erc721Abi, "ownerOf", [BigInt(wallet.nftId)]),
      client.getCode({ address: wallet.address }),
      client.getBalance({ address: safe }),
      read(WBNB, erc20Abi, "balanceOf", [safe]),
    ])
  const others = []
  for (const [symbol, token] of Object.entries(data.tokens)) {
    if (symbol === "WBNB") continue
    const held = await read(token, erc20Abi, "balanceOf", [wallet.address])
    if (held > 0n) others.push(`${formatEther(held)} ${symbol}`)
  }
  const used = claimed || stakedWbnb === 0n
  console.log(`${name} ${wallet.address}  ${used ? "USED (rescued)" : "READY"}`)
  console.log(
    `  wallet: ${formatEther(bnb)} BNB, ${formatEther(wbnb)} WBNB` +
      (others.length ? `, ${others.join(", ")}` : "") +
      `, drainer allowance ${allowance > 0n ? "open" : "none"}` +
      `, delegated ${code && code !== "0x" ? "yes" : "no"}`,
  )
  console.log(
    `  staked: ${formatEther(stakedWbnb)} WBNB` +
      (stakedBnb === null ? "" : `, ${formatEther(stakedBnb)} BNB`) +
      `; airdrop ${claimed ? "claimed" : "open"}; NFT #${wallet.nftId} with ${
        nftOwner === safe
          ? "the safe wallet"
          : nftOwner === wallet.address
            ? "the wallet"
            : nftOwner
      }`,
  )
  console.log(`  safe ${safe}: ${formatEther(safeBnb)} BNB, ${formatEther(safeWbnb)} WBNB`)
}
