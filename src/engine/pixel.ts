// 像素缓冲区：低分辨率绘图 + 彩色点光源 + Bayer 抖动量化（与概念图同一套画法）
export type RGB = [number, number, number];

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
export const bayer = (x: number, y: number) => (BAYER4[y & 3][x & 3] + 0.5) / 16;

const hexCache = new Map<string, RGB>();
export function hex(h: string): RGB {
  let c = hexCache.get(h);
  if (!c) {
    const n = parseInt(h.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexCache.set(h, c);
  }
  return c;
}
export const shade = (c: RGB, f: number): RGB => [
  Math.max(0, Math.min(255, Math.round(c[0] * f))),
  Math.max(0, Math.min(255, Math.round(c[1] * f))),
  Math.max(0, Math.min(255, Math.round(c[2] * f))),
];

export class Buf {
  w: number; h: number;
  c: Uint8ClampedArray;
  light: Float32Array; lr: Float32Array; lg: Float32Array; lb: Float32Array;
  emit: Uint8Array;
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.c = new Uint8ClampedArray(w * h * 3);
    this.light = new Float32Array(w * h);
    this.lr = new Float32Array(w * h);
    this.lg = new Float32Array(w * h);
    this.lb = new Float32Array(w * h);
    this.emit = new Uint8Array(w * h);
  }
  copyFrom(o: Buf) { this.c.set(o.c); this.emit.set(o.emit); }
  copyLight(o: Buf) { this.light.set(o.light); this.lr.set(o.lr); this.lg.set(o.lg); this.lb.set(o.lb); }
  set(x: number, y: number, col: RGB) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.c[i] = col[0]; this.c[i + 1] = col[1]; this.c[i + 2] = col[2];
  }
  get(x: number, y: number): RGB {
    const i = (y * this.w + x) * 3;
    return [this.c[i], this.c[i + 1], this.c[i + 2]];
  }
  glow(x: number, y: number) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.emit[(y | 0) * this.w + (x | 0)] = 1; }
  rect(x: number, y: number, w: number, h: number, col: RGB) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col);
  }
  rectGlow(x: number, y: number, w: number, h: number, col: RGB) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { this.set(x + i, y + j, col); this.glow(x + i, y + j); }
  }
  hline(x: number, y: number, w: number, col: RGB) { this.rect(x, y, w, 1, col); }
  vline(x: number, y: number, h: number, col: RGB) { this.rect(x, y, 1, h, col); }
  vramp(x: number, y: number, w: number, h: number, cols: RGB[]) {
    const n = cols.length - 1;
    for (let j = 0; j < h; j++) {
      const t = (j / Math.max(1, h - 1)) * n;
      const k = Math.min(n - 1, Math.floor(t));
      const f = t - k;
      for (let i = 0; i < w; i++) this.set(x + i, y + j, f > bayer(x + i, y + j) ? cols[k + 1] : cols[k]);
    }
  }
  dither(x: number, y: number, w: number, h: number, col: RGB, density: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (bayer(x + i, y + j) < density) this.set(x + i, y + j, col);
  }
  line(x0: number, y0: number, x1: number, y1: number, col: RGB) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, col: RGB) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++)
      if ((x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5) <= 1) this.set(cx + x, cy + y, col);
  }
  clearLight(amb: number) { this.light.fill(amb); this.lr.fill(0); this.lg.fill(0); this.lb.fill(0); }
  addLight(cx: number, cy: number, radius: number, col: RGB, intensity = 1, clip: number[] | null = null, cone: [number, number] | null = null) {
    const [r, g, b] = col;
    const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(this.w - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(this.h - 1, Math.ceil(cy + radius));
    const cr = r / 255, cg = g / 255, cb = b / 255;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (clip && (x < clip[0] || y < clip[1] || x >= clip[0] + clip[2] || y >= clip[1] + clip[3])) continue;
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / radius;
      if (d >= 1) continue;
      let f = (1 - d) * (1 - d) * intensity;
      if (cone) {
        const a = Math.atan2(dy, dx);
        let da = Math.abs(a - cone[0]); if (da > Math.PI) da = 2 * Math.PI - da;
        if (da > cone[1]) continue;
        f *= 1 - (da / cone[1]) * 0.6;
      }
      const i = y * this.w + x;
      this.light[i] += f;
      this.lr[i] += f * cr; this.lg[i] += f * cg; this.lb[i] += f * cb;
    }
  }
  // 光照量化 + 抖动，写入 ImageData
  shadeInto(img: ImageData, levels = 8, tint: [number, number, number] = [0.5, 0.58, 0.85], raw = false) {
    const d = img.data, W = this.w, Hh = this.h;
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let r = this.c[i * 3], g = this.c[i * 3 + 1], b = this.c[i * 3 + 2];
      if (!raw && !this.emit[i]) {
        const Lr = this.light[i];
        let L = Lr > 1.25 ? 1.25 : Lr;
        const q = L * levels;
        const k = Math.floor(q);
        L = (q - k > bayer(x, y) ? k + 1 : k) / levels;
        const tot = Lr + 1e-4;
        const cr = this.lr[i] / tot, cg = this.lg[i] / tot, cb = this.lb[i] / tot;
        const w = Lr * 1.4 > 1 ? 1 : Lr * 1.4;
        const mr = tint[0] * (1 - w) + (0.5 + cr * 0.7) * w;
        const mg = tint[1] * (1 - w) + (0.5 + cg * 0.7) * w;
        const mb = tint[2] * (1 - w) + (0.5 + cb * 0.7) * w;
        r = r * L * mr * 1.25; g = g * L * mg * 1.25; b = b * L * mb * 1.25;
      }
      const o = i * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  toCanvas(opts: { levels?: number; tint?: [number, number, number]; raw?: boolean } = {}): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    this.shadeInto(img, opts.levels, opts.tint, opts.raw);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}
