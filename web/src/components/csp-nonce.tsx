"use client"

import { setNonce } from "get-nonce"

/**
 * Hands the per-request CSP nonce to libraries that inject <style> tags at runtime
 * (Radix scroll lock uses react-style-singleton, which reads it via get-nonce).
 * Runs during render so the nonce is set before any dialog or menu opens.
 */
export function CspNonce({ nonce }: { nonce: string | undefined }) {
  if (nonce) setNonce(nonce)
  return null
}
