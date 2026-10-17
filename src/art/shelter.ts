// 避难所侧剖面：背景（随状态重绘）+ 光源列表
import { Buf, hex, shade, RGB } from '../engine/pixel';
import { artRng } from '../engine/rng';
import { FLOORS, ROOMS, ROOM, LADDERS } from '../content/layout';
import { silhouette } from './actors';

export interface BgState {
  power: boolean; archiveOpen: boolean; collapse: number; drain: boolean; farmBuilt: boolean; farm: number;
  cans: number; night: boolean; phase: number; damage: number; filter: boolean; radioFixed: boolean; water: number;
  fuelBarrels: number; meds: number; occupied: boolean; dusk: boolean;
}

const C = {
  snow: hex('#c9d1dc'), snowD: hex('#8994a6'),
  earth: [hex('#2a211c'), hex('#231b17'), hex('#1b1512')],
  conc: hex('#5c5e5c'), concD: hex('#3e403f'), concL: hex('#77797a'), concDD: hex('#2a2b2b'),
  wall: hex('#4a4c48'), wallD: hex('#3a3c39'),
  floor: hex('#2f2d2a'), rust: hex('#6a3c24'), rustL: hex('#8e5232'),
  wood: hex('#6a4a30'), woodD: hex('#4a3220'), woodL: hex('#8a6440'),
  metal: hex('#5a646c'), metalD: hex('#39424a'), metalL: hex('#8a96a0'),
  red: hex('#8c2626'), redD: hex('#5a1a1a'), cream: hex('#cfc4a8'),
};

export function drawBackground(b: Buf, s: BgState) {
  const W = b.w;
  const R = artRng(1717);
  b.emit.fill(0);
  // ---------- 天空 ----------
  const sky = s.night
    ? [hex('#0b0d16'), hex('#141826'), hex('#231d2a'), hex('#3a2228'), hex(s.phase === 2 ? '#7a3a22' : '#5a2a22')]
    : s.dusk ? [hex('#3a3448'), hex('#5a4a58'), hex('#8a6a60'), hex('#b08a6a'), hex('#c89a70')]
    : [hex('#5a6878'), hex('#7a8898'), hex('#9aa6b2'), hex('#b0b8c0'), hex('#c0c4c8')];
  b.vramp(0, 0, W, 62, sky);
  if (s.night) for (let i = 0; i < 40; i++) { const x = (R() * W) | 0, y = (R() * 26) | 0; b.set(x, y, hex('#5a6280')); b.glow(x, y); }
  // 远方火光
  if (s.phase === 2 || s.night) for (let x = 0; x < W; x++) {
    const fire = Math.max(0, Math.sin(x * 0.021 + 1.2) * 0.5 + Math.sin(x * 0.067) * 0.3) * (x > 230 ? 1 : 0.35) * (s.phase === 2 ? 1.6 : 1);
    const h = Math.round(fire * 8);
    for (let y = 0; y < h; y++) if ((y + x) % 2 === 0 || y < h / 2) b.set(x, 48 - y, hex(s.night ? '#8a3a1e' : '#7a6a60'));
  }
  const ruinFar = s.night ? hex('#171620') : hex('#4a4e58'), ruinNear = s.night ? hex('#100f15') : hex('#3a3c44');
  let x = 0;
  const R2 = artRng(99);
  while (x < W) {
    const w = 8 + ((R2() * 22) | 0), h = 6 + ((R2() * 18) | 0);
    b.rect(x, 52 - h, w, h + 4, ruinFar);
    for (let i = 0; i < w; i += 2) if (R2() < 0.4) b.rect(x + i, 52 - h - 1 - ((R2() * 3) | 0), 2, 3, ruinFar);
    if (x > 200 && R2() < 0.5 && (s.night || s.phase === 2)) { const wx = x + 2 + ((R2() * (w - 4)) | 0), wy = 52 - h + 2 + ((R2() * (h - 4)) | 0); b.set(wx, wy, hex('#e0802a')); b.glow(wx, wy); }
    x += w + ((R2() * 6) | 0);
  }
  // 教堂尖顶、水塔
  b.rect(300, 22, 6, 32, ruinFar); for (let i = 0; i < 10; i++) b.hline(303 - (i >> 1), 12 + i, 1 + (i >> 1) * 2, ruinFar);
  b.rect(410, 26, 14, 8, ruinFar); b.vline(412, 34, 20, ruinFar); b.vline(421, 34, 20, ruinFar); b.line(412, 34, 421, 46, ruinFar);
  // 哨塔
  b.rect(336, 20, 3, 40, ruinNear); b.rect(346, 20, 3, 40, ruinNear); b.rect(333, 16, 19, 6, ruinNear);
  b.line(336, 30, 349, 44, ruinNear); b.line(349, 30, 336, 44, ruinNear);
  if (s.night) b.rectGlow(340, 18, 3, 2, hex('#f4f0d8'));
  // 旗帜（占领后换了颜色）
  b.vline(344, 6, 10, ruinNear); b.rect(345, 6, 7, 4, s.occupied ? hex('#3a5a8a') : hex('#8c2626'));
  // 铁丝网、警示牌、枯树
  for (let px = 250; px < W; px += 14) b.vline(px, 50, 12, hex('#1e1c22'));
  for (let px = 250; px < W; px++) { b.set(px, 52 + ((px >> 1) % 2), hex('#2a2830')); b.set(px, 56 + (((px + 1) >> 1) % 2), hex('#2a2830')); }
  b.rect(286, 50, 12, 7, hex('#a89a6a')); b.rect(287, 51, 10, 5, C.red); b.vline(292, 57, 5, hex('#1e1c22'));
  b.vline(150, 34, 28, ruinNear); b.line(150, 42, 141, 33, ruinNear); b.line(150, 46, 160, 38, ruinNear); b.line(145, 38, 143, 30, ruinNear);
  // 地面雪
  for (let gx = 0; gx < W; gx++) {
    const top = 60 + Math.round(Math.sin(gx * 0.08) * 1.2 + Math.sin(gx * 0.31));
    b.vline(gx, top, 64 - top, C.snow); b.set(gx, top, hex('#e4e8f0')); b.vline(gx, 64, 2, C.snowD);
  }
  b.ellipse(210, 63, 14, 3, hex('#2a2428')); b.ellipse(210, 62, 11, 2, hex('#1a1618'));
  if (s.phase >= 2) { b.ellipse(120, 63, 9, 2, hex('#2a2428')); b.ellipse(268, 63, 8, 2, hex('#2a2428')); }
  // 入口掩体
  b.rect(20, 46, 44, 18, C.conc); b.rect(20, 46, 44, 2, C.concL); b.rect(56, 48, 8, 16, C.concD);
  b.rect(16, 44, 52, 3, C.concL); b.hline(16, 44, 52, hex('#e4e8f0')); b.hline(16, 43, 50, C.snow);
  b.rect(30, 52, 16, 12, C.concDD); b.rect(31, 53, 14, 11, hex('#1a1612'));
  b.rect(32, 54, 12, 10, C.rust); b.rect(33, 55, 4, 8, C.rustL); b.vline(38, 54, 10, C.redD);
  b.rect(36, 47, 9, 4, C.cream); b.rect(37, 48, 7, 2, C.red);
  b.hline(20, 45, 44, C.snow);

  // ---------- 土层 ----------
  for (let y = 66; y < 270; y++) for (let x0 = 0; x0 < W; x0++) {
    const n = Math.sin(x0 * 0.13 + y * 0.31) + Math.sin(x0 * 0.041 - y * 0.12) * 1.5;
    b.set(x0, y, n > 1 ? C.earth[0] : n > -0.8 ? C.earth[1] : C.earth[2]);
  }
  const R3 = artRng(7);
  for (let i = 0; i < 160; i++) { const sx = (R3() * W) | 0, sy = 66 + ((R3() * 200) | 0); b.rect(sx, sy, 2, 1, hex('#3a2e26')); b.set(sx, sy + 1, hex('#14100e')); }
  b.rect(0, 70, 360, 2, C.metalD); b.hline(0, 70, 360, C.metal);
  for (let px = 10; px < 360; px += 40) b.rect(px, 69, 3, 4, C.rust);

  // ---------- 房间 ----------
  b.rect(4, 72, 352, 156, C.concD);
  for (let y = 72; y < 228; y += 6) b.hline(4, y, 352, shade(C.concD, 0.88));
  const R4 = artRng(31);
  const room = (id: string, opt: { wall?: RGB; wallD?: RGB; dado?: RGB } = {}) => {
    const r = ROOM[id]; const F = FLOORS[r.floor];
    const x0 = r.x, w = r.w;
    b.rect(x0, F.y, w, F.h, opt.wall || C.wall);
    for (let yy = F.y + 4; yy < F.y + F.h - 10; yy += 7) b.hline(x0, yy, w, opt.wallD || C.wallD);
    for (let yy = F.y; yy < F.y + F.h; yy += 7) for (let xx = x0 + ((yy / 7) % 2 ? 4 : 0); xx < x0 + w; xx += 9) b.vline(xx, yy, 4, opt.wallD || C.wallD);
    b.rect(x0, F.y + F.h - 12, w, 10, opt.dado || hex('#3b4a44'));
    b.hline(x0, F.y + F.h - 12, w, shade(opt.dado || hex('#3b4a44'), 1.3));
    for (let k = 0; k < w / 6; k++) { const sx = x0 + ((R4() * w) | 0), sy = F.y + ((R4() * (F.h - 4)) | 0); b.dither(sx, sy, 3 + ((R4() * 6) | 0), 2 + ((R4() * 6) | 0), hex('#2e302c'), 0.3); }
    for (let k = 0; k < 3; k++) { const sx = x0 + ((R4() * w) | 0); b.dither(sx, F.y, 2, 6 + ((R4() * 14) | 0), hex('#363a38'), 0.45); }
    b.rect(x0, F.y + F.h - 2, w, 2, C.floor); b.hline(x0, F.y + F.h - 2, w, hex('#46423c'));
    b.dither(x0, F.y, w, 3, hex('#202220'), 0.6);
    // 炮击造成的裂缝
    if (s.damage > 10) for (let k = 0; k < Math.min(6, s.damage / 10); k++) { const cx = x0 + ((R4() * w) | 0); b.line(cx, F.y, cx + 3 - ((R4() * 6) | 0), F.y + 4 + ((R4() * 10) | 0), hex('#2a2a28')); }
  };
  for (const F of FLOORS) { b.rect(4, F.y + F.h, 352, 6, C.conc); b.hline(4, F.y + F.h, 352, C.concL); b.hline(4, F.y + F.h + 5, 352, C.concDD); for (let px = 8; px < 352; px += 11) b.set(px, F.y + F.h + 3, C.rust); }
  b.rect(4, 72, 352, 6, C.conc); b.hline(4, 77, 352, C.concDD);
  room('entrance', { wall: hex('#4b4a46') }); room('storage'); room('kitchen', { dado: hex('#4a3a2c') }); room('vent');
  room('dorm', { dado: hex('#3a3f4a') }); room('generator', { wall: hex('#45463f') }); room('infirmary', { wall: hex('#5a5f5c'), dado: hex('#6a7470') }); room('washroom');
  room('archive', { wall: hex('#3e3c38') }); room('lower', { wall: hex('#3a3530'), dado: hex('#3a3530') });
  // 坍塌区
  b.rect(156, 178, 196, 44, hex('#1e1a17'));
  for (const r of ROOMS) { if (r.id === 'collapse') continue; const F = FLOORS[r.floor]; b.rect(r.x - 2, F.y, 2, F.h, C.conc); b.vline(r.x - 2, F.y, F.h, C.concL); }
  b.rect(352, 78, 4, 144, C.conc);
  // 楼层之间的梯子（打通楼板）
  for (const L of LADDERS) {
    const ya = FLOORS[L.a].y + FLOORS[L.a].h - 2, yb = FLOORS[L.b].y + FLOORS[L.b].h - 2;
    b.rect(L.x - 4, ya, 9, FLOORS[L.b].y - ya, hex('#141210'));
    for (let ly = ya - 18; ly < yb; ly += 3) b.hline(L.x - 3, ly, 7, C.metal);
    b.vline(L.x - 3, ya - 18, yb - ya + 18, C.metalD); b.vline(L.x + 3, ya - 18, yb - ya + 18, C.metalD);
  }

  // ---------- 气闸 ----------
  {
    const y0 = ROOM.entrance && FLOORS[0].y, fy = FLOORS[0].y + FLOORS[0].h - 2;
    b.rect(34, 64, 10, 14, hex('#1a1612'));
    for (let ly = 64; ly < fy; ly += 3) b.hline(35, ly, 8, C.metal);
    b.vline(35, 64, fy - 64, C.metalD); b.vline(42, 64, fy - 64, C.metalD);
    b.rect(10, y0 + 8, 18, 32, C.metalD); b.rect(11, y0 + 9, 16, 30, C.metal);
    b.ellipse(19, y0 + 22, 5, 5, C.metalD); b.ellipse(19, y0 + 22, 3, 3, C.metal);
    b.hline(14, y0 + 22, 11, C.rustL); b.vline(19, y0 + 17, 11, C.rustL);
    for (let k = 0; k < 6; k++) { b.set(12, y0 + 11 + k * 5, C.metalL); b.set(25, y0 + 11 + k * 5, C.metalL); }
    for (let i = 0; i < 18; i++) b.set(10 + i, y0 + 41, (i >> 1) % 2 ? hex('#c8a020') : hex('#1a1a1a'));
    b.hline(58, y0 + 12, 11, C.woodD); b.rect(59, y0 + 13, 4, 11, hex('#4e5639')); b.rect(64, y0 + 13, 4, 9, hex('#5b4631'));
    if (s.power) b.rectGlow(54, y0 + 3, 4, 2, hex('#ff3a2a')); else b.rect(54, y0 + 3, 4, 2, hex('#4a1a14'));
    for (let i = 0; i < 2; i++) b.ellipse(62 + i * 5, fy - 2, 2, 2, hex('#7a6a4a'));
  }
  // ---------- 仓库 ----------
  {
    const y0 = FLOORS[0].y, fy = y0 + FLOORS[0].h - 2;
    b.rect(76, y0 + 6, 52, fy - y0 - 6, hex('#2b2d2c'));
    for (let sx = 76; sx < 128; sx += 3) b.vline(sx, y0 + 6, fy - y0 - 6, hex('#5a5f60'));
    for (let sy = y0 + 6; sy < fy; sy += 3) b.hline(76, sy, 52, hex('#4a4f50'));
    for (const sy of [y0 + 13, y0 + 23, y0 + 33]) { b.rect(78, sy, 46, 2, C.woodD); b.hline(78, sy, 46, C.wood); }
    // 罐头数量随库存变化
    let n = s.cans;
    for (const sy of [13, 23, 33]) for (let i = 0; i < 11 && n > 0; i++, n--) {
      const cx0 = 80 + i * 4;
      b.rect(cx0, y0 + sy - 4, 3, 4, hex('#8a8a80')); b.hline(cx0, y0 + sy - 3, 3, hex('#9a3a2a')); b.set(cx0, y0 + sy - 4, hex('#c4c4b8'));
    }
    b.rect(127, y0 + 18, 2, 18, hex('#3a3c3c'));
    b.rect(131, y0 + 24, 4, 4, hex('#a08a40')); b.set(132, y0 + 23, hex('#c8b060')); b.set(133, y0 + 22, hex('#c8b060'));
    b.rect(140, fy - 7, 12, 7, C.wood); b.hline(140, fy - 7, 12, C.woodL); b.line(140, fy - 7, 151, fy - 1, C.woodD);
    b.rect(144, fy - 11, 3, 4, hex('#5a5040')); b.rectGlow(145, fy - 10, 1, 2, hex('#ffcc66'));
    b.rect(90, y0 + 3, 20, 3, C.cream); b.hline(91, y0 + 4, 18, C.redD);
    // 油桶放在仓库角落
    for (let i = 0; i < Math.min(3, s.fuelBarrels); i++) { const ox = 154 - i * 0; b.rect(ox - i * 7, fy - 9, 6, 9, hex('#3a5a3a')); b.hline(ox - i * 7, fy - 9, 6, hex('#5a7a5a')); }
  }
  // ---------- 公共区 ----------
  {
    const y0 = FLOORS[0].y, fy = y0 + FLOORS[0].h - 2;
    b.rect(196, y0 + 5, 14, 17, C.woodD); b.rect(197, y0 + 6, 12, 15, hex('#8a7a5a'));
    b.ellipse(203, y0 + 11, 3, 3, hex('#5a4a38')); b.rect(199, y0 + 15, 9, 6, hex('#4a3a30'));
    b.dither(197, y0 + 6, 12, 15, hex('#6a5a44'), 0.25); b.line(197, y0 + 6, 208, y0 + 20, hex('#3a2e24'));
    b.rect(214, y0 + 7, 44, 6, C.redD); b.rect(215, y0 + 8, 42, 4, C.red);
    for (let i = 0; i < 6; i++) b.rect(218 + i * 7, y0 + 9, 4, 2, hex('#d8c8a0'));
    b.rect(168, fy - 14, 20, 14, hex('#4a4a48')); b.hline(168, fy - 14, 20, hex('#6a6a66'));
    b.rect(171, fy - 18, 8, 4, hex('#2a2a2c')); b.hline(170, fy - 18, 10, hex('#5a5a5c'));
    b.rect(172, fy - 6, 6, 3, hex('#1a1a1a')); b.rectGlow(173, fy - 5, 4, 1, hex('#d0501a'));
    b.vline(168, y0, fy - 14 - y0, hex('#3a3a3a'));
    b.rect(208, fy - 11, 40, 2, C.wood); b.hline(208, fy - 11, 40, C.woodL);
    b.vline(210, fy - 9, 9, C.woodD); b.vline(245, fy - 9, 9, C.woodD);
    b.rect(222, fy - 13, 8, 2, C.cream); b.rect(236, fy - 14, 3, 3, hex('#d8dcd8'));
    b.rect(212, fy - 6, 6, 1, C.wood); b.vline(213, fy - 5, 5, C.woodD); b.vline(216, fy - 5, 5, C.woodD);
    b.rect(238, fy - 6, 6, 1, C.wood); b.vline(239, fy - 5, 5, C.woodD); b.vline(242, fy - 5, 5, C.woodD);
    b.vline(228, y0, 10, hex('#1a1a1a')); b.rect(225, y0 + 10, 7, 2, hex('#3a3a38'));
    if (s.power) b.rectGlow(227, y0 + 12, 3, 2, hex('#ffe0a0')); else b.rect(227, y0 + 12, 3, 2, hex('#5a5040'));
    // 收音机
    b.rect(250, y0 + 20, 12, 8, hex('#5a3a24')); b.rect(251, y0 + 21, 6, 6, hex('#3a2a1a'));
    for (let yy = y0 + 22; yy < y0 + 27; yy += 2) b.hline(251, yy, 6, hex('#6a5040'));
    b.set(259, y0 + 22, C.cream); b.set(259, y0 + 25, C.cream);
    if (s.radioFixed) b.rectGlow(258, y0 + 21, 2, 1, hex('#80ff80')); else if (s.power) b.rectGlow(258, y0 + 21, 2, 1, hex('#ffb040'));
    b.line(262, y0 + 20, 262, y0 + 8, hex('#2a2a2a'));
  }
  // ---------- 通风 / 水房 ----------
  {
    const y0 = FLOORS[0].y, fy = y0 + FLOORS[0].h - 2;
    b.rect(276, y0 + 10, 16, 16, C.metalD); b.ellipse(284, y0 + 18, 6, 6, C.metal); b.ellipse(284, y0 + 18, 2, 2, C.metalD);
    for (let a = 0; a < 4; a++) { const ang = a * Math.PI / 2 + 0.4; b.line(284, y0 + 18, 284 + Math.round(Math.cos(ang) * 5), y0 + 18 + Math.round(Math.sin(ang) * 5), C.metalD); }
    b.rect(282, y0, 4, 10, C.metalD); b.rect(292, y0 + 17, 6, 2, C.metal); b.rect(297, y0 + 17, 2, 6, C.rustL);
    b.rect(318, y0 + 10, 26, 28, hex('#4a5a60')); b.rect(318, y0 + 10, 26, 2, hex('#6a7a80')); b.rect(340, y0 + 12, 4, 26, hex('#34424a'));
    const lvl = Math.max(0, Math.min(25, Math.round(s.water / 150 * 25)));
    b.rect(321, y0 + 37 - lvl, 20, lvl, hex('#3a4a50')); if (lvl) b.hline(321, y0 + 37 - lvl, 20, hex('#5a8aa0'));
    for (let k = 0; k < 5; k++) b.hline(344, y0 + 14 + k * 5, 2, C.cream);
    if (s.filter) { b.rect(346, fy - 16, 5, 14, hex('#6a7a6a')); b.line(348, fy - 16, 348, y0 + 6, hex('#4a5a5a')); b.rectGlow(347, fy - 6, 2, 1, hex('#7ab0c8')); }
    b.rect(326, fy - 2, 2, 2, hex('#2a3a40')); b.set(327, fy - 4, hex('#7ab0c8'));
    b.rect(306, fy - 5, 3, 5, hex('#5a5040'));
    b.rect(300, y0 + 8, 8, 8, C.cream); b.ellipse(304, y0 + 12, 3, 3, hex('#e8e0c8')); b.line(304, y0 + 12, 306, y0 + 10, hex('#a02020'));
  }
  // ---------- 宿舍 ----------
  {
    const y0 = FLOORS[1].y, fy = y0 + FLOORS[1].h - 2;
    const bunk = (bx: number) => {
      b.vline(bx, y0 + 10, fy - y0 - 10, C.metalD); b.vline(bx + 24, y0 + 10, fy - y0 - 10, C.metalD);
      b.rect(bx, y0 + 20, 25, 2, C.metal); b.rect(bx, fy - 6, 25, 2, C.metal);
      b.rect(bx + 1, y0 + 18, 23, 2, hex('#6a6858')); b.rect(bx + 1, fy - 8, 23, 2, hex('#6a6858'));
    };
    bunk(10); bunk(64); bunk(94);
    b.rect(92, y0 + 8, 30, 1, hex('#2a2a2a'));
    for (let cx0 = 92; cx0 < 122; cx0 += 2) if (cx0 < 96 || cx0 > 117) b.vline(cx0, y0 + 9, fy - y0 - 10, cx0 % 4 < 2 ? hex('#7a5a4a') : hex('#6a4a3c'));
    b.rect(36, y0 + 16, 6, 5, C.cream); b.rect(37, y0 + 17, 4, 3, hex('#5a5050'));
    b.vline(124, y0 + 12, 6, hex('#a08a40')); b.hline(122, y0 + 14, 5, hex('#a08a40'));
    b.rect(40, fy - 4, 2, 4, hex('#e8e0c8'));
  }
  // ---------- 发电机房 ----------
  {
    const y0 = FLOORS[1].y, fy = y0 + FLOORS[1].h - 2;
    b.rect(150, fy - 20, 40, 20, hex('#5a3a2a')); b.rect(150, fy - 20, 40, 2, hex('#7a5236'));
    b.rect(154, fy - 26, 20, 6, hex('#4a4440')); b.rect(176, fy - 24, 10, 4, hex('#3a3430'));
    for (let k = 0; k < 6; k++) b.vline(156 + k * 3, fy - 17, 12, hex('#3a2a20'));
    b.rect(180, fy - 16, 8, 8, C.cream); b.ellipse(184, fy - 12, 3, 3, hex('#e8e0c8')); b.line(184, fy - 12, 182, fy - 14, hex('#a02020'));
    if (s.power) { b.rectGlow(152, fy - 6, 2, 2, hex('#ff5a1a')); b.rectGlow(156, fy - 6, 2, 2, hex('#40ff60')); } else { b.rect(152, fy - 6, 2, 2, hex('#4a1a14')); b.rect(156, fy - 6, 2, 2, hex('#1a3a1a')); }
    b.rect(164, y0, 4, fy - 26 - y0, hex('#3a3430'));
    for (const ox of [194, 203]) { b.rect(ox, fy - 12, 8, 12, hex('#3a5a3a')); b.hline(ox, fy - 9, 8, hex('#2a4a2a')); b.hline(ox, fy - 4, 8, hex('#2a4a2a')); b.hline(ox, fy - 12, 8, hex('#5a7a5a')); }
    for (let k = 0; k < 26; k++) b.set(188 + k, y0 + 4 + Math.round(Math.sin(k / 4) * 1.5), hex('#1a1a1a'));
  }
  // ---------- 医务室 ----------
  {
    const y0 = FLOORS[1].y, fy = y0 + FLOORS[1].h - 2;
    b.rect(230, y0 + 6, 10, 10, hex('#d8d8d0')); b.rect(234, y0 + 7, 2, 8, hex('#b02a2a')); b.rect(231, y0 + 10, 8, 2, hex('#b02a2a'));
    b.rect(246, fy - 9, 34, 2, C.metal); b.vline(247, fy - 7, 7, C.metalD); b.vline(278, fy - 7, 7, C.metalD);
    b.rect(246, fy - 11, 34, 2, hex('#d8d4c8')); b.vline(246, fy - 15, 6, C.metal);
    b.vline(286, y0 + 6, fy - y0 - 6, C.metalD); b.hline(283, y0 + 6, 6, C.metalD); b.rect(284, y0 + 7, 3, 6, hex('#a8c8d0'));
    b.rect(220, y0 + 20, 14, 18, hex('#c8ccc4')); b.rect(221, y0 + 21, 12, 16, hex('#7a8480')); b.hline(221, y0 + 28, 12, hex('#c8ccc4'));
    for (let i = 0; i < Math.min(4, s.meds); i++) b.rect(223 + i * 3, y0 + 25, 2, 3, hex('#d8a040'));
    b.hline(249, y0 + 1, 22, hex('#3a3a3a'));
    if (s.power) b.rectGlow(250, y0 + 2, 20, 1, hex('#e8f4ff')); else b.rect(250, y0 + 2, 20, 1, hex('#6a6a6a'));
  }
  // ---------- 厕所 ----------
  {
    const y0 = FLOORS[1].y, fy = y0 + FLOORS[1].h - 2;
    b.rect(310, fy - 8, 10, 8, hex('#5a5a50')); b.hline(309, fy - 8, 12, hex('#7a7a70')); b.hline(311, fy - 9, 8, hex('#3a3a30'));
    b.rect(330, y0 + 4, 1, fy - y0 - 4, hex('#3a3a3a'));
    for (let cx0 = 326; cx0 < 350; cx0++) b.vline(cx0, y0 + 5, 26, cx0 % 3 ? hex('#5a6a6a') : hex('#4a5a5a'));
    b.dither(300, fy - 3, 50, 3, hex('#3a3a28'), 0.4);
  }
  // ---------- 档案室 ----------
  {
    const y0 = FLOORS[2].y, fy = y0 + FLOORS[2].h - 2;
    for (let k = 0; k < 4; k++) { b.rect(12 + k * 17, y0 + 8, 14, fy - y0 - 8, hex('#4a4e4a')); for (let d = 0; d < 4; d++) { b.hline(13 + k * 17, y0 + 12 + d * 8, 12, hex('#2a2e2a')); b.rect(17 + k * 17, y0 + 14 + d * 8, 4, 1, hex('#8a8a80')); } }
    if (!s.archiveOpen) { b.line(10, y0 + 6, 80, fy - 4, hex('#d8ccb0')); b.line(10, y0 + 7, 80, fy - 3, hex('#d8ccb0')); b.ellipse(45, y0 + 23, 4, 4, hex('#9a2020')); }
    else { b.dither(14, fy - 6, 60, 4, hex('#d8ccb0'), 0.3); } // 散落的纸
    // 门
    b.rect(82, y0 + 10, 3, fy - y0 - 10, s.archiveOpen ? hex('#2a2420') : hex('#5a4a3a'));
    if (!s.archiveOpen) b.rect(83, y0 + 24, 2, 3, hex('#a08a40'));
  }
  // ---------- 下层小间 ----------
  {
    const y0 = FLOORS[2].y, fy = y0 + FLOORS[2].h - 2;
    b.rect(104, fy - 4, 28, 4, hex('#6a5a48')); b.hline(104, fy - 4, 28, hex('#8a7a60'));
    b.rect(126, fy - 7, 7, 3, hex('#5a4a50'));
    b.rect(146, fy - 6, 2, 6, hex('#3a5a3a')); b.set(146, fy - 7, hex('#3a5a3a'));
    b.rect(150, fy - 3, 2, 3, hex('#e8e0c8'));
    // 种植床
    if (s.farmBuilt) {
      b.rect(90, fy - 6, 12, 6, C.woodD); b.hline(90, fy - 6, 12, C.wood);
      const g = Math.round(s.farm / 100 * 8);
      for (let i = 0; i < 6; i++) { b.vline(91 + i * 2, fy - 6 - Math.max(1, g - (i % 3)), Math.max(1, g - (i % 3)), hex(g > 5 ? '#c8c098' : '#8aa060')); if (g > 4) b.set(91 + i * 2, fy - 7 - g + (i % 3), hex('#d8d0b0')); }
    }
  }
  // ---------- 坍塌区 ----------
  {
    const y0 = 178, fy = 220;
    const cleared = 156 + Math.floor(s.collapse / 100 * 180);
    const R5 = artRng(55);
    for (let i = 0; i < 80; i++) {
      const rx = 158 + ((R5() * 190) | 0), ry = fy - ((R5() * R5() * 30) | 0);
      const w = 3 + ((R5() * 9) | 0), h = 2 + ((R5() * 5) | 0);
      if (rx < cleared && !s.drain) { b.rect(rx, fy - 2, w, 2, C.concD); continue; }
      if (s.drain && rx < 330) continue;
      b.rect(rx, ry - h, w, h, R5() < 0.5 ? C.concD : C.conc); b.hline(rx, ry - h, w, C.concL);
    }
    for (let i = 0; i < 8; i++) { const rx = 170 + i * 22; b.line(rx, y0, rx + 6 - ((R5() * 12) | 0), y0 + 14 + ((R5() * 14) | 0), C.rust); }
    b.ellipse(300, fy, 22, 2, hex('#1a2a34')); b.hline(290, fy - 1, 14, hex('#2a4a5a'));
    b.dither(240, 178, 4, 30, hex('#8a94a6'), 0.2);
    if (s.drain) { b.rect(336, fy - 18, 14, 18, hex('#0a0c0e')); b.ellipse(343, fy - 18, 7, 4, hex('#0a0c0e')); for (let k = 0; k < 6; k++) b.set(338 + k * 2, fy - 2, hex('#3a5a6a')); }
    if (s.collapse > 0 && !s.drain) { b.rect(cleared - 2, fy - 22, 3, 22, hex('#2a2622')); }
  }
}

// 光源：[x, y, 半径, 颜色, 强度, 裁剪房间]
export type Light = [number, number, number, RGB, number, string | null];
export function lightsFor(st: { power: boolean; lit: Record<string, boolean>; candles: boolean; night: boolean; dusk: boolean; people: Record<string, number>; cooking: boolean; flicker: number }): Light[] {
  const L: Light[] = [];
  const p = st.power;
  const f = st.flicker;
  if (p) {
    L.push([56, FLOORS[0].y + 4, 44, hex('#ff2a1a'), 1.0, 'entrance']);
    L.push([228, FLOORS[0].y + 14, 60, hex('#ffd08a'), 1.35 * f, 'kitchen']);
    L.push([260, FLOORS[1].y + 4, 62, hex('#c8e0ff'), 1.25, 'infirmary']);
    L.push([170, FLOORS[1].y + 30, 56, hex('#ff6a2a'), 1.1 * f, 'generator']);
    L.push([100, FLOORS[0].y + 8, 50, hex('#ffe8c0'), 0.8, 'storage']);
    L.push([310, FLOORS[0].y + 6, 50, hex('#e8f0ff'), 0.7, 'vent']);
    L.push([60, FLOORS[1].y + 8, 60, hex('#ffd8a0'), 0.7, 'dorm']);
    L.push([325, FLOORS[1].y + 8, 30, hex('#e8f0ff'), 0.6, 'washroom']);
  } else {
    L.push([56, FLOORS[0].y + 4, 20, hex('#ff2a1a'), 0.35, 'entrance']);
  }
  L.push([145, FLOORS[0].y + 31, 30, hex('#ffb050'), 0.9, 'storage']);
  if (st.cooking) L.push([175, FLOORS[0].y + 37, 26, hex('#ff6020'), 1.0, 'kitchen']);
  else L.push([175, FLOORS[0].y + 37, 14, hex('#ff6020'), 0.6, 'kitchen']);
  if (st.candles) {
    if (!p && st.people.dorm) L.push([41, FLOORS[1].y + 34, 60, hex('#ffb860'), 0.95, 'dorm']);
    if (!p && st.people.kitchen) L.push([226, FLOORS[0].y + 26, 50, hex('#ffb860'), 0.9, 'kitchen']);
    if (!p && st.people.infirmary) L.push([240, FLOORS[1].y + 30, 40, hex('#ffb860'), 0.8, 'infirmary']);
    if (st.people.lower) L.push([151, FLOORS[2].y + 38, 40, hex('#ff9a40'), 0.95, 'lower']);
    if (st.people.archive) L.push([40, FLOORS[2].y + 30, 40, hex('#ffb860'), 0.8, 'archive']);
  }
  if (st.people.vent && !p) L.push([307, FLOORS[0].y + 36, 30, hex('#ffb050'), 0.7, 'vent']);
  L.push([242, 180, 30, hex('#8a9ab8'), 0.35, null]);
  return L;
}

export function applyLights(b: Buf, lights: Light[], night: boolean, dusk: boolean) {
  b.clearLight(0.2);
  // 地表
  const amb = night ? 0.55 : dusk ? 0.85 : 1.05;
  for (let y = 0; y < 66; y++) for (let x0 = 0; x0 < b.w; x0++) { const i = y * b.w + x0; b.light[i] = amb; b.lb[i] = night ? 0.25 : 0.4; b.lg[i] = night ? 0.12 : 0.38; b.lr[i] = night ? 0.18 : 0.38; }
  if (night) { b.addLight(400, 50, 120, hex('#ff6a2a'), 0.55); b.addLight(342, 19, 240, hex('#e8f0ff'), 1.2, [0, 0, b.w, 66], [Math.PI * 0.9, 0.05]); }
  b.addLight(38, 60, 30, hex('#8090b0'), 0.3);
  for (const [x, y, r, c, i, room] of lights) {
    let clip: number[] | null = null;
    if (room) { const R = ROOM[room]; const F = FLOORS[R.floor]; clip = [R.x, F.y, R.w, F.h]; }
    b.addLight(x, y, r, c, i, clip);
  }
}

export { silhouette };
