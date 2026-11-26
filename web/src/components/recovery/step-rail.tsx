"use client"

import { CheckIcon } from "@phosphor-icons/react"

import { type RecoveryState, useRecovery } from "@/components/recovery/recovery-provider"
import { useRecoveryFlow } from "@/components/recovery/use-recovery-flow"

const steps = ["Key", "Scan", "Plan", "Review", "Send"] as const

/** The step the owner is on. Everything before it is done; 5 means the rescue is confirmed. */
export function currentStep(state: Pick<RecoveryState, "ownerKey" | "report" | "phase">) {
  const phase = state.phase
  if (phase.name === "done") return 5
  if (phase.name === "sending") return 4
  if (phase.name === "checked") return 3
  if (phase.name === "checking") return phase.task === "scan" ? 1 : 3
  if (!state.ownerKey) return 0
  if (!state.report) return 1
  return 2
}

/**
 * Where the owner is in a rescue, and the one thing to do next. The card below is long, so this
 * stays at the top as the map.
 */
export function StepRail() {
  const { state } = useRecovery()
  const { primary } = useRecoveryFlow()
  const current = currentStep(state)

  return (
    <div className="grid gap-3">
      <ol className="grid grid-cols-5 gap-2" aria-label="Rescue progress">
        {steps.map((label, i) => {
          const status = i < current ? "done" : i === current ? "active" : "todo"
          return (
            <li
              key={label}
              data-status={status}
              aria-current={status === "active" ? "step" : undefined}
              className="group grid gap-2 border-t border-foreground/15 pt-2 transition-colors duration-base data-[status=active]:border-primary data-[status=done]:border-success"
            >
              <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums group-data-[status=active]:text-primary group-data-[status=done]:text-success">
                {status === "done" ? (
                  <CheckIcon weight="bold" className="size-3.5" />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              <span className="text-sm font-medium text-muted-foreground group-data-[status=active]:text-foreground group-data-[status=done]:text-foreground">
                {label}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {current === 5 ? "Rescue confirmed." : `Next: ${primary.label}.`}
      </p>
    </div>
  )
}
