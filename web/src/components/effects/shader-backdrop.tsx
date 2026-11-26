"use client"

import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

const VERTEX = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`

// Slow aurora: fractal noise bent into a band of brand light, faded at the edges.
const FRAGMENT = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
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
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.05;
  float n = fbm(p * 1.8 + vec2(t, -t * 0.7));
  float curve = p.y - 0.18 + 0.22 * sin(p.x * 1.6 + t * 2.0) + (n - 0.5) * 0.5;
  float band = smoothstep(0.42, 0.0, abs(curve));
  float haze = pow(n, 3.0) * 0.35;
  float vignette = smoothstep(1.25, 0.15, length(p * vec2(0.75, 1.3)));
  vec3 color = u_base + u_tint * (band * 0.32 + haze * 0.25) * vignette;
  gl_FragColor = vec4(color, 1.0);
}
`

function readColor(name: string): [number, number, number] {
  const hex = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
    .replace("#", "")
  const value = Number.parseInt(hex.length === 3 ? hex.replace(/./g, "$&$&") : hex, 16)
  if (Number.isNaN(value)) return [0, 0, 0]
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
}

/**
 * WebGL backdrop tinted from the theme tokens (--primary, --background). Pauses when offscreen or
 * in a hidden tab, renders one still frame under reduced motion, and falls back to nothing
 * when WebGL is unavailable.
 */
export function ShaderBackdrop({
  className,
  fragment = FRAGMENT,
  maxDpr = 1.5,
  fps = 60,
}: {
  className?: string
  /** A fragment shader with the same uniforms. `u_scroll` is the scroll position in viewports. */
  fragment?: string
  maxDpr?: number
  fps?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas?.getContext("webgl", { antialias: false, premultipliedAlpha: false })
    if (!canvas || !gl || gl.isContextLost()) {
      if (canvas) canvas.dataset.lost = "true"
      return
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragment)
    const program = gl.createProgram()
    if (!vs || !fs || !program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, "a_position")
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(program, "u_res")
    const uTime = gl.getUniformLocation(program, "u_time")
    const uScroll = gl.getUniformLocation(program, "u_scroll")
    gl.uniform3fv(gl.getUniformLocation(program, "u_tint"), readColor("--primary"))
    gl.uniform3fv(gl.getUniformLocation(program, "u_base"), readColor("--background"))

    let frame = 0
    // A lost context paints as a blank canvas; hide it and let the page background show.
    const onLost = () => {
      canvas.dataset.lost = "true"
      cancelAnimationFrame(frame)
    }
    canvas.addEventListener("webglcontextlost", onLost)

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let visible = true
    const started = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, maxDpr)
      canvas.width = Math.floor(canvas.clientWidth * dpr)
      canvas.height = Math.floor(canvas.clientHeight * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(uRes, canvas.width, canvas.height)
    }
    let last = -Infinity
    const draw = (now: number) => {
      // A slow field does not need every frame: skipping some saves the battery.
      if (reduce || now - last >= 1000 / fps - 1) {
        last = now
        gl.uniform1f(uTime, reduce ? 12 : (now - started) / 1000)
        gl.uniform1f(uScroll, window.scrollY / Math.max(window.innerHeight, 1))
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
      if (!reduce && visible && !document.hidden) frame = requestAnimationFrame(draw)
    }
    const resume = () => {
      cancelAnimationFrame(frame)
      last = -Infinity
      frame = requestAnimationFrame(draw)
    }

    resize()
    resume()
    const resizeObserver = new ResizeObserver(() => {
      resize()
      if (reduce) resume()
    })
    resizeObserver.observe(canvas)
    const intersection = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting)
      if (visible) resume()
    })
    intersection.observe(canvas)
    document.addEventListener("visibilitychange", resume)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersection.disconnect()
      document.removeEventListener("visibilitychange", resume)
      // Free resources but keep the context: StrictMode re-runs this effect on the same canvas.
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      canvas.removeEventListener("webglcontextlost", onLost)
    }
  }, [fragment, maxDpr, fps])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none block size-full data-[lost=true]:hidden", className)}
    />
  )
}
