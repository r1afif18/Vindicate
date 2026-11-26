import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 0x1234…abcd */
export function shortAddress(address: string, chars = 4) {
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}
