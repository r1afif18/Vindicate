"use client"

import { useEffect, useState } from "react"

import { LogoMark } from "@/components/brand/logo"

const COUNT_MS = 1_700
const LIFT_MS = 2_700

// Set once the curtain has lifted in this page load. Coming back to the landing page from the app
// is a client navigation, and it should not replay.
let played = false

/**
 * A short curtain over the landing page while the stage starts. It is pure decoration: it never
 * blocks a click (the header and its link to the app sit above it), and it lifts by a CSS
 * animation, so it also lifts with JavaScript off or reduced motion on.
 */
export function Preloader() {
  const [show] = useState(() => !played)
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    // The hero's text waits for the curtain. Once it has lifted, that wait is switched off.
    const entered = () => {
      played = true
      document.documentElement.dataset.entered = "true"
    }
    if (!show) {
      entered()
      return
    }
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - started) / COUNT_MS)
      setPercent(Math.round(100 * (1 - (1 - k) ** 3)))
      if (k < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const lifted = setTimeout(entered, LIFT_MS)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(lifted)
      // Leaving before it lifted still counts as having seen it.
      entered()
    }
  }, [show])

  if (!show) return null
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 grid animate-preloader-out place-items-center bg-background"
    >
      <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <span className="relative grid size-24 place-items-center bg-background">
        <LogoMark className="h-14 w-auto" />
      </span>
      <span className="absolute bottom-6 left-5 font-flow text-4xl tabular-nums md:left-8">
        {String(percent).padStart(3, "0")}%
      </span>
    </div>
  )
}
