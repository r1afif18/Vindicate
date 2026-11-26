import {
  type Address,
  type Hash,
  type Hex,
  type SignedAuthorization,
  type TransactionReceipt,
  createWalletClient,
  erc20Abi,
  http,
  isAddressEqual,
  parseEventLogs,
  zeroAddress,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"

import { type Network, publicClientFor } from "@/lib/chains"
import { vindicateDelegateAbi } from "@/lib/contracts/vindicate-delegate"
import { RecoveryPlanError, buildRecovery } from "@/lib/recovery/plan"
import { parseDelegation } from "@/lib/recovery/scan"
import { recoveryDomain, recoveryTypes } from "@/lib/recovery/typed-data"
import type { RecoveryAction, RecoveryMessage } from "@/lib/recovery/types"

/** How long a signed recovery stays valid. Short, so a leaked signature goes stale quickly. */
const DEADLINE_SECONDS = 10n * 60n
/** Do not send this close to the deadline: the transaction still has to be mined before it. */
const DEADLINE_MARGIN_SECONDS = 30n
/** Head-room on the gas estimate, in percent. */
const GAS_BUFFER = 120n

export interface RecoveryRequest {
  network: Network
  /** Private key of the compromised wallet. Used only in this browser tab. */
  ownerKey: Hex
  /** Private key of the wallet that pays gas. Used only in this browser tab. */
  sponsorKey: Hex
  recipient: Address
  actions: readonly RecoveryAction[]
  recoveryNonce: bigint
}

export interface PreparedRecovery {
  network: Network
  owner: Address
  sponsor: Address
  message: RecoveryMessage
  signature: Hex
  authorization: SignedAuthorization
  gas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  /** Upper bound on what the gas wallet pays, in wei. */
  maxCost: bigint
  sponsorBalance: bigint
}

/**
 * The signed review can no longer do what it was signed for, because the compromised wallet has
 * changed since. The fix is always the same: scan and review again.
 */
export class StaleRecoveryError extends RecoveryPlanError {
  override name = "StaleRecoveryError"
}

/** The rescue was broadcast, but this tab could not learn how it ended. */
export class UnconfirmedRecoveryError extends StaleRecoveryError {
  override name = "UnconfirmedRecoveryError"
  constructor(readonly hash: Hash) {
    super(
      `The rescue was sent, but its result could not be confirmed (transaction ${hash.slice(0, 10)}…${hash.slice(-8)}). Check it on the explorer and let it settle before you review again.`,
    )
  }
}

/** One asset the contract reported sweeping. `token` is null for BNB. */
export interface SweptAsset {
  token: Address | null
  /** What reached the safe wallet, after the fee. */
  amount: bigint
  fee: bigint
}

/**
 * Signs everything locally and simulates the transaction. Nothing is broadcast.
 * The two keys never leave this function except as signatures.
 */
export async function prepareRecovery(request: RecoveryRequest): Promise<PreparedRecovery> {
  const { network } = request
  const delegate = requireDelegate(network)
  const owner = privateKeyToAccount(request.ownerKey)
  const sponsor = privateKeyToAccount(request.sponsorKey)
  if (isAddressEqual(request.recipient, delegate)) {
    throw new RecoveryPlanError("The safe wallet is the Vindicate contract. Use a wallet address.")
  }
  if (isAddressEqual(owner.address, sponsor.address)) {
    throw new RecoveryPlanError(
      "Use a different wallet to pay gas. The compromised wallet is watched.",
    )
  }

  const client = publicClientFor(network)
  const wallet = createWalletClient({
    account: sponsor,
    chain: network.chain,
    transport: http(network.rpcUrl),
  })

  const block = await client.getBlock()
  const message = buildRecovery({
    owner: owner.address,
    recipient: request.recipient,
    executor: sponsor.address,
    actions: request.actions,
    nonce: request.recoveryNonce,
    deadline: block.timestamp + DEADLINE_SECONDS,
  })

  const [signature, authorization] = await Promise.all([
    owner.signTypedData({
      domain: recoveryDomain(network.chain.id, owner.address),
      types: recoveryTypes,
      primaryType: "Recovery",
      message,
    }),
    wallet.signAuthorization({ account: owner, contractAddress: delegate }),
  ])

  const [gas, fees, sponsorBalance] = await Promise.all([
    client.estimateContractGas({
      account: sponsor,
      address: owner.address,
      abi: vindicateDelegateAbi,
      functionName: "execute",
      args: [message, signature],
      authorizationList: [authorization],
    }),
    client.estimateFeesPerGas(),
    client.getBalance({ address: sponsor.address }),
  ])

  const bufferedGas = (gas * GAS_BUFFER) / 100n
  return {
    network,
    owner: owner.address,
    sponsor: sponsor.address,
    message,
    signature,
    authorization,
    gas: bufferedGas,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    maxCost: bufferedGas * fees.maxFeePerGas,
    sponsorBalance,
  }
}

/** Broadcasts a prepared recovery as one EIP-7702 transaction sent to the compromised wallet. */
export async function sendRecovery(prepared: PreparedRecovery, sponsorKey: Hex): Promise<Hash> {
  const { network } = prepared
  const client = publicClientFor(network)
  // Read both now rather than trusting the review: the gas wallet may have been topped up since,
  // and the deadline is in chain time, which this computer's clock does not have to match.
  const [balance, block] = await Promise.all([
    client.getBalance({ address: prepared.sponsor }),
    client.getBlock(),
  ])
  if (balance < prepared.maxCost) {
    throw new RecoveryPlanError(
      "The gas wallet does not have enough BNB for gas. Top it up and try again.",
    )
  }
  if (block.timestamp > prepared.message.deadline - DEADLINE_MARGIN_SECONDS) {
    throw new StaleRecoveryError(
      "The review is more than 10 minutes old. Review it again before sending.",
    )
  }
  await assertAuthorizationUsable(prepared)
  const wallet = createWalletClient({
    account: privateKeyToAccount(sponsorKey),
    chain: network.chain,
    transport: http(network.rpcUrl),
  })
  return wallet.writeContract({
    address: prepared.owner,
    abi: vindicateDelegateAbi,
    functionName: "execute",
    args: [prepared.message, prepared.signature],
    authorizationList: [prepared.authorization],
    gas: prepared.gas,
    maxFeePerGas: prepared.maxFeePerGas,
    maxPriorityFeePerGas: prepared.maxPriorityFeePerGas,
  })
}

/** Clears any EIP-7702 delegation on the compromised wallet, including a drainer's. */
export async function revokeDelegation(
  network: Network,
  ownerKey: Hex,
  sponsorKey: Hex,
): Promise<Hash> {
  const owner = privateKeyToAccount(ownerKey)
  const sponsor = privateKeyToAccount(sponsorKey)
  const wallet = createWalletClient({
    account: sponsor,
    chain: network.chain,
    transport: http(network.rpcUrl),
  })
  const authorization = await wallet.signAuthorization({
    account: owner,
    contractAddress: zeroAddress,
  })
  return wallet.sendTransaction({
    to: owner.address,
    value: 0n,
    authorizationList: [authorization],
  })
}

export async function waitForRecovery(network: Network, hash: Hash) {
  return publicClientFor(network).waitForTransactionReceipt({ hash, timeout: 120_000 })
}

/**
 * Waits for a broadcast rescue and reports what it swept. Once the transaction is out, a
 * timeout or an RPC error means "unknown", not "failed": the caller must not offer a resend.
 */
export async function settleRecovery(prepared: PreparedRecovery, hash: Hash) {
  let receipt: TransactionReceipt
  try {
    receipt = await waitForRecovery(prepared.network, hash)
  } catch {
    throw new UnconfirmedRecoveryError(hash)
  }
  return confirmRecovery(prepared, receipt)
}

/**
 * Decides whether a mined transaction really was the rescue, and reports what it swept.
 *
 * A "success" status is not enough. If the authorization was cancelled before the transaction
 * landed, the call reaches a wallet with no code (or with someone else's code) and succeeds while
 * doing nothing. Only the delegate's own `Recovered` event, emitted from the compromised wallet
 * with the nonce that was signed, proves the instruction ran.
 */
export function confirmRecovery(
  prepared: PreparedRecovery,
  receipt: TransactionReceipt,
): SweptAsset[] {
  if (receipt.status !== "success") {
    throw new RecoveryPlanError("The rescue transaction reverted. Nothing was moved.")
  }
  const events = parseEventLogs({ abi: vindicateDelegateAbi, logs: receipt.logs }).filter((log) =>
    isAddressEqual(log.address, prepared.owner),
  )
  const ran = events.some(
    (log) =>
      log.eventName === "Recovered" &&
      log.args.nonce === prepared.message.nonce &&
      isAddressEqual(log.args.recipient, prepared.message.recipient),
  )
  if (!ran) {
    throw new StaleRecoveryError(
      "The transaction was mined, but the rescue did not run. Another transaction from the compromised wallet cancelled the authorization first, so nothing was moved. Review the rescue and send it again.",
    )
  }
  // The contract reports what it sent. A token that taxes transfers delivers less, so for tokens
  // the amount shown is what the token's own Transfer events say reached the safe wallet.
  const recipient = prepared.message.recipient
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs })
  const arrived = (token: Address) => {
    let net = 0n
    let seen = false
    for (const t of transfers) {
      if (!isAddressEqual(t.address, token)) continue
      if (isAddressEqual(t.args.to, recipient)) {
        net += t.args.value
        seen = true
      }
      if (isAddressEqual(t.args.from, recipient)) net -= t.args.value
    }
    return seen && net >= 0n ? net : null
  }
  return events.flatMap((log) => {
    if (log.eventName !== "Swept") return []
    const token = isAddressEqual(log.args.token, zeroAddress) ? null : log.args.token
    return [
      {
        token,
        amount: token === null ? log.args.amount : (arrived(token) ?? log.args.amount),
        fee: log.args.fee,
      },
    ]
  })
}

/**
 * Whether the wallet runs no delegated code any more. A clearing transaction can be mined and
 * still do nothing (a transaction from the leaked key cancels its authorization), so the chain
 * is asked, a few times because a public RPC can answer from a block behind.
 */
export async function delegationCleared(network: Network, owner: Address, attempts = 5) {
  const client = publicClientFor(network)
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (parseDelegation(await client.getCode({ address: owner })) === null) return true
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  return false
}

/**
 * An EIP-7702 authorization is only valid for the wallet's current transaction count. Any
 * transaction from the leaked key after the review cancels it, and the rescue would then be mined
 * as a call that does nothing. A wallet already delegated to Vindicate does not need it.
 */
async function assertAuthorizationUsable(prepared: PreparedRecovery) {
  const client = publicClientFor(prepared.network)
  const [count, code] = await Promise.all([
    client.getTransactionCount({ address: prepared.owner, blockTag: "pending" }),
    client.getCode({ address: prepared.owner }),
  ])
  if (count === prepared.authorization.nonce) return
  const delegation = parseDelegation(code)
  const delegate = prepared.network.delegate
  if (delegation && delegate && isAddressEqual(delegation, delegate)) return
  throw new StaleRecoveryError(
    "The compromised wallet sent a transaction after this review, which cancels the signed authorization. Nothing was sent. Review the rescue again.",
  )
}

function requireDelegate(network: Network): Address {
  if (!network.delegate)
    throw new RecoveryPlanError(`Vindicate is not deployed on ${network.name} yet.`)
  return network.delegate
}
