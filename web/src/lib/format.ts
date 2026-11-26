import { formatUnits } from "viem"

/** Human amount with at most `max` fraction digits, never in scientific notation. */
export function formatAmount(value: bigint, decimals: number, max = 6) {
  const [whole = "0", fraction = ""] = formatUnits(value, decimals).split(".")
  const trimmed = fraction.slice(0, max).replace(/0+$/, "")
  const grouped = BigInt(whole).toLocaleString("en-US")
  if (trimmed) return `${grouped}.${trimmed}`
  return value > 0n && whole === "0" ? `<0.${"0".repeat(max - 1)}1` : grouped
}
