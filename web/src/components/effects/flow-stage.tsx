"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef } from "react"

const ShaderBackdrop = dynamic(
  () => import("@/components/effects/shader-backdrop").then((m) => m.ShaderBackdrop),
  { ssr: false },
)

// A field of hair-thin lines that bend over slow dunes, lit from one side. The lines are the
// stripes of one coordinate pushed around by a height field, so they flow without any geometry.
const FLOW = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_time;
uniform float u_scroll;
uniform vec3 u_tint;
uniform vec3 u_base;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  p.y += u_scroll * 0.1;
  float t = u_time * 0.022;

  // Dunes: one warped noise field, sampled three times to get its slope.
  vec2 q = p * vec2(0.8, 1.3);
  q += 0.6 * vec2(fbm(q * 0.9 + vec2(0.0, t)), fbm(q * 0.9 + vec2(5.2, -t)));
  vec2 drift = vec2(t * 0.5, 0.0);
  float e = 0.02;
  float h = fbm(q * 1.2 + drift);
  float hx = fbm((q + vec2(e, 0.0)) * 1.2 + drift) - h;
  float hy = fbm((q + vec2(0.0, e)) * 1.2 + drift) - h;
  float light = clamp(0.5 + (hx - hy * 1.3) / e * 0.42, 0.0, 1.0);

  // Parallel lines about five pixels apart, each pushed sideways by the height under it, the
  // way straight threads look when laid over dunes. The push is kept small, so the lines stay
  // threads and never close into contour rings.
  float freq = u_res.y / 5.0;
  float bend = 0.46;
  float s = fract((p.x + p.y * 0.18 + h * bend) * freq);
  float line = smoothstep(0.0, 0.34, s) * smoothstep(1.0, 0.6, s);
  float density = abs(1.0 + bend * hx / e * 0.8) * freq / u_res.y;
  line = mix(line, 0.4, smoothstep(0.3, 0.5, density));

  // One side of every dune catches the light, the other falls into shadow.
  float ridge = pow(light, 1.7);
  float body = smoothstep(0.2, 0.7, h);
  float vignette = smoothstep(1.45, 0.25, length(p * vec2(0.65, 1.05)));
  vec3 color = u_base + u_tint * (line * (0.05 + 1.05 * ridge * (0.3 + 0.7 * body)) + ridge * body * 0.1) * vignette;
  color += (hash(gl_FragCoord.xy + fract(u_time) * 61.0) - 0.5) * 0.028;
  gl_FragColor = vec4(color, 1.0);
}
`

/**
 * The landing page's fixed stage: one moving field behind every section. A shade deepens as the
 * page scrolls, so the hero shows the field at full strength and the sections after it read
 * clearly on top of a dimmed one.
 */
export function FlowStage({ shade: fixedShade }: { shade?: number }) {
  const shade = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // A page that sets its own shade (the app) keeps it; only the landing page ties it to scroll.
    if (fixedShade !== undefined) return
    const update = () => {
      const depth = Math.min(1, window.scrollY / (window.innerHeight * 0.85))
      if (shade.current) shade.current.style.opacity = String(0.1 + depth * 0.68)
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [fixedShade])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <ShaderBackdrop fragment={FLOW} maxDpr={1.25} fps={30} className="absolute inset-0" />
      <div
        ref={shade}
        className="absolute inset-0 bg-background"
        style={{ opacity: fixedShade ?? 0.1 }}
      />
    </div>
  )
}
