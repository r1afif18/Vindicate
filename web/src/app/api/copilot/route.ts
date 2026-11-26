import { getAddress, isAddress } from "viem"
import { z } from "zod"

import { type NetworkId, isPracticeChain, networks } from "@/lib/chains"
import { addressesIn, investigate } from "@/lib/copilot/investigate"
import { askModel } from "@/lib/copilot/model"
import { buildCandidates, describeFindings, resolvePlan, rulePlan } from "@/lib/copilot/plan"
import { looksLikeSecret } from "@/lib/copilot/secret"
import type { CopilotResponse } from "@/lib/copilot/types"

const address = z
  .string()
  .refine((v) => isAddress(v), "must be a checksummed 0x address")
  .transform((v) => getAddress(v))

/**
 * Reading a week of history and waiting for the model takes 20 to 30 seconds, longer than the
 * default limit some hosts give a route.
 */
export const maxDuration = 60

/** Only public data comes in: an address and the owner's own description. Never a key. */
const requestSchema = z.object({
  networkId: z.enum(["bsc", "bsc-testnet"]),
  owner: address,
  story: z.string().max(2000).optional(),
  recipient: address.optional(),
})

/**
 * The copilot reads a wallet's history with eth_getLogs over wide block ranges, which many keyed
 * RPC plans cap at a handful of blocks. So the server may be given an RPC of its own for the
 * investigation. It is never sent to the browser, and no transaction goes through it.
 */
const investigationRpc: Record<NetworkId, string | undefined> = {
  bsc: process.env.COPILOT_RPC_BSC,
  "bsc-testnet": process.env.COPILOT_RPC_BSC_TESTNET,
}

function investigationNetwork(id: NetworkId) {
  const network = networks[id]
  // The practice chain lives on this machine. Investigating a public network instead would
  // describe a different wallet from the one in the app.
  if (isPracticeChain(network)) return network
  const rpcUrl = investigationRpc[id]?.trim()
  return rpcUrl ? { ...network, rpcUrl } : network
}

/** Each request reads a lot of chain and may call a paid model, so a caller gets a few a minute. */
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 6
const MAX_MENTIONED = 12
const recent = new Map<string, number[]>()

function overLimit(request: Request) {
  const caller = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  const now = Date.now()
  const hits = (recent.get(caller) ?? []).filter((t) => now - t < WINDOW_MS)
  hits.push(now)
  recent.set(caller, hits)
  // Keeps the table from growing without bound on a long-lived server.
  if (recent.size > 5_000) recent.clear()
  return hits.length > MAX_PER_WINDOW
}

/**
 * Investigates a wallet and proposes a rescue plan. The investigation is code reading the chain;
 * a model then chooses among the steps that code verified and explains them. With no model
 * available the route still answers, using every safe step and saying so.
 */
export async function POST(request: Request) {
  if (overLimit(request)) {
    return Response.json(
      { error: "Too many investigations in a minute. Wait a moment and try again." },
      { status: 429 },
    )
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: "Send a network, a wallet address and an optional note." },
      { status: 400 },
    )
  }
  const { networkId, owner, recipient } = parsed.data
  const story = parsed.data.story?.trim() ?? ""
  // The browser stops this first. Checked again here so no other caller can send a key onward.
  if (looksLikeSecret(story)) {
    return Response.json(
      {
        error:
          "The note contains what looks like a private key. Nothing was read or sent on. Remove it and try again.",
      },
      { status: 400 },
    )
  }

  let investigation: Awaited<ReturnType<typeof investigate>>
  try {
    investigation = await investigate({
      network: investigationNetwork(networkId),
      owner,
      mentioned: addressesIn(story).slice(0, MAX_MENTIONED),
      recipient,
    })
  } catch {
    return Response.json(
      { error: "The chain could not be read. Check the connection and try again." },
      { status: 502 },
    )
  }
  const { findings, log } = investigation
  const candidates = buildCandidates(findings)

  // With nothing found and nothing said there is nothing for a model to weigh. With a note it
  // still has a job: tell the owner what it would need to find what they describe.
  let answer =
    candidates.length > 0 || story !== "" ? await askModel({ findings, candidates, story }) : null
  let resolved = answer?.ok ? resolvePlan(answer.plan, candidates) : null
  if (answer?.ok && resolved && resolved.unknown.length > 0) {
    // The model named a step that does not exist. Tell it so once; after that, drop what is left.
    const retry = await askModel({ findings, candidates, story, rejected: resolved.unknown })
    if (retry.ok) {
      answer = retry
      resolved = resolvePlan(retry.plan, candidates)
    }
  }

  let body: CopilotResponse
  if (answer?.ok && resolved) {
    log.push("A model chose among the verified steps and wrote the reasons.")
    body = {
      mode: "ai",
      notice: null,
      summary: answer.plan.summary,
      threat: answer.plan.threat,
      steps: resolved.steps,
      skipped: resolved.skipped,
      questions: answer.plan.questions,
      log,
    }
  } else {
    const rules = resolvePlan(rulePlan(candidates), candidates)
    body = {
      mode: "rules",
      // Null when the model was simply not needed: nothing was found and no note was given.
      notice: answer && !answer.ok ? answer.reason : null,
      ...describeFindings(findings, rules),
      steps: rules.steps,
      skipped: rules.skipped,
      questions: [],
      log,
    }
  }
  return Response.json(body)
}
