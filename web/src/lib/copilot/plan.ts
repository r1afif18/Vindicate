import { formatUnits } from "viem"
import { z } from "zod"

import type { Candidate, CopilotStep, Findings, SkippedStep } from "@/lib/copilot/types"

/**
 * The copilot's safety boundary. Code turns what the chain shows into a fixed menu of candidate
 * steps, each with an id. A model may only pick ids from that menu and explain its picks. It
 * never produces an address, an amount or calldata, so nothing it writes (or anything a
 * malicious token name tells it to write) can become a transaction.
 */

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

export function buildCandidates(findings: Findings): Candidate[] {
  const candidates: Candidate[] = []

  findings.allowances.forEach((a, i) =>
    candidates.push({
      id: `allowance:${i}`,
      title: `Revoke ${a.symbol} approval to ${short(a.spender)}`,
      detail: `${a.spender} may move ${a.unlimited ? "an unlimited amount" : formatUnits(BigInt(a.amount), a.decimals)} of ${a.symbol} out of this wallet.`,
      action: { kind: "revoke-allowance", allowance: a },
      blocker: null,
      caution: null,
    }),
  )
  findings.operators.forEach((o, i) =>
    candidates.push({
      id: `operator:${i}`,
      title: `Revoke NFT operator ${short(o.operator)}`,
      detail: `${o.operator} may move every NFT of collection ${o.collection} out of this wallet.`,
      action: { kind: "revoke-operator", collection: o.collection, operator: o.operator },
      blocker: null,
      caution: null,
    }),
  )
  findings.calls.forEach((c, i) => {
    const unknownPayout =
      c.pays.length === 0
        ? "It is not known what this call pays. BNB it returns is swept with the rest, but a token it returns would stay in the compromised wallet unless you add that token to the plan."
        : null
    candidates.push({
      id: `call:${i}`,
      title: `Call ${c.label} on ${short(c.target)}`,
      detail:
        `${c.label} on ${c.target} can be called by this wallet right now without failing. What it actually pays was not measured. ` +
        (c.source === "history"
          ? "Tokens went from this wallet to this contract before."
          : "The user named this contract.") +
        (c.pays.length > 0
          ? ` It is expected to pay out ${c.pays.join(", ")}. Including this step also sweeps ${c.pays.length === 1 ? "that token" : "those tokens"} in the same transaction, so what it pays is not left behind.`
          : ' What it pays is not known. BNB it returns is covered by the "bnb" step; a token it returns is only rescued if the owner adds that token.'),
      action: { kind: "custom-call", target: c.target, data: c.data, receives: c.pays },
      blocker: null,
      caution: unknownPayout,
    })
  })
  findings.nfts.forEach((n, i) =>
    candidates.push({
      id: `nft:${i}`,
      title:
        n.standard === "erc721"
          ? `Move NFT #${n.tokenId} from ${short(n.collection)}`
          : `Move ${n.amount}× item #${n.tokenId} from ${short(n.collection)}`,
      detail: `${n.standard === "erc721" ? "ERC-721" : "ERC-1155"} collection ${n.collection}, token id ${n.tokenId}.`,
      action:
        n.standard === "erc721"
          ? { kind: "transfer-erc721", collection: n.collection, tokenId: n.tokenId }
          : {
              kind: "transfer-erc1155",
              collection: n.collection,
              tokenId: n.tokenId,
              amount: n.amount,
            },
      blocker: null,
      caution: null,
    }),
  )
  findings.tokens.forEach((t, i) =>
    candidates.push({
      id: `token:${i}`,
      title: `Sweep ${t.symbol}`,
      detail: `Balance ${formatUnits(BigInt(t.balance), t.decimals)} ${t.symbol} (${t.address}).`,
      action: { kind: "sweep-token", token: t.address },
      blocker: t.transferable
        ? null
        : `${t.symbol} cannot be moved: ${t.blocker ?? "the token rejects the transfer"}. Because the rescue is all-or-nothing, including it would cancel everything else.`,
      caution: null,
    }),
  )
  // BNB is worth sweeping when there is some, or when a call may bring some in.
  if (BigInt(findings.nativeBalance) > 0n || findings.calls.length > 0) {
    candidates.push({
      id: "bnb",
      title: "Sweep BNB",
      detail:
        BigInt(findings.nativeBalance) > 0n
          ? `Balance ${formatUnits(BigInt(findings.nativeBalance), 18)} BNB.`
          : "No BNB right now, but a call in this rescue may return some.",
      action: { kind: "sweep-native" },
      blocker: null,
      caution: null,
    })
  }
  return candidates
}

/** What a model is asked to return. Ids only: see the note at the top of this file. */
export const ModelPlanSchema = z.object({
  summary: z.string(),
  threat: z.string(),
  steps: z.array(z.object({ id: z.string(), reason: z.string() })),
  skipped: z.array(z.object({ id: z.string(), reason: z.string() })),
  questions: z.array(z.string()),
})
export type ModelPlan = z.infer<typeof ModelPlanSchema>

export interface ResolvedPlan {
  steps: CopilotStep[]
  skipped: SkippedStep[]
  /** Ids the model used that are not on the menu. A non-empty list means "ask it again". */
  unknown: string[]
}

/** Checks a model's picks against the menu. Whatever is not on it is dropped, never trusted. */
export function resolvePlan(plan: ModelPlan, candidates: readonly Candidate[]): ResolvedPlan {
  const byId = new Map(candidates.map((c) => [c.id, c] as const))
  const steps: CopilotStep[] = []
  const skipped: ResolvedPlan["skipped"] = []
  const unknown: string[] = []
  const seen = new Set<string>()

  for (const pick of plan.steps) {
    const candidate = byId.get(pick.id)
    if (!candidate) {
      unknown.push(pick.id)
      continue
    }
    if (seen.has(candidate.id)) continue
    seen.add(candidate.id)
    // A blocked step stays out no matter what the model argued.
    if (candidate.blocker) {
      skipped.push({
        id: candidate.id,
        title: candidate.title,
        reason: candidate.blocker,
        action: candidate.action,
      })
    } else {
      steps.push({
        id: candidate.id,
        title: candidate.title,
        reason: pick.reason,
        action: candidate.action,
        caution: candidate.caution,
      })
    }
  }
  for (const pick of plan.skipped) {
    const candidate = byId.get(pick.id)
    if (!candidate) {
      unknown.push(pick.id)
      continue
    }
    if (seen.has(candidate.id)) continue
    seen.add(candidate.id)
    skipped.push({
      id: candidate.id,
      title: candidate.title,
      reason: candidate.blocker ?? pick.reason,
      action: candidate.action,
    })
  }
  // Anything the model did not mention is reported as skipped, so nothing disappears silently.
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue
    skipped.push({
      id: candidate.id,
      title: candidate.title,
      reason: candidate.blocker ?? "Not included by the copilot. Add it by hand if you want it.",
      action: candidate.action,
    })
  }
  return { steps, skipped, unknown }
}

const ruleReasons: Record<Candidate["action"]["kind"], string> = {
  "revoke-allowance": "This approval lets another address pull the token, so it is cut off first.",
  "revoke-operator": "This operator can move every NFT in the collection, so it is cut off first.",
  "custom-call": "This call goes through for the wallet right now, so it runs before the sweep.",
  "transfer-erc721": "The wallet still owns this NFT.",
  "transfer-erc1155": "The wallet still holds these items.",
  "sweep-token": "The wallet still holds this token and it can be transferred.",
  "sweep-native": "BNB left here, or returned by a call, would be taken by a sweeper.",
}

/**
 * The plan when no model is available: take every step that is safe to take. It selects exactly
 * as a cautious person would, but it cannot weigh the user's own account of what happened.
 */
export function rulePlan(candidates: readonly Candidate[]): ModelPlan {
  // Several exits can each succeed on their own and still fail one after another (withdraw()
  // and exit() on the same vault, say). Without judgement to choose, take one per contract.
  const exited = new Set<string>()
  const steps = candidates
    .filter((c) => {
      if (c.blocker) return false
      if (c.action.kind !== "custom-call") return true
      if (exited.has(c.action.target)) return false
      exited.add(c.action.target)
      return true
    })
    .map((c) => ({ id: c.id, reason: ruleReasons[c.action.kind] }))
  return { summary: "", threat: "", steps, skipped: [], questions: [] }
}

/** Plain summary for the rules-only plan, built from counts so it never overstates. */
export function describeFindings(findings: Findings, plan: ResolvedPlan) {
  const parts: string[] = []
  const tokens = plan.steps.filter((s) => s.action.kind === "sweep-token").length
  const nfts = plan.steps.filter((s) => s.action.kind.startsWith("transfer-")).length
  const revokes = plan.steps.filter((s) => s.action.kind.startsWith("revoke-")).length
  const calls = plan.steps.filter((s) => s.action.kind === "custom-call").length
  if (tokens) parts.push(`${tokens} token${tokens === 1 ? "" : "s"}`)
  if (plan.steps.some((s) => s.action.kind === "sweep-native")) parts.push("BNB")
  if (nfts) parts.push(`${nfts} NFT position${nfts === 1 ? "" : "s"}`)
  const summary =
    plan.steps.length === 0
      ? "Nothing rescuable was found in the part of the wallet's history that could be read."
      : `This plan moves ${parts.join(", ") || "nothing"} to your safe wallet` +
        (calls
          ? `, after ${calls} call${calls === 1 ? "" : "s"} that may pay the wallet first`
          : "") +
        (revokes ? `, and revokes ${revokes} approval${revokes === 1 ? "" : "s"}` : "") +
        "."
  const threats: string[] = []
  if (findings.delegation && !findings.delegatedToVindicate) {
    threats.push(`The wallet is delegated to ${findings.delegation}, which is not Vindicate.`)
  }
  if (findings.allowances.length + findings.operators.length > 0) {
    threats.push(
      `${findings.allowances.length + findings.operators.length} approval(s) still let other addresses move assets out.`,
    )
  }
  // Approvals are only found through the wallet's history. Where that could not be read in
  // full, finding none proves nothing, and saying "none found" would read as a clean bill.
  if (!findings.historyComplete) {
    threats.push(
      findings.blocksScanned === 0
        ? "Approvals could not be checked on this network. If you know the drainer's address, enter it under Revoke approvals."
        : "Only recent history could be read, so an older approval may exist that was not found. If you know the drainer's address, enter it under Revoke approvals.",
    )
  }
  return {
    summary,
    threat: threats.join(" ") || "No open approvals or foreign delegation were found.",
  }
}
