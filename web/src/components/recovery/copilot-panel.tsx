"use client"

import { CircleNotchIcon, MagnifyingGlassIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { planEvents, plannedTokens } from "@/components/recovery/copilot-apply"
import { useRecovery, useSameWallet } from "@/components/recovery/recovery-provider"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { Field } from "@/components/ui/field"
import { Textarea } from "@/components/ui/input"
import { Notice } from "@/components/ui/notice"
import { looksLikeSecret } from "@/lib/copilot/secret"
import type { CopilotRequest, CopilotResponse, CopilotStep } from "@/lib/copilot/types"
import { explainError } from "@/lib/recovery/errors"
import { scanWallet } from "@/lib/recovery/scan"

const kindLabel: Record<CopilotStep["action"]["kind"], string> = {
  "revoke-allowance": "Revoke",
  "revoke-operator": "Revoke",
  "custom-call": "Call",
  "transfer-erc721": "NFT",
  "transfer-erc1155": "NFT",
  "sweep-token": "Sweep",
  "sweep-native": "Sweep",
}

/**
 * The copilot: it reads the wallet's history, works out what can still be rescued and proposes a
 * plan with a reason for every step. It only ever receives the wallet's address and the owner's
 * note. Keys stay in this tab, the owner still picks the safe wallet, and nothing is signed until
 * they review and send the plan themselves.
 */
export function CopilotPanel() {
  const { state, dispatch, network, owner } = useRecovery()
  const [story, setStory] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CopilotResponse | null>(null)
  const [applied, setApplied] = useState(false)
  // Folded to one line until the owner asks for it, so the card stays short for those who
  // already know what they are rescuing.
  const [open, setOpen] = useState(false)
  const sameWallet = useSameWallet()
  if (state.phase.name === "done") return null
  // Shown from the first screen, so the owner knows help exists before they are stuck. It can
  // only investigate once there is a scanned wallet to investigate.
  const ready = Boolean(owner && state.report)
  // The note is sent to a server and a model. A private key is 64 hex characters, so a note
  // holding such a string is stopped here, before anything leaves the tab.
  const secret = looksLikeSecret(story)
  const locked = state.phase.name === "sending" || !ready

  async function investigate() {
    if (!owner) return
    setBusy(true)
    setError(null)
    setResult(null)
    setApplied(false)
    try {
      const body: CopilotRequest = {
        networkId: network.id,
        owner,
        story: story.trim() || undefined,
        recipient: state.recipient ?? undefined,
      }
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await response.json()) as CopilotResponse | { error: string }
      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : "The copilot could not investigate this wallet.")
        return
      }
      setResult(data)
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Copies the proposed steps into the plan below. The owner can still edit every one. Pressing
   * it again is harmless: the plan ignores a step it already holds.
   */
  async function apply(plan: CopilotResponse) {
    if (!owner || !state.ownerKey) return
    const { ownerKey, networkId } = state
    setBusy(true)
    setError(null)
    try {
      const report = await scanWallet(network, owner, [
        ...state.extraTokens,
        ...plannedTokens(plan),
      ])
      // The scan took a moment. If the wallet or network changed meanwhile, this plan is not
      // for what is on screen now.
      if (!sameWallet(ownerKey, networkId)) return
      for (const event of planEvents(plan, report, { ownerKey, networkId })) dispatch(event)
      setApplied(true)
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open && !result) {
    return (
      <section
        className="flex flex-wrap items-center justify-between gap-3 border border-border px-4 py-3"
        aria-label="Rescue copilot"
      >
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="text-sm font-semibold">Not sure what can be rescued?</h2>
          <p className="text-sm text-pretty text-muted-foreground">
            The copilot reads the wallet&apos;s history and proposes a plan.
          </p>
        </div>
        <Button variant="outline" disabled={locked} onClick={() => setOpen(true)}>
          <MagnifyingGlassIcon />
          {ready ? "Ask the copilot" : "Scan the wallet first"}
        </Button>
      </section>
    )
  }

  return (
    <section className="grid gap-4 border border-border p-4" aria-label="Rescue copilot">
      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Rescue copilot</h2>
          {result ? null : (
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          )}
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          It reads as much of this wallet&apos;s history as the network allows and proposes a plan.
          The wallet&apos;s address, your safe wallet&apos;s address and your note are sent to this
          site; the note and what was found on chain go on to the AI model. Your key stays in this
          tab.
        </p>
      </div>
      <Field
        id="copilot-story"
        label="What happened? (optional)"
        hint="Mention anything you know is still out there, with its contract address if you have it: a stake, an airdrop, a vesting contract. Never put a private key or seed phrase here."
      >
        <Textarea
          id="copilot-story"
          value={story}
          disabled={busy || locked}
          onChange={(e) => setStory(e.target.value)}
          placeholder="My wallet was drained yesterday. I still have a stake in 0x…"
        />
      </Field>
      <Button
        variant="outline"
        className="justify-self-start"
        disabled={busy || locked || secret}
        onClick={() => void investigate()}
      >
        {busy ? <CircleNotchIcon className="animate-spin" /> : <MagnifyingGlassIcon />}
        {busy
          ? "Investigating"
          : !ready
            ? "Scan the wallet first"
            : result
              ? "Investigate again"
              : "Investigate this wallet"}
      </Button>
      {secret ? (
        <Notice tone="danger" title="Remove the key from your note">
          The note contains 64 hex characters in a row, which is what a private key looks like.
          Nothing was sent. Delete it: the copilot only needs contract addresses.
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {result ? (
        <div className="grid gap-4 border-t border-border pt-4">
          {result.mode === "rules" && (result.steps.length > 0 || result.notice) ? (
            <Notice tone="warning" title="Planned by rules, not by the AI model">
              {result.notice ?? "No model was available."} Each step below was still checked against
              the chain on its own, and addresses in your note were looked up, but nothing weighed
              what you wrote.
            </Notice>
          ) : null}
          <div className="grid gap-2 text-sm">
            <p>{result.summary}</p>
            <p className="text-muted-foreground">{result.threat}</p>
          </div>

          {result.steps.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold">Proposed rescue</h3>
              <ol className="grid gap-px bg-border">
                {result.steps.map((s) => (
                  <li key={s.id} className="grid gap-1 bg-card py-2.5">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Chip>{kindLabel[s.action.kind]}</Chip>
                      {s.title}
                    </span>
                    <span className="text-sm text-pretty text-muted-foreground">{s.reason}</span>
                    {s.caution ? (
                      <span className="text-sm text-pretty text-warning">{s.caution}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The copilot found nothing it can rescue. You can still build a plan by hand below.
            </p>
          )}

          {result.skipped.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold">Left out</h3>
              <ul className="grid gap-px bg-border">
                {result.skipped.map((s) => (
                  <li key={s.id} className="grid gap-1 bg-card py-2.5">
                    <span className="text-sm font-medium">{s.title}</span>
                    <span className="text-sm text-pretty text-muted-foreground">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.questions.length > 0 ? (
            <Notice title="The copilot needs you to check">
              <ul className="grid list-disc gap-1 pl-5">
                {result.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">How it investigated</h3>
            <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
              {result.log.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          {result.steps.length > 0 ? (
            applied ? (
              <Notice tone="success" title="Plan loaded below">
                Check each step, add your safe wallet and a gas wallet, then review. Nothing is
                signed until you do.
              </Notice>
            ) : (
              <Button
                variant="outline"
                className="justify-self-start"
                disabled={busy || locked}
                onClick={() => void apply(result)}
              >
                Use this plan
              </Button>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
