// 场景化搜刮：外出到达地点后，进入一栋可以走动的建筑。房间、楼梯、锁、瓦砾、可搜的家具、来巡逻的人。
// 纯数据、可存档、不依赖浏览器（命令行测试也用它）。画面在 src/art/explore.ts 与 src/ui/explore.ts
import type { ItemKey, LocId, Person, World } from './types';
import { player, P, cnt, addItem, takeItem, clamp, knowFact, log, isDark } from './util';
import { rnd, rint, chance, pick, makeRng, RngState } from '../engine/rng';
import { ITEMS } from '../content/items';
import { LOCS } from '../content/locations';

export type ContKind = 'wardrobe' | 'drawer' | 'cupboard' | 'fridge' | 'bed' | 'desk' | 'filecab' | 'safe' | 'crate' | 'sacks' | 'medcab' | 'locker' | 'pew' | 'altar' | 'luggage' | 'corpse' | 'counter' | 'shelf' | 'pile';
export interface XRoom { id: number; floor: number; x: number; w: number; name: string }
export interface XGate { id: number; floor: number; x: number; state: 'open' | 'locked' | 'rubble' }
export interface XStair { id: number; x: number; a: number; b: number; state: 'open' | 'rubble' }
export interface XCont { id: number; floor: number; x: number; kind: ContKind; searched: boolean; loot: Partial<Record<ItemKey, number>>; locked?: boolean; note?: string }
export interface XScene { loc: LocId; theme: string; floors: number; basement: boolean; entrance: { floor: number; x: number }; rooms: XRoom[]; gates: XGate[]; stairs: XStair[]; conts: XCont[]; windows: { floor: number; x: number }[] }
export interface Waypoint { floor: number; x: number; climb?: number }
export interface XEnemy { id: number; kind: 'patrol' | 'scavengers'; x: number; floor: number; facing: number; path: Waypoint[]; climb: { to: number; t: number } | null; wait: number; visits: number; leaving: boolean; calm?: boolean; look: number }
export type XAct = { kind: 'search' | 'force' | 'pick' | 'clear' | 'leave'; target: number; on: 'cont' | 'gate' | 'stair' | 'exit'; t: number; dur: number };
export interface Explore {
  loc: LocId; x: number; floor: number; facing: number; path: Waypoint[]; climb: { to: number; t: number } | null;
  pending: { on: 'cont' | 'gate' | 'stair' | 'exit'; id: number; kind: XAct['kind'] | 'hide' } | null;
  act: XAct | null; hidden: number | null;
  bag: Partial<Record<ItemKey, number>>; carryMax: number;
  threat: number; minutes: number; acc: number;
  enemies: XEnemy[]; nextEnemy: number; spotted: XEnemy['kind'] | null;
  log: string[]; done: boolean; noiseAt: { floor: number; x: number } | null;
}

// ---------- 几何 ----------
export const SX0 = 24, SX1 = 456, FH = 64, ROOM_H = 56;
export const SEC_PER_MIN = 0.5;          // 现实 0.5 秒 = 游戏 1 分钟
export const WALK = 46, ENEMY_WALK = 30;  // 像素 / 秒
const groundFloor = (sc: XScene) => (sc.basement ? sc.floors - 2 : sc.floors - 1);
export function surfaceY(sc: XScene, f: number) { const g = sc.basement ? 176 : 236; return g - (groundFloor(sc) - f) * FH; }
export const roomAt = (sc: XScene, f: number, x: number) => sc.rooms.find((r) => r.floor === f && x >= r.x && x < r.x + r.w) || sc.rooms.find((r) => r.floor === f)!;

// ---------- 主题 ----------
interface Theme { floors: number; basement?: boolean; rooms: [string, ContKind[]][]; locked?: string[]; first?: string[] }
const THEMES: Partial<Record<LocId, Theme>> = {
  houses: { floors: 3, rooms: [['楼道', ['luggage', 'corpse']], ['客厅', ['cupboard', 'drawer', 'desk']], ['卧室', ['wardrobe', 'bed', 'drawer']], ['厨房', ['cupboard', 'fridge']], ['储藏间', ['crate', 'shelf']]], first: ['楼道'] },
  grain: { floors: 2, basement: true, rooms: [['仓库', ['sacks', 'sacks', 'shelf', 'crate']], ['办公室', ['desk', 'filecab', 'safe']], ['装卸间', ['crate', 'luggage']], ['地窖', ['sacks', 'crate', 'shelf']]], first: ['装卸间'] },
  hospital: { floors: 3, rooms: [['走廊', ['corpse', 'bed']], ['病房', ['bed', 'drawer', 'bed']], ['药房', ['medcab', 'medcab', 'shelf']], ['手术室', ['medcab', 'locker']], ['护士站', ['counter', 'drawer', 'filecab']]], locked: ['药房'], first: ['走廊'] },
  church: { floors: 2, basement: true, rooms: [['礼拜堂', ['pew', 'pew', 'altar']], ['圣器室', ['wardrobe', 'drawer', 'crate']], ['钟楼', ['crate']], ['地下室', ['crate', 'sacks', 'shelf']]], first: ['礼拜堂'] },
  party: { floors: 3, rooms: [['走廊', ['corpse']], ['办公室', ['desk', 'filecab']], ['档案室', ['filecab', 'filecab', 'shelf']], ['会议室', ['desk', 'counter']], ['书记办公室', ['desk', 'safe', 'drawer']]], locked: ['书记办公室', '档案室'], first: ['走廊'] },
  station: { floors: 2, rooms: [['候车厅', ['pew', 'luggage', 'luggage']], ['售票处', ['counter', 'drawer']], ['行李房', ['luggage', 'luggage', 'crate', 'shelf']], ['站长室', ['desk', 'filecab', 'locker']]], first: ['候车厅'] },
  border: { floors: 2, rooms: [['岗亭', ['desk', 'locker']], ['宿舍', ['bed', 'locker', 'bed']], ['军械库', ['locker', 'crate', 'crate']], ['仓库', ['crate', 'sacks']]], locked: ['军械库'], first: ['岗亭'] },
};
export const hasScene = (loc: LocId) => !!THEMES[loc];

// 物品更可能出现在什么家具里
const AFFINITY: Partial<Record<ItemKey, ContKind[]>> = {
  food: ['cupboard', 'fridge', 'sacks', 'crate', 'shelf', 'luggage'], fuel: ['crate', 'shelf'], seeds: ['sacks', 'crate', 'shelf'],
  meds: ['medcab', 'drawer', 'locker'], bandage: ['medcab', 'drawer', 'locker'], filter: ['shelf', 'crate', 'medcab'],
  cigs: ['drawer', 'desk', 'luggage', 'cupboard', 'corpse'], alcohol: ['cupboard', 'desk', 'luggage', 'altar', 'drawer'],
  valuables: ['drawer', 'safe', 'wardrobe', 'luggage', 'corpse', 'altar'], candle: ['drawer', 'altar', 'cupboard', 'crate'],
  blanket: ['wardrobe', 'bed'], condom: ['drawer', 'wardrobe'], crowbar: ['crate', 'shelf', 'locker'], knife: ['drawer', 'cupboard', 'corpse'],
  tools: ['crate', 'shelf', 'locker'], parts: ['crate', 'shelf', 'locker'], radioParts: ['shelf', 'desk', 'crate', 'locker'],
  papers: ['filecab', 'desk', 'safe', 'corpse'], blankPermit: ['filecab', 'desk', 'safe'], stamp: ['safe', 'desk'],
  ammo: ['locker', 'corpse', 'crate'], pistol: ['locker', 'safe', 'desk', 'corpse'], rifle: ['locker', 'crate'], map: ['desk', 'luggage', 'locker'],
};
export const HIDE_KINDS: ContKind[] = ['wardrobe', 'bed', 'pew', 'counter', 'desk'];
export const CONT_NAME: Record<ContKind, string> = { wardrobe: '衣柜', drawer: '抽屉柜', cupboard: '橱柜', fridge: '冰箱', bed: '床', desk: '桌子', filecab: '文件柜', safe: '保险柜', crate: '木箱', sacks: '麻袋堆', medcab: '药柜', locker: '铁皮柜', pew: '长椅', altar: '祭坛', luggage: '行李', corpse: '尸体', counter: '柜台', shelf: '货架', pile: '你放下的东西' };
export const CONT_W: Record<ContKind, number> = { wardrobe: 16, drawer: 16, cupboard: 20, fridge: 13, bed: 30, desk: 24, filecab: 11, safe: 13, crate: 15, sacks: 22, medcab: 15, locker: 11, pew: 32, altar: 22, luggage: 18, corpse: 22, counter: 34, shelf: 26, pile: 10 };
const SEARCH_MIN: Record<ContKind, number> = { wardrobe: 8, drawer: 6, cupboard: 6, fridge: 3, bed: 6, desk: 7, filecab: 12, safe: 6, crate: 7, sacks: 10, medcab: 6, locker: 5, pew: 4, altar: 6, luggage: 9, corpse: 5, counter: 6, shelf: 8, pile: 1 };

// ---------- 生成 ----------
export function genScene(w: World, loc: LocId): XScene {
  const th = THEMES[loc]!;
  const r = makeRng((w.seed ^ (LOCS[loc].x * 7919)) >>> 0);
  const sc: XScene = { loc, theme: loc, floors: th.floors + (th.basement ? 1 : 0), basement: !!th.basement, entrance: { floor: 0, x: SX0 + 6 }, rooms: [], gates: [], stairs: [], conts: [], windows: [] };
  sc.entrance.floor = groundFloor(sc);
  let id = 1;
  const pool = th.rooms.filter(([n]) => n !== '地窖' && n !== '地下室');
  const cellar = th.rooms.find(([n]) => n === '地窖' || n === '地下室');
  for (let f = 0; f < sc.floors; f++) {
    const isBase = sc.basement && f === sc.floors - 1;
    const n = isBase ? 2 : rint(r, 3, 4);
    // 随机切分宽度（每间至少 80）
    const total = SX1 - SX0;
    const ws: number[] = []; let left = total;
    for (let i = 0; i < n; i++) { const rest = n - i - 1; const wi = i === n - 1 ? left : rint(r, 80, Math.max(80, left - rest * 80)); ws.push(wi); left -= wi; }
    let x = SX0;
    const names: string[] = [];
    for (let i = 0; i < n; i++) {
      let name: string;
      if (isBase) name = cellar ? cellar[0] : '地下室';
      else if (f === sc.entrance.floor && i === 0 && th.first) name = th.first[0];
      else name = pick(r, pool)[0];
      names.push(name);
      sc.rooms.push({ id: id++, floor: f, x, w: ws[i], name });
      if (i > 0) {
        const locked = (th.locked || []).includes(name) || (th.locked || []).includes(names[i - 1]);
        sc.gates.push({ id: id++, floor: f, x, state: locked ? 'locked' : chance(r, 0.12) ? 'rubble' : 'open' });
      }
      x += ws[i];
    }
  }
  // 楼梯：每两层之间一道，避开门口
  for (let f = 0; f < sc.floors - 1; f++) {
    let sx = 0;
    for (let k = 0; k < 20; k++) { sx = rint(r, SX0 + 16, SX1 - 16); if (!sc.gates.some((g) => (g.floor === f || g.floor === f + 1) && Math.abs(g.x - sx) < 20) && Math.abs(sx - sc.entrance.x) > 30) break; }
    sc.stairs.push({ id: id++, x: sx, a: f, b: f + 1, state: chance(r, 0.15) ? 'rubble' : 'open' });
  }
  // 窗（地上层，每间一扇）
  for (const rm of sc.rooms) if (!(sc.basement && rm.floor === sc.floors - 1) && rm.w > 60) sc.windows.push({ floor: rm.floor, x: rm.x + Math.round(rm.w * (0.3 + rnd(r) * 0.4)) });
  // 家具
  for (const rm of sc.rooms) {
    const kinds = (th.rooms.find(([n]) => n === rm.name) || th.rooms[0])[1];
    const used: [number, number][] = [];
    for (const s of sc.stairs) if (s.a === rm.floor || s.b === rm.floor) used.push([s.x - 14, s.x + 14]);
    for (const g of sc.gates) if (g.floor === rm.floor) used.push([g.x - 8, g.x + 8]);
    if (rm.floor === sc.entrance.floor) used.push([SX0, SX0 + 22]);
    for (const w of sc.windows) if (w.floor === rm.floor) used.push([w.x - 8, w.x + 8]); // 窗下不放高柜，简单起见整片让开
    const want = Math.min(kinds.length, rm.w > 130 ? 3 : 2) + (chance(r, 0.3) ? 1 : 0);
    for (let i = 0; i < want; i++) {
      const kind = i < kinds.length ? kinds[i] : pick(r, kinds);
      const cw = CONT_W[kind];
      for (let k = 0; k < 15; k++) {
        const cx = rint(r, rm.x + 6 + cw / 2, rm.x + rm.w - 6 - cw / 2);
        if (used.some(([a, b]) => cx + cw / 2 + 3 > a && cx - cw / 2 - 3 < b)) continue;
        used.push([cx - cw / 2, cx + cw / 2]);
        sc.conts.push({ id: id++, floor: rm.floor, x: cx, kind, searched: false, loot: {}, locked: kind === 'safe' });
        break;
      }
    }
  }
  // 物资：按地点的物资表掷三轮，放进合适的家具
  const L = LOCS[loc];
  const looted = w.locs[loc].looted;
  for (let round = 0; round < 3; round++) for (const [k, a, b, pr] of L.loot || []) {
    if (rnd(r) >= pr * (1 - looted / 120)) continue;
    const n = rint(r, a, b);
    const aff = AFFINITY[k] || [];
    const cands = sc.conts.filter((c) => aff.includes(c.kind));
    const c = cands.length ? pick(r, cands) : pick(r, sc.conts);
    if (c) c.loot[k] = (c.loot[k] || 0) + n;
  }
  // 地点专属的线索
  const note = (kinds: ContKind[], fact: string) => { const c = sc.conts.find((x) => kinds.includes(x.kind)); if (c) c.note = fact; };
  if (loc === 'station') note(['desk', 'filecab'], 'K_MIL');
  if (loc === 'church') note(['altar', 'drawer'], 'K_SMUG');
  if (loc === 'houses') note(['drawer', 'desk'], 'K_MARKET');
  if (loc === 'party') { const s = sc.conts.find((x) => x.kind === 'safe'); if (s) { s.loot.blankPermit = (s.loot.blankPermit || 0) + 1; if (rnd(r) < 0.5) s.loot.stamp = 1; } }
  // 之前被人翻过的
  for (const c of sc.conts) if (rnd(r) < looted / 130) { c.searched = true; c.loot = {}; }
  return sc;
}

// NPC 外出也会翻掉一些
export function emptySome(sc: XScene, frac: number, rng: RngState) {
  for (const c of sc.conts) if (!c.searched && rnd(rng) < frac) { c.searched = true; c.loot = {}; }
}

// ---------- 路径 ----------
function gateBetween(sc: XScene, f: number, x0: number, x1: number): XGate | undefined {
  const [a, b] = x0 < x1 ? [x0, x1] : [x1, x0];
  return sc.gates.find((g) => g.floor === f && g.state !== 'open' && g.x > a && g.x < b);
}
// 房间图上的广度优先：返回途经点；到不了返回 null
export function findPath(sc: XScene, from: { floor: number; x: number }, to: { floor: number; x: number }): Waypoint[] | null {
  const start = roomAt(sc, from.floor, from.x), goal = roomAt(sc, to.floor, to.x);
  const prev = new Map<number, { room: XRoom; via: Waypoint[] }>();
  const q: XRoom[] = [start]; prev.set(start.id, { room: start, via: [] });
  while (q.length) {
    const cur = q.shift()!;
    if (cur === goal) break;
    const nbs: [XRoom, Waypoint[]][] = [];
    for (const g of sc.gates) if (g.floor === cur.floor && g.state === 'open') {
      if (g.x === cur.x + cur.w) nbs.push([roomAt(sc, cur.floor, g.x + 1), [{ floor: cur.floor, x: g.x + 5 }]]);
      if (g.x === cur.x) nbs.push([roomAt(sc, cur.floor, g.x - 1), [{ floor: cur.floor, x: g.x - 5 }]]);
    }
    for (const s of sc.stairs) if (s.state === 'open' && s.x >= cur.x && s.x < cur.x + cur.w && (s.a === cur.floor || s.b === cur.floor)) {
      const other = s.a === cur.floor ? s.b : s.a;
      nbs.push([roomAt(sc, other, s.x), [{ floor: cur.floor, x: s.x, climb: other }]]);
    }
    for (const [nb, via] of nbs) if (!prev.has(nb.id)) { prev.set(nb.id, { room: cur, via }); q.push(nb); }
  }
  if (!prev.has(goal.id)) return null;
  const segs: Waypoint[][] = [];
  for (let c = goal; c !== start;) { const p = prev.get(c.id)!; segs.unshift(p.via); c = p.room; }
  return [...segs.flat(), { floor: to.floor, x: clamp(to.x, SX0 + 4, SX1 - 4) }];
}

// ---------- 开始 / 结束 ----------
const team = (w: World) => (w.trip ? w.trip.members.map((id) => P(w, id)!).filter((p) => p && p.alive) : []);
const bagWeight = (bag: Partial<Record<ItemKey, number>>) => Object.entries(bag).reduce((s, [k, v]) => s + (ITEMS[k as ItemKey]?.weight || 0) * (v || 0), 0);
export const weightOf = bagWeight;
const hasTool = (w: World, k: ItemKey) => team(w).some((p) => cnt(p.inv, k) > 0);

export function startExplore(w: World): Explore {
  const tr = w.trip!;
  const ls = w.locs[tr.loc];
  if (!ls.scene) ls.scene = genScene(w, tr.loc);
  const sc = ls.scene;
  const carried = bagWeight(player(w).inv);
  const ex: Explore = {
    loc: tr.loc, x: sc.entrance.x + 8, floor: sc.entrance.floor, facing: 1, path: [], climb: null, pending: null, act: null, hidden: null,
    bag: {}, carryMax: Math.max(4, 14 + (team(w).length - 1) * 10 - carried), threat: 0, minutes: 0, acc: 0,
    enemies: [], nextEnemy: 1, spotted: null, log: [], done: false, noiseAt: null,
  };
  tr.explore = ex;
  say(ex, `你${team(w).length > 1 ? '们' : ''}从${sc.basement ? '侧门' : '门口'}钻了进去。里面${isDark(w) ? '漆黑一片' : '很暗，窗外透进一点灰白的光'}。`);
  return ex;
}
export function sceneOf(w: World, ex: Explore): XScene { return w.locs[ex.loc].scene!; }

// 离开建筑：背包里的东西归你，更新搜刮度
export function finishExplore(w: World, ex: Explore, keepBag = true) {
  const sc = sceneOf(w, ex), me = player(w);
  if (keepBag) for (const [k, v] of Object.entries(ex.bag)) addItem(me.inv, k as ItemKey, v || 0);
  const searched = sc.conts.filter((c) => c.searched && c.kind !== 'pile').length, total = Math.max(1, sc.conts.filter((c) => c.kind !== 'pile').length);
  w.locs[ex.loc].looted = clamp(Math.round((searched / total) * 100));
  ex.done = true;
  if (w.trip) {
    w.trip.searches++;
    const got = Object.entries(ex.bag).filter(([, v]) => v).map(([k, v]) => `${ITEMS[k as ItemKey].name}×${Math.floor(v || 0)}`).join('、');
    if (keepBag) w.trip.notes.push(got ? `在${LOCS[ex.loc].name}里待了 ${ex.minutes} 分钟，带出来：${got}。` : `在${LOCS[ex.loc].name}里待了 ${ex.minutes} 分钟，什么也没带出来。`);
    w.trip.explore = undefined;
  }
}

function say(ex: Explore, s: string) { ex.log.push(s); if (ex.log.length > 30) ex.log.shift(); }

// ---------- 玩家指令 ----------
// 走到某处
export function orderMove(w: World, ex: Explore, floor: number, x: number): boolean {
  if (ex.act || ex.spotted) return false;
  const p = findPath(sceneOf(w, ex), { floor: ex.floor, x: ex.x }, { floor, x });
  ex.hidden = null; ex.pending = null;
  if (!p) { say(ex, '过不去。'); return false; }
  ex.path = p; return true;
}
// 对家具 / 门 / 楼梯 / 出口做某件事：先走过去
export function orderAct(w: World, ex: Explore, on: 'cont' | 'gate' | 'stair' | 'exit', id: number, kind: XAct['kind'] | 'hide'): boolean {
  if (ex.act || ex.spotted) return false;
  const sc = sceneOf(w, ex);
  let tx = 0, tf = 0;
  if (on === 'cont') { const c = sc.conts.find((x) => x.id === id)!; tx = c.x; tf = c.floor; }
  else if (on === 'exit') { tx = sc.entrance.x + 4; tf = sc.entrance.floor; }
  // 门、楼梯：从哪一侧能走到就从哪一侧去
  const cands: { floor: number; x: number }[] = [];
  if (on === 'gate') { const g = sc.gates.find((x) => x.id === id)!; const near = ex.floor === g.floor && ex.x > g.x ? 1 : -1; cands.push({ floor: g.floor, x: g.x + near * 6 }, { floor: g.floor, x: g.x - near * 6 }); }
  else if (on === 'stair') { const s = sc.stairs.find((x) => x.id === id)!; cands.push({ floor: ex.floor === s.a ? s.a : s.b, x: s.x }, { floor: ex.floor === s.a ? s.b : s.a, x: s.x }); }
  else cands.push({ floor: tf, x: tx });
  let p: Waypoint[] | null = null;
  for (const c of cands) { p = findPath(sc, { floor: ex.floor, x: ex.x }, c); if (p) break; }
  if (!p) { say(ex, '过不去。'); return false; }
  ex.hidden = null;
  ex.path = p; ex.pending = { on, id, kind };
  return true;
}
// 现在能对某个东西做什么
export function actionsFor(w: World, ex: Explore, on: 'cont' | 'gate' | 'stair', id: number): { kind: XAct['kind'] | 'hide'; label: string; min: number; tip?: string }[] {
  const sc = sceneOf(w, ex), me = player(w);
  const crow = hasTool(w, 'crowbar'), tools = hasTool(w, 'tools') || crow;
  const out: { kind: XAct['kind'] | 'hide'; label: string; min: number; tip?: string }[] = [];
  if (on === 'cont') {
    const c = sc.conts.find((x) => x.id === id)!;
    if (c.locked) {
      if (crow) out.push({ kind: 'force', label: '用撬棍撬开', min: 15, tip: '很响' });
      out.push({ kind: 'pick', label: '试着开锁', min: 25, tip: `机械 ${me.skills.mechanic}，不一定成功` });
    } else if (!c.searched) out.push({ kind: 'search', label: `翻${CONT_NAME[c.kind]}`, min: searchMin(w, c) });
    else if (Object.values(c.loot).some((v) => v)) out.push({ kind: 'search', label: '拿走剩下的东西', min: 1 });
    if (HIDE_KINDS.includes(c.kind)) out.push({ kind: 'hide', label: c.kind === 'wardrobe' ? '躲进去' : c.kind === 'bed' ? '钻到床底下' : c.kind === 'pew' ? '趴到长椅下面' : '躲到后面', min: 0 });
  } else if (on === 'gate') {
    const g = sc.gates.find((x) => x.id === id)!;
    if (g.state === 'locked') { if (crow) out.push({ kind: 'force', label: '用撬棍撬开门', min: 8, tip: '很响' }); out.push({ kind: 'pick', label: '试着开锁', min: 18, tip: `机械 ${me.skills.mechanic}，不一定成功` }); }
    if (g.state === 'rubble') out.push({ kind: 'clear', label: '清理瓦砾', min: tools ? 15 : 25, tip: '有点响' });
  } else {
    const s = sc.stairs.find((x) => x.id === id)!;
    if (s.state === 'rubble') out.push({ kind: 'clear', label: '清理楼梯上的瓦砾', min: tools ? 15 : 25, tip: '有点响' });
  }
  return out;
}
function searchMin(w: World, c: XCont) { return Math.max(1, Math.round(SEARCH_MIN[c.kind] / (1 + (team(w).length - 1) * 0.3))); }

// ---------- 推进 ----------
export interface StepEvents { minutes: number; spotted?: XEnemy['kind']; arrived?: boolean }
// dt：现实秒数。返回这段时间里流逝的游戏分钟数（由调用方推进整个世界）
export function exploreStep(w: World, ex: Explore, dt: number): StepEvents {
  const sc = sceneOf(w, ex);
  const ev: StepEvents = { minutes: 0 };
  if (ex.done || ex.spotted) return ev;
  // 玩家移动 / 爬楼梯
  moveActor(ex, ex.path, dt, WALK);
  if (!ex.path.length && !ex.climb && ex.pending && !ex.act) startPending(w, ex, sc);
  // 正在做的事
  if (ex.act) {
    ex.act.t += dt;
    if (ex.act.t >= ex.act.dur * SEC_PER_MIN) completeAct(w, ex, sc, ex.act);
  }
  // 时间
  ex.acc += dt;
  while (ex.acc >= SEC_PER_MIN) {
    ex.acc -= SEC_PER_MIN; ex.minutes++; ev.minutes++;
    minuteTick(w, ex, sc);
  }
  // 敌人
  for (const e of ex.enemies) enemyStep(w, ex, sc, e, dt);
  ex.enemies = ex.enemies.filter((e) => !(e.leaving && !e.path.length && !e.climb && e.floor === sc.entrance.floor && e.x <= sc.entrance.x + 2));
  if (!ex.spotted) for (const e of ex.enemies) if (sees(sc, ex, e, dt)) { ex.spotted = e.kind; ex.act = null; ex.path = []; ev.spotted = e.kind; say(ex, e.kind === 'patrol' ? '手电筒的光照到了你的脸上。' : '有人看见你了。'); break; }
  return ev;
}

type Mover = { x: number; floor: number; facing: number; climb: { to: number; t: number } | null };
function moveActor(a: Mover, path: Waypoint[], dt: number, speed: number) {
  if (a.climb) { a.climb.t += dt; if (a.climb.t >= 1.1) { a.floor = a.climb.to; a.climb = null; } return; }
  const wp = path[0];
  if (!wp) return;
  const d = wp.x - a.x;
  if (Math.abs(d) <= speed * dt) {
    a.x = wp.x;
    path.shift();
    if (wp.climb !== undefined) a.climb = { to: wp.climb, t: 0 };
  } else { a.x += Math.sign(d) * speed * dt; a.facing = Math.sign(d); }
}

function startPending(w: World, ex: Explore, sc: XScene) {
  const p = ex.pending!; ex.pending = null;
  if (p.kind === 'hide') { ex.hidden = p.id; say(ex, '你屏住了呼吸。'); return; }
  if (p.on === 'exit') { ex.act = { kind: 'leave', target: 0, on: 'exit', t: 0, dur: 1 }; return; }
  const opts = actionsFor(w, ex, p.on as 'cont' | 'gate' | 'stair', p.id);
  const o = opts.find((x) => x.kind === p.kind);
  if (!o) return;
  ex.act = { kind: p.kind as XAct['kind'], target: p.id, on: p.on, t: 0, dur: o.min };
  // 开始就会出声的动作
  if (p.kind === 'force') noise(ex, 22, sc, p.on, p.id);
}

function noise(ex: Explore, n: number, sc: XScene, on: string, id: number) {
  ex.threat += n;
  const thing = on === 'cont' ? sc.conts.find((c) => c.id === id) : on === 'gate' ? sc.gates.find((g) => g.id === id) : sc.stairs.find((s) => s.id === id);
  ex.noiseAt = { floor: thing && 'floor' in thing ? thing.floor : ex.floor, x: thing ? thing.x : ex.x };
}

function completeAct(w: World, ex: Explore, sc: XScene, a: XAct) {
  const me = player(w);
  ex.act = null;
  if (a.kind === 'leave') { say(ex, '你回到了门口。'); finishExplore(w, ex); return; }
  if (a.on === 'cont') {
    const c = sc.conts.find((x) => x.id === a.target)!;
    if (a.kind === 'force') { c.locked = false; say(ex, `${CONT_NAME[c.kind]}的门被撬开了。声音在楼里回荡。`); return; }
    if (a.kind === 'pick') { if (chance(w.rng, 0.25 + me.skills.mechanic / 200)) { c.locked = false; say(ex, '咔哒一声，锁开了。'); } else { noise(ex, 6, sc, 'cont', c.id); say(ex, '锁没打开。你的手指冻僵了。'); } return; }
    // 翻找
    const first = !c.searched;
    c.searched = true;
    if (first) noise(ex, c.kind === 'crate' || c.kind === 'locker' || c.kind === 'filecab' ? 4 : 2, sc, 'cont', c.id);
    if (first && c.kind === 'corpse') me.needs.stress = clamp(me.needs.stress + 4);
    const took: string[] = [], left: string[] = [];
    for (const [k0, v0] of Object.entries(c.loot)) {
      const k = k0 as ItemKey; let v = v0 || 0;
      const wt = ITEMS[k].weight;
      let n = v;
      if (wt > 0) n = Math.min(v, Math.floor((ex.carryMax - bagWeight(ex.bag) + 1e-6) / wt));
      if (n > 0) { addItem(ex.bag, k, n); v -= n; took.push(`${ITEMS[k].name}×${n}`); }
      if (v > 0) left.push(`${ITEMS[k].name}×${v}`);
      if (v > 0) c.loot[k] = v; else delete c.loot[k];
    }
    if (first && c.note) {
      const f = c.note; c.note = undefined;
      knowFact(w, me, f);
      const L = { K_MIL: 'camp', K_SMUG: 'market', K_MARKET: 'market' } as Record<string, LocId>;
      if (L[f]) w.locs[L[f]].known = true;
      say(ex, f === 'K_MIL' ? '桌上压着一张调度单：「站台东侧，军需交换点」。你把它塞进了口袋。' : f === 'K_SMUG' ? '祭坛下面压着一张纸条：「过河的人，周四，老电影院」。' : '一张传单：「老电影院地下室，以物易物」。');
      log(w, '你在搜刮时发现了新的线索。', { col: '#e8c890', important: true });
    }
    if (took.length) say(ex, `${first ? '翻出了' : '拿走了'}：${took.join('、')}。`);
    else if (!left.length && !(first && c.note)) say(ex, first ? pick(w.rng, ['什么都没有。', '早被人翻过了。', '只有灰。', '一些没用的旧东西。']) : '空了。');
    if (left.length) say(ex, `背不下了，留在原地：${left.join('、')}。`);
    return;
  }
  if (a.on === 'gate') {
    const g = sc.gates.find((x) => x.id === a.target)!;
    if (a.kind === 'force') { g.state = 'open'; say(ex, '门被撬开了。'); }
    else if (a.kind === 'pick') { if (chance(w.rng, 0.3 + me.skills.mechanic / 160)) { g.state = 'open'; say(ex, '锁开了。'); } else { noise(ex, 6, sc, 'gate', g.id); say(ex, '锁没打开。'); } }
    else if (a.kind === 'clear') { g.state = 'open'; noise(ex, 12, sc, 'gate', g.id); say(ex, '你把门口的瓦砾搬开了。'); }
    return;
  }
  if (a.on === 'stair') { const s = sc.stairs.find((x) => x.id === a.target)!; s.state = 'open'; noise(ex, 12, sc, 'stair', s.id); say(ex, '楼梯清出了一条能走的道。'); }
}

// 每过一分钟：冷、累、危险上升、可能来人
function minuteTick(w: World, ex: Explore, sc: XScene) {
  for (const p of team(w)) { p.needs.warmth = clamp(p.needs.warmth - 0.07); p.needs.energy = clamp(p.needs.energy - 0.02); }
  const danger = LOCS[ex.loc].danger[w.war.phase - 1];
  ex.threat += danger * 0.022 * (isDark(w) ? 0.6 : 1);
  if (ex.act && (ex.act.kind === 'clear')) ex.threat += 0.6;
  if (!ex.enemies.length && (ex.threat >= 100 || rnd(w.rng) < danger / 30000)) spawnEnemies(w, ex, sc);
}

function spawnEnemies(w: World, ex: Explore, sc: XScene) {
  const kind: XEnemy['kind'] = rnd(w.rng) < (w.war.phase >= 2 ? 0.6 : 0.4) ? 'patrol' : 'scavengers';
  const n = rint(w.rng, 1, kind === 'patrol' ? 3 : 2);
  for (let i = 0; i < n; i++) ex.enemies.push({ id: ex.nextEnemy++, kind, x: sc.entrance.x - 10 - i * 12, floor: sc.entrance.floor, facing: 1, path: [], climb: null, wait: 1 + i * 0.6, visits: 0, leaving: false, look: rint(w.rng, 0, 3) });
  ex.threat = 25;
  say(ex, kind === 'patrol' ? '楼下传来皮靴的声音，还有手电筒的光。有人进来了。' : '楼下有人在说话，压着嗓子。是别的拾荒者。');
}

function enemyStep(w: World, ex: Explore, sc: XScene, e: XEnemy, dt: number) {
  if (e.wait > 0 && !e.path.length && !e.climb) {
    e.wait -= dt;
    if (Math.random() < dt * 0.8) e.facing = -e.facing; // 四处照
    if (e.wait <= 0) {
      if (e.leaving) return;
      e.visits++;
      if (e.visits > 3) { e.leaving = true; e.path = findPath(sc, e, { floor: sc.entrance.floor, x: sc.entrance.x - 20 }) || []; return; }
      // 去有动静的地方，或者随便一间
      const target = ex.noiseAt && rnd(w.rng) < 0.6 ? ex.noiseAt : (() => { const rm = pick(w.rng, sc.rooms); return { floor: rm.floor, x: rm.x + rm.w / 2 }; })();
      ex.noiseAt = null;
      e.path = findPath(sc, e, target) || [];
    }
    return;
  }
  moveActor(e, e.path, dt, ENEMY_WALK);
  if (!e.path.length && !e.climb && e.wait <= 0 && !e.leaving) e.wait = 2 + rnd(w.rng) * 2.5;
}

// 被看见：同层、朝向你、没有关着的门挡着；躲起来时只有很近才可能被发现
function sees(sc: XScene, ex: Explore, e: XEnemy, dt: number): boolean {
  if (e.calm || e.climb || ex.climb || e.floor !== ex.floor || (e.leaving && e.x < sc.entrance.x)) return false;
  const d = ex.x - e.x;
  if (gateBetween(sc, e.floor, e.x, ex.x)) return false;
  if (ex.hidden !== null) return Math.abs(d) < 24 && Math.random() < dt * (e.kind === 'patrol' ? 0.12 : 0.08);
  return Math.abs(d) < 12 || (Math.abs(d) < 70 && Math.sign(d) === e.facing);
}

// 遭遇处理完：对方撤走，或者你的外出结束
export function afterEncounter(w: World, ex: Explore) {
  ex.spotted = null;
  const sc = sceneOf(w, ex);
  for (const e of ex.enemies) { e.leaving = true; e.calm = true; e.wait = 0; e.path = findPath(sc, e, { floor: sc.entrance.floor, x: sc.entrance.x - 20 }) || []; }
  if (!w.trip || w.trip.stage !== 'at') { ex.done = true; return; }
}

// 放下背包里的东西（变成地上的一堆，以后还能拿）
export function dropItem(w: World, ex: Explore, k: ItemKey, n: number) {
  const sc = sceneOf(w, ex);
  const got = takeItem(ex.bag, k, n);
  if (!got) return;
  let pile = sc.conts.find((c) => c.kind === 'pile' && c.floor === ex.floor && Math.abs(c.x - ex.x) < 10);
  if (!pile) { pile = { id: 9000 + sc.conts.length, floor: ex.floor, x: Math.round(ex.x), kind: 'pile', searched: true, loot: {} }; sc.conts.push(pile); }
  addItem(pile.loot, k, got);
}
export { bagWeight };
