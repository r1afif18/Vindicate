"use client"

import { KeyIcon, LockKeyIcon } from "@phosphor-icons/react"
import { type FormEvent, useState } from "react"
import type { Hex } from "viem"

import { SecretInput } from "@/components/recovery/secret-input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Notice } from "@/components/ui/notice"
import { normalizePrivateKey } from "@/lib/keys"

interface KeyFieldProps {
  /** What the key belongs to, e.g. "compromised wallet". Used in labels. */
  subject: string
  value: Hex | null
  onSubmit: (key: Hex) => void
  onClear: () => void
  disabled?: boolean
  note: string
}

/**
 * Private keys only enter through a dedicated form in a dialog. Once submitted, the typed text is
 * dropped from component state and the key is only ever shown masked to its last four characters.
 */
export function KeyField({ subject, value, onSubmit, onClear, disabled, note }: KeyFieldProps) {
  const [open, setOpen] = useState(false)

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 border border-border bg-background px-3 py-2.5">
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <LockKeyIcon weight="fill" className="size-4 shrink-0 text-primary" />
          <span
            className="truncate font-mono text-sm tracking-widest text-muted-foreground"
            aria-label={`Key for the ${subject}, hidden`}
          >
            •••• •••• •••• {value.slice(-4)}
          </span>
        </span>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onClear}>
          Replace
        </Button>
      </div>
    )
  }

  return (
    <>
      <Button variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        <KeyIcon />
        Enter the {subject} key
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <DialogContent
            title={`${subject[0]?.toUpperCase()}${subject.slice(1)} private key`}
            description={note}
          >
            <KeyForm
              subject={subject}
              onDone={(key) => {
                onSubmit(key)
                setOpen(false)
              }}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}

function KeyForm({ subject, onDone }: { subject: string; onDone: (key: Hex) => void }) {
  const [text, setText] = useState("")
  const [touched, setTouched] = useState(false)
  const key = normalizePrivateKey(text)
  const error =
    touched && !key
      ? "A private key is 64 hex characters, with or without 0x. Seed phrases are not accepted."
      : null

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!key) return
    setText("")
    onDone(key)
  }

  return (
    <form onSubmit={submit} autoComplete="off" className="grid gap-5" noValidate>
      <Field id={`key-${subject}`} label="Private key" error={error}>
        <SecretInput
          id={`key-${subject}`}
          value={text}
          invalid={Boolean(error)}
          placeholder="0x…"
          onChange={(v) => setText(v)}
        />
      </Field>
      <Notice title="Stays in this tab">
        Held in memory only, never stored or sent. Closing or refreshing the tab clears it. Check
        that the address bar shows the official Vindicate domain before you continue.
      </Notice>
      <Button type="submit" size="lg">
        Use this key
      </Button>
    </form>
  )
}
