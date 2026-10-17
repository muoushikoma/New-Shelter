// 角色美术：场景小人（约 10×20）与 40×48 半身像，沿用概念图初版画风
import { Buf, RGB, hex, shade, bayer } from '../engine/pixel';

export type SkinKey = 'pale' | 'warm' | 'tan';
export type HairStyle = 'short' | 'receding' | 'shaved' | 'cap' | 'tied' | 'bun' | 'wavy' | 'long' | 'bald';
export interface Look {
  skin: SkinKey; hair: string; style: HairStyle; coat: string; pants: string;
  male: boolean; heavy?: boolean; glasses?: boolean; scarf?: string; earring?: boolean;
  scar?: boolean; stubble?: boolean; grey?: boolean; smudge?: boolean; cap?: string; bandage?: boolean;
}

export const SKIN: Record<SkinKey, RGB[]> = {
  pale: [hex('#f1d3bd'), hex('#d9ae95'), hex('#a97a68'), hex('#6e4a44')],
  warm: [hex('#e8bf9a'), hex('#c9946f'), hex('#96644d'), hex('#5e3b33')],
  tan: [hex('#d3a07a'), hex('#ad7a58'), hex('#7d5240'), hex('#4b302a')],
};

export type Pose = 'stand' | 'walk' | 'work' | 'sit' | 'lie' | 'crouch';

// (x, y) 为脚底中心；frame 用于走路动画
export function person(b: Buf, x: number, y: number, p: Look, pose: Pose = 'stand', facing = 1, frame = 0, blanket?: RGB) {
  const sk = SKIN[p.skin];
  const coat = hex(p.coat), coatD = shade(coat, 0.7), coatL = shade(coat, 1.18);
  const pants = hex(p.pants), pantsD = shade(pants, 0.7);
  const hair = hex(p.hair), hairD = shade(hair, 0.7);
  const boot = hex('#1b1714');
  const f = facing >= 0 ? 1 : -1;
  const wide = p.heavy ? 1 : 0;
  x = Math.round(x); y = Math.round(y);

  const head = (hx: number, hy: number) => {
    b.rect(hx - 2, hy + 1, 5, 4, sk[1]);
    b.rect(hx - 1, hy + 1, 3, 3, sk[0]);
    b.rect(hx - 1, hy + 5, 3, 1, sk[2]);
    b.set(hx + f * 2, hy + 4, sk[2]);
    b.set(hx + f * 1, hy + 3, hex('#1a1214'));
    const hs = p.style;
    if (hs === 'shaved' || hs === 'bald') { b.rect(hx - 2, hy, 5, 1, sk[2]); if (hs === 'shaved') b.dither(hx - 2, hy, 5, 2, hairD, 0.5); else { b.set(hx - f * 2, hy + 1, hair); b.set(hx - f * 2, hy + 2, hair); } }
    else if (hs === 'receding') { b.rect(hx - 2, hy, 5, 1, sk[1]); b.set(hx - f * 2, hy + 1, hair); b.set(hx - f * 2, hy + 2, hair); b.hline(hx - 1, hy, 3, hair); }
    else if (hs === 'cap') { const c = hex(p.cap || '#2f3a48'); b.rect(hx - 2, hy - 1, 5, 2, c); b.rect(hx + (f > 0 ? 1 : -3), hy + 1, 3, 1, shade(c, 0.7)); b.set(hx - f * 2, hy + 2, hair); }
    else {
      b.rect(hx - 2, hy, 5, 1, hair); b.rect(hx - 2, hy - 1, 4, 1, hair);
      b.set(hx - f * 2, hy + 1, hair); b.set(hx - f * 2, hy + 2, hair);
      b.set(hx - f * 1, hy + 1, hair);
      if (hs === 'tied' || hs === 'bun') { b.rect(hx - f * 3, hy, 1, 2, hairD); b.set(hx - f * 3, hy - 1, hair); }
      if (hs === 'wavy' || hs === 'long') { b.rect(hx - f * 2, hy + 1, 1, 6, hair); b.rect(hx - f * 3, hy + 1, 1, 5, hairD); b.set(hx + f * 2, hy + 1, hair); }
    }
    if (p.glasses) { b.set(hx + f, hy + 3, hex('#b8c4c8')); b.set(hx + f * 2, hy + 3, hex('#6f7a80')); }
    if (p.bandage) { b.hline(hx - 2, hy + 1, 5, hex('#d8d2c4')); b.set(hx, hy + 1, hex('#8a2a24')); }
    if (p.earring) b.set(hx - f, hy + 5, hex('#e0c060'));
    if (p.grey) b.set(hx, hy - 1, hex('#a49c94'));
  };

  if (pose === 'stand' || pose === 'work' || pose === 'walk') {
    const bob = pose === 'walk' && frame % 2 === 1 ? 1 : 0;
    const top = y - 20 + bob;
    head(x, top);
    b.set(x, top + 6, sk[2]);
    b.rect(x - 3 - wide, top + 7, 7 + wide * 2, 7, coat);
    b.rect(x - 3 - wide, top + 7, 7 + wide * 2, 1, coatL);
    b.rect(x + (f > 0 ? -3 - wide : 3 + wide), top + 8, 1, 6, coatD);
    if (p.scarf) { const sc = hex(p.scarf); b.rect(x - 2, top + 7, 5, 2, sc); b.set(x - f * 1, top + 9, sc); }
    b.hline(x - 3 - wide, top + 13, 7 + wide * 2, coatD);
    if (pose === 'work') {
      b.rect(x + f * 3, top + 8, 1, 3, coatD);
      b.rect(x + (f > 0 ? 4 : -5), top + 10, 2, 1, coatD);
      b.set(x + f * 5, top + 10, sk[1]); b.set(x + f * 6, top + (frame % 2 ? 9 : 10), sk[1]);
    } else {
      b.set(x + f * (3 + wide), top + 13, sk[1]);
      b.set(x - f * (3 + wide), top + 13, sk[2]);
    }
    if (pose === 'walk') {
      const ph = frame % 4;
      const l1 = ph === 1 ? -1 : ph === 3 ? 1 : 0;
      b.rect(x - 2 + l1, top + 14, 2, 5 - bob, pants); b.rect(x + 1 - l1, top + 14, 2, 5 - bob, pantsD);
      b.rect(x - 2 + l1, y - 1 + 0, 2, 1, boot); b.rect(x + 1 - l1, y - 1, 2, 1, boot);
    } else {
      b.rect(x - 2, top + 14, 2, 5, pants); b.rect(x + 1, top + 14, 2, 5, pantsD);
      b.set(x, top + 14, pantsD);
      b.rect(x - 2, top + 19, 2, 1, boot); b.rect(x + 1, top + 19, 2, 1, boot);
      b.set(x + f * 2 + (f > 0 ? 1 : -1), top + 19, boot);
    }
  } else if (pose === 'sit') {
    const top = y - 15;
    head(x, top);
    b.set(x, top + 6, sk[2]);
    b.rect(x - 3 - wide, top + 7, 7 + wide * 2, 6, coat);
    b.rect(x - 3 - wide, top + 7, 7 + wide * 2, 1, coatL);
    b.rect(x - f * (3 + wide), top + 8, 1, 5, coatD);
    if (p.scarf) b.rect(x - 2, top + 7, 5, 2, hex(p.scarf));
    b.rect(x + (f > 0 ? -1 : -4), top + 12, 6, 2, pants);
    b.rect(x + (f > 0 ? 3 : -4), top + 12, 2, 1, pantsD);
    b.rect(x + (f > 0 ? 3 : -4), top + 14, 2, 3, pantsD);
    b.rect(x + (f > 0 ? 3 : -5), top + 17, 3, 1, boot);
    b.set(x + f * 3, top + 11, sk[1]);
  } else if (pose === 'lie') {
    const hy = y - 5, hx = x;
    b.rect(hx - 2, hy, 4, 5, sk[1]); b.rect(hx - 1, hy + 1, 2, 2, sk[0]);
    b.rect(hx - 2 - (f > 0 ? 1 : -4), hy, 2, 5, hair);
    if (p.bandage) b.vline(hx, hy, 5, hex('#d8d2c4'));
    const bl = blanket || hex('#56604e');
    const bx = f > 0 ? hx + 2 : hx - 18;
    b.rect(bx, hy - 1, 16, 6, bl);
    b.hline(bx, hy - 1, 16, shade(bl, 1.2));
    b.rect(bx + (f > 0 ? 12 : 0), hy - 2, 4, 1, shade(bl, 0.8));
  } else if (pose === 'crouch') {
    const top = y - 14;
    head(x + f, top);
    b.rect(x - 3, top + 6, 7, 5, coat);
    b.rect(x - 3, top + 6, 7, 1, coatL);
    b.rect(x - 2, top + 11, 6, 2, pants);
    b.rect(x - 3, top + 13, 3, 1, boot); b.rect(x + 2, top + 13, 3, 1, boot);
    b.set(x + f * 4, top + 9, sk[1]);
  }
}

export function silhouette(b: Buf, x: number, y: number, col: RGB, pose: 'sit' | 'stand' = 'sit', facing = 1, long = false) {
  const top = pose === 'sit' ? y - 15 : y - 20;
  b.rect(x - 2, top, 5, 6, col);
  if (long) b.rect(x - facing * 3, top + 1, 1, 6, col);
  b.rect(x - 3, top + 6, 7, pose === 'sit' ? 7 : 8, col);
  if (pose === 'sit') b.rect(x + (facing > 0 ? -1 : -4), top + 12, 6, 2, col);
  else b.rect(x - 2, top + 14, 5, 6, col);
}

// ---------- 40×48 半身像 ----------
export function portrait(b: Buf, ox: number, oy: number, p: Look & { age?: number }, opt: { bg?: RGB[]; rim?: boolean; noBg?: boolean } = {}) {
  const W = 40, Hh = 48;
  const sk = SKIN[p.skin];
  const cx = 20, cy = 22, rx = p.heavy ? 10 : 9, ry = 12;
  const bg = opt.bg || [hex('#1b1f26'), hex('#252b33')];
  if (!opt.noBg) for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - 14, y - 16) / 34;
    b.set(ox + x, oy + y, d < bayer(ox + x, oy + y) * 0.6 + 0.35 ? bg[1] : bg[0]);
  }
  const coat = hex(p.coat), coatD = shade(coat, 0.68), coatL = shade(coat, 1.2), coatDD = shade(coat, 0.5);
  for (let y = 36; y < Hh; y++) {
    const t = (y - 36) / 12;
    const half = Math.round(9 + t * 9 + (p.heavy ? 2 : 0));
    for (let x = cx - half; x <= cx + half; x++) {
      const s = (x - cx) / half;
      let c = coat;
      if (s > 0.5) c = bayer(ox + x, oy + y) < (s - 0.5) * 2 ? coatDD : coatD;
      else if (s < -0.6 && y < 41) c = coatL;
      b.set(ox + x, oy + y, c);
    }
  }
  for (let y = 36; y < 44; y++) { const k = (y - 36) >> 1; b.set(ox + cx - 3 - k, oy + y, coatDD); b.set(ox + cx + 3 + k, oy + y, coatDD); }
  b.rect(ox + cx - 3, oy + 31, 7, 6, sk[2]);
  b.rect(ox + cx - 3, oy + 31, 3, 4, sk[1]);
  b.rect(ox + cx - 2, oy + 36, 5, 2, sk[3]);
  if (p.scarf) {
    const sc = hex(p.scarf);
    for (let y = 34; y < 41; y++) for (let x = cx - 7; x <= cx + 7; x++) {
      const s = (x - cx) / 7;
      if (Math.abs(s) <= 1 - (y - 34) * 0.05) b.set(ox + x, oy + y, s > 0.4 ? shade(sc, 0.7) : sc);
    }
    b.hline(ox + cx - 6, oy + 34, 12, shade(sc, 1.25));
  }
  const faceW = (dy: number) => {
    const t = dy / ry;
    if (t < 0) return rx * Math.sqrt(Math.max(0, 1 - t * t));
    return rx * (1 - Math.pow(t, 1.8) * 0.62);
  };
  for (let dy = -ry; dy <= ry; dy++) {
    const w = faceW(dy);
    for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) {
      if (Math.abs(dx) > w + 0.2) continue;
      const s = dx / Math.max(1, w);
      const by = bayer(ox + cx + dx, oy + cy + dy);
      let tone = 0;
      const v = s * 0.9 + (dy > ry * 0.6 ? 0.35 : 0) + (dy < -ry * 0.6 ? 0.1 : 0);
      if (v > 0.62) tone = by < (v - 0.62) * 3 ? 3 : 2;
      else if (v > 0.15) tone = by < (v - 0.15) * 2.2 ? 2 : 1;
      else if (v > -0.35) tone = by < (v + 0.35) * 2 ? 1 : 0;
      b.set(ox + cx + dx, oy + cy + dy, sk[tone]);
    }
  }
  b.rect(ox + cx - rx - 1, oy + cy - 1, 2, 4, sk[1]); b.set(ox + cx - rx, oy + cy, sk[2]);
  b.rect(ox + cx + rx, oy + cy - 1, 2, 4, sk[3]);
  if (p.earring) { b.set(ox + cx - rx - 1, oy + cy + 4, hex('#e8cc6a')); b.set(ox + cx - rx - 1, oy + cy + 5, hex('#9a7a30')); }
  const eyeY = oy + cy - 1;
  const hairC = hex(p.hair);
  const hairD = shade(hairC, 0.6);
  const brow = p.grey ? hex('#6a625c') : hairD;
  b.hline(ox + cx - 6, eyeY - 3, 4, brow); b.hline(ox + cx + 2, eyeY - 3, 4, brow);
  if (p.male) { b.hline(ox + cx - 6, eyeY - 2, 1, brow); b.set(ox + cx + 5, eyeY - 2, brow); }
  for (const ex of [cx - 5, cx + 2]) {
    b.rect(ox + ex, eyeY, 3, 1, hex('#d8d0c8'));
    b.set(ox + ex + 1, eyeY, hex('#1a1418'));
    b.set(ox + ex + (ex < cx ? 2 : 1), eyeY, hex('#1a1418'));
    b.hline(ox + ex, eyeY - 1, 3, sk[3]);
    if (!p.male) b.set(ox + ex + (ex < cx ? -1 : 3), eyeY - 1, hex('#1a1418'));
    b.hline(ox + ex, eyeY + 1, 3, sk[2]);
  }
  if ((p.age || 0) >= 40) { b.set(ox + cx - 6, eyeY + 2, sk[2]); b.set(ox + cx + 5, eyeY + 2, sk[3]); b.set(ox + cx - 4, oy + cy + 5, sk[2]); b.set(ox + cx + 4, oy + cy + 5, sk[3]); }
  b.vline(ox + cx + 1, oy + cy + 1, 3, sk[2]);
  b.hline(ox + cx - 1, oy + cy + 4, 3, sk[2]); b.set(ox + cx + 1, oy + cy + 4, sk[3]);
  b.set(ox + cx - 1, oy + cy + 3, sk[0]);
  const lip = p.male ? sk[3] : hex('#9a4a4a');
  b.hline(ox + cx - 2, oy + cy + 7, 5, lip);
  if (!p.male) b.hline(ox + cx - 1, oy + cy + 8, 3, shade(hex('#b0605a'), 0.95));
  else b.hline(ox + cx - 1, oy + cy + 8, 3, sk[2]);
  if (p.stubble) for (let dy = 4; dy <= 11; dy++) for (let dx = -8; dx <= 8; dx++) {
    if (Math.abs(dx) > faceW(dy) - 0.5) continue;
    if (dy < 6 && Math.abs(dx) < 5) continue;
    if (((dx * 7 + dy * 13) % 3 + 3) % 3 === 0) b.set(ox + cx + dx, oy + cy + dy, shade(sk[2], 0.85));
  }
  if (p.scar) { for (let i = 0; i < 6; i++) b.set(ox + cx - 6 + i, oy + cy - 4 + i, hex('#c9867a')); b.set(ox + cx - 6, oy + cy - 4, hex('#e4a89a')); }
  if (p.smudge) b.dither(ox + cx + 3, oy + cy + 2, 4, 3, hex('#3a2e28'), 0.4);
  if (p.bandage) { b.rect(ox + cx - rx, oy + cy - 9, rx * 2 + 1, 3, hex('#d8d2c4')); b.rect(ox + cx + 3, oy + cy - 9, 3, 2, hex('#8a2a24')); }
  const hairL = shade(hairC, 1.5), hairDD = shade(hairC, 0.45);
  const hairPx = (x: number, y: number) => {
    const s = (x - cx) / 12;
    const by = bayer(ox + x, oy + y);
    let c = hairC;
    if (s > 0.35) c = by < (s - 0.35) * 2 ? hairDD : hairD;
    else if (s < -0.2 && s > -0.6 && (x + y) % 5 === 0) c = hairL;
    if (p.grey && (x * 3 + y * 7) % 4 === 0) c = hex('#a8a098');
    b.set(ox + x, oy + y, c);
  };
  const st = p.style;
  if (st === 'shaved' || st === 'bald') {
    if (st === 'shaved') for (let dy = -ry; dy <= -4; dy++) { const w = faceW(dy); for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) if (bayer(ox + cx + dx, oy + cy + dy) < 0.55) b.set(ox + cx + dx, oy + cy + dy, shade(hairC, dx > 3 ? 0.6 : 0.95)); }
    else { b.rect(ox + cx - rx - 1, oy + cy - 6, 3, 7, hairC); b.rect(ox + cx + rx - 1, oy + cy - 6, 3, 7, hairDD); }
  } else if (st === 'cap') {
    const cc = hex(p.cap || '#2f3a48');
    for (let dy = -ry - 2; dy <= -5; dy++) { const w = faceW(Math.max(-ry, dy)) + 1.5; for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) b.set(ox + cx + dx, oy + cy + dy, dx > 4 ? shade(cc, 0.7) : cc); }
    b.rect(ox + cx - 10, oy + cy - 5, 21, 2, shade(cc, 0.55));
    b.hline(ox + cx - 10, oy + cy - 5, 21, shade(cc, 1.3));
    b.rect(ox + cx - rx, oy + cy - 3, 2, 5, hairC); b.rect(ox + cx + rx - 1, oy + cy - 3, 2, 5, hairDD);
  } else {
    const hl = st === 'receding' ? -8 : -5;
    for (let dy = -ry - 2; dy <= hl; dy++) {
      const w = faceW(Math.max(-ry, dy + 1)) + 2;
      for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) {
        if (st === 'receding' && dy > -ry && Math.abs(dx) < 4) continue;
        hairPx(cx + dx, cy + dy);
      }
    }
    if (st === 'receding') {
      b.rect(ox + cx - rx - 1, oy + cy - 8, 3, 7, hairC); b.rect(ox + cx + rx - 1, oy + cy - 8, 3, 7, hairDD);
      b.dither(ox + cx - 4, oy + cy - ry, 8, 2, hairD, 0.3);
    }
    if (st === 'short') {
      b.rect(ox + cx - rx - 1, oy + cy - 6, 2, 6, hairC); b.rect(ox + cx + rx, oy + cy - 6, 2, 5, hairDD);
      for (let i = 0; i < 6; i++) hairPx(cx - 6 + i, cy - 4 - (i % 2));
    }
    if (st === 'tied' || st === 'bun') {
      for (let dx = -8; dx <= 8; dx++) if (Math.abs(dx) > 1) hairPx(cx + dx, cy - 4 - (Math.abs(dx) > 5 ? 0 : 1));
      b.rect(ox + cx - rx - 1, oy + cy - 5, 2, 8, hairC); b.rect(ox + cx + rx, oy + cy - 5, 2, 8, hairDD);
      if (st === 'bun') { for (let y = -4; y <= 3; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 14) hairPx(cx + 2 + x, cy - ry - 4 + y); }
      else { for (let y = 0; y < 14; y++) hairPx(cx + rx + 1 + (y > 6 ? 1 : 0), cy - 3 + y); for (let y = 0; y < 12; y++) hairPx(cx + rx + 2 + (y > 6 ? 1 : 0), cy - 1 + y); }
    }
    if (st === 'wavy' || st === 'long') {
      for (let dx = -9; dx <= 9; dx++) if (Math.abs(dx) > 2) hairPx(cx + dx, cy - 4 - (Math.abs(dx) > 6 ? 0 : 1));
      for (let y = -6; y < 18; y++) {
        const wob = st === 'wavy' ? Math.round(Math.sin(y * 0.7)) : 0;
        for (let k = 0; k < 4; k++) { hairPx(cx - rx - 3 + k + wob, cy + y); hairPx(cx + rx + k - 1 + wob, cy + y); }
      }
    }
  }
  if (p.glasses) {
    const gc = hex('#c9d2d6'), gd = hex('#5d666c');
    for (const ex of [cx - 6, cx + 1]) { b.hline(ox + ex, eyeY - 2, 5, gc); b.hline(ox + ex, eyeY + 2, 5, gd); b.vline(ox + ex, eyeY - 2, 5, gc); b.vline(ox + ex + 4, eyeY - 2, 5, gd); b.set(ox + ex + 1, eyeY - 1, hex('#eef6f8')); }
    b.hline(ox + cx - 1, eyeY - 1, 2, gc);
  }
  if (opt.rim !== false) for (let dy = -ry + 2; dy <= ry - 2; dy++) { const w = Math.round(faceW(dy)); b.set(ox + cx + w, oy + cy + dy, hex('#7d93b0')); }
}

// 半身像 → canvas（缓存）
const pCache = new Map<string, HTMLCanvasElement>();
export function portraitCanvas(id: string, look: Look & { age?: number }, opt: { bg?: RGB[]; rim?: boolean; dead?: boolean } = {}): HTMLCanvasElement {
  const key = id + (opt.dead ? ':dead' : '') + (opt.rim === false ? ':nr' : '');
  let c = pCache.get(key);
  if (c) return c;
  const b = new Buf(40, 48);
  portrait(b, 0, 0, look, opt);
  if (opt.dead) for (let i = 0; i < b.c.length; i += 3) { const g = (b.c[i] * 0.3 + b.c[i + 1] * 0.5 + b.c[i + 2] * 0.2) * 0.7; b.c[i] = g; b.c[i + 1] = g; b.c[i + 2] = g; }
  c = b.toCanvas({ raw: true });
  pCache.set(key, c);
  return c;
}
// 头部特写 24×24
export function headCanvas(id: string, look: Look & { age?: number }, dead = false): HTMLCanvasElement {
  const key = 'h:' + id + (dead ? ':dead' : '');
  let c = pCache.get(key);
  if (c) return c;
  const src = portraitCanvas(id, look, { rim: false, dead });
  c = document.createElement('canvas'); c.width = 24; c.height = 24;
  c.getContext('2d')!.drawImage(src, -8, -9);
  pCache.set(key, c);
  return c;
}
export function clearPortraitCache(id?: string) { if (!id) pCache.clear(); else for (const k of [...pCache.keys()]) if (k.includes(id)) pCache.delete(k); }
