"use client"

import { ArrowDownIcon, CircleNotchIcon } from "@phosphor-icons/react"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { getAddress, isAddress, isAddressEqual, zeroAddress } from "viem"
import { generatePrivateKey } from "viem/accounts"

import { Tag } from "@/components/marketing/tag"
import { CopilotPanel } from "@/components/recovery/copilot-panel"
import { CopyButton } from "@/components/recovery/copy-button"
import { DemoBanner } from "@/components/recovery/demo-banner"
import { KeyField } from "@/components/recovery/key-field"
import { Receipt } from "@/components/recovery/receipt"
import { useRecovery } from "@/components/recovery/recovery-provider"
import { RescuePlan } from "@/components/recovery/rescue-plan"
import { usePlanSummary } from "@/components/recovery/use-plan-summary"
import { useRecoveryFlow } from "@/components/recovery/use-recovery-flow"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Chip } from "@/components/ui/chip"
import { Input } from "@/components/ui/input"
import { Notice } from "@/components/ui/notice"
import { Skeleton } from "@/components/ui/skeleton"
import { publicClientFor } from "@/lib/chains"
import { formatAmount } from "@/lib/format"
import { shortAddress } from "@/lib/utils"

/**
 * The whole recovery in one card, read top to bottom: the wallet it leaves, the wallet it lands
 * in, what moves, who pays gas, what it costs, and one button for the next step.
 */
export function RecoveryCard() {
  const { state } = useRecovery()
  const sending = state.phase.name === "sending"
  return (
    <Card
      status={state.phase.name === "done" ? "success" : "default"}
      beam={sending}
      aria-label="Rescue"
    >
      <div className="grid grid-cols-1 gap-2 p-2">
        {state.phase.name === "done" ? (
          <Receipt hash={state.phase.hash} swept={state.phase.swept} />
        ) : (
          <Form />
        )}
      </div>
    </Card>
  )
}

function Form() {
  const { state, owner } = useRecovery()
  const { primary, run } = useRecoveryFlow()
  return (
    <>
      <DemoBanner />
      <Kicker>Wallets</Kicker>
      <SourceWell />
      <div className="relative z-10 -my-4 grid place-items-center" aria-hidden="true">
        <span className="grid size-9 place-items-center border-4 border-card bg-primary text-primary-foreground chamfer-sm">
          <ArrowDownIcon weight="bold" className="size-4" />
        </span>
      </div>
      <DestinationWell />
      <Kicker>Plan</Kicker>
      {/* Keyed so a proposal made for one wallet or network can never be applied to another. */}
      <CopilotPanel key={`${owner}-${state.networkId}`} />
      <RescuePlan />
      <Kicker>Pay and send</Kicker>
      <GasWallet />
      <Summary />
      {state.error ? (
        <Notice tone="danger" title="That did not go through">
          {state.error}
        </Notice>
      ) : null}
      <Button
        size="lg"
        className="mt-1"
        variant={primary.kind === "blocked" ? "outline" : "primary"}
        disabled={
          primary.kind === "blocked" ||
          primary.kind === "busy" ||
          (primary.kind === "send" && primary.disabled)
        }
        onClick={() => void run()}
      >
        {primary.kind === "busy" ? <CircleNotchIcon className="animate-spin" /> : null}
        {primary.label}
      </Button>
    </>
  )
}

/** Names a stretch of the card, in the same boxed label the step rail and landing page use. */
function Kicker({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-2 pt-3">
      <Tag>{children}</Tag>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  )
}

function Well({
  label,
  status,
  children,
}: {
  label: string
  status?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="grid min-w-0 grid-cols-1 gap-3 bg-muted p-4">
      <div className="flex min-h-6 items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{label}</span>
        {status}
      </div>
      {children}
    </section>
  )
}

function SourceWell() {
  const { state, dispatch, owner } = useRecovery()
  const { scan, busy } = useRecoveryFlow()
  const locked = state.phase.name === "sending"
  const held = state.report
    ? state.report.tokens.filter((t) => t.balance > 0n).length +
      (state.report.nativeBalance > 0n ? 1 : 0)
    : null

  return (
    <Well
      label="From"
      status={
        state.report ? (
          <span className="inline-flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void scan()}>
              Rescan
            </Button>
            <Chip tone="success" dot>
              Scanned
            </Chip>
          </span>
        ) : owner ? (
          <Chip>Not scanned</Chip>
        ) : null
      }
    >
      <KeyField
        subject="compromised wallet"
        value={state.ownerKey}
        disabled={locked}
        note="Only a key that has already leaked. Never the key of your safe wallet."
        onSubmit={(key) => dispatch({ type: "ownerKey", key })}
        onClear={() => dispatch({ type: "ownerKey", key: null })}
      />
      {owner ? (
        <div className="flex items-center justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <span className="truncate font-mono text-lg">{shortAddress(owner, 6)}</span>
            <span className="text-sm text-muted-foreground">
              {held === null
                ? "Not scanned yet"
                : `${held} known ${held === 1 ? "asset" : "assets"} with a balance`}
            </span>
          </div>
          <CopyButton value={owner} label="Copy address" />
        </div>
      ) : null}
    </Well>
  )
}

function DestinationWell() {
  const { state, dispatch, owner } = useRecovery()
  const [input, setInput] = useState(state.recipient ?? "")
  const locked = state.phase.name === "sending"
  const error = (() => {
    if (!input) return null
    if (!isAddress(input, { strict: false })) return "Enter a 0x address."
    // Mixed-case addresses carry a checksum. A mismatch means a character is wrong, and funds
    // sent to a mistyped address cannot be recovered.
    if (!isAddress(input)) return "That address fails its checksum. Check every character."
    const address = getAddress(input)
    if (isAddressEqual(address, zeroAddress)) return "That is the zero address."
    if (owner && isAddressEqual(address, owner)) return "That is the compromised wallet."
    if (state.allowances.some((a) => isAddressEqual(a.spender, address)))
      return "That is an address you are revoking."
    return null
  })()

  return (
    <Well
      label="To"
      status={
        state.recipient ? (
          <Chip tone="live" dot>
            Safe wallet
          </Chip>
        ) : null
      }
    >
      <Input
        id="recipient"
        font="mono"
        value={input}
        disabled={locked}
        placeholder="0x… a wallet the attacker has never touched"
        autoComplete="off"
        spellCheck={false}
        aria-label="Safe wallet address"
        aria-invalid={Boolean(error) || undefined}
        aria-describedby="recipient-message"
        onChange={(e) => {
          const v = e.target.value.trim()
          setInput(v)
          const ok =
            isAddress(v) &&
            !isAddressEqual(v, zeroAddress) &&
            !(owner && isAddressEqual(getAddress(v), owner))
          dispatch({ type: "recipient", address: ok ? getAddress(v) : null })
        }}
      />
      {error ? (
        <p id="recipient-message" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </Well>
  )
}

function GasWallet() {
  const { state, dispatch, network, sponsor } = useRecovery()
  const [revealed, setRevealed] = useState(false)
  const locked = state.phase.name === "sending"
  const balance = useQuery({
    queryKey: ["balance", network.id, sponsor],
    queryFn: () => publicClientFor(network).getBalance({ address: sponsor as `0x${string}` }),
    enabled: Boolean(sponsor),
    refetchInterval: 4_000,
  })

  return (
    <section className="grid gap-3 px-2 pt-1">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Gas wallet</h2>
        <div className="flex border border-input" role="group" aria-label="Gas wallet source">
          {(["generated", "imported"] as const).map((source) => (
            <button
              key={source}
              type="button"
              disabled={locked}
              aria-pressed={state.sponsorSource === source}
              onClick={() => {
                // Pressing the selected option again must not throw a funded wallet away.
                if (state.sponsorSource === source) return
                setRevealed(false)
                dispatch({ type: "sponsor", key: null, source })
              }}
              className="cursor-pointer px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-quick disabled:cursor-not-allowed aria-pressed:bg-accent aria-pressed:text-foreground"
            >
              {source === "generated" ? "New" : "My own"}
            </button>
          ))}
        </div>
      </div>

      {!sponsor && state.sponsorSource === "generated" ? (
        <Button
          variant="outline"
          disabled={locked}
          onClick={() =>
            dispatch({ type: "sponsor", key: generatePrivateKey(), source: "generated" })
          }
        >
          Create a gas wallet for this rescue
        </Button>
      ) : null}

      {state.sponsorSource === "imported" && !state.sponsorKey ? (
        <KeyField
          subject="gas wallet"
          value={null}
          disabled={locked}
          note="A clean wallet that holds a little BNB. It pays the network fee and nothing else."
          onSubmit={(key) => dispatch({ type: "sponsor", key, source: "imported" })}
          onClear={() => dispatch({ type: "sponsor", key: null, source: "imported" })}
        />
      ) : null}

      {sponsor ? (
        <div className="grid gap-2 bg-muted p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono">{shortAddress(sponsor, 6)}</span>
            <span className="inline-flex shrink-0 items-center gap-1">
              <span className="font-mono tabular-nums" aria-live="polite">
                {balance.isPending ? (
                  <Skeleton className="h-4 w-16" />
                ) : (
                  `${formatAmount(balance.data ?? 0n, 18)} BNB`
                )}
              </span>
              <CopyButton value={sponsor} label="Copy gas wallet address" />
            </span>
          </div>
          {balance.data === 0n ? (
            <p className="text-xs text-muted-foreground">
              Send about 0.001 BNB on {network.name} to this address. The balance refreshes by
              itself.
            </p>
          ) : null}
          {state.sponsorSource === "generated" && state.sponsorKey ? (
            revealed ? (
              <div className="flex items-center gap-2 border-t border-border pt-2">
                <code className="min-w-0 flex-1 font-mono text-xs break-all">
                  {state.sponsorKey}
                </code>
                <CopyButton value={state.sponsorKey} label="Copy gas wallet key" />
              </div>
            ) : (
              <button
                type="button"
                className="cursor-pointer justify-self-start text-xs text-muted-foreground underline decoration-input underline-offset-4 hover:text-foreground"
                onClick={() => setRevealed(true)}
              >
                Show key to recover leftover gas later
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function Summary() {
  const { state } = useRecovery()
  const { moves, operations, feeBps } = usePlanSummary()
  const phase = state.phase
  const prepared = phase.name === "checked" || phase.name === "sending" ? phase.prepared : null
  const revokes = operations.filter((o) => o.kind === "revoke").length
  if (!state.report) return null

  return (
    <dl className="grid gap-2 border-t border-border px-2 pt-4 text-sm">
      <SummaryRow
        label="Moves"
        value={`${moves.length} ${moves.length === 1 ? "asset" : "assets"}${revokes ? `, ${revokes} revoke${revokes === 1 ? "" : "s"}` : ""}`}
      />
      <SummaryRow
        label="Vindicate fee"
        value={feeBps === undefined ? "…" : `${feeBps / 100}% of swept tokens and BNB`}
      />
      <SummaryRow
        label="Network fee"
        value={prepared ? `≤ ${formatAmount(prepared.maxCost, 18)} BNB` : "Shown after review"}
      />
      {prepared ? <SummaryRow label="Signature valid for" value="10 minutes" /> : null}
    </dl>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  )
}
