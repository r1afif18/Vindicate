"use client"

import { CircleNotchIcon } from "@phosphor-icons/react"
import { type FormEvent, type ReactNode, useState } from "react"
import { getAddress, isAddress, isHex, parseEther } from "viem"

import { useRecovery, useSameWallet } from "@/components/recovery/recovery-provider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input, Textarea } from "@/components/ui/input"
import { Notice } from "@/components/ui/notice"
import { RadioCard, RadioGroup } from "@/components/ui/radio-group"
import { explainError } from "@/lib/recovery/errors"
import { readAllowances, scanWallet } from "@/lib/recovery/scan"

export type AddItemKind = "token" | "approval" | "operator" | "nft" | "call"

// Strict: a mixed-case address whose checksum fails has a wrong character somewhere.
const isAddr = (v: string) => isAddress(v)
const addressError = (v: string) => {
  if (!v || isAddr(v)) return null
  return isAddress(v, { strict: false })
    ? "That address fails its checksum. Check every character."
    : "Enter a 0x address."
}

const copy: Record<AddItemKind, { title: string; description: string }> = {
  token: {
    title: "Add a token",
    description: "Any BEP-20 token by its contract address. Its balance is read from the chain.",
  },
  approval: {
    title: "Revoke a drainer's approvals",
    description:
      "Paste the drainer or spender address from the explorer. Every scanned token is checked for an allowance to it. Revoking is free.",
  },
  operator: {
    title: "Revoke an NFT operator",
    description: "Removes an operator approved for every NFT in a collection.",
  },
  nft: { title: "Move an NFT", description: "Sent to the safe wallet with no fee." },
  call: {
    title: "Add a call to run first",
    description:
      "For a claim, unstake or withdrawal that must happen before sweeping. Copy the calldata from the project or the explorer. Only add calls you understand.",
  },
}

/** One dialog host for every "add" action. `kind` picks the form; `null` closes it. */
export function AddItemDialog({
  kind,
  onClose,
}: {
  kind: AddItemKind | null
  onClose: () => void
}) {
  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      {kind ? (
        <DialogContent title={copy[kind].title} description={copy[kind].description}>
          {kind === "token" ? <TokenForm onDone={onClose} /> : null}
          {kind === "approval" ? <ApprovalForm onDone={onClose} /> : null}
          {kind === "operator" ? <OperatorForm onDone={onClose} /> : null}
          {kind === "nft" ? <NftForm onDone={onClose} /> : null}
          {kind === "call" ? <CallForm onDone={onClose} /> : null}
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

/**
 * Every form below works in two places: alone in a dialog, or inline in the rescue card.
 * `inline` gives it a quieter submit button, unique field ids and no focus grab on mount.
 */
export interface ItemFormProps {
  onDone: () => void
  inline?: boolean
}

function FormShell({
  onSubmit,
  submitLabel,
  disabled,
  busy,
  error,
  inline,
  row,
  children,
}: {
  onSubmit: (e: FormEvent) => void
  submitLabel: string
  disabled: boolean
  busy?: boolean
  error?: string | null
  inline?: boolean
  /** One field and its button on a single line. For the short inline forms. */
  row?: boolean
  children: ReactNode
}) {
  if (row) {
    return (
      <form onSubmit={onSubmit} className="grid gap-2">
        <div className="flex flex-col items-start gap-2 sm:flex-row">
          <div className="w-full min-w-0 flex-1">{children}</div>
          {/* Beside the input on wide screens, pushed down by the height of the field's label
              so the two line up. Below it on narrow ones, where the label may wrap. */}
          <Button type="submit" variant="outline" className="sm:mt-7" disabled={disabled || busy}>
            {busy ? <CircleNotchIcon className="animate-spin" /> : null}
            {submitLabel}
          </Button>
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </form>
    )
  }
  return (
    <form onSubmit={onSubmit} className={inline ? "grid gap-3" : "grid gap-5"}>
      {children}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button
        type="submit"
        size={inline ? "md" : "lg"}
        variant={inline ? "outline" : "primary"}
        className={inline ? "justify-self-start" : undefined}
        disabled={disabled || busy}
      >
        {busy ? <CircleNotchIcon className="animate-spin" /> : null}
        {submitLabel}
      </Button>
    </form>
  )
}

const fieldId = (inline: boolean | undefined, id: string) => (inline ? `inline-${id}` : id)

export function TokenForm({ onDone, inline }: ItemFormProps) {
  const { state, dispatch, network, owner } = useRecovery()
  const sameWallet = useSameWallet()
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = fieldId(inline, "token-address")

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!owner || !state.ownerKey || !isAddr(value)) return
    const { ownerKey, networkId } = state
    const token = getAddress(value)
    setBusy(true)
    setError(null)
    try {
      const report = await scanWallet(network, owner, [...state.extraTokens, token])
      if (!sameWallet(ownerKey, networkId)) return
      if (!report.tokens.some((t) => t.address === token)) {
        setError("That address is not a token on this network.")
        return
      }
      dispatch({ type: "addToken", token })
      dispatch({ type: "scanned", report, ownerKey, networkId })
      onDone()
    } catch (err) {
      setError(explainError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormShell
      onSubmit={submit}
      submitLabel="Add token"
      disabled={!isAddr(value)}
      busy={busy}
      error={error}
      inline={inline}
      row={inline}
    >
      <Field id={id} label="Token contract address (CA)" error={addressError(value)}>
        <Input
          id={id}
          font="mono"
          value={value}
          onChange={(e) => setValue(e.target.value.trim())}
          placeholder="0x…"
          autoFocus={!inline}
        />
      </Field>
    </FormShell>
  )
}

export function ApprovalForm({ onDone, inline }: ItemFormProps) {
  const { state, dispatch, network, owner } = useRecovery()
  const sameWallet = useSameWallet()
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = fieldId(inline, "spender")

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!owner || !state.report || !isAddr(value)) return
    setBusy(true)
    setError(null)
    try {
      const { ownerKey, networkId } = state
      const found = await readAllowances(network, owner, state.report.tokens, [getAddress(value)])
      if (!sameWallet(ownerKey, networkId)) return
      if (found.length === 0) {
        setError(
          "No open allowances to that address on the scanned tokens. Add the token first if it is missing.",
        )
        return
      }
      dispatch({ type: "allowances", allowances: found })
      onDone()
    } catch (err) {
      setError(explainError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormShell
      onSubmit={submit}
      submitLabel="Find approvals"
      disabled={!isAddr(value)}
      busy={busy}
      error={error}
      inline={inline}
      row={inline}
    >
      <Field id={id} label="Drainer or spender address" error={addressError(value)}>
        <Input
          id={id}
          font="mono"
          value={value}
          onChange={(e) => setValue(e.target.value.trim())}
          placeholder="0x…"
          autoFocus={!inline}
        />
      </Field>
    </FormShell>
  )
}

export function OperatorForm({ onDone, inline }: ItemFormProps) {
  const { dispatch } = useRecovery()
  const [collection, setCollection] = useState("")
  const [operator, setOperator] = useState("")
  const valid = isAddr(collection) && isAddr(operator)
  const collectionId = fieldId(inline, "op-collection")
  const operatorId = fieldId(inline, "op-operator")
  return (
    <FormShell
      submitLabel="Add revoke"
      disabled={!valid}
      inline={inline}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        dispatch({
          type: "addOperator",
          item: { collection: getAddress(collection), operator: getAddress(operator) },
        })
        onDone()
      }}
    >
      <div className={inline ? "grid gap-3 sm:grid-cols-2" : "grid gap-5"}>
        <Field id={collectionId} label="NFT collection address" error={addressError(collection)}>
          <Input
            id={collectionId}
            font="mono"
            value={collection}
            onChange={(e) => setCollection(e.target.value.trim())}
            placeholder="0x…"
            autoFocus={!inline}
          />
        </Field>
        <Field id={operatorId} label="Approved operator" error={addressError(operator)}>
          <Input
            id={operatorId}
            font="mono"
            value={operator}
            onChange={(e) => setOperator(e.target.value.trim())}
            placeholder="0x…"
          />
        </Field>
      </div>
    </FormShell>
  )
}

export function NftForm({ onDone, inline }: ItemFormProps) {
  const { dispatch } = useRecovery()
  const [standard, setStandard] = useState<"erc721" | "erc1155">("erc721")
  const [collection, setCollection] = useState("")
  const [tokenId, setTokenId] = useState("")
  // Empty, not "1": a number typed after a prefilled digit silently becomes a different one.
  const [amount, setAmount] = useState("")
  const valid =
    isAddr(collection) &&
    /^\d+$/.test(tokenId) &&
    (standard === "erc721" || /^[1-9]\d*$/.test(amount))
  const collectionId = fieldId(inline, "nft-collection")
  const tokenIdId = fieldId(inline, "nft-id")
  const amountId = fieldId(inline, "nft-amount")

  return (
    <FormShell
      submitLabel="Add NFT"
      disabled={!valid}
      inline={inline}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        dispatch({
          type: "addNft",
          item: {
            standard,
            collection: getAddress(collection),
            tokenId: BigInt(tokenId),
            amount: standard === "erc721" ? 1n : BigInt(amount),
          },
        })
        onDone()
      }}
    >
      <RadioGroup
        value={standard}
        onValueChange={(v) => setStandard(v as typeof standard)}
        className="grid-cols-2"
        aria-label="NFT standard"
      >
        <RadioCard value="erc721">
          <span className="font-medium">ERC-721</span>
          {inline ? null : <span className="text-sm text-muted-foreground">One of a kind</span>}
        </RadioCard>
        <RadioCard value="erc1155">
          <span className="font-medium">ERC-1155</span>
          {inline ? null : <span className="text-sm text-muted-foreground">Has a quantity</span>}
        </RadioCard>
      </RadioGroup>
      <Field id={collectionId} label="NFT collection address" error={addressError(collection)}>
        <Input
          id={collectionId}
          font="mono"
          value={collection}
          onChange={(e) => setCollection(e.target.value.trim())}
          placeholder="0x…"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id={tokenIdId} label="Token ID">
          <Input
            id={tokenIdId}
            inputMode="numeric"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value.trim())}
            placeholder="1234"
          />
        </Field>
        {standard === "erc1155" ? (
          <Field id={amountId} label="Quantity">
            <Input
              id={amountId}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.trim())}
              placeholder="How many to move"
            />
          </Field>
        ) : null}
      </div>
    </FormShell>
  )
}

export function CallForm({ onDone, inline }: ItemFormProps) {
  const { state, dispatch, network, owner } = useRecovery()
  const sameWallet = useSameWallet()
  const [target, setTarget] = useState("")
  const [data, setData] = useState("")
  const [value, setValue] = useState("0")
  const [received, setReceived] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dataValid = isHex(data, { strict: true }) && data.length >= 10
  const valid = isAddr(target) && dataValid && (received === "" || isAddr(received))
  const targetId = fieldId(inline, "call-target")
  const dataId = fieldId(inline, "call-data")
  const valueId = fieldId(inline, "call-value")
  const receivedId = fieldId(inline, "call-received")

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    let wei: bigint
    try {
      wei = parseEther(value || "0")
    } catch {
      setError("Enter an amount in BNB, such as 0.01.")
      return
    }
    if (wei < 0n) {
      setError("Enter an amount in BNB, such as 0.01.")
      return
    }
    setError(null)
    // The token a claim pays out is usually not in the wallet yet. Adding it here is what makes
    // the same transaction sweep it, instead of leaving it behind for the attacker.
    if (received) {
      if (!owner || !state.ownerKey) return
      const { ownerKey, networkId } = state
      const token = getAddress(received)
      setBusy(true)
      try {
        const report = await scanWallet(network, owner, [...state.extraTokens, token])
        if (!sameWallet(ownerKey, networkId)) return
        if (!report.tokens.some((t) => t.address === token)) {
          setError("The token you will receive is not a token on this network.")
          return
        }
        dispatch({ type: "addToken", token })
        dispatch({ type: "scanned", report, ownerKey, networkId })
      } catch (err) {
        setError(explainError(err))
        return
      } finally {
        setBusy(false)
      }
    }
    dispatch({
      type: "addCall",
      item: { target: getAddress(target), data: data as `0x${string}`, value: wei },
    })
    onDone()
  }

  return (
    <FormShell
      submitLabel="Add call"
      disabled={!valid}
      busy={busy}
      error={error}
      inline={inline}
      onSubmit={submit}
    >
      {/* Inline, the four fields share two columns and the long hints live in the panel's
          "Where do I find" note instead of under every field. */}
      <div className={inline ? "grid gap-3 sm:grid-cols-2" : "grid gap-5"}>
        <Field
          id={targetId}
          label="Contract address"
          error={addressError(target)}
          className="sm:col-span-2"
        >
          <Input
            id={targetId}
            font="mono"
            value={target}
            onChange={(e) => setTarget(e.target.value.trim())}
            placeholder="0x…"
            autoFocus={!inline}
          />
        </Field>
        <Field
          id={dataId}
          label="Calldata (hex data)"
          error={
            data && !dataValid
              ? "Calldata is hex starting with 0x and a 4-byte function selector."
              : null
          }
          className="sm:col-span-2"
        >
          <Textarea
            id={dataId}
            font="mono"
            className={inline ? "min-h-16" : undefined}
            value={data}
            onChange={(e) => setData(e.target.value.trim())}
            placeholder="0x…"
          />
        </Field>
        <Field
          id={valueId}
          label="BNB to send with it"
          hint="Usually 0. Only if the claim charges a fee."
        >
          <Input
            id={valueId}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value.trim())}
          />
        </Field>
        <Field
          id={receivedId}
          label="Token you will receive (CA)"
          error={addressError(received)}
          hint="Optional. It is swept in the same transaction."
        >
          <Input
            id={receivedId}
            font="mono"
            value={received}
            onChange={(e) => setReceived(e.target.value.trim())}
            placeholder="0x…"
          />
        </Field>
      </div>
    </FormShell>
  )
}
