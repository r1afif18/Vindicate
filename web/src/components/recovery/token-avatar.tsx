import { cn } from "@/lib/utils"

/** Monogram for a token. We do not fetch remote logos: they are untrusted and blocked by the CSP. */
export function TokenAvatar({ symbol, className }: { symbol: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full border border-border bg-accent text-xs font-semibold text-accent-foreground",
        className,
      )}
    >
      {symbol.slice(0, 3).toUpperCase()}
    </span>
  )
}
