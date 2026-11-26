"use client"

import { useMotionValueEvent, useScroll } from "motion/react"
import { type ReactNode, useRef, useState } from "react"

export interface PinnedStep {
  title: string
  body: string
}

// Heights of the bars along the bottom, as a share of their track. Fixed, so the server and the
// browser draw the same thing.
const BARS = [
  18, 26, 22, 34, 30, 46, 40, 58, 52, 70, 62, 84, 74, 96, 80, 100, 82, 92, 70, 78, 58, 64, 46, 50,
  36, 40, 28, 30, 20, 22, 14,
]

/**
 * Steps that hold the screen while the page scrolls through them: the section is several
 * viewports tall, its content sticks, and the scroll position picks which step is shown.
 * Wide screens only. Narrow ones get a plain list from the caller.
 */
export function PinnedSteps({
  heading,
  steps,
}: {
  heading: ReactNode
  steps: readonly PinnedStep[]
}) {
  const track = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] })
  const [progress, setProgress] = useState(0)
  useMotionValueEvent(scrollYProgress, "change", setProgress)
  const active = Math.min(steps.length - 1, Math.floor(progress * steps.length))

  return (
    <div ref={track} style={{ height: `${steps.length * 85}svh` }} className="relative">
      <div className="sticky top-0 flex h-svh flex-col items-center overflow-hidden px-8 pt-28 text-center">
        <h2 className="font-flow text-3xl leading-none text-balance text-muted-foreground">
          {heading}
        </h2>
        <div className="relative mt-16 w-full max-w-md flex-1">
          {steps.map((step, i) => (
            <div
              key={step.title}
              aria-hidden={i !== active}
              className="absolute inset-x-0 top-0 grid justify-items-center gap-5 transition duration-500 ease-out"
              style={{
                opacity: i === active ? 1 : 0,
                transform: `translateY(${i === active ? 0 : i < active ? -18 : 18}px)`,
              }}
            >
              <span className="font-flow text-display leading-none tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="inline-flex border border-foreground/70 px-1.5 py-0.5 text-sm font-medium">
                {step.title}
              </span>
              <p className="max-w-xs text-pretty text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
        <div
          aria-hidden="true"
          // A fifth of the screen, and not at all on a short one, where they would run into the text.
          className="absolute inset-x-0 bottom-0 flex h-[20svh] items-end justify-center gap-6 [@media(max-height:760px)]:hidden"
        >
          {BARS.map((height, i) => {
            const lit = i / (BARS.length - 1) <= progress
            return (
              <span
                // The bars never reorder, so their position is a stable key.
                key={i}
                className="w-px bg-foreground transition-opacity duration-300"
                style={{ height: `${height}%`, opacity: lit ? 0.85 : 0.14 }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
