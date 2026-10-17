// 搜刮场景的画法：建筑剖面、房间、门、楼梯、窗、各种家具（翻过 / 没翻过两种样子）
import { Buf, RGB, hex, shade, bayer } from '../engine/pixel';
import type { XScene, XCont, ContKind } from '../sim/explore';
import { SX0, SX1, ROOM_H, FH, surfaceY, CONT_W } from '../sim/explore';

interface Pal { wall: string; wall2: string; trim: string; floor: string; floorL: string; ext: string; extD: string; pattern: 'paper' | 'tile' | 'stone' | 'plank' | 'concrete' }
const PAL: Record<string, Pal> = {
  houses: { wall: '#5c4a44', wall2: '#66534b', trim: '#3a2c28', floor: '#3e3026', floorL: '#4c3b2e', ext: '#4a3a34', extD: '#382a26', pattern: 'paper' },
  grain: { wall: '#58564f', wall2: '#605e56', trim: '#3a3934', floor: '#3a3936', floorL: '#46443f', ext: '#4a4c48', extD: '#36383a', pattern: 'concrete' },
  hospital: { wall: '#76807a', wall2: '#8a948c', trim: '#4a524e', floor: '#4a5452', floorL: '#56605c', ext: '#666a66', extD: '#4a4e4c', pattern: 'tile' },
  church: { wall: '#5e5a54', wall2: '#68645c', trim: '#3a3632', floor: '#3a2e24', floorL: '#46382c', ext: '#5a564e', extD: '#423e38', pattern: 'stone' },
  party: { wall: '#6a5a4a', wall2: '#74624f', trim: '#5a1e1a', floor: '#4a3424', floorL: '#5a4030', ext: '#5a5a5e', extD: '#424246', pattern: 'paper' },
  station: { wall: '#5a5648', wall2: '#646050', trim: '#3a3830', floor: '#4a4840', floorL: '#56544a', ext: '#504c44', extD: '#3a3832', pattern: 'tile' },
  border: { wall: '#4e4232', wall2: '#584a38', trim: '#33291e', floor: '#3a3a36', floorL: '#46463f', ext: '#4a4e3e', extD: '#363a2e', pattern: 'plank' },
};
export const palOf = (sc: XScene) => PAL[sc.theme] || PAL.houses;

export interface SceneLook { night: boolean }

// 静态背景：天空、外墙、房间、门、楼梯、窗、家具
export function drawScene(b: Buf, sc: XScene, o: SceneLook) {
  const P = palOf(sc);
  const H = b.h;
  // 天空与地面
  b.vramp(0, 0, b.w, H, o.night ? [hex('#0a0d15'), hex('#141a26'), hex('#1e2634')] : [hex('#4a525c'), hex('#6a727a'), hex('#868c92')]);
  const top = surfaceY(sc, 0) - ROOM_H - 6;
  const ground = sc.basement ? surfaceY(sc, sc.floors - 2) + (FH - ROOM_H) : surfaceY(sc, sc.floors - 1) + (FH - ROOM_H);
  // 远处的废墟剪影
  for (let x = 0; x < b.w; x += 1) { const hgt = 10 + Math.round(8 * Math.sin(x * 0.05) + 6 * Math.sin(x * 0.13 + 1)); b.rect(x, ground - hgt - 4, 1, hgt, hex(o.night ? '#0e121a' : '#3e444c')); }
  // 地面雪
  b.rect(0, ground, b.w, H - ground, hex(o.night ? '#2a3240' : '#9aa2ac'));
  b.dither(0, ground, b.w, 3, hex(o.night ? '#3a4454' : '#c8d0d8'), 0.5);
  if (sc.basement) { b.rect(SX0 - 6, ground, SX1 - SX0 + 12, H - ground, hex('#2a2420')); b.dither(SX0 - 6, ground, SX1 - SX0 + 12, H - ground, hex('#322a24'), 0.3); }
  // 外墙
  b.rect(SX0 - 6, top, SX1 - SX0 + 12, ground - top, hex(P.ext));
  b.dither(SX0 - 6, top, SX1 - SX0 + 12, ground - top, hex(P.extD), 0.25);
  // 屋顶：塌了几块
  b.rect(SX0 - 8, top - 4, SX1 - SX0 + 16, 5, hex(P.extD));
  for (let i = 0; i < 4; i++) { const hx = SX0 + 30 + ((i * 113 + sc.rooms.length * 37) % (SX1 - SX0 - 60)); b.rect(hx, top - 4, 10 + (i * 7) % 14, 5, hex(o.night ? '#141a26' : '#6a727a')); }
  b.dither(SX0 - 8, top - 6, SX1 - SX0 + 16, 2, hex(o.night ? '#3a4454' : '#d0d6dc'), 0.6);
  for (let f = 0; f < sc.floors; f++) drawFloor(b, sc, f, P, o);
  // 入口
  const ef = sc.entrance.floor, ey = surfaceY(sc, ef);
  b.rect(SX0 - 6, ey - 28, 8, 28, hex(o.night ? '#1a2230' : '#7a828a'));
  b.dither(SX0 - 6, ey - 4, 8, 4, hex('#c8d0d8'), 0.5);
  for (const c of sc.conts) drawCont(b, sc, c);
}

function drawFloor(b: Buf, sc: XScene, f: number, P: Pal, o: SceneLook) {
  const sy = surfaceY(sc, f), ty = sy - ROOM_H;
  const isBase = sc.basement && f === sc.floors - 1;
  const wall = hex(isBase ? '#3e3a34' : P.wall), wall2 = hex(isBase ? '#46413a' : P.wall2), trim = hex(P.trim);
  b.rect(SX0, ty, SX1 - SX0, ROOM_H, wall);
  // 墙面纹理
  const pat = isBase ? 'stone' : P.pattern;
  for (let y = ty; y < sy; y++) for (let x = SX0; x < SX1; x++) {
    let on = false;
    if (pat === 'paper') on = (x % 8 === 0) || ((x + y) % 16 === 0 && y % 3 === 0);
    else if (pat === 'tile') on = y > sy - 26 ? (x % 6 === 0 || (y - ty) % 6 === 0) : false;
    else if (pat === 'stone') on = ((y - ty) % 7 === 0) || (((x + (Math.floor((y - ty) / 7) % 2) * 6) % 12) === 0);
    else if (pat === 'plank') on = x % 7 === 0;
    else on = bayer(x, y) < 0.08;
    if (on) b.set(x, y, wall2);
  }
  if (pat === 'tile' && !isBase) b.rect(SX0, sy - 27, SX1 - SX0, 1, trim);
  if (sc.theme === 'party' && !isBase) b.rect(SX0, ty + 6, SX1 - SX0, 2, hex('#6a2420'));
  // 剥落、污渍、裂缝
  for (let i = 0; i < 7; i++) {
    const x = SX0 + ((i * 61 + f * 97) % (SX1 - SX0 - 20)), y = ty + 6 + ((i * 23 + f * 11) % (ROOM_H - 20));
    b.dither(x, y, 10 + (i % 3) * 5, 6 + (i % 2) * 5, shade(wall, 0.78), 0.4);
  }
  for (let i = 0; i < 3; i++) { let x = SX0 + 20 + ((i * 131 + f * 53) % (SX1 - SX0 - 40)), y = ty + 2; for (let k = 0; k < 14; k++) { b.set(x, y, shade(wall, 0.55)); y++; x += (k * 7 + i) % 3 - 1; } }
  // 地板与楼板
  b.rect(SX0, sy - 2, SX1 - SX0, 2, hex(P.floorL));
  b.rect(SX0, sy, SX1 - SX0, FH - ROOM_H, hex('#2e2c2a'));
  b.rect(SX0, sy, SX1 - SX0, 1, hex(P.floor));
  b.dither(SX0, sy + 2, SX1 - SX0, FH - ROOM_H - 2, hex('#26241f'), 0.35);
  // 窗
  for (const w of sc.windows) if (w.floor === f) {
    const wx = w.x - 7, wy = ty + 10;
    b.rect(wx - 1, wy - 1, 16, 20, trim);
    b.vramp(wx, wy, 14, 18, o.night ? [hex('#0e1420'), hex('#1a2232')] : [hex('#8a929a'), hex('#a8b0b6')]);
    if (sc.theme === 'church') { b.rect(wx + 2, wy + 2, 4, 6, hex('#6a2a2a')); b.rect(wx + 8, wy + 2, 4, 6, hex('#2a4a6a')); b.rect(wx + 2, wy + 10, 10, 5, hex('#5a5a2a')); }
    b.rect(wx + 6, wy, 2, 18, trim); b.rect(wx, wy + 8, 14, 2, trim);
    b.line(wx + 1, wy + 1, wx + 5, wy + 6, hex(o.night ? '#2a3448' : '#d0d6da')); // 碎玻璃
    if (!o.night) for (let j = 0; j < 18; j++) for (let i = 0; i < 14; i++) b.glow(wx + i, wy + j);
  }
  // 装饰：画像、海报
  if (!isBase && sc.theme === 'party') for (const rm of sc.rooms) if (rm.floor === f && rm.w > 90) { const x = rm.x + 10; b.rect(x, ty + 12, 12, 15, hex('#5a4a2a')); b.rect(x + 1, ty + 13, 10, 13, hex('#7a6a5a')); b.rect(x + 3, ty + 15, 6, 6, hex('#c8a890')); b.rect(x + 2, ty + 21, 8, 4, hex('#3a3a40')); }
  if (!isBase && sc.theme === 'church') for (const rm of sc.rooms) if (rm.floor === f && rm.name === '礼拜堂') { const x = rm.x + rm.w - 18; b.rect(x + 4, ty + 8, 2, 16, hex('#8a7a5a')); b.rect(x, ty + 12, 10, 2, hex('#8a7a5a')); }
  if (!isBase && sc.theme === 'station') for (const rm of sc.rooms) if (rm.floor === f && rm.name === '候车厅') { const x = rm.x + 8; b.rect(x, ty + 8, 30, 8, hex('#1a1c1a')); for (let i = 0; i < 6; i++) b.rect(x + 2 + i * 5, ty + 10, 3, 4, hex('#c8a040')); }
  if (!isBase && sc.theme === 'houses') for (const rm of sc.rooms) if (rm.floor === f && (rm.name === '客厅' || rm.name === '卧室')) { const x = rm.x + Math.round(rm.w * 0.65); b.rect(x, ty + 14, 10, 8, hex('#4a3a2a')); b.rect(x + 1, ty + 15, 8, 6, hex('#6a7a8a')); }
  // 隔墙与门
  for (const g of sc.gates) if (g.floor === f) {
    b.rect(g.x - 2, ty, 4, ROOM_H - 26, trim);
    b.rect(g.x - 2, ty, 4, 1, shade(trim, 1.3));
    if (g.state === 'locked') { b.rect(g.x - 3, sy - 26, 6, 26, hex('#4a3826')); b.rect(g.x - 3, sy - 26, 6, 1, hex('#5a4630')); b.rect(g.x + 1, sy - 14, 2, 2, hex('#a8904a')); }
    if (g.state === 'rubble') rubble(b, g.x, sy, 9, 14);
  }
  // 楼梯：楼板上的洞 + 梯子
  for (const s of sc.stairs) if (s.b === f) {
    const ay = surfaceY(sc, s.a);
    b.rect(s.x - 7, ay, 14, FH - ROOM_H, hex('#14120f'));
    for (let y = ay - 2; y < sy; y++) { b.set(s.x - 5, y, hex('#6a5a44')); b.set(s.x + 5, y, hex('#6a5a44')); if ((y - ay) % 5 === 0) b.rect(s.x - 5, y, 11, 1, hex('#7a6a50')); }
    if (s.state === 'rubble') rubble(b, s.x, sy, 10, 18);
  }
  if (isBase) b.rect(SX0, ty - (FH - ROOM_H), SX1 - SX0, 0, wall);
  // 地上的碎屑
  for (let i = 0; i < 12; i++) { const x = SX0 + ((i * 37 + f * 71) % (SX1 - SX0)); b.rect(x, sy - 1 - (i % 2), 2 + (i % 3), 1 + (i % 2), shade(hex(P.floor), 1.3)); }
}

function rubble(b: Buf, x: number, sy: number, rx: number, h: number) {
  for (let j = 0; j < h; j++) { const w = Math.round(rx * (1 - j / h)); for (let i = -w; i <= w; i++) b.set(x + i, sy - 1 - j, (i * 7 + j * 3) % 5 === 0 ? hex('#7a746a') : (i + j) % 3 === 0 ? hex('#4a4640') : hex('#5e5850')); }
  b.rect(x - 6, sy - h - 2, 3, 2, hex('#6a6058')); b.rect(x + 3, sy - h + 2, 4, 2, hex('#6a6058'));
}

// 家具：x 是中心，底部贴地
export function drawCont(b: Buf, sc: XScene, c: XCont) {
  const sy = surfaceY(sc, c.floor) - 2;
  const w = CONT_W[c.kind], x = Math.round(c.x - w / 2);
  const s = c.searched;
  const R = (dx: number, dy: number, ww: number, hh: number, col: string) => b.rect(x + dx, sy - dy, ww, hh, hex(col));
  const mess = () => { for (let i = 0; i < 5; i++) b.rect(x + ((i * 7) % (w + 6)) - 3, sy - 1, 2 + (i % 2), 1, hex(i % 2 ? '#a89a80' : '#7a8088')); };
  switch (c.kind as ContKind) {
    case 'wardrobe': R(0, 30, 16, 30, '#3e2c20'); R(1, 29, 7, 27, s ? '#1a1410' : '#4a3626'); R(8, 29, 7, 27, '#4a3626'); R(7, 16, 1, 3, '#a89060'); if (s) { R(-5, 28, 5, 26, '#4a3626'); mess(); } break;
    case 'drawer': R(0, 14, 16, 14, '#4a3828'); for (let i = 0; i < 3; i++) R(1, 13 - i * 4, 14, 3, '#5a4632'); if (s) { R(-2, 9, 18, 3, '#5a4632'); mess(); } break;
    case 'cupboard': R(0, 18, 20, 18, '#5a4a3a'); R(0, 18, 20, 2, '#6a5a48'); R(1, 15, 9, 14, s ? '#1e1812' : '#4a3a2c'); R(10, 15, 9, 14, '#4a3a2c'); if (!s) { R(3, 24, 3, 6, '#8a9aa0'); R(8, 23, 4, 5, '#a08a6a'); } else mess(); break;
    case 'fridge': R(0, 26, 13, 26, '#a8aaa4'); R(0, 26, 13, 1, '#c0c2bc'); R(0, 15, 13, 1, '#7a7c78'); R(10, 22, 1, 4, '#5a5c58'); if (s) { R(-6, 25, 6, 10, '#9a9c96'); R(1, 25, 11, 9, '#1a1c1a'); } break;
    case 'bed': R(0, 10, 30, 6, '#5a4a3a'); R(1, 11, 28, 3, s ? '#7a6a5a' : '#8a7a6a'); R(0, 14, 3, 14, '#4a3a2a'); R(2, 13, 8, 3, '#b0a898'); if (!s) R(10, 13, 18, 4, '#5a5a6a'); else mess(); break;
    case 'desk': R(0, 12, 24, 2, '#5a4430'); R(1, 10, 2, 10, '#4a3626'); R(17, 10, 6, 10, '#4a3626'); R(18, 8, 4, 2, '#6a5236'); if (!s) { R(4, 14, 6, 2, '#c8c0b0'); R(12, 15, 3, 3, '#3a3a3a'); } else { R(16, 7, 8, 3, '#6a5236'); mess(); } break;
    case 'filecab': R(0, 24, 11, 24, '#6a6e70'); for (let i = 0; i < 3; i++) { R(1, 22 - i * 8, 9, 6, '#7a7e80'); R(4, 20 - i * 8, 3, 1, '#4a4e50'); } if (s) { R(-3, 15, 14, 6, '#7a7e80'); for (let i = 0; i < 6; i++) R(-6 + i * 4, 1, 3, 1, '#d8d0c0'); } break;
    case 'safe': R(0, 14, 13, 14, '#3a3c40'); R(1, 13, 11, 12, '#4a4c52'); R(5, 9, 3, 3, '#8a8c90'); if (c.locked) R(9, 7, 2, 2, '#c84a3a'); else R(-4, 13, 4, 12, '#4a4c52'); break;
    case 'crate': R(0, 12, 15, 12, '#6a5236'); R(0, 12, 15, 1, '#7a6244'); R(0, 6, 15, 1, '#4a3a26'); b.line(x, sy - 11, x + 14, sy - 1, hex('#4a3a26')); if (s) { R(-3, 15, 10, 2, '#7a6244'); mess(); } break;
    case 'sacks': for (let i = 0; i < 3; i++) { R(i * 7, 10 - (i % 2) * 2, 9, 10 - (i % 2) * 2, s ? '#6a6050' : '#8a7c5e'); R(i * 7 + 1, 10 - (i % 2) * 2, 7, 1, '#9a8c6e'); } R(6, 15, 9, 6, s ? '#6a6050' : '#8a7c5e'); if (s) for (let i = 0; i < 8; i++) R(-3 + i * 3, 1, 2, 1, '#c8b890'); break;
    case 'medcab': R(0, 24, 15, 24, '#c8ccc8'); R(1, 23, 13, 20, s ? '#2a2c2a' : '#a8b0b0'); R(6, 20, 3, 7, '#c84a3a'); R(4, 18, 7, 3, '#c84a3a'); if (s) { R(-6, 23, 6, 18, '#b8bcb8'); for (let i = 0; i < 4; i++) R(i * 5 - 4, 1, 2, 1, '#e8e0d0'); } break;
    case 'locker': R(0, 28, 11, 28, '#4a5a44'); R(1, 27, 9, 26, s ? '#1e221c' : '#56664e'); for (let i = 0; i < 3; i++) R(3, 25 - i * 2, 5, 1, '#3a4a34'); if (s) { R(-6, 27, 6, 26, '#56664e'); mess(); } break;
    case 'pew': R(0, 7, 32, 2, '#4a3624'); R(0, 14, 32, 2, '#4a3624'); R(1, 12, 2, 12, '#3a2a1c'); R(29, 12, 2, 12, '#3a2a1c'); if (s) mess(); break;
    case 'altar': R(0, 16, 22, 16, '#6a6458'); R(-1, 17, 24, 2, '#7a7468'); R(2, 14, 18, 1, '#8a2a2a'); if (!s) { R(4, 21, 2, 5, '#e8d8a8'); R(16, 21, 2, 5, '#e8d8a8'); b.glow(x + 4, sy - 21); } else mess(); break;
    case 'luggage': R(0, 8, 10, 8, '#5a3e2a'); R(6, 13, 9, 6, '#3a4a5a'); R(11, 7, 7, 7, '#6a5a3a'); R(3, 9, 4, 1, '#3a2a1a'); if (s) { R(-2, 3, 22, 1, '#8a7a6a'); mess(); } break;
    case 'corpse': R(0, 3, 22, 3, s ? '#3a3a34' : '#45473e'); R(18, 5, 5, 4, '#a89a8a'); R(19, 6, 3, 1, '#4a3a30'); R(2, 4, 6, 1, '#2e2e2a'); b.dither(x - 2, sy - 1, 26, 1, hex('#5a2a24'), 0.3); break;
    case 'counter': R(0, 16, 34, 16, '#5a4a38'); R(-1, 17, 36, 2, '#6a5844'); R(2, 12, 30, 1, '#4a3a2a'); if (!s) R(4, 20, 6, 3, '#3a3a3a'); else mess(); break;
    case 'shelf': R(0, 24, 2, 24, '#5a4a36'); R(24, 24, 2, 24, '#5a4a36'); for (let i = 0; i < 3; i++) R(0, 23 - i * 8, 26, 1, '#6a5840'); if (!s) for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) if ((i + j * 3) % 4 !== 0) R(3 + j * 5, 22 - i * 8, 4, 5, ['#7a6a4a', '#5a6a7a', '#8a5a3a', '#6a7a5a'][(i + j) % 4]); if (s) mess(); break;
    case 'pile': R(0, 4, 10, 4, '#6a5a44'); R(2, 6, 5, 2, '#7a6a50'); break;
  }
}
