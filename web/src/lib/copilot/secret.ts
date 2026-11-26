/**
 * True when free text holds 64 hex characters in a row: the shape of a private key. A transaction
 * hash has it too, and is refused all the same, because the two cannot be told apart and only one
 * of them is safe to send.
 */
export function looksLikeSecret(text: string) {
  return /[0-9a-fA-F]{64}/.test(text)
}
