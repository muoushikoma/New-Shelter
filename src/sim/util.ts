import type { ItemKey, Memory, Person, Relation, RoomId, World, LogEntry } from './types';
import { roomAt } from '../content/layout';
import { ITEMS } from '../content/items';

export const clamp = (v: number, a = 0, b = 100) => (v < a ? a : v > b ? b : v);
export const START_HOUR = 8;
export const day = (w: World) => Math.floor((w.t + START_HOUR * 60) / 1440) + 1;
export const minuteOfDay = (w: World) => (w.t + START_HOUR * 60) % 1440;
export const hour = (w: World) => Math.floor(minuteOfDay(w) / 60);
export const isNight = (w: World) => { const h = hour(w); return h >= 22 || h < 6; };
export const isDark = (w: World) => { const h = hour(w); return h >= 19 || h < 7; };
export const clock = (w: World) => { const m = minuteOfDay(w); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export const tAt = (dayN: number, h: number, m = 0) => (dayN - 1) * 1440 + h * 60 + m - START_HOUR * 60;

export function P(w: World, id: string | null | undefined): Person | undefined { return id ? w.people.find((p) => p.id === id) : undefined; }
export const player = (w: World) => w.people.find((p) => p.isPlayer)!;
export const alive = (w: World) => w.people.filter((p) => p.alive);
export const present = (w: World) => w.people.filter((p) => p.alive && p.present);
export const npcs = (w: World) => w.people.filter((p) => p.alive && p.present && !p.isPlayer);
export const roomOf = (p: Person): RoomId => (p.present ? roomAt(p.floor, p.x) : 'outside');
export const peopleIn = (w: World, room: RoomId) => present(w).filter((p) => roomOf(p) === room);
export const asleep = (p: Person) => p.action?.type === 'sleep' && (p.action.t > 0);
export const awake = (p: Person) => p.alive && p.present && !asleep(p) && !hasCond(p, 'captive');
export const hasCond = (p: Person, t: string) => p.conds.some((c) => c.type === t);
export const cond = (p: Person, t: string) => p.conds.find((c) => c.type === t);
export const nm = (w: World, id: string | null | undefined) => (id ? (P(w, id)?.isPlayer ? '你' : P(w, id)?.name || '某人') : '没人');
export const pron = (p: Person | undefined) => (p?.isPlayer ? '你' : p?.gender === 'f' ? '她' : '他');

export function newRel(): Relation {
  return { trust: 30, affection: 30, fear: 5, desire: 0, respect: 30, resentment: 0, debt: 0, state: 'stranger', times: 0, lastTalk: -9999, flirts: 0 };
}
// a 对 b 的看法
export function rel(w: World, a: string, b: string): Relation {
  let ra = w.rel[a];
  if (!ra) ra = w.rel[a] = {};
  let r = ra[b];
  if (!r) r = ra[b] = newRel();
  return r;
}
export function relAdd(w: World, a: string, b: string, d: Partial<Record<'trust' | 'affection' | 'fear' | 'desire' | 'respect' | 'resentment' | 'debt', number>>) {
  if (a === b) return;
  const r = rel(w, a, b);
  for (const k of Object.keys(d) as (keyof typeof d)[]) {
    const v = d[k]!;
    if (k === 'debt') r.debt = clamp(r.debt + v, -100, 100);
    else (r as unknown as Record<string, number>)[k] = clamp((r as unknown as Record<string, number>)[k] + v);
  }
}
// 综合好恶（-100..100）
export function opinion(w: World, a: string, b: string): number {
  const r = rel(w, a, b);
  return r.affection * 0.4 + r.trust * 0.35 + r.respect * 0.25 - r.resentment * 0.8 - (r.fear > 50 ? (r.fear - 50) * 0.3 : 0);
}

export function addMem(p: Person, w: World, m: Omit<Memory, 't'>) {
  p.mem.unshift({ ...m, t: w.t });
  if (p.mem.length > 60) p.mem.length = 60;
}
export function memOf(p: Person, kind: string, who?: string) { return p.mem.filter((m) => m.kind === kind && (!who || m.who === who)); }

export function log(w: World, text: string, opt: Partial<LogEntry> = {}) {
  w.log.unshift({ t: w.t, text, ...opt });
  if (w.log.length > 300) w.log.length = 300;
}

// 物品
export const cnt = (bag: Partial<Record<ItemKey, number>>, k: ItemKey) => bag[k] || 0;
export function addItem(bag: Partial<Record<ItemKey, number>>, k: ItemKey, n: number) {
  bag[k] = Math.max(0, Math.round(((bag[k] || 0) + n) * 100) / 100);
  if (!bag[k]) delete bag[k];
}
export function takeItem(bag: Partial<Record<ItemKey, number>>, k: ItemKey, n: number): number {
  const have = bag[k] || 0;
  const got = Math.min(have, n);
  addItem(bag, k, -got);
  return got;
}
export const bagValue = (bag: Partial<Record<ItemKey, number>>) => Object.entries(bag).reduce((s, [k, v]) => s + (ITEMS[k as ItemKey]?.value || 0) * (v || 0), 0);
export const has = (p: Person, k: ItemKey, n = 1) => cnt(p.inv, k) + cnt(p.stash, k) >= n;
export const holderOf = (w: World, k: ItemKey) => w.people.find((p) => p.alive && cnt(p.inv, k) > 0);

export function bark(p: Person, w: World, text: string, dur = 90) { p.bark = { text, until: w.t + dur }; }

export function tagMethod(p: Person, tag: string, n = 1) { p.tags[tag] = (p.tags[tag] || 0) + n; }

export function knowFact(w: World, p: Person, fact: string) {
  if (p.knows[fact]) return false;
  p.knows[fact] = true;
  if (p.isPlayer) w.discovered[fact] = true;
  return true;
}

export const fmtItems = (bag: Partial<Record<ItemKey, number>>) =>
  Object.entries(bag).filter(([, v]) => v).map(([k, v]) => `${ITEMS[k as ItemKey].name}×${Math.round((v || 0) * 10) / 10}`).join('、') || '无';

export function uid(w: World, prefix: string) { return `${prefix}${w.nextId++}`; }
