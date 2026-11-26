"use client"

import {
  CoinsIcon,
  DownloadSimpleIcon,
  ImageSquareIcon,
  ProhibitIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { type KeyboardEvent, type ReactNode, useState } from "react"

import {
  ApprovalForm,
  CallForm,
  NftForm,
  OperatorForm,
  TokenForm,
} from "@/components/recovery/add-item-dialogs"
import {
  allowanceKey,
  listedTokens,
  sweepableNative,
  sweepsNative,
  useRecovery,
} from "@/components/recovery/recovery-provider"
import { TokenAvatar } from "@/components/recovery/token-avatar"
import { usePlanSummary } from "@/components/recovery/use-plan-summary"
import { Amount } from "@/components/ui/amount"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Chip } from "@/components/ui/chip"
import { formatAmount } from "@/lib/format"
import { feeOf } from "@/lib/recovery/plan"
import { shortAddress } from "@/lib/utils"

type RescueKind = "tokens" | "claim" | "nfts" | "approvals"

const kinds: { kind: RescueKind; label: string; description: string; icon: ReactNode }[] = [
  {
    kind: "tokens",
    label: "Tokens",
    description: "Tokens and BNB the wallet holds right now.",
    icon: <CoinsIcon />,
  },
  {
    kind: "claim",
    label: "Claim",
    description: "An airdrop claim, unstake or withdrawal that must run before the sweep.",
    icon: <DownloadSimpleIcon />,
  },
  {
    kind: "nfts",
    label: "NFTs",
    description: "ERC-721 and ERC-1155 items, moved with no fee.",
    icon: <ImageSquareIcon />,
  },
  {
    kind: "approvals",
    label: "Revoke",
    description: "Approvals a drainer can still use to pull tokens or NFTs.",
    icon: <ProhibitIcon />,
  },
]

/**
 * The plan, built by answering one question: what needs rescuing? One tab per kind, one panel on
 * screen at a time, so the card stays short. A count on each tab shows what it already holds,
 * and every tab's items go out in the same transaction.
 */
export function RescuePlan() {
  const { state, dispatch } = useRecovery()
  const { feeBps } = usePlanSummary()
  const [active, setActive] = useState<RescueKind>("tokens")
  // Bumped per form after a successful add, so only that form remounts empty.
  const [added, setAdded] = useState<Record<string, number>>({})
  // Before the scan there is nothing to fill in yet, but the plan is still shown, with its
  // fields switched off: the owner sees from the first screen what a rescue can cover and what
  // they will be asked for.
  const report = state.report

  const locked = state.phase.name === "sending"
  const bps = feeBps ?? 0
  const tokens = listedTokens(state)
  const bnbLeft = sweepableNative(state)
  const done = (form: string) => () => setAdded((n) => ({ ...n, [form]: (n[form] ?? 0) + 1 }))
  const formKey = (form: string) => `${form}-${added[form] ?? 0}`
  const counts: Record<RescueKind, number> = {
    tokens:
      (sweepsNative(state) ? 1 : 0) +
      tokens.filter((t) => state.sweepTokens.includes(t.address.toLowerCase())).length,
    claim: state.calls.length,
    nfts: state.nfts.length,
    approvals:
      state.allowances.filter((a) => state.revokes.includes(allowanceKey(a))).length +
      state.operators.length,
  }

  // Arrow keys move between tabs, as the tab pattern expects.
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const at = kinds.findIndex((k) => k.kind === active)
    const next = kinds[(at + step + kinds.length) % kinds.length]
    if (!next) return
    setActive(next.kind)
    document.getElementById(`tab-${next.kind}`)?.focus()
  }

  return (
    // A fieldset, so every field and button in the plan is disabled while a rescue is in flight.
    <fieldset disabled={locked} className="grid min-w-0 grid-cols-1 gap-3 px-2 pt-3">
      <h2 className="text-sm font-semibold">What do you need to rescue?</h2>

      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        role="tablist"
        aria-label="Rescue types"
      >
        {kinds.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="tab"
            id={`tab-${k.kind}`}
            aria-selected={active === k.kind}
            aria-controls={`rescue-${k.kind}`}
            tabIndex={active === k.kind ? 0 : -1}
            onKeyDown={onTabKey}
            onClick={() => setActive(k.kind)}
            className="flex cursor-pointer items-center gap-2 border border-border bg-muted px-3 py-2 text-left text-sm font-medium transition duration-quick ease-out-quart hover:border-input aria-selected:border-primary/60 aria-selected:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
          >
            {k.icon}
            <span className="min-w-0 flex-1 truncate">{k.label}</span>
            {counts[k.kind] > 0 ? <Chip>{counts[k.kind]}</Chip> : null}
          </button>
        ))}
      </div>
      <p className="text-sm text-pretty text-muted-foreground">
        {kinds.find((k) => k.kind === active)?.description}{" "}
        {report ? "Everything on every tab goes out in one transaction." : null}
      </p>

      {report ? null : (
        <p className="border border-dashed border-border p-3 text-sm text-pretty text-muted-foreground">
          Paste the compromised key and scan the wallet to unlock these fields. Pick a tab to see
          what you will be asked for.
        </p>
      )}

      <fieldset disabled={!report} className="grid min-w-0 grid-cols-1 gap-3">
        <Panel kind="tokens" hidden={active !== "tokens"}>
          {report ? (
            <ul className="grid grid-cols-1">
              <AnimatePresence initial={false}>
                <AssetRow
                  key="native"
                  id="asset-native"
                  symbol="BNB"
                  balance={formatAmount(report.nativeBalance, 18)}
                  receive={bnbLeft === 0n ? null : formatAmount(bnbLeft - feeOf(bnbLeft, bps), 18)}
                  checked={sweepsNative(state)}
                  // With no BNB and no call that could bring some in, there is nothing to sweep.
                  disabled={locked || (report.nativeBalance === 0n && state.calls.length === 0)}
                  onChange={(on) => dispatch({ type: "toggleNative", on })}
                />
                {tokens.map((t) => (
                  <AssetRow
                    key={t.address}
                    id={`asset-${t.address}`}
                    symbol={t.symbol}
                    balance={formatAmount(t.balance, t.decimals)}
                    receive={
                      t.balance === 0n
                        ? null
                        : formatAmount(t.balance - feeOf(t.balance, bps), t.decimals)
                    }
                    checked={state.sweepTokens.includes(t.address.toLowerCase())}
                    disabled={locked}
                    onChange={(on) => dispatch({ type: "toggleToken", token: t.address, on })}
                  />
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <p className="px-2 py-2.5 text-sm text-muted-foreground">
              BNB and every token found by the scan are listed here, already ticked.
            </p>
          )}
          <Subsection
            title="Add a token that is not listed"
            hint="Paste its contract address (CA) from BscScan or your wallet. The balance is read from the chain."
          >
            <TokenForm key={formKey("token")} inline onDone={done("token")} />
          </Subsection>
        </Panel>

        <Panel kind="claim" hidden={active !== "claim"}>
          <details className="border border-border bg-muted text-sm">
            <summary className="cursor-pointer px-3 py-2 font-medium">
              Where do I find the contract and the calldata?
            </summary>
            <ol className="grid list-decimal gap-1 px-3 pb-3 pl-8 text-pretty text-muted-foreground">
              <li>Open the project&apos;s claim page and connect the compromised wallet.</li>
              <li>
                Click Claim, Unstake or Withdraw. When the wallet asks you to confirm, do not
                confirm.
              </li>
              <li>
                The popup shows the contract as &ldquo;Interacting with&rdquo; or &ldquo;To&rdquo;,
                and the calldata under &ldquo;Hex data&rdquo;. Copy both, then reject the popup.
              </li>
            </ol>
          </details>
          {state.calls.length > 0 ? (
            <ul className="grid grid-cols-1">
              <AnimatePresence initial={false}>
                {state.calls.map((c, i) => (
                  <ExtraRow
                    key={`call-${c.target}-${c.data}`}
                    disabled={locked}
                    onRemove={() => dispatch({ type: "removeAt", list: "calls", index: i })}
                  >
                    Run {c.data.slice(0, 10)} on {shortAddress(c.target)} first
                  </ExtraRow>
                ))}
              </AnimatePresence>
            </ul>
          ) : null}
          <Subsection title={state.calls.length > 0 ? "Add another call" : "Add the call"}>
            <CallForm key={formKey("call")} inline onDone={done("call")} />
          </Subsection>
        </Panel>

        <Panel kind="nfts" hidden={active !== "nfts"}>
          {state.nfts.length > 0 ? (
            <ul className="grid grid-cols-1">
              <AnimatePresence initial={false}>
                {state.nfts.map((n, i) => (
                  <ExtraRow
                    key={`nft-${n.collection}-${n.tokenId}`}
                    disabled={locked}
                    onRemove={() => dispatch({ type: "removeAt", list: "nfts", index: i })}
                  >
                    {n.standard === "erc1155" ? `${n.amount}× ` : ""}NFT #{String(n.tokenId)} ·{" "}
                    {shortAddress(n.collection)}
                  </ExtraRow>
                ))}
              </AnimatePresence>
            </ul>
          ) : null}
          <Subsection title={state.nfts.length > 0 ? "Add another NFT" : "Add an NFT"}>
            <NftForm key={formKey("nft")} inline onDone={done("nft")} />
          </Subsection>
        </Panel>

        <Panel kind="approvals" hidden={active !== "approvals"}>
          {state.allowances.length > 0 ? (
            <ul className="grid grid-cols-1">
              {state.allowances.map((a) => {
                const key = allowanceKey(a)
                return (
                  <li key={key}>
                    <label className="flex cursor-pointer items-center gap-3 px-2 py-2.5 text-sm transition-colors duration-quick hover:bg-muted has-disabled:cursor-default has-disabled:opacity-50">
                      <Checkbox
                        checked={state.revokes.includes(key)}
                        disabled={locked}
                        onCheckedChange={(v) =>
                          dispatch({ type: "toggleRevoke", key, on: v === true })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        {a.amount >= 2n ** 255n ? "Unlimited" : formatAmount(a.amount, a.decimals)}{" "}
                        {a.symbol} to <span className="font-mono">{shortAddress(a.spender)}</span>
                      </span>
                      <span className="text-muted-foreground">
                        {state.revokes.includes(key) ? "Revoke" : "Stays"}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          ) : null}
          <Subsection
            title="Token approvals"
            hint="The address the wallet approved, from the Token Approvals page on BscScan. Every token on the Tokens tab is checked for an allowance to it."
          >
            <ApprovalForm key={formKey("approval")} inline onDone={done("approval")} />
          </Subsection>
          {state.operators.length > 0 ? (
            <ul className="grid grid-cols-1">
              <AnimatePresence initial={false}>
                {state.operators.map((o, i) => (
                  <ExtraRow
                    key={`op-${o.collection}-${o.operator}`}
                    disabled={locked}
                    onRemove={() => dispatch({ type: "removeAt", list: "operators", index: i })}
                  >
                    Revoke operator {shortAddress(o.operator)} on {shortAddress(o.collection)}
                  </ExtraRow>
                ))}
              </AnimatePresence>
            </ul>
          ) : null}
          <Subsection
            title="NFT operators"
            hint="An operator is approved for every NFT in one collection."
          >
            <OperatorForm key={formKey("operator")} inline onDone={done("operator")} />
          </Subsection>
        </Panel>
      </fieldset>
    </fieldset>
  )
}

/**
 * Every panel stays mounted and the inactive ones are only hidden, so a half-filled form is still
 * there when the owner comes back to its tab.
 */
function Panel({
  kind,
  hidden,
  children,
}: {
  kind: RescueKind
  hidden: boolean
  children: ReactNode
}) {
  return (
    <div
      id={`rescue-${kind}`}
      role="tabpanel"
      aria-labelledby={`tab-${kind}`}
      hidden={hidden}
      className="grid grid-cols-1 gap-3 border border-border p-3"
    >
      {children}
    </div>
  )
}

function Subsection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <h4 className="text-sm font-medium">{title}</h4>
      {children}
      {hint ? <p className="text-xs text-pretty text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

interface AssetRowProps {
  id: string
  symbol: string
  balance: string
  /** Null when the balance is still empty and only a call in this rescue will fill it. */
  receive: string | null
  checked: boolean
  disabled: boolean
  onChange: (on: boolean) => void
}

function AssetRow({ id, symbol, balance, receive, checked, disabled, onChange }: AssetRowProps) {
  return (
    <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center gap-3 px-2 py-2.5 transition-colors duration-quick hover:bg-muted has-disabled:cursor-default has-disabled:opacity-50 has-disabled:hover:bg-transparent"
      >
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(v) => onChange(v === true)}
        />
        <TokenAvatar symbol={symbol} />
        <span className="grid min-w-0 flex-1">
          <span className="font-medium">{symbol}</span>
          <Amount value={balance} size="xs" tone="muted" />
        </span>
        {checked && receive === null ? (
          <span className="text-sm text-muted-foreground">Whatever arrives</span>
        ) : checked ? (
          <Amount value={receive ?? "0"} sign="+" tone="success" />
        ) : (
          <span className="text-sm text-muted-foreground">Stays</span>
        )}
      </label>
    </motion.li>
  )
}

function ExtraRow({
  children,
  onRemove,
  disabled,
}: {
  children: ReactNode
  onRemove: () => void
  disabled: boolean
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-center justify-between gap-3 py-1 pr-1 pl-2 text-sm"
    >
      <span className="min-w-0 truncate">{children}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Remove"
        onClick={onRemove}
        disabled={disabled}
      >
        <TrashIcon />
      </Button>
    </motion.li>
  )
}
