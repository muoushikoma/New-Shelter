// 地表全景：外出时的背景（夜/昼、战争阶段）
import { Buf, hex, RGB } from '../engine/pixel';
import { artRng } from '../engine/rng';
import { LOCS } from '../content/locations';
import type { LocId } from '../sim/types';

export function drawSurface(b: Buf, night: boolean, phase: number, focus: LocId | null) {
  const W = b.w, H = b.h;
  const R = artRng(2024);
  const GY = 214;
  b.emit.fill(0);
  const sky: RGB[] = night ? [hex('#07080f'), hex('#0e1120'), hex('#1d1826'), hex('#3a2026'), hex(phase === 2 ? '#7a3420' : '#4a2420')]
    : [hex('#4a5462'), hex('#6a7480'), hex('#8a929a'), hex('#a8acb0'), hex('#b8b8b4')];
  b.vramp(0, 0, W, 150, sky);
  if (night) for (let i = 0; i < 30; i++) { const x = (R() * W) | 0, y = (R() * 50) | 0; b.set(x, y, hex('#4a5070')); b.glow(x, y); }
  const far = night ? hex('#14121a') : hex('#5a5c64');
  for (let x = 0; x < W; x++) {
    const h = 20 + Math.round(Math.abs(Math.sin(x * 0.05) * 14 + Math.sin(x * 0.17) * 6));
    b.vline(x, 150 - h, h + 10, far);
    if (night && R() < 0.04) { b.set(x, 150 - h + 4 + ((R() * 10) | 0), hex('#e07a2a')); b.glow(x, 150 - h + 4); }
  }
  for (const sx of phase >= 2 ? [120, 330, 410] : [330]) for (let y = 30; y < 140; y++) {
    const w = 4 + (140 - y) * 0.12, xo = Math.sin(y * 0.06 + sx) * 6 + (140 - y) * 0.15;
    b.dither(Math.round(sx + xo - w), y, Math.round(w * 2), 1, night ? hex('#2a2228') : hex('#6a6a6a'), 0.55);
  }
  // 地点剪影
  const mid = night ? hex('#24222a') : hex('#4a4a50');
  const midL = night ? hex('#34303a') : hex('#62626a');
  const bld = (x: number, w: number, h: number, roof = 0) => { b.rect(x - w / 2, GY - h, w, h, mid); b.rect(x - w / 2, GY - h, 2, h, midL); if (roof) for (let i = 0; i < roof; i++) b.hline(x - i, GY - h - roof + i, i * 2 + 1, mid); for (let yy = GY - h + 4; yy < GY - 6; yy += 8) for (let xx = x - w / 2 + 4; xx < x + w / 2 - 3; xx += 7) { const lit = night && R() < 0.12; b.rect(xx, yy, 3, 4, lit ? hex('#e0a050') : hex(night ? '#0e0c10' : '#2a2a30')); if (lit) { b.glow(xx, yy); b.glow(xx + 1, yy); } } };
  bld(LOCS.church.x, 22, 40, 10); b.rect(LOCS.church.x - 3, GY - 70, 6, 20, mid);
  bld(LOCS.houses.x, 40, 34); bld(LOCS.houses.x + 26, 18, 22);
  bld(LOCS.grain.x, 46, 30); b.rect(LOCS.grain.x - 18, GY - 40, 36, 8, hex(night ? '#5a1a1a' : '#8c2626'));
  bld(LOCS.hospital.x, 40, 52); b.rect(LOCS.hospital.x - 3, GY - 46, 6, 2, hex('#c03030')); b.rect(LOCS.hospital.x - 1, GY - 48, 2, 6, hex('#c03030'));
  bld(LOCS.market.x, 30, 26); b.rect(LOCS.market.x - 10, GY - 30, 20, 4, hex(night ? '#3a2a3a' : '#5a4a5a'));
  bld(LOCS.party.x, 44, 46); b.rect(LOCS.party.x - 2, GY - 66, 1, 20, mid); b.rect(LOCS.party.x - 1, GY - 66, 8, 5, hex(phase >= 3 ? '#3a5a8a' : '#8c2626'));
  bld(LOCS.station.x, 56, 24); b.rect(LOCS.station.x - 28, GY - 8, 56, 2, hex('#3a3a3a'));
  // 军营帐篷
  for (let i = 0; i < 3; i++) { const tx = LOCS.camp.x - 14 + i * 12; for (let k = 0; k < 8; k++) b.hline(tx - k, GY - 8 + k, k * 2 + 1, hex(phase >= 3 ? '#3a4a5a' : '#3e4432')); }
  // 哨所与界河
  b.rect(LOCS.border.x - 4, GY - 40, 3, 40, mid); b.rect(LOCS.border.x + 6, GY - 40, 3, 40, mid); b.rect(LOCS.border.x - 7, GY - 46, 19, 7, mid);
  for (let x = LOCS.border.x + 20; x < W; x++) for (let y = GY - 2; y < GY + 4; y++) b.set(x, y, (x + y) % 3 ? hex(night ? '#1a2a3a' : '#5a7a8a') : hex(night ? '#2a3a4a' : '#7a9aaa'));
  // 红十字帐篷
  if (phase >= 3) { for (let k = 0; k < 10; k++) b.hline(LOCS.redcross.x - k, GY - 10 + k, k * 2 + 1, hex('#d8d8d0')); b.rect(LOCS.redcross.x - 1, GY - 8, 2, 5, hex('#c03030')); b.rect(LOCS.redcross.x - 3, GY - 6, 6, 1, hex('#c03030')); }
  // 地面
  for (let x = 0; x < W; x++) {
    const top = GY + Math.round(Math.sin(x * 0.07) * 1.2);
    b.vline(x, top, H - top, hex(night ? '#a0a8b4' : '#d8dce4'));
    b.vline(x, top + 6, H - top, hex(night ? '#7a8494' : '#b8bec8'));
    b.set(x, top, hex('#e8ecf2'));
  }
  b.dither(0, GY + 12, W, H - GY - 12, hex(night ? '#5a6476' : '#9aa2b0'), 0.5);
  // 避难所入口（最左）
  b.rect(4, GY - 14, 22, 14, hex('#5c5e5a')); b.rect(10, GY - 9, 8, 9, hex('#5a3424'));
  // 焦点地点：光圈
  if (focus) { const x = LOCS[focus].x; b.addLight(x, GY - 20, 50, hex('#ffd890'), 0.0); }
  for (let i = 0; i < 220; i++) { const x = (R() * W) | 0, y = (R() * H) | 0; b.set(x, y, R() < 0.5 ? hex('#e8ecf4') : hex('#9aa4b4')); if (night) b.glow(x, y); }
  b.clearLight(night ? 0.42 : 1.0);
  if (night) { b.addLight(LOCS.camp.x, GY - 30, 140, hex('#f0f4d0'), 1.1, null, [Math.PI * 0.8, 0.12]); b.addLight(LOCS.border.x, GY - 46, 160, hex('#e8f0ff'), 1.0, null, [Math.PI * 0.75, 0.06]); b.addLight(240, 100, 400, hex('#ff7a3a'), 0.25); }
  if (focus) b.addLight(LOCS[focus].x, GY - 20, 60, hex('#ffd890'), night ? 0.8 : 0.3);
}
export const SURFACE_GY = 214;
