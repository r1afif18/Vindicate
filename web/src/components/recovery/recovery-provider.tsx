"use client"

import {
  type Dispatch,
  type ReactNode,
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react"
import type { Address, Hash, Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

import { type Network, type NetworkId, networkList, networks } from "@/lib/chains"
import type { PreparedRecovery, SweptAsset } from "@/lib/recovery/execute"
import type { Allowance, WalletReport } from "@/lib/recovery/scan"
import type { RecoveryAction } from "@/lib/recovery/types"

export interface NftItem {
  standard: "erc721" | "erc1155"
  collection: Address
  tokenId: bigint
  amount: bigint
}

export interface OperatorRevoke {
  collection: Address
  operator: Address
}

export interface CustomCall {
  target: Address
  data: Hex
  value: bigint
}

/** Where the transaction is. Any edit to the plan drops a check back to `idle`. */
export type Phase =
  | { name: "idle" }
  /** `task` only changes the label: a rescan is not a signature. */
  | { name: "checking"; task?: "scan" | "review" }
  | { name: "checked"; prepared: PreparedRecovery }
  | { name: "sending"; prepared: PreparedRecovery; hash?: Hash }
  /** `swept` is what the contract reported moving, which can be less than what was planned. */
  | { name: "done"; hash: Hash; swept: SweptAsset[] }

export interface RecoveryState {
  phase: Phase
  error: string | null
  networkId: NetworkId
  /** Held in memory only. Never persisted, logged or sent. */
  ownerKey: Hex | null
  report: WalletReport | null
  extraTokens: Address[]
  /** Lower-cased token addresses selected for sweeping. */
  sweepTokens: string[]
  sweepNative: boolean
  allowances: Allowance[]
  /** Keys from allowanceKey() selected for revoking. */
  revokes: string[]
  operators: OperatorRevoke[]
  nfts: NftItem[]
  calls: CustomCall[]
  recipient: Address | null
  /** Held in memory only. Never persisted, logged or sent. */
  sponsorKey: Hex | null
  sponsorSource: "generated" | "imported"
  /** Bumped on reset so views holding key text in local state remount and drop it. */
  session: number
  /**
   * Bumped on every edit. Async work (scan, review, send) remembers the revision it started
   * from, and its result is dropped if the plan has changed underneath it.
   */
  revision: number
}

export type RecoveryEvent =
  /** `revision`: the plan this result belongs to. Omit only for user-initiated transitions. */
  | { type: "phase"; phase: Phase; revision?: number }
  | { type: "error"; message: string | null; revision?: number }
  /** A signed review turned out to be unusable: back to idle with a fresh scan and the reason. */
  | { type: "stale"; report: WalletReport | null; message: string; revision: number }
  | { type: "network"; networkId: NetworkId }
  | { type: "ownerKey"; key: Hex | null }
  /** `ownerKey` and `networkId` say what was scanned, so a result for an old wallet is dropped. */
  | { type: "scanned"; report: WalletReport; ownerKey: Hex; networkId: NetworkId }
  | { type: "addToken"; token: Address }
  | { type: "toggleToken"; token: string; on: boolean }
  | { type: "toggleNative"; on: boolean }
  | { type: "allowances"; allowances: Allowance[] }
  | { type: "toggleRevoke"; key: string; on: boolean }
  | { type: "addOperator"; item: OperatorRevoke }
  | { type: "addNft"; item: NftItem }
  | { type: "addCall"; item: CustomCall }
  | { type: "removeAt"; list: "operators" | "nfts" | "calls"; index: number }
  | { type: "recipient"; address: Address | null }
  | { type: "sponsor"; key: Hex | null; source: "generated" | "imported" }
  /** Forget everything, keys included. */
  | { type: "reset" }
  /** Start another rescue on the same network with the same gas wallet. */
  | { type: "again" }

/** True for a token the user added by address, as opposed to one from the watch list. */
export function isAddedToken(state: Pick<RecoveryState, "extraTokens">, token: Address) {
  return state.extraTokens.some((t) => t.toLowerCase() === token.toLowerCase())
}

/**
 * Tokens worth listing: anything with a balance, plus hand-added tokens that are still empty.
 * The contract skips an empty balance, so sweeping one is harmless.
 */
export function listedTokens(state: Pick<RecoveryState, "report" | "extraTokens">) {
  return (state.report?.tokens ?? []).filter(
    (t) => t.balance > 0n || isAddedToken(state, t.address),
  )
}

/**
 * Whether BNB is swept. An empty wallet still sweeps when a call is in the plan, because that
 * call (an unstake, a WBNB withdrawal) is what brings the BNB in.
 */
export function sweepsNative(state: Pick<RecoveryState, "report" | "sweepNative" | "calls">) {
  if (!state.sweepNative || !state.report) return false
  return state.report.nativeBalance > 0n || state.calls.length > 0
}

/** BNB left to sweep once the plan's own calls have spent what they send along. */
export function sweepableNative(state: Pick<RecoveryState, "report" | "calls">) {
  const balance = state.report?.nativeBalance ?? 0n
  const spent = state.calls.reduce((sum, call) => sum + call.value, 0n)
  return balance > spent ? balance - spent : 0n
}

export function allowanceKey(a: Pick<Allowance, "token" | "spender">) {
  return `${a.token}:${a.spender}`.toLowerCase()
}

export const initialState: RecoveryState = {
  phase: { name: "idle" },
  error: null,
  // Start on the first network Vindicate is deployed to.
  networkId: networkList.find((n) => n.delegate)?.id ?? "bsc",
  ownerKey: null,
  report: null,
  extraTokens: [],
  sweepTokens: [],
  sweepNative: true,
  allowances: [],
  revokes: [],
  operators: [],
  nfts: [],
  calls: [],
  recipient: null,
  sponsorKey: null,
  sponsorSource: "generated",
  session: 0,
  revision: 0,
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

const toggle = (list: string[], value: string, on: boolean) =>
  on ? [...new Set([...list, value])] : list.filter((v) => v !== value)

/** Plan edits invalidate a finished check and clear the last error. */
export function reducer(state: RecoveryState, event: RecoveryEvent): RecoveryState {
  if (event.type === "phase" || event.type === "error" || event.type === "stale") {
    // The result of work that started on an older plan says nothing about the current one.
    if (event.revision !== undefined && event.revision !== state.revision) return state
    if (event.type === "phase") return { ...state, phase: event.phase, error: null }
    if (event.type === "error") return { ...state, error: event.message }
    const rescanned =
      event.report && state.ownerKey
        ? edit(state, {
            type: "scanned",
            report: event.report,
            ownerKey: state.ownerKey,
            networkId: state.networkId,
          })
        : state
    return {
      ...rescanned,
      phase: { name: "idle" },
      error: event.message,
      revision: state.revision + 1,
    }
  }
  if (event.type === "reset" || event.type === "again") return edit(state, event)
  const locked = state.phase.name === "sending" || state.phase.name === "done"
  if (locked) return state
  const next = edit(state, event)
  if (next === state) return state
  return { ...next, phase: { name: "idle" }, error: null, revision: state.revision + 1 }
}

function edit(
  state: RecoveryState,
  event: Exclude<RecoveryEvent, { type: "phase" } | { type: "error" } | { type: "stale" }>,
): RecoveryState {
  switch (event.type) {
    case "network":
      // Balances and approvals belong to one chain, so a switch starts the scan over.
      // The safe wallet and the gas wallet do not depend on the chain, so they are kept.
      return {
        ...initialState,
        networkId: event.networkId,
        ownerKey: state.ownerKey,
        recipient: state.recipient,
        sponsorKey: state.sponsorKey,
        sponsorSource: state.sponsorSource,
        session: state.session,
      }
    case "ownerKey":
      // Likewise for a different compromised wallet: a funded gas wallet must not be lost.
      return {
        ...initialState,
        networkId: state.networkId,
        ownerKey: event.key,
        recipient: state.recipient,
        sponsorKey: state.sponsorKey,
        sponsorSource: state.sponsorSource,
        session: state.session,
      }
    case "scanned": {
      if (event.ownerKey !== state.ownerKey || event.networkId !== state.networkId) return state
      const known = new Set(state.sweepTokens)
      // Select what newly holds a balance. A token the user unticked keeps its balance from one
      // scan to the next, so it is not picked up again here.
      const fresh = event.report.tokens
        .filter(
          (t) =>
            t.balance > 0n &&
            !state.report?.tokens.some((p) => p.address === t.address && p.balance > 0n),
        )
        .map((t) => t.address.toLowerCase())
      return {
        ...state,
        report: event.report,
        sweepTokens: [...new Set([...known, ...fresh])],
      }
    }
    case "addToken":
      // A token added by hand is selected even at a zero balance: it is usually there to catch
      // what a claim or unstake call in the same rescue will bring in.
      return {
        ...state,
        extraTokens: [...new Set([...state.extraTokens, event.token])],
        sweepTokens: toggle(state.sweepTokens, event.token.toLowerCase(), true),
      }
    case "toggleToken":
      return {
        ...state,
        sweepTokens: toggle(state.sweepTokens, event.token.toLowerCase(), event.on),
      }
    case "toggleNative":
      return { ...state, sweepNative: event.on }
    case "allowances": {
      const merged = new Map(state.allowances.map((a) => [allowanceKey(a), a]))
      for (const a of event.allowances) merged.set(allowanceKey(a), a)
      return {
        ...state,
        allowances: [...merged.values()],
        revokes: [...new Set([...state.revokes, ...event.allowances.map(allowanceKey)])],
      }
    }
    case "toggleRevoke":
      return { ...state, revokes: toggle(state.revokes, event.key, event.on) }
    // The same entry twice would run twice on chain, where the second run reverts (an NFT can
    // only be moved once, a stake only withdrawn once) and takes the whole rescue with it.
    case "addOperator":
      return state.operators.some(
        (o) => same(o.collection, event.item.collection) && same(o.operator, event.item.operator),
      )
        ? state
        : { ...state, operators: [...state.operators, event.item] }
    case "addNft": {
      const at = state.nfts.findIndex(
        (n) =>
          n.standard === event.item.standard &&
          same(n.collection, event.item.collection) &&
          n.tokenId === event.item.tokenId,
      )
      if (at === -1) return { ...state, nfts: [...state.nfts, event.item] }
      // The same item again with another quantity is a correction, not a second transfer.
      if (state.nfts[at]?.amount === event.item.amount) return state
      return { ...state, nfts: state.nfts.map((n, i) => (i === at ? event.item : n)) }
    }
    case "addCall":
      return state.calls.some(
        (c) =>
          same(c.target, event.item.target) &&
          c.data.toLowerCase() === event.item.data.toLowerCase() &&
          c.value === event.item.value,
      )
        ? state
        : { ...state, calls: [...state.calls, event.item] }
    case "removeAt":
      return { ...state, [event.list]: state[event.list].filter((_, i) => i !== event.index) }
    case "recipient":
      return { ...state, recipient: event.address }
    case "sponsor":
      return { ...state, sponsorKey: event.key, sponsorSource: event.source }
    case "reset":
      return { ...initialState, session: state.session + 1, revision: state.revision + 1 }
    case "again":
      return {
        ...initialState,
        networkId: state.networkId,
        sponsorKey: state.sponsorKey,
        sponsorSource: state.sponsorSource,
        session: state.session + 1,
        revision: state.revision + 1,
      }
    default:
      event satisfies never
      return state
  }
}

/** Compiles the user's selections into plan actions. */
export function selectActions(state: RecoveryState): RecoveryAction[] {
  const actions: RecoveryAction[] = []
  for (const a of state.allowances) {
    if (state.revokes.includes(allowanceKey(a))) {
      actions.push({ kind: "revoke-allowance", token: a.token, spender: a.spender })
    }
  }
  for (const o of state.operators) actions.push({ kind: "revoke-operator", ...o })
  for (const c of state.calls) actions.push({ kind: "custom-call", ...c })
  for (const n of state.nfts) {
    actions.push(
      n.standard === "erc721"
        ? { kind: "transfer-erc721", collection: n.collection, tokenId: n.tokenId }
        : {
            kind: "transfer-erc1155",
            collection: n.collection,
            tokenId: n.tokenId,
            amount: n.amount,
          },
    )
  }
  for (const t of listedTokens(state)) {
    if (state.sweepTokens.includes(t.address.toLowerCase())) {
      actions.push({ kind: "sweep-token", token: t.address })
    }
  }
  if (sweepsNative(state)) actions.push({ kind: "sweep-native" })
  return actions
}

interface RecoveryContextValue {
  state: RecoveryState
  dispatch: Dispatch<RecoveryEvent>
  network: Network
  owner: Address | null
  sponsor: Address | null
  actions: RecoveryAction[]
}

const RecoveryContext = createContext<RecoveryContextValue | null>(null)

export function RecoveryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const value = useMemo<RecoveryContextValue>(
    () => ({
      state,
      dispatch,
      network: networks[state.networkId],
      owner: state.ownerKey ? privateKeyToAccount(state.ownerKey).address : null,
      sponsor: state.sponsorKey ? privateKeyToAccount(state.sponsorKey).address : null,
      actions: selectActions(state),
    }),
    [state],
  )
  return <RecoveryContext value={value}>{children}</RecoveryContext>
}

/**
 * For steps that read the chain and then change the plan. Between the read and the change the
 * owner may have pasted another key or switched network, and the answer must not land in a plan
 * it was not asked for. Returns a check to run after the await.
 */
export function useSameWallet() {
  const { state } = useRecovery()
  const latest = useRef({ ownerKey: state.ownerKey, networkId: state.networkId })
  useEffect(() => {
    latest.current = { ownerKey: state.ownerKey, networkId: state.networkId }
  }, [state.ownerKey, state.networkId])
  return useCallback(
    (ownerKey: Hex | null, networkId: NetworkId) =>
      latest.current.ownerKey === ownerKey && latest.current.networkId === networkId,
    [],
  )
}

export function useRecovery() {
  const ctx = use(RecoveryContext)
  if (!ctx) throw new Error("useRecovery must be used inside <RecoveryProvider>")
  return ctx
}
