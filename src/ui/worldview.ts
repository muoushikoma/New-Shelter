// 世界画面：背景缓存 + 每帧绘制人物 + 光照
import { Buf, hex } from '../engine/pixel';
import { drawBackground, lightsFor, applyLights, BgState } from '../art/shelter';
import { person, Pose } from '../art/actors';
import type { Person, World } from '../sim/types';
import { FLOORS, floorY, ROOM, BEDS, LADDERS, OBJECTS, roomAt } from '../content/layout';
import { present, isNight, hour, roomOf, cnt, P, hasCond } from '../sim/util';
import type { UI } from '../engine/ui';

export const WW = 480, WH = 270;

export class WorldView {
  bg = new Buf(WW, WH);
  frame = new Buf(WW, WH);
  lightBuf = new Buf(WW, WH);
  bgKey = ''; lightKey = '';
  cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData;
  t = 0;
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = WW; this.cv.height = WH;
    this.ctx = this.cv.getContext('2d')!;
    this.img = this.ctx.createImageData(WW, WH);
  }
  bgState(w: World): BgState {
    const h = hour(w);
    return {
      power: w.shelter.power, archiveOpen: w.shelter.archiveOpen, collapse: Math.round(w.shelter.collapseWork / 10) * 10, drain: w.shelter.drainFound,
      farmBuilt: w.shelter.farmBuilt, farm: Math.round(w.shelter.farm / 20) * 20, cans: Math.min(33, Math.ceil(cnt(w.storage, 'food') / 3)),
      night: isNight(w) || h < 7 || h >= 19, dusk: (h >= 16 && h < 19) || (h >= 6 && h < 8), phase: w.war.phase, damage: Math.round(w.shelter.damage / 10) * 10,
      filter: w.shelter.filterBuilt, radioFixed: w.shelter.radioFixed, water: Math.round(w.shelter.water / 15) * 15, fuelBarrels: Math.ceil(cnt(w.storage, 'fuel') / 10),
      meds: Math.ceil(cnt(w.storage, 'meds')), occupied: w.war.phase >= 3,
    };
  }
  render(w: World, alpha: number, sel: string | null, hoverId: string | null) {
    this.t++;
    const bs = this.bgState(w);
    const key = JSON.stringify(bs);
    if (key !== this.bgKey) { drawBackground(this.bg, bs); this.bgKey = key; this.lightKey = ''; }
    // 光照
    const ppl: Record<string, number> = {};
    for (const p of present(w)) { const r = roomOf(p); ppl[r] = (ppl[r] || 0) + 1; }
    const cooking = present(w).some((p) => p.action && (p.action.type === 'cook' || p.action.type === 'melt' || p.action.type === 'warm') && p.action.t > 0 && roomOf(p) === 'kitchen');
    const flick = w.shelter.power && w.shelter.genHealth < 30 ? (Math.sin(this.t * 0.7) > 0.6 ? 0.55 : 1) : 1;
    const ls = { power: w.shelter.power, lit: Object.fromEntries(Object.entries(w.shelter.rooms).map(([k, v]) => [k, v.lit])), candles: w.shelter.candles > 0 || cnt(w.storage, 'candle') > 0, night: bs.night, dusk: bs.dusk, people: ppl, cooking, flicker: flick };
    const lk = JSON.stringify(ls) + bs.night + bs.dusk;
    if (lk !== this.lightKey) { applyLights(this.lightBuf, lightsFor(ls), bs.night, bs.dusk); this.lightKey = lk; }
    const f = this.frame;
    f.copyFrom(this.bg); f.copyLight(this.lightBuf);
    // 雪花（地表）
    for (let i = 0; i < 40; i++) { const x = (i * 97 + this.t * (1 + (i % 3))) % WW, y = (i * 53 + this.t * (2 + (i % 2))) % 62; f.set(x, y, hex('#d8dee8')); f.glow(x, y); }
    // 发电机震动
    if (w.shelter.power && this.t % 6 < 3) f.set(160, FLOORS[1].y + FLOORS[1].h - 28, hex('#8a8a80'));
    // 人物
    const drawn = present(w).slice().sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const p of drawn) this.drawPerson(w, p, alpha);
    f.shadeInto(this.img, 8, [0.5, 0.58, 0.85]);
    this.ctx.putImageData(this.img, 0, 0);
  }
  // 人物在屏幕上的位置（插值）
  pos(w: World, p: Person, alpha: number): { x: number; y: number; pose: Pose; hidden: boolean; lyingY?: number } {
    let x = p.px + (p.x - p.px) * alpha;
    if (Math.abs(p.x - p.px) > 60) x = p.x;
    let y = floorY(p.floor);
    let pose: Pose = 'stand';
    const a = p.action;
    const moving = Math.abs(p.x - p.px) > 0.01 || (a && !(Math.abs(p.x - a.x) < 1.5 && p.floor === ROOM[a.room]?.floor));
    if (p.climb) {
      const from = floorY(p.floor), to = floorY(p.climb.to);
      const k = 1 - (p.climb.left - alpha) / 2;
      y = from + (to - from) * Math.max(0, Math.min(1, k));
      return { x, y, pose: 'stand', hidden: false };
    }
    if (moving && a && a.t === 0) return { x, y, pose: 'walk', hidden: false };
    if (!a) return { x, y, pose: 'stand', hidden: false };
    switch (a.type) {
      case 'sleep': {
        const bi = p.bed;
        if (bi !== undefined && BEDS[bi] && roomOf(p) === BEDS[bi].room) { const b = BEDS[bi]; return { x: b.x - 4, y: b.upper ? FLOORS[1].y + 19 : floorY(1) - 7, pose: 'lie', hidden: false }; }
        return { x, y: y - 1, pose: 'lie', hidden: false };
      }
      case 'rest': return { x: 252, y: floorY(1) - 10, pose: 'lie', hidden: false };
      case 'intimacy': return { x, y: y - 3, pose: 'lie', hidden: false };
      case 'eat': case 'chat': case 'listen': case 'smoke': case 'booze': case 'cry': case 'wait': case 'pray': case 'meeting': case 'comfort': return { x, y, pose: 'sit', hidden: false };
      case 'crank': case 'repair': case 'cook': case 'refuel': case 'farm': case 'treat': case 'search': case 'fixradio': case 'melt': case 'forge': case 'buildfilter': case 'steal': case 'take': case 'hoard': return { x, y, pose: 'work', hidden: false };
      case 'clear': return { x, y, pose: 'crouch', hidden: false };
      case 'guard': case 'warm': case 'idle': case 'wander': case 'sing': case 'flirt': return { x, y, pose: a.type === 'idle' && a.t % 40 > 20 ? 'sit' : 'stand', hidden: false };
    }
    return { x, y, pose, hidden: false };
  }
  drawPerson(w: World, p: Person, alpha: number) {
    const { x, y, pose } = this.pos(w, p, alpha);
    const frame = Math.floor(this.t / 6) % 4;
    const blanket = p.action?.type === 'intimacy' ? hex('#5a4a5a') : p.isPlayer ? hex('#5a6a4a') : undefined;
    let facing = p.facing;
    if (pose === 'work' && p.action) facing = p.action.x >= x ? 1 : -1;
    person(this.frame, x, y, p.look, pose, facing, pose === 'walk' ? frame : pose === 'work' ? Math.floor(this.t / 10) : 0, blanket);
  }
  // 命中测试（世界坐标）
  hitPerson(w: World, wx: number, wy: number, alpha: number): Person | null {
    let best: Person | null = null, bd = 99;
    for (const p of present(w)) {
      const { x, y, pose } = this.pos(w, p, alpha);
      const h = pose === 'lie' ? 7 : pose === 'sit' ? 16 : 21;
      const wdt = pose === 'lie' ? 10 : 5;
      if (wx >= x - wdt && wx <= x + wdt && wy >= y - h && wy <= y + 1) { const d = Math.abs(wx - x); if (d < bd) { bd = d; best = p; } }
    }
    return best;
  }
  hitObject(w: World, wx: number, wy: number): string | null {
    for (const o of OBJECTS) {
      const r = ROOM[o.room]; const F = FLOORS[r.floor];
      if (o.id === 'farmbed' && !w.shelter.farmBuilt && !cnt(w.storage, 'seeds') && !present(w).some((p) => p.isPlayer && cnt(p.inv, 'seeds'))) continue;
      if (o.id === 'files' && !w.shelter.archiveOpen) continue;
      const top = o.id === 'hatch' ? 60 : F.y + 4;
      if (wx >= o.x - o.w / 2 && wx <= o.x + o.w / 2 && wy >= top && wy <= F.y + F.h) return o.id;
    }
    return null;
  }
  floorAt(wy: number): number { for (let f = 0; f < 3; f++) if (wy >= FLOORS[f].y && wy <= FLOORS[f].y + FLOORS[f].h) return f; return -1; }
}

// 气泡、标记（画在 UI 层；UI 坐标 = 世界坐标 × 2）
export function drawOverlays(ui: UI, wv: WorldView, w: World, alpha: number, sel: string | null, hover: string | null) {
  for (const p of present(w)) {
    const { x, y, pose } = wv.pos(w, p, alpha);
    const top = pose === 'lie' ? y - 8 : pose === 'sit' ? y - 16 : y - 21;
    const sx = Math.round(x * 2), sy = Math.round(top * 2);
    if (p.id === sel || p.id === hover) { ui.rect(sx - 5, sy - 8, 11, 2, p.id === sel ? '#f0d040' : '#a0a8b0'); ui.rect(sx - 3, sy - 6, 7, 2, p.id === sel ? '#f0d040' : '#a0a8b0'); ui.rect(sx - 1, sy - 4, 3, 2, p.id === sel ? '#f0d040' : '#a0a8b0'); }
    if (p.isPlayer && p.id !== sel) { ui.rect(sx - 3, sy - 7, 7, 2, '#f0d040'); ui.rect(sx - 1, sy - 5, 3, 2, '#f0d040'); }
    let txt = '';
    let fg = '#e8dcc0', bd = '#8a8070';
    if (p.bark && p.bark.until > w.t) txt = p.bark.text;
    else if (p.action?.type === 'sleep' && p.action.t > 0) { txt = 'z z'; fg = '#8a9ab0'; bd = '#4a5260'; }
    else if (p.action?.type === 'intimacy' && p.action.t > 0) { txt = '♥'; fg = '#ff9ab0'; bd = '#7a3a5a'; }
    else if (hasCond(p, 'drunk')) { txt = '～'; fg = '#d8b060'; }
    else if (p.needs.hunger < 15 && !p.isPlayer) { txt = '饿'; fg = '#e8a060'; bd = '#7a4a2a'; }
    else if (p.needs.warmth < 15 && !p.isPlayer) { txt = '冷'; fg = '#a0c8f0'; bd = '#3a5a7a'; }
    if (txt) {
      const tw = ui.measure(txt) + 10, x0 = sx - (tw >> 1), y0 = sy - 22 - (p.id === sel ? 6 : 0);
      ui.rect(x0 - 1, y0 - 1, tw + 2, 18, '#050505'); ui.rect(x0, y0, tw, 16, bd); ui.rect(x0 + 1, y0 + 1, tw - 2, 14, '#16181c');
      ui.rect(sx - 2, y0 + 16, 5, 2, bd); ui.rect(sx - 1, y0 + 18, 3, 2, bd);
      ui.text(txt, x0 + 5, y0 + 1, fg);
    }
  }
}
export { roomAt, P, LADDERS };
