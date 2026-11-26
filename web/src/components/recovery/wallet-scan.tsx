"use client"

import {
  CheckIcon,
  CoinsIcon,
  GasPumpIcon,
  HandGrabbingIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  ShieldCheckIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type ReactNode, useState } from "react"

import { type AddItemKind, AddItemDialog } from "@/components/recovery/add-item-dialogs"
import { allowanceKey, useRecovery } from "@/components/recovery/recovery-provider"
import { findSwept, usePlanSummary } from "@/components/recovery/use-plan-summary"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { formatAmount } from "@/lib/format"
import { watchedTokens } from "@/lib/tokens"
import { cn, shortAddress } from "@/lib/utils"

type Severity = "high" | "medium" | "info"

interface Exposure {
  key: string
  severity: Severity
  icon: ReactNode
  title: string
  detail: string
  control?: ReactNode
  /** Whether the plan deals with it. Left false, it is still exposed after the rescue. */
  handled: boolean
}

const ease = [0.25, 1, 0.5, 1] as const
const TICKS = 28

/** What the attacker can still reach in this wallet, and what the rescue does about each part. */
export function WalletScan() {
  const { state, dispatch, network } = useRecovery()
  const [dialog, setDialog] = useState<AddItemKind | null>(null)
  const report = state.report
  const done = state.phase.name === "done"
  const scanning = state.phase.name === "checking" && !report
  const { moves } = usePlanSummary()
  const swept = state.phase.name === "done" ? state.phase.swept : []
  const watched = watchedTokens[network.id].length

  const exposures: Exposure[] = []
  if (report) {
    if (report.delegation && !report.delegatedToVindicate) {
      exposures.push({
        key: "delegation",
        severity: "high",
        icon: <TreeStructureIcon />,
        title: "Delegated to code Vindicate does not recognise",
        detail: `Every call to this wallet runs ${shortAddress(report.delegation)}. On a drained wallet that is usually a sweeper. The rescue replaces it.`,
        handled: true,
      })
    }
    for (const a of state.allowances) {
      const key = allowanceKey(a)
      exposures.push({
        key,
        severity: "high",
        icon: <HandGrabbingIcon />,
        title: `${a.amount >= 2n ** 255n ? "Unlimited" : formatAmount(a.amount, a.decimals)} ${a.symbol} approval`,
        detail: `${shortAddress(a.spender)} can pull ${a.symbol} the moment it arrives.`,
        handled: state.revokes.includes(key),
        control: (
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={state.revokes.includes(key)}
              disabled={state.phase.name === "sending" || done}
              onCheckedChange={(v) => dispatch({ type: "toggleRevoke", key, on: v === true })}
            />
            Revoke
          </label>
        ),
      })
    }
    for (const o of state.operators) {
      exposures.push({
        key: `operator-${o.collection}-${o.operator}`.toLowerCase(),
        severity: "high",
        icon: <HandGrabbingIcon />,
        title: "NFT operator approval",
        detail: `${shortAddress(o.operator)} can move every NFT in ${shortAddress(o.collection)}. The rescue revokes it.`,
        handled: true,
      })
    }
    if (report.nativeBalance > 0n) {
      exposures.push({
        key: "native",
        severity: "medium",
        icon: <GasPumpIcon />,
        title: `${formatAmount(report.nativeBalance, 18)} BNB in reach of sweepers`,
        detail: state.sweepNative
          ? "Included. It leaves with everything else."
          : "Not included. A bot will take it.",
        handled: state.sweepNative,
      })
    }
    const tokens = report.tokens.filter((t) => t.balance > 0n)
    if (tokens.length > 0) {
      const picked = tokens.filter((t) =>
        state.sweepTokens.includes(t.address.toLowerCase()),
      ).length
      exposures.push({
        key: "tokens",
        severity: "medium",
        icon: <CoinsIcon />,
        title: `${tokens.length} ${tokens.length === 1 ? "token" : "tokens"} still in the wallet`,
        detail: `${picked} of ${tokens.length} selected to move.`,
        handled: picked === tokens.length,
      })
    }
  }

  // After a rescue, a planned sweep with no matching event means the asset was already gone.
  // The same goes for anything the plan left out: it is still there for the attacker.
  const partial =
    state.phase.name === "done" &&
    (exposures.some((e) => !e.handled) ||
      // BNB swept "in case a call returns some" is not a gap when none came back.
      moves.some(
        (m) =>
          m.token !== undefined && !(m.pending && m.token === null) && !findSwept(m.token, swept),
      ))

  const high = exposures.filter((e) => e.severity === "high").length
  const medium = exposures.filter((e) => e.severity === "medium").length

  return (
    <Card aria-labelledby="scan-title">
      <div className="grid gap-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <h2 id="scan-title" className="font-semibold">
              Wallet scan
            </h2>
            <p className="text-sm text-muted-foreground">What the attacker can still reach</p>
          </div>
          {report ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog("approval")}
              disabled={state.phase.name === "sending" || done}
            >
              <MagnifyingGlassIcon />
              Check a drainer
            </Button>
          ) : null}
        </div>

        <Gauge
          high={high}
          medium={medium}
          scanned={Boolean(report)}
          scanning={scanning}
          secured={done}
          partial={partial}
        />

        {scanning ? (
          <div className="grid gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-8" />
                <div className="grid flex-1 gap-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {report ? (
          <ul className="grid gap-px bg-border">
            <AnimatePresence initial={false}>
              {exposures.map((e) => (
                <motion.li
                  key={e.key}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease }}
                  className="flex items-start gap-3 bg-card py-3"
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center border [&_svg]:size-4",
                      done && e.handled
                        ? "border-success/40 text-success"
                        : e.severity === "high"
                          ? "border-destructive/40 text-destructive"
                          : "border-warning/40 text-warning",
                    )}
                  >
                    {done && e.handled ? <CheckIcon weight="bold" /> : e.icon}
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-sm font-medium">{e.title}</span>
                    <span className="text-xs text-pretty text-muted-foreground">{e.detail}</span>
                  </span>
                  {e.control && !done ? <span className="shrink-0 pt-1">{e.control}</span> : null}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : !scanning ? (
          <p className="text-sm text-muted-foreground">
            Paste the compromised key and scan. The scan reads the BNB balance,{" "}
            {watched === 0 ? "any token you add" : `${watched} well-known tokens`} and whether the
            wallet runs someone else&apos;s code. Other tokens, NFTs and approvals are found by the
            copilot or added by hand.
          </p>
        ) : null}

        {report && !done ? (
          <p className="text-xs text-pretty text-muted-foreground">
            This list is what the scan and your own additions found, not everything the wallet may
            hold. Tokens outside the{" "}
            {watched === 0 ? "ones you added" : `${watched} well-known ones`}, NFTs and approvals
            only appear once the copilot finds them or you add them.
          </p>
        ) : null}

        <Timeline />
      </div>
      <AddItemDialog kind={dialog} onClose={() => setDialog(null)} />
    </Card>
  )
}

/** Segmented arc: lit segments grow with what is exposed, and turn green once secured. */
function Gauge({
  high,
  medium,
  scanned,
  scanning,
  secured,
  partial,
}: {
  high: number
  medium: number
  scanned: boolean
  scanning: boolean
  secured: boolean
  /** The rescue ran, but some planned assets had already left the wallet. */
  partial: boolean
}) {
  const reduceMotion = useReducedMotion()
  const level = secured ? TICKS : Math.min(TICKS, high * 9 + medium * 4)
  const tone = secured
    ? "text-success"
    : high > 0
      ? "text-destructive"
      : medium > 0
        ? "text-warning"
        : "text-muted-foreground"
  const total = high + medium
  const ticks = Array.from({ length: TICKS }, (_, i) => {
    const angle = Math.PI + (i / (TICKS - 1)) * Math.PI
    const [cx, cy, r1, r2] = [120, 120, 92, 108]
    // Rounded so server and client render identical attributes.
    const at = (v: number) => Math.round(v * 100) / 100
    return {
      x1: at(cx + r1 * Math.cos(angle)),
      y1: at(cy + r1 * Math.sin(angle)),
      x2: at(cx + r2 * Math.cos(angle)),
      y2: at(cy + r2 * Math.sin(angle)),
    }
  })

  return (
    <figure
      className="relative grid justify-items-center"
      aria-label={
        secured ? (partial ? "Partly completed" : "Plan completed") : `${total} known exposures`
      }
    >
      <svg viewBox="0 0 240 132" className="w-full max-w-xs" aria-hidden="true">
        {ticks.map((t, i) => (
          <motion.line
            key={`${t.x1}-${t.y1}`}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            strokeWidth="5"
            strokeLinecap="square"
            className={cn(
              "stroke-current transition-colors duration-base",
              i < level && scanned ? tone : "text-accent",
            )}
            animate={scanning && !reduceMotion ? { opacity: [0.3, 1, 0.3] } : { opacity: 1 }}
            transition={
              scanning
                ? { duration: 1.2, repeat: Number.POSITIVE_INFINITY, delay: i * 0.03 }
                : { duration: 0.2, delay: reduceMotion ? 0 : i * 0.015 }
            }
          />
        ))}
      </svg>
      <figcaption className="absolute bottom-0 grid justify-items-center gap-0.5 text-center">
        {secured ? (
          <ShieldCheckIcon weight="fill" className="size-8 text-success" />
        ) : (
          <span
            className={cn(
              "font-display text-4xl tabular-nums",
              scanned ? tone : "text-muted-foreground",
            )}
          >
            {scanned ? total : "–"}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {secured
            ? partial
              ? "Partly completed"
              : "Plan completed"
            : scanning
              ? "Scanning"
              : scanned
                ? total === 1
                  ? "known exposure"
                  : "known exposures"
                : "Not scanned"}
        </span>
      </figcaption>
    </figure>
  )
}

/** The exact order the contract runs things. Lights up while the transaction is in flight. */
function Timeline() {
  const { state } = useRecovery()
  const { operations, hasWork } = usePlanSummary()
  const reduceMotion = useReducedMotion()
  const sending = state.phase.name === "sending"
  const done = state.phase.name === "done"
  const swept = state.phase.name === "done" ? state.phase.swept : []
  // A sweep with no matching event found nothing to move: show it as skipped, not as done.
  const skipped = (op: (typeof operations)[number]) =>
    done && op.kind === "sweep" && !findSwept(op.token ?? null, swept)
  if (!hasWork && !done) return null

  return (
    <div className="grid gap-3 border-t border-border pt-5">
      <h3 className="text-sm font-semibold">In one transaction</h3>
      <ol className="grid">
        <AnimatePresence initial={false}>
          {operations.map((op, i) => (
            <motion.li
              key={op.key}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease }}
              className="group relative flex gap-3 pb-3 last:pb-0"
            >
              <span
                aria-hidden="true"
                className="absolute top-6 bottom-0 left-2.75 w-px bg-border group-last:hidden"
              />
              <motion.span
                animate={sending && !reduceMotion ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }}
                transition={
                  sending
                    ? { duration: 1, repeat: Number.POSITIVE_INFINITY, delay: i * 0.15 }
                    : undefined
                }
                className={cn(
                  "relative grid size-6 shrink-0 place-items-center border font-mono text-xs",
                  skipped(op)
                    ? "border-warning/40 text-warning"
                    : done
                      ? "border-success bg-success text-success-foreground"
                      : sending
                        ? "border-primary text-primary"
                        : "border-input bg-card text-muted-foreground",
                )}
              >
                {skipped(op) ? (
                  <MinusIcon weight="bold" className="size-3" />
                ) : done ? (
                  <CheckIcon weight="bold" className="size-3" />
                ) : (
                  i + 1
                )}
              </motion.span>
              <span className="pt-0.5 text-sm text-pretty">
                {op.label}
                {skipped(op) ? (
                  <span className="text-muted-foreground"> · nothing left to move</span>
                ) : null}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </div>
  )
}
