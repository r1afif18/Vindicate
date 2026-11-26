import {
  type Address,
  type Hex,
  BaseError,
  ExecutionRevertedError,
  encodeFunctionData,
  erc20Abi,
  erc721Abi,
  getAddress,
  isAddress,
  maxUint256,
  numberToHex,
  pad,
  parseAbi,
  toEventSelector,
  toFunctionSelector,
  zeroAddress,
} from "viem"

import { type Network, publicClientFor } from "@/lib/chains"
import type {
  AllowanceFinding,
  CallFinding,
  Findings,
  NftFinding,
  OperatorFinding,
  TokenFinding,
} from "@/lib/copilot/types"
import { scanWallet } from "@/lib/recovery/scan"

/**
 * Reads everything a rescue needs to know about a wallet from the chain alone: what it holds,
 * what it has approved, and which contracts it can still pull value out of. Only an address goes
 * in. No key is needed, and nothing here sends a transaction: every "would this work" question is
 * answered with eth_call.
 */

const TRANSFER = toEventSelector("Transfer(address,address,uint256)")
const TRANSFER_SINGLE = toEventSelector("TransferSingle(address,address,address,uint256,uint256)")
const APPROVAL = toEventSelector("Approval(address,address,uint256)")
const APPROVAL_FOR_ALL = toEventSelector("ApprovalForAll(address,address,bool)")

const erc1155Abi = parseAbi([
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function isApprovedForAll(address account, address operator) view returns (bool)",
])

/** No-argument exits worth trying on a contract the wallet has put value into. */
const EXITS = [
  "unstake()",
  "withdraw()",
  "withdrawAll()",
  "exit()",
  "claim()",
  "claimAll()",
  "claimRewards()",
  "getReward()",
  "harvest()",
].map((label) => ({ label, data: toFunctionSelector(`function ${label}`) }))

/** Getters a staking or airdrop contract commonly uses to name the token it pays out. */
const PAYOUT_GETTERS = parseAbi([
  "function token() view returns (address)",
  "function TOKEN() view returns (address)",
  "function rewardToken() view returns (address)",
  "function rewardsToken() view returns (address)",
])

/**
 * A selector no real contract implements. A contract that accepts it accepts anything (it has a
 * fallback), so "the exit did not revert" would say nothing about whether it pays out.
 */
const NO_SUCH_FUNCTION = toFunctionSelector("function vindicateProbeNoContractImplements()")

/**
 * How much history to read, and how to cut it up for RPCs that cap eth_getLogs ranges. BNB Chain
 * makes a block in well under a second, so a week is over a million blocks.
 */
const LOOKBACK_BLOCKS = 1_400_000n
const MAX_SPAN = 50_000n
const MIN_SPAN = 1_000n
const MAX_LOG_REQUESTS = 160
/** Windows read at once, after the first one has shown what range the RPC accepts. */
const HISTORY_LANES = 4
/** Stand-in receiver for the "can this token move" test when no safe wallet is known yet. */
const PROBE_RECIPIENT: Address = "0x1111111111111111111111111111111111111111"

interface RawLog {
  address: Address
  topics: Hex[]
  data: Hex
}

export interface InvestigateInput {
  network: Network
  owner: Address
  /** Addresses the user mentioned. They are probed like contracts from the wallet's history. */
  mentioned?: readonly Address[]
  recipient?: Address
}

export async function investigate(input: InvestigateInput): Promise<{
  findings: Findings
  log: string[]
}> {
  const { network } = input
  // Checksummed once here, because every comparison below is on checksummed addresses.
  const owner = getAddress(input.owner)
  const client = publicClientFor(network)
  const log: string[] = []
  const ownerTopic = pad(owner)

  // 1. History: every transfer in or out, and every approval the wallet has ever given.
  const mentioned = (input.mentioned ?? []).filter((a) => isAddress(a)).map((a) => getAddress(a))
  const latest = await client.getBlockNumber()
  const floor = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n
  const filters: (Hex | Hex[] | null)[][] = [
    [TRANSFER, null, ownerTopic],
    [TRANSFER, ownerTopic],
    [TRANSFER_SINGLE, null, null, ownerTopic],
    [[APPROVAL, APPROVAL_FOR_ALL], ownerTopic],
  ]

  /**
   * Walks back from the latest block. `address` narrows every query to those contracts. The first
   * window goes alone, to find a block range the RPC accepts; after that several windows are
   * read side by side, because a week of BNB Chain is dozens of them.
   */
  async function readHistory(address?: readonly Address[]) {
    const found: RawLog[][] = filters.map(() => [])
    const readWindow = (from: bigint, to: bigint) =>
      Promise.all(
        filters.map((topics) =>
          client.request({
            method: "eth_getLogs",
            params: [
              {
                fromBlock: numberToHex(from),
                toBlock: numberToHex(to),
                topics,
                ...(address ? { address: [...address] } : {}),
              },
            ],
          }),
        ),
      )
    let span = MAX_SPAN
    let lanes = 1
    let to = latest
    let requests = 0
    let reached = latest + 1n
    while (to >= floor && requests + filters.length <= MAX_LOG_REQUESTS) {
      const windows: [bigint, bigint][] = []
      let cursor = to
      while (
        windows.length < lanes &&
        cursor >= floor &&
        requests + (windows.length + 1) * filters.length <= MAX_LOG_REQUESTS
      ) {
        const from = cursor >= floor + span ? cursor - span + 1n : floor
        windows.push([from, cursor])
        if (from === floor) break
        cursor = from - 1n
      }
      requests += windows.length * filters.length
      try {
        const batches = await Promise.all(windows.map(([from, end]) => readWindow(from, end)))
        for (const batch of batches) {
          batch.forEach((logsOfFilter, i) => found[i]?.push(...(logsOfFilter as RawLog[])))
        }
        reached = windows.at(-1)?.[0] ?? reached
        if (reached === floor) break
        to = reached - 1n
        lanes = HISTORY_LANES
      } catch {
        // Nothing from a failed round is kept, so the same stretch is simply read again:
        // one window at a time first, then with a smaller range (most public RPCs cap it).
        if (lanes > 1) {
          lanes = 1
        } else {
          if (span <= MIN_SPAN) break
          span /= 2n
        }
      }
    }
    return { found, blocks: Number(latest + 1n - reached), complete: reached === 0n }
  }

  let history = await readHistory()
  let narrowed = false
  if (history.blocks === 0 && mentioned.length > 0) {
    // Public BNB Chain RPCs refuse log queries that do not name a contract. The contracts the
    // owner named can still be searched for this wallet's transfers and approvals.
    history = await readHistory(mentioned)
    narrowed = history.blocks > 0
  }
  const logs = history.found
  const blocksScanned = history.blocks
  const historyComplete = history.complete && !narrowed
  const blockCount = blocksScanned.toLocaleString("en-US")
  // Blocks mean little to an owner. Say how far back that is in time.
  const reach = blocksScanned > 0 ? await timeSpan(client, latest, BigInt(blocksScanned)) : ""
  log.push(
    blocksScanned === 0
      ? "This network's RPC does not allow reading a wallet's history, so only the watch list and the addresses in your note were checked. Name the tokens and contracts you know about."
      : narrowed
        ? `This network's RPC only allows history searches inside named contracts, so the ${mentioned.length} address${mentioned.length === 1 ? "" : "es"} in your note were searched for this wallet's transfers and approvals (last ${blockCount} blocks${reach}). Anything in a contract you did not name, or older than that, is not covered.`
        : historyComplete
          ? `Read the wallet's full history (${blockCount} blocks).`
          : `Read the wallet's last ${blockCount} blocks of history${reach}. Older activity is not covered.`,
  )

  const [incoming = [], outgoing = [], incoming1155 = [], approvals = []] = logs
  // Anyone can emit a log that names this wallet, with any shape. One that does not parse is
  // skipped: it must never take the whole investigation down.
  const each = (list: RawLog[], read: (l: RawLog) => void) => {
    for (const l of list) {
      try {
        read(l)
      } catch {
        // malformed log
      }
    }
  }
  const erc20s = new Set<Address>()
  const nft721 = new Map<string, { collection: Address; tokenId: bigint }>()
  each(incoming, (l) => {
    const collection = getAddress(l.address)
    // ERC-721 indexes the token id, so its Transfer has a fourth topic.
    const id = l.topics[3]
    if (id) nft721.set(`${collection}:${id}`, { collection, tokenId: BigInt(id) })
    else erc20s.add(collection)
  })
  const nft1155 = new Map<string, { collection: Address; tokenId: bigint }>()
  each(incoming1155, (l) => {
    const collection = getAddress(l.address)
    const tokenId = BigInt(l.data.slice(0, 66))
    nft1155.set(`${collection}:${tokenId}`, { collection, tokenId })
  })
  const spenders = new Map<string, { token: Address; spender: Address }>()
  const operatorPairs = new Map<string, OperatorFinding>()
  each(approvals, (l) => {
    const contract = getAddress(l.address)
    const who = l.topics[2]
    if (!who || l.topics.length !== 3) return // 4 topics: a single-NFT approval
    const counterparty = getAddress(`0x${who.slice(26)}`)
    if (l.topics[0] === APPROVAL) {
      spenders.set(`${contract}:${counterparty}`, { token: contract, spender: counterparty })
      erc20s.add(contract)
    } else {
      operatorPairs.set(`${contract}:${counterparty}`, {
        collection: contract,
        operator: counterparty,
      })
    }
  })
  // Wherever the wallet sent tokens, it may have a position it can still withdraw. Which token
  // went where is kept: it is the best evidence of what an exit from that contract pays back.
  const sentTo = new Map<Address, Set<Address>>()
  each(outgoing, (l) => {
    const dest = l.topics[2]
    if (!dest) return
    const destination = getAddress(`0x${dest.slice(26)}`)
    const tokens = sentTo.get(destination) ?? new Set<Address>()
    if (l.topics.length === 3) tokens.add(getAddress(l.address)) // ERC-20 only
    sentTo.set(destination, tokens)
  })

  // 2. Present state: history says what to look at, the chain says what is still true.
  // An address from the owner's note may be a token. scanWallet drops the ones that are not.
  const report = await scanWallet(network, owner, [...erc20s, ...mentioned])
  for (const t of report.tokens) erc20s.add(t.address)
  const held = report.tokens.filter((t) => t.balance > 0n)
  log.push(
    `Found ${held.length} token${held.length === 1 ? "" : "s"} with a balance and ${report.nativeBalance > 0n ? "some" : "no"} BNB.`,
  )

  const receiver = input.recipient ?? PROBE_RECIPIENT
  const tokens: TokenFinding[] = await Promise.all(
    held.map(async (t) => {
      const verdict = await simulateTransfer(client, owner, t.address, receiver, t.balance)
      return {
        address: t.address,
        symbol: t.symbol,
        decimals: t.decimals,
        balance: t.balance.toString(),
        transferable: verdict === null,
        blocker: verdict,
      }
    }),
  )
  const stuck = tokens.filter((t) => !t.transferable)
  if (stuck.length > 0) {
    log.push(
      `${stuck.map((t) => t.symbol).join(", ")} cannot be transferred. Including ${stuck.length === 1 ? "it" : "them"} would cancel the whole rescue.`,
    )
  }

  const nfts: NftFinding[] = []
  const owned721 = await client.multicall({
    allowFailure: true,
    contracts: [...nft721.values()].map((n) => ({
      address: n.collection,
      abi: erc721Abi,
      functionName: "ownerOf" as const,
      args: [n.tokenId] as const,
    })),
  })
  ;[...nft721.values()].forEach((n, i) => {
    const r = owned721[i]
    if (r?.status === "success" && getAddress(r.result as Address) === owner) {
      nfts.push({
        standard: "erc721",
        collection: n.collection,
        tokenId: n.tokenId.toString(),
        amount: "1",
      })
    }
  })
  const owned1155 = await client.multicall({
    allowFailure: true,
    contracts: [...nft1155.values()].map((n) => ({
      address: n.collection,
      abi: erc1155Abi,
      functionName: "balanceOf" as const,
      args: [owner, n.tokenId] as const,
    })),
  })
  ;[...nft1155.values()].forEach((n, i) => {
    const r = owned1155[i]
    if (r?.status === "success" && (r.result as bigint) > 0n) {
      nfts.push({
        standard: "erc1155",
        collection: n.collection,
        tokenId: n.tokenId.toString(),
        amount: (r.result as bigint).toString(),
      })
    }
  })
  if (nfts.length > 0) log.push(`Found ${nfts.length} NFT position${nfts.length === 1 ? "" : "s"}.`)

  const symbolOf = new Map(report.tokens.map((t) => [t.address, t] as const))
  const allowanceReads = await client.multicall({
    allowFailure: true,
    contracts: [...spenders.values()].map((s) => ({
      address: s.token,
      abi: erc20Abi,
      functionName: "allowance" as const,
      args: [owner, s.spender] as const,
    })),
  })
  const allowances: AllowanceFinding[] = []
  ;[...spenders.values()].forEach((s, i) => {
    const r = allowanceReads[i]
    const meta = symbolOf.get(s.token)
    if (r?.status !== "success" || (r.result as bigint) === 0n || !meta) return
    const amount = r.result as bigint
    allowances.push({
      token: s.token,
      symbol: meta.symbol,
      decimals: meta.decimals,
      spender: s.spender,
      amount: amount.toString(),
      unlimited: amount >= maxUint256 / 2n,
    })
  })
  const operatorReads = await client.multicall({
    allowFailure: true,
    contracts: [...operatorPairs.values()].map((o) => ({
      address: o.collection,
      abi: erc1155Abi,
      functionName: "isApprovedForAll" as const,
      args: [owner, o.operator] as const,
    })),
  })
  const operators = [...operatorPairs.values()].filter(
    (_, i) => operatorReads[i]?.status === "success" && operatorReads[i]?.result === true,
  )
  if (allowances.length + operators.length > 0) {
    log.push(
      `Found ${allowances.length + operators.length} approval${allowances.length + operators.length === 1 ? "" : "s"} that still let someone else move this wallet's assets.`,
    )
  }

  // 3. Exits: contracts the wallet funded, or that the user pointed at, that pay out right now.
  const known = new Set<Address>([
    ...erc20s,
    ...[...nft721.values()].map((n) => n.collection),
    ...[...nft1155.values()].map((n) => n.collection),
  ])
  const sources = new Map<Address, CallFinding["source"]>()
  for (const a of sentTo.keys()) if (!known.has(a) && a !== owner) sources.set(a, "history")
  for (const a of mentioned) if (!known.has(a) && a !== owner) sources.set(a, "mentioned")
  const calls: CallFinding[] = []
  for (const [target, source] of sources) {
    const code = await client.getCode({ address: target })
    if (!code || code === "0x") continue
    // A contract that accepts any call would "succeed" at every exit while paying nothing.
    if (await succeeds(client, owner, target, NO_SUCH_FUNCTION)) continue
    const usable = await Promise.all(
      EXITS.map(async (exit) => ({ exit, ok: await succeeds(client, owner, target, exit.data) })),
    )
    if (!usable.some((u) => u.ok)) continue
    // What the exit pays back: the token the contract names, and whatever this wallet put in.
    const payout = await client.multicall({
      allowFailure: true,
      contracts: PAYOUT_GETTERS.map((item) => ({
        address: target,
        abi: [item],
        functionName: item.name,
      })),
    })
    const named = payout.flatMap((p) =>
      p.status === "success" && isAddress(String(p.result)) && p.result !== zeroAddress
        ? [getAddress(String(p.result))]
        : [],
    )
    const guesses = [...new Set([...named, ...(sentTo.get(target) ?? [])])]
    // scanWallet keeps only addresses that really are tokens.
    const pays =
      guesses.length > 0
        ? (await scanWallet(network, owner, guesses)).tokens
            .map((t) => t.address)
            .filter((a) => guesses.includes(a))
        : []
    for (const { exit, ok } of usable) {
      if (!ok) continue
      calls.push({ target, label: exit.label, data: exit.data, source, pays })
    }
  }
  if (sources.size > 0) {
    log.push(
      calls.length > 0
        ? `Checked ${sources.size} contract${sources.size === 1 ? "" : "s"} for something this wallet can still call: ${calls.length} call${calls.length === 1 ? "" : "s"} would go through right now. What each one pays was not measured.`
        : `Checked ${sources.size} contract${sources.size === 1 ? "" : "s"} for something this wallet can still call: nothing would go through right now.`,
    )
  }

  if (report.delegation && !report.delegatedToVindicate) {
    log.push(`The wallet runs someone else's code (${report.delegation}). The rescue replaces it.`)
  }

  return {
    findings: {
      owner,
      nativeBalance: report.nativeBalance.toString(),
      delegation: report.delegation,
      delegatedToVindicate: report.delegatedToVindicate,
      tokens,
      nfts,
      allowances,
      operators,
      calls,
      blocksScanned,
      historyComplete,
    },
    log,
  }
}

type Client = ReturnType<typeof publicClientFor>

/**
 * A call that reverts is an answer. A call that could not be made at all (timeout, rate limit) is
 * not, and must not be mistaken for one: it is rethrown so the investigation fails loudly.
 */
function reverted(error: unknown) {
  return (
    error instanceof BaseError && error.walk((e) => e instanceof ExecutionRevertedError) !== null
  )
}

/** ", about 3 days" for a number of blocks ending at `latest`. Empty if the chain will not say. */
async function timeSpan(client: Client, latest: bigint, blocks: bigint) {
  try {
    const first = latest >= blocks ? latest - blocks + 1n : 0n
    const [from, to] = await Promise.all([
      client.getBlock({ blockNumber: first }),
      client.getBlock({ blockNumber: latest }),
    ])
    const hours = Number(to.timestamp - from.timestamp) / 3600
    if (hours < 1) return ""
    return hours < 48
      ? `, about ${Math.round(hours)} hours`
      : `, about ${Math.round(hours / 24)} days`
  } catch {
    return ""
  }
}

/**
 * Runs a read, and once more if it failed for a reason that is not the chain's answer. Public
 * RPCs drop the odd request, and one dropped probe should not sink the whole investigation.
 */
async function steady<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    if (reverted(error)) throw error
    return read()
  }
}

/** Whether a call from `from` would go through right now. */
async function succeeds(client: Client, from: Address, to: Address, data: Hex) {
  try {
    await steady(() => client.call({ account: from, to, data }))
    return true
  } catch (error) {
    if (reverted(error)) return false
    throw error
  }
}

/**
 * Null when moving the whole balance would work. Otherwise a fixed description of why not. The
 * token's own revert text is never passed on: an attacker writes it, and it would end up in
 * front of the user and the model.
 */
async function simulateTransfer(
  client: Client,
  from: Address,
  token: Address,
  to: Address,
  amount: bigint,
) {
  try {
    const { data } = await steady(() =>
      client.call({
        account: from,
        to: token,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] }),
      }),
    )
    // ERC-20 reports success by returning true, or nothing at all. A returned false is a refusal.
    if (data && data.length >= 66 && BigInt(data.slice(0, 66)) === 0n) {
      return "the token reports the transfer as failed"
    }
    return null
  } catch (error) {
    if (reverted(error)) return "the token rejects the transfer"
    throw error
  }
}

/** Every 0x address in free text, deduplicated. Used on the user's own description only. */
export function addressesIn(text: string): Address[] {
  const found = text.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g) ?? []
  return [...new Set(found.map((a) => getAddress(a)))]
}
