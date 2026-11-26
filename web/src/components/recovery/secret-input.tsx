"use client"

import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { Input } from "@/components/ui/input"

interface SecretInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  placeholder?: string
}

/**
 * Private key field. Hidden by default, and opted out of autofill, spellcheck and
 * password managers so the key is not stored or sent to a dictionary service.
 */
export function SecretInput({ id, value, onChange, invalid, placeholder }: SecretInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-message`}
        font="mono"
        adornment="end"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide key" : "Show key"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-10 cursor-pointer place-items-center rounded-r-md text-muted-foreground transition-colors duration-quick hover:text-foreground"
      >
        {visible ? <EyeSlashIcon className="size-4.5" /> : <EyeIcon className="size-4.5" />}
      </button>
    </div>
  )
}
