"use client"

import { CircleNotchIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { isAddressEqual } from "viem"

import { useRecovery, useSameWallet } from "@/components/recovery/recovery-provider"
import { Button } from "@/components/ui/button"
import { Notice } from "@/components/ui/notice"
import { isPracticeChain } from "@/lib/chains"
import { demoFor } from "@/lib/demo"
import { explainError } from "@/lib/recovery/errors"
import { readAllowances, scanWallet } from "@/lib/recovery/scan"
import { shortAddress } from "@/lib/utils"

/**
 * Offers the practice assets configured for this network. One press fills in a rescue of every
 * kind, so a first-time user or a demo audience sees the whole flow without hunting for
 * contract addresses. It never fills in a key, the safe wallet or the gas wallet.
 */
export function DemoBanner() {
  const { state, dispatch, network, owner } = useRecovery()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const demo = demoFor(network.id)
  const sameWallet = useSameWallet()
  if (!demo || state.phase.name === "done") return null

  const isDemoWallet = owner !== null && isAddressEqual(owner, demo.wallet)
  const loaded = state.calls.some((c) => isAddressEqual(c.target, demo.claim.target))

  async function load() {
    if (!demo || !owner || !state.ownerKey) return
    const { ownerKey, networkId } = state
    setBusy(true)
    setError(null)
    try {
      const report = await scanWallet(network, owner, [
        ...state.extraTokens,
        demo.token,
        demo.claim.token,
      ])
      const allowances = await readAllowances(network, owner, report.tokens, [demo.drainer])
      if (!sameWallet(ownerKey, networkId)) return
      dispatch({ type: "addToken", token: demo.token })
      dispatch({ type: "addToken", token: demo.claim.token })
      dispatch({ type: "scanned", report, ownerKey, networkId })
      if (allowances.length > 0) dispatch({ type: "allowances", allowances })
      dispatch({
        type: "addOperator",
        item: { collection: demo.nft.collection, operator: demo.drainer },
      })
      dispatch({ type: "addCall", item: { ...demo.claim, value: 0n } })
      dispatch({ type: "addCall", item: { ...demo.unstake, value: 0n } })
      dispatch({
        type: "addNft",
        item: {
          standard: "erc721",
          collection: demo.nft.collection,
          tokenId: BigInt(demo.nft.tokenId),
          amount: 1n,
        },
      })
      dispatch({
        type: "addNft",
        item: {
          standard: "erc1155",
          collection: demo.items.collection,
          tokenId: BigInt(demo.items.tokenId),
          amount: BigInt(demo.items.amount),
        },
      })
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }

  if (loaded) {
    return (
      <Notice tone="success" title="Demo rescue loaded">
        A token with a drainer approval, an airdrop claim, an unstake and two NFTs are in the plan
        below. Add a safe wallet and a gas wallet, then review.
      </Notice>
    )
  }

  return (
    <Notice title="Practice assets are set up on this network">
      <div className="grid justify-items-start gap-3">
        {isDemoWallet ? (
          state.report ? (
            <p>
              This is the demo wallet. Load a rescue that uses every kind at once: tokens, a claim,
              an unstake, NFTs and revokes.
            </p>
          ) : (
            <p>This is the demo wallet. Scan it, then load the demo rescue.</p>
          )
        ) : (
          <p>
            To try a full rescue, paste the key of the demo wallet{" "}
            <span className="font-mono text-foreground">{shortAddress(demo.wallet)}</span>.{" "}
            {/* Where that key is depends on who set the practice assets up. */}
            {isPracticeChain(network) ? (
              <>
                It is printed by <span className="font-mono text-foreground">pnpm dev:chain</span>.
              </>
            ) : (
              <>
                It is in the file written by{" "}
                <span className="font-mono text-foreground">scripts/testnet-practice.mjs</span>.
              </>
            )}
          </p>
        )}
        {isDemoWallet && state.report ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
            {busy ? <CircleNotchIcon className="animate-spin" /> : null}
            Load the demo rescue
          </Button>
        ) : null}
        {error ? <p className="text-destructive">{error}</p> : null}
      </div>
    </Notice>
  )
}
