import { cn } from "@/lib/utils"

/** Vector trace of the Vindicate mark: a hexagonal shield split by an upward arrow. */
export const LOGO_PATHS = [
  // Arrow, shaft and lower shield.
  "M487 988 771 1152 638 1229 897 1378V687H760L966 347 1172 687H1035V1378L1294 1229 1161 1152 1445 988V1307L966 1586 487 1307Z",
  // Left prong.
  "M487 629 651 535V742L812 835V1067L716 956 487 826Z",
  // Right prong.
  "M1445 629 1281 535V742L1120 835V1067L1216 956 1445 826Z",
] as const

export const LOGO_VIEWBOX = "487 347 958 1239"

export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("fill-primary", className)}
    >
      {LOGO_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

/** The mark alone, labelled for screen readers. Used in navigation. */
export function Logo({ className }: { className?: string }) {
  return <LogoMark title="Vindicate" className={cn("h-8 w-auto", className)} />
}
