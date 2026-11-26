import { type Address, erc20Abi, getAddress, hexToBigInt, isAddressEqual } from "viem"

import { type Network, publicClientFor } from "@/lib/chains"
import { vindicateDelegateAbi } from "@/lib/contracts/vindicate-delegate"
import { watchedTokens } from "@/lib/tokens"

/** ERC-7201 slot holding the delegate's nonce. See VindicateDelegate.STORAGE_SLOT. */
export const NONCE_SLOT = "0x39229323e81384f951a0cdef3eff5fe1b85bb796dc156831150ba46c8b86cd00"

/** EIP-7702 delegation designator prefix: 0xef0100 || address. */
const DELEGATION_PREFIX = "0xef0100"

export interface TokenHolding {
  address: Address
  symbol: string
  decimals: number
  balance: bigint
}

export interface Allowance {
  token: Address
  symbol: string
  decimals: number
  spender: Address
  amount: bigint
}

export interface WalletReport {
  address: Address
  nativeBalance: bigint
  /** Contract this wallet currently delegates to, if any. */
  delegation: Address | null
  /** True when the current delegation is Vindicate's own delegate. */
  delegatedToVindicate: boolean
  /** Next recovery nonce the owner must sign. Survives re-delegation because it lives in storage. */
  recoveryNonce: bigint
  tokens: TokenHolding[]
}

export function parseDelegation(code: string | undefined): Address | null {
  if (!code || !code.toLowerCase().startsWith(DELEGATION_PREFIX) || code.length !== 48) return null
  return getAddress(`0x${code.slice(8)}`)
}

export async function scanWallet(
  network: Network,
  owner: Address,
  extraTokens: readonly Address[] = [],
): Promise<WalletReport> {
  const client = publicClientFor(network)
  const tokenList = dedupe([...watchedTokens[network.id], ...extraTokens])

  const [nativeBalance, code, nonceWord, holdings] = await Promise.all([
    client.getBalance({ address: owner }),
    client.getCode({ address: owner }),
    client.getStorageAt({ address: owner, slot: NONCE_SLOT }),
    readHoldings(network, owner, tokenList),
  ])

  const delegation = parseDelegation(code)
  return {
    address: owner,
    nativeBalance,
    delegation,
    delegatedToVindicate:
      delegation !== null &&
      network.delegate !== undefined &&
      isAddressEqual(delegation, network.delegate),
    recoveryNonce: nonceWord ? hexToBigInt(nonceWord) : 0n,
    tokens: holdings,
  }
}

async function readHoldings(network: Network, owner: Address, tokens: readonly Address[]) {
  if (tokens.length === 0) return []
  const client = publicClientFor(network)
  const results = await client.multicall({
    allowFailure: true,
    contracts: tokens.flatMap((address) => [
      { address, abi: erc20Abi, functionName: "balanceOf", args: [owner] } as const,
      { address, abi: erc20Abi, functionName: "symbol" } as const,
      { address, abi: erc20Abi, functionName: "decimals" } as const,
    ]),
  })

  const holdings: TokenHolding[] = []
  tokens.forEach((address, i) => {
    const [balance, symbol, decimals] = results.slice(i * 3, i * 3 + 3)
    if (balance?.status !== "success" || decimals?.status !== "success") return
    holdings.push({
      address,
      balance: balance.result as bigint,
      symbol: symbol?.status === "success" ? String(symbol.result).slice(0, 16) : "Unknown",
      decimals: Number(decimals.result),
    })
  })
  return holdings
}

/** Non-zero allowances the owner has granted to any of `spenders` on any of `tokens`. */
export async function readAllowances(
  network: Network,
  owner: Address,
  tokens: readonly TokenHolding[],
  spenders: readonly Address[],
): Promise<Allowance[]> {
  const pairs = tokens.flatMap((token) => spenders.map((spender) => ({ token, spender })))
  if (pairs.length === 0) return []

  const results = await publicClientFor(network).multicall({
    allowFailure: true,
    contracts: pairs.map(({ token, spender }) => ({
      address: token.address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender],
    })),
  })

  return pairs.flatMap(({ token, spender }, i) => {
    const r = results[i]
    if (r?.status !== "success" || r.result === 0n) return []
    return [
      {
        token: token.address,
        symbol: token.symbol,
        decimals: token.decimals,
        spender,
        amount: r.result as bigint,
      },
    ]
  })
}

export async function readFeeBps(network: Network): Promise<number> {
  if (!network.delegate) throw new Error(`Vindicate is not deployed on ${network.name} yet.`)
  const fee = await publicClientFor(network).readContract({
    address: network.delegate,
    abi: vindicateDelegateAbi,
    functionName: "feeBps",
  })
  return Number(fee)
}

function dedupe(addresses: readonly Address[]) {
  const seen = new Map<string, Address>()
  for (const a of addresses) seen.set(a.toLowerCase(), getAddress(a))
  return [...seen.values()]
}
