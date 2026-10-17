// 可序列化的随机数：状态存在 world 里，存档读档后结果一致
export interface RngState { s: number }

export function makeRng(seed: number): RngState {
  return { s: (seed >>> 0) || 0x9e3779b9 };
}

export function rnd(r: RngState): number {
  // mulberry32
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rint = (r: RngState, a: number, b: number) => a + Math.floor(rnd(r) * (b - a + 1));
export const chance = (r: RngState, p: number) => rnd(r) < p;
export function pick<T>(r: RngState, arr: readonly T[]): T { return arr[Math.floor(rnd(r) * arr.length)]; }
export function shuffle<T>(r: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd(r) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
export function weighted<T>(r: RngState, items: readonly [T, number][]): T {
  const tot = items.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let x = rnd(r) * tot;
  for (const [v, w] of items) { x -= Math.max(0, w); if (x <= 0) return v; }
  return items[items.length - 1][0];
}

// 仅用于美术的确定性随机（不进存档）
export function artRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
