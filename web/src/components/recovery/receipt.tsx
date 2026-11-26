"use client"

import { ArrowSquareOutIcon, CheckIcon, CircleNotchIcon } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useState } from "react"
import type { Hash } from "viem"

import { DecryptedText } from "@/components/effects/decrypted-text"
import { allowanceKey, useRecovery } from "@/components/recovery/recovery-provider"
import { TokenAvatar } from "@/components/recovery/token-avatar"
import { type AssetMove, findSwept, usePlanSummary } from "@/components/recovery/use-plan-summary"
import { Button } from "@/components/ui/button"
import { Notice } from "@/components/ui/notice"
import { explorerTxUrl } from "@/lib/chains"
import { formatAmount } from "@/lib/format"
import { explainError } from "@/lib/recovery/errors"
import {
  type SweptAsset,
  delegationCleared,
  revokeDelegation,
  waitForRecovery,
} from "@/lib/recovery/execute"
import { shortAddress } from "@/lib/utils"

const ease = [0.25, 1, 0.5, 1] as const

/** What the contract reported sweeping for a planned move, or undefined if it found nothing. */
function sweptFor(move: AssetMove, swept: readonly SweptAsset[]) {
  return move.token === undefined ? undefined : findSwept(move.token, swept)
}

/**
 * What the user keeps after a confirmed rescue: proof, what arrived, and one optional cleanup.
 * Amounts come from the transaction's own events, never from the plan, so an asset someone moved
 * out before the rescue landed is shown as missing instead of as rescued.
 */
export function Receipt({ hash, swept }: { hash: Hash; swept: readonly SweptAsset[] }) {
  const { state, dispatch, network, owner } = useRecovery()
  const { moves } = usePlanSummary()
  const missing = moves.filter((m) => m.fee !== null && !sweptFor(m, swept))
  // Held at review and gone by the time the rescue landed: someone moved it first.
  const gone = missing.filter((m) => !m.pending)
  // A token added because a call was expected to pay it, which the call did not. BNB is left
  // out: it is swept "in case a call returns some", and none returning is not a failure.
  const unpaid = missing.filter((m) => m.pending && m.token !== null)
  // Approvals the owner chose to keep. They are still open after this rescue.
  const kept = state.allowances.filter((a) => !state.revokes.includes(allowanceKey(a)))
  // Assets the wallet held that the owner chose not to move. They are still there too.
  const left = state.report
    ? [
        ...(state.report.nativeBalance > 0n && !state.sweepNative ? ["BNB"] : []),
        ...state.report.tokens
          .filter((t) => t.balance > 0n && !state.sweepTokens.includes(t.address.toLowerCase()))
          .map((t) => t.symbol),
      ]
    : []
  const complete =
    gone.length === 0 && unpaid.length === 0 && kept.length === 0 && left.length === 0
  const [clearing, setClearing] = useState<"idle" | "busy" | "done">("idle")
  const [error, setError] = useState<string | null>(null)
  const explorer = explorerTxUrl(network, hash)

  async function clear() {
    if (!state.ownerKey || !state.sponsorKey) return
    setClearing("busy")
    setError(null)
    try {
      await waitForRecovery(
        network,
        await revokeDelegation(network, state.ownerKey, state.sponsorKey),
      )
      // Mined is not the same as cleared: a transaction from the leaked key cancels the request.
      if (owner && !(await delegationCleared(network, owner))) {
        setError(
          "The wallet is still delegated. A transaction from the compromised key got in first and cancelled the request. Try again.",
        )
        setClearing("idle")
        return
      }
      setClearing("done")
    } catch (e) {
      setError(explainError(e))
      setClearing("idle")
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease }}
      className="grid gap-5 p-3"
    >
      <div className="grid justify-items-center gap-3 pt-6 text-center">
        <motion.span
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 360, damping: 20, delay: 0.1 }}
          className="grid size-16 place-items-center bg-success text-success-foreground chamfer"
        >
          <CheckIcon weight="bold" className="size-8" />
        </motion.span>
        <h2 className="font-display text-2xl">
          {complete ? "Rescue complete" : "Rescue confirmed, with gaps"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Confirmed on {network.name}.{" "}
          {complete ? "Everything in your plan is now in" : "What arrived is now in"}{" "}
          <span className="font-mono text-foreground">
            {state.recipient ? shortAddress(state.recipient) : "your safe wallet"}
          </span>
          .
        </p>
        <DecryptedText
          text={shortAddress(hash, 12)}
          animateOn="view"
          sequential
          speed={25}
          parentClassName="font-mono text-xs text-muted-foreground"
        />
      </div>

      <ul className="grid gap-1 bg-muted p-2">
        {moves.map((m) => {
          const arrived = sweptFor(m, swept)
          return (
            <li key={m.key} className="flex items-center gap-3 px-2 py-2">
              <TokenAvatar symbol={m.fee === null ? "NFT" : m.symbol} />
              <span className="flex-1 font-medium">{m.symbol}</span>
              {m.fee === null ? (
                <span className="font-mono text-sm text-success tabular-nums">Moved</span>
              ) : arrived ? (
                <span className="font-mono text-sm text-success tabular-nums">
                  +{formatAmount(arrived.amount, m.decimals ?? 18)}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">Nothing arrived</span>
              )}
            </li>
          )
        })}
      </ul>
      {gone.length > 0 ? (
        <Notice tone="warning" title="Some assets were already gone">
          {gone.map((m) => m.symbol).join(", ")} had left the compromised wallet before the rescue
          landed, so there was nothing to move. Check the wallet on the explorer to see where it
          went.
        </Notice>
      ) : null}

      {unpaid.length > 0 ? (
        <Notice tone="warning" title="An expected token did not arrive">
          {unpaid.map((m) => m.symbol).join(", ")} never reached the compromised wallet during the
          rescue, so there was nothing to move. If a call was meant to pay it, that call ran without
          failing but sent nothing.
        </Notice>
      ) : null}
      {left.length > 0 ? (
        <Notice tone="warning" title="Left in the compromised wallet">
          {left.join(", ")} {left.length === 1 ? "was" : "were"} not part of this rescue and{" "}
          {left.length === 1 ? "is" : "are"} still in the compromised wallet, where the attacker can
          reach {left.length === 1 ? "it" : "them"}.
        </Notice>
      ) : null}
      {kept.length > 0 ? (
        <Notice tone="warning" title="An approval is still open">
          You left {kept.length === 1 ? "an approval" : `${kept.length} approvals`} in place (
          {kept.map((a) => `${a.symbol} to ${shortAddress(a.spender)}`).join(", ")}). It can still
          pull that token out of the compromised wallet.
        </Notice>
      ) : null}
      {explorer ? null : (
        <Notice title="This was a practice rescue">
          It ran on the local chain on this computer, so it is not on BscScan and no real funds
          moved.
        </Notice>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {explorer ? (
          <Button asChild variant="outline">
            <a href={explorer} target="_blank" rel="noreferrer noopener">
              View on explorer
              <ArrowSquareOutIcon />
            </a>
          </Button>
        ) : null}
        <Button variant="outline" onClick={clear} disabled={clearing !== "idle"}>
          {clearing === "busy" ? <CircleNotchIcon className="animate-spin" /> : null}
          {clearing === "done" ? "Delegation cleared" : "Clear delegation"}
        </Button>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Notice tone="warning" title="Treat this wallet as burned">
        The attacker still holds the key. Don&apos;t send anything to it again. If more tokens or an
        airdrop land there later, run another rescue.
      </Notice>

      {/* Keeps the gas wallet: it may still hold BNB, and the next rescue needs one anyway. */}
      <Button size="lg" onClick={() => dispatch({ type: "again" })}>
        Start another rescue
      </Button>
    </motion.div>
  )
}
