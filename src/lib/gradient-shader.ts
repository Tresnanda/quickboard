// A flow-gradient shader, baked once per (seed, tint) to a cached image. One shared
// WebGL context renders every gradient — so the cards show a plain static
// background-image (no per-card GL context, no resize repaint cost), while still
// getting real per-pixel noise domain-warping that CSS radial blobs can't. Custom
// (no dependency) on purpose. Falls back to a CSS string if WebGL is unavailable.

export type RGB = [number, number, number];

const W = 320;
const H = 224;

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// iq-style fractal domain warping: warp the field twice, then blend four colors by
// the warped coordinates → organic flowing bands with near-white edges.
const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform vec3 u_deep, u_mid, u_glow, u_edge;
uniform float u_seed, u_flip;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = v_uv;
  uv.x *= u_flip;
  uv = uv * 1.5 + u_seed;
  // domain-warped flow → smooth multi-hue color (the shadergradient-style mesh)
  vec2 q = vec2(fbm(uv), fbm(uv + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(uv + 2.2 * q + vec2(1.7, 9.2)), fbm(uv + 2.2 * q + vec2(8.3, 2.8)));
  float f = fbm(uv + 2.6 * r);
  vec3 col = mix(u_mid, u_deep, smoothstep(0.24, 0.95, f));
  col = mix(col, u_glow, smoothstep(0.30, 0.98, r.x));
  col = mix(col, u_edge, smoothstep(0.36, 1.0, q.y));
  // gentle luminous sheen only — no slope lighting (that read as brushed metal)
  float sheen = smoothstep(0.72, 1.08, f * 0.55 + r.x * 0.5 + q.y * 0.2);
  col += sheen * 0.06;
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;

type GL = WebGLRenderingContext;

let tried = false;
let gl: GL | null = null;
let program: WebGLProgram | null = null;
let canvas: HTMLCanvasElement | null = null;
let uni: Record<string, WebGLUniformLocation | null> = {};
const cache = new Map<string, string>();

function compile(g: GL, type: number, src: string): WebGLShader | null {
  const sh = g.createShader(type);
  if (!sh) return null;
  g.shaderSource(sh, src);
  g.compileShader(sh);
  if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) return null;
  return sh;
}

function init() {
  if (tried) return;
  tried = true;
  if (typeof document === "undefined") return;
  try {
    canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const opts: WebGLContextAttributes = { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false, depth: false };
    const ctx = (canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts)) as GL | null;
    if (!ctx) return;
    ctx.getExtension("OES_standard_derivatives"); // dFdx/dFdy for the slope lighting
    const vs = compile(ctx, ctx.VERTEX_SHADER, VERT);
    const fs = compile(ctx, ctx.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = ctx.createProgram();
    if (!prog) return;
    ctx.attachShader(prog, vs);
    ctx.attachShader(prog, fs);
    ctx.linkProgram(prog);
    if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) return;
    ctx.useProgram(prog);
    const buf = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
    // one oversized triangle covers the viewport
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
    const loc = ctx.getAttribLocation(prog, "a_pos");
    ctx.enableVertexAttribArray(loc);
    ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);
    uni = {
      deep: ctx.getUniformLocation(prog, "u_deep"),
      mid: ctx.getUniformLocation(prog, "u_mid"),
      glow: ctx.getUniformLocation(prog, "u_glow"),
      edge: ctx.getUniformLocation(prog, "u_edge"),
      seed: ctx.getUniformLocation(prog, "u_seed"),
      flip: ctx.getUniformLocation(prog, "u_flip"),
    };
    ctx.viewport(0, 0, W, H);
    gl = ctx;
    program = prog;
  } catch {
    gl = null;
  }
}

/**
 * Bake a flow gradient to a cached `url(...) center / cover` background value.
 * Returns null if WebGL is unavailable (caller falls back to a CSS gradient).
 */
export function bakeCover(key: string, deep: RGB, mid: RGB, glow: RGB, edge: RGB, seed: number, flip: number): string | null {
  const hit = cache.get(key);
  if (hit) return hit;
  init();
  if (!gl || !program || !canvas) return null;
  try {
    gl.useProgram(program);
    gl.uniform3fv(uni.deep, deep);
    gl.uniform3fv(uni.mid, mid);
    gl.uniform3fv(uni.glow, glow);
    gl.uniform3fv(uni.edge, edge);
    gl.uniform1f(uni.seed, seed);
    gl.uniform1f(uni.flip, flip);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const url = `url("${canvas.toDataURL("image/png")}") center / cover no-repeat`;
    cache.set(key, url);
    return url;
  } catch {
    return null;
  }
}
