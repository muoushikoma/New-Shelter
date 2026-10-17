// 数据驱动的剧情事件：从内容包 JSON 读入，注册进事件系统。规范见 docs/CONTENT_GUIDE.md「剧情事件」
// 本文件不依赖浏览器，命令行校验工具也用它
import { defEvent, EVENTS, EventView, Choice, HOURLY_HOOKS } from '../sim/events';
import type { Action, CondType, ItemKey, Person, SkillKey, World } from '../sim/types';
import { P, player, present, rel, relAdd, opinion, log, day, hour, cnt, addItem, takeItem, addMem, bark, clamp, hasCond, knowFact, tagMethod, isNight } from '../sim/util';
import { rnd } from '../engine/rng';
import { addCond, die } from '../sim/env';
import { leaveForever } from '../sim/war';
import { makeStranger } from '../sim/world';
import { completeIntimacy } from '../sim/intimacy';
import { ITEMS } from './items';
import { matchWhen, fillText } from './match';
import { OBJECTS } from './layout';
const OBJ_IDS = OBJECTS.map((o) => o.id);

export type Who = string; // 'player' | 'leader' | 'keyholder' | 角色名（cast 里的键）| 'all'

export interface CastSpec {
  who?: 'npc' | 'leader' | 'keyholder' | 'partner' | string; // string = 人物模板 key（如 lin）
  when?: Record<string, unknown>;
  pick?: string;           // random（默认）| max:路径 | min:路径
  awake?: boolean;         // 默认 true：只选醒着的人
  optional?: boolean;      // 找不到人也照样触发（文本里该角色为空）
}
export interface Effect { op: string; [k: string]: unknown }
export interface StoryChoice {
  label: string;
  when?: Record<string, unknown>; hide?: boolean; why?: string;
  tags?: [string, string][];
  check?: { skill?: SkillKey; bonus?: number; chance?: number; who?: Who };
  effects?: Effect[]; result?: string; next?: string;
  fail?: { effects?: Effect[]; result?: string; next?: string };
}
export interface StoryEvent {
  id: string; title: string; text: string;
  trigger?: { on?: 'hourly' | 'daily' | 'manual'; hour?: number; hours?: [number, number]; chance?: number; once?: boolean; cooldown?: number; minDay?: number; maxDay?: number; when?: Record<string, unknown>; priority?: number };
  cast?: Record<string, CastSpec>;
  speaker?: string; art?: string; cg?: string;
  object?: string; label?: string;   // 挂在场景物件上：物件菜单里多一个选项（label），条件用 trigger.when
  lines?: { who: string; text: string }[];
  choices: StoryChoice[];
  auto?: Effect[];
}

export const STORY: Record<string, StoryEvent> = {};
type Cast = Record<string, string>;

const NEEDS = ['hunger', 'thirst', 'warmth', 'energy', 'hygiene', 'stress', 'desire'] as const;
const SKILLS: SkillKey[] = ['medic', 'mechanic', 'cook', 'combat', 'stealth', 'persuade', 'forgery', 'scavenge'];
const CONDS: CondType[] = ['wound', 'infection', 'fever', 'flu', 'dysentery', 'frostbite', 'heart', 'pregnant', 'trauma', 'drunk', 'hypothermia', 'starving', 'grief'];
const SHELTER_KEYS = ['water', 'damage', 'genHealth', 'collapseWork', 'farm', 'candles'] as const;
const REL_KEYS = ['trust', 'affection', 'fear', 'desire', 'respect', 'resentment', 'debt'] as const;
const LEAVE = ['crossed', 'joined', 'expelled', 'taken', 'fled'] as const;
const RESERVED = new Set(['player', 'leader', 'keyholder', 'all', 'storage', 'world', 'facts', 'settings', 'day', 'hour']);
export const PERSON_FIELDS = new Set(['id', 'key', 'name', 'realName', 'age', 'gender', 'origin', 'originText', 'traits', 'isPlayer', 'isLeader', 'keyHolder', 'health', 'needs', 'skills', 'items', 'conds', 'partner', 'hasPartner', 'partnerIsPlayer', 'rel', 'myRel', 'opinion', 'asleep', 'room', 'goals', 'regime', 'grudge', 'grief']);
export const EFFECT_OPS = ['item', 'need', 'health', 'skill', 'rel', 'relState', 'fact', 'log', 'bark', 'memory', 'cond', 'cure', 'shelter', 'tag', 'know', 'event', 'intimacy', 'leave', 'die', 'join'] as const;

// ---------- 上下文（when 条件与 {变量} 都从这里取值） ----------
export function personView(w: World, p: Person) {
  const me = player(w);
  const r = p.isPlayer ? null : rel(w, p.id, me.id), m = p.isPlayer ? null : rel(w, me.id, p.id);
  const rr = (x: typeof r) => x ? { trust: Math.round(x.trust), affection: Math.round(x.affection), fear: Math.round(x.fear), desire: Math.round(x.desire), respect: Math.round(x.respect), resentment: Math.round(x.resentment), debt: Math.round(x.debt), state: x.state, times: x.times } : null;
  return {
    id: p.id, key: p.id, name: p.isPlayer ? '你' : p.name, realName: p.name, age: p.age, gender: p.gender === 'm' ? 'male' : 'female',
    origin: p.origin, originText: p.originText, traits: p.traits, isPlayer: p.isPlayer,
    isLeader: w.politics.leader === p.id, keyHolder: w.shelter.keyHolder === p.id,
    health: Math.round(p.health), needs: Object.fromEntries(NEEDS.map((k) => [k, Math.round(p.needs[k])])), skills: { ...p.skills },
    items: Object.fromEntries(Object.keys(ITEMS).map((k) => [k, Math.floor(cnt(p.inv, k as ItemKey) + cnt(p.stash, k as ItemKey))])),
    conds: p.conds.map((c) => c.type), partner: p.partner || null, hasPartner: !!p.partner, partnerIsPlayer: p.partner === me.id,
    rel: rr(r), myRel: rr(m), opinion: p.isPlayer ? 0 : Math.round(opinion(w, p.id, me.id)),
    asleep: p.action?.type === 'sleep' && p.action.t > 0, room: p.action?.room || '',
    goals: [...p.goals], regime: p.pers.regime,
    // 对玩家最耿耿于怀的一件事、最近一次失去的人（对话里用）
    grudge: p.isPlayer ? '' : (p.mem.filter((m) => m.who === me.id && m.w < -10).sort((a, b) => a.w - b.w)[0]?.text || ''),
    grief: p.mem.find((m) => m.kind === 'death')?.text || '',
  };
}
export function storyContext(w: World, cast: Cast): Record<string, unknown> {
  const h = hour(w);
  const ctx: Record<string, unknown> = {
    day: day(w), hour: h, timeOfDay: h < 6 || h >= 22 ? 'night' : h < 9 ? 'dawn' : h < 17 ? 'day' : 'dusk', night: isNight(w),
    warPhase: w.war.phase, food: Math.floor(cnt(w.storage, 'food')), fuel: Math.floor(cnt(w.storage, 'fuel')), meds: Math.floor(cnt(w.storage, 'meds')),
    storage: Object.fromEntries(Object.keys(ITEMS).map((k) => [k, Math.floor(cnt(w.storage, k as ItemKey))])),
    water: Math.round(w.shelter.water), power: w.shelter.power, tempOut: Math.round(w.shelter.tempOut), damage: Math.round(w.shelter.damage),
    population: present(w).length, leader: !w.politics.leader ? 'none' : w.politics.leader === player(w).id ? 'player' : 'npc',
    regime: !w.politics.leader ? (w.politics.meetings ? 'commune' : 'anarchy') : w.politics.rules.decision === 'leader' ? 'dictatorship' : 'oligarchy',
    rules: { ...w.politics.rules }, facts: w.facts, settings: { ...w.settings }, player: personView(w, player(w)),
    leaderP: w.politics.leader ? personView(w, P(w, w.politics.leader)!) : null,
  };
  for (const [k, id] of Object.entries(cast)) { const p = P(w, id); ctx[k] = p ? personView(w, p) : { name: '', id: '' }; }
  return ctx;
}

// ---------- 选角 ----------
function castFor(w: World, ev: StoryEvent, preset: Cast = {}): Cast | null {
  const cast: Cast = { ...preset };
  const me = player(w);
  for (const [k, spec] of Object.entries(ev.cast || {})) {
    if (cast[k] && P(w, cast[k])?.present) continue;
    const used = new Set(Object.values(cast));
    let cands = present(w).filter((p) => !p.isPlayer && !used.has(p.id) && !hasCond(p, 'captive') && !(spec.awake !== false && p.action?.type === 'sleep' && p.action.t > 0));
    const who = spec.who || 'npc';
    if (who === 'leader') cands = cands.filter((p) => w.politics.leader === p.id);
    else if (who === 'keyholder') cands = cands.filter((p) => w.shelter.keyHolder === p.id);
    else if (who === 'partner') cands = cands.filter((p) => me.partner === p.id);
    else if (who !== 'npc') cands = cands.filter((p) => p.id === who);
    if (spec.when) cands = cands.filter((p) => matchWhen(spec.when, personView(w, p)));
    if (!cands.length) { if (spec.optional) continue; return null; }
    let pickP = cands[Math.floor(rnd(w.rng) * cands.length)];
    const m = (spec.pick || '').match(/^(max|min):(.+)$/);
    if (m) {
      const val = (p: Person) => Number((m[2].split('.').reduce<unknown>((o, kk) => (o as Record<string, unknown> | null)?.[kk], personView(w, p))) ?? 0);
      pickP = cands.slice().sort((a, b) => (m[1] === 'max' ? val(b) - val(a) : val(a) - val(b)))[0];
    }
    cast[k] = pickP.id;
  }
  return cast;
}

// ---------- 效果 ----------
function whoList(w: World, cast: Cast, who: unknown): Person[] {
  const s = String(who ?? 'player');
  if (s === 'player') return [player(w)];
  if (s === 'all') return present(w).filter((p) => !p.isPlayer);
  if (s === 'everyone') return present(w);
  if (s === 'leader') { const p = P(w, w.politics.leader); return p ? [p] : []; }
  if (s === 'keyholder') { const p = P(w, w.shelter.keyHolder); return p ? [p] : []; }
  const p = P(w, cast[s]); return p ? [p] : [];
}
export function applyEffects(w: World, effects: Effect[] | undefined, cast: Cast) {
  const ctx = () => storyContext(w, cast);
  for (const e of effects || []) {
    const ws = () => whoList(w, cast, e.who);
    const n = Number(e.add ?? e.qty ?? 0);
    switch (e.op) {
      case 'item': {
        const k = e.item as ItemKey;
        if (e.who === 'storage') { if (n >= 0) addItem(w.storage, k, n); else takeItem(w.storage, k, -n); break; }
        for (const p of ws()) { if (n >= 0) addItem(p.inv, k, n); else { const got = takeItem(p.inv, k, -n); if (got < -n) takeItem(p.stash, k, -n - got); } }
        break;
      }
      case 'need': for (const p of ws()) { const k = e.need as typeof NEEDS[number]; p.needs[k] = clamp(p.needs[k] + n); } break;
      case 'health': for (const p of ws()) p.health = clamp(p.health + n); break;
      case 'skill': for (const p of ws()) { const k = e.skill as SkillKey; p.skills[k] = clamp(p.skills[k] + n); } break;
      case 'rel': {
        const d: Record<string, number> = {};
        for (const k of REL_KEYS) if (typeof e[k] === 'number') d[k] = e[k] as number;
        for (const a of whoList(w, cast, e.from)) for (const b of whoList(w, cast, e.to ?? 'player')) { if (a === b) continue; relAdd(w, a.id, b.id, d); if (e.both) relAdd(w, b.id, a.id, d); }
        break;
      }
      case 'relState': for (const a of whoList(w, cast, e.from)) for (const b of whoList(w, cast, e.to ?? 'player')) { if (a === b) continue; rel(w, a.id, b.id).state = e.state as never; if (e.both !== false) rel(w, b.id, a.id).state = e.state as never; } break;
      case 'fact': { const k = String(e.key); if ('value' in e) w.facts[k] = e.value as never; else w.facts[k] = Number(w.facts[k] || 0) + n; break; }
      case 'log': log(w, fillText(String(e.text), ctx()), { important: !!e.important, col: e.important ? '#e8c890' : undefined }); break;
      case 'bark': for (const p of ws()) bark(p, w, fillText(String(e.text), ctx()), Number(e.dur || 120)); break;
      case 'memory': for (const p of ws()) addMem(p, w, { kind: String(e.kind || 'story'), who: whoList(w, cast, e.about)[0]?.id, w: Number(e.weight ?? 0), text: fillText(String(e.text), ctx()) }); break;
      case 'cond': for (const p of ws()) addCond(w, p, e.cond as CondType, Number(e.sev ?? 40)); break;
      case 'cure': for (const p of ws()) p.conds = p.conds.filter((c) => c.type !== e.cond); break;
      case 'shelter': { const k = e.key as typeof SHELTER_KEYS[number]; const s = w.shelter as unknown as Record<string, number>; s[k] = Math.max(0, (s[k] || 0) + n); if (k === 'damage' || k === 'genHealth') s[k] = clamp(s[k]); break; }
      case 'tag': for (const p of ws()) tagMethod(p, String(e.tag), Number(e.n ?? 1)); break;
      case 'know': {
        for (const p of ws()) knowFact(w, p, String(e.fact));
        // 知道了门路，地图上就出现对应的地点
        const loc = ({ K_MIL: 'camp', K_SMUG: 'market', K_REDCROSS: 'redcross' } as Record<string, string>)[String(e.fact)];
        if (loc && ws().some((p) => p.isPlayer) && (w.locs as Record<string, { known: boolean }>)[loc]) (w.locs as Record<string, { known: boolean }>)[loc].known = true;
        break;
      }
      case 'event': {
        const id = String(e.id);
        const c: Record<string, unknown> = {};
        for (const [k, v] of Object.entries((e.ctx as Record<string, unknown>) || {})) c[k] = typeof v === 'string' && cast[v] ? cast[v] : v === 'player' ? player(w).id : v;
        w.pending.push({ id, t: w.t + Number(e.delay || 0), ctx: STORY[id] ? { cast: { ...cast } } : c });
        break;
      }
      case 'intimacy': {
        const a = whoList(w, cast, e.initiator)[0], b = whoList(w, cast, e.partner ?? 'player')[0];
        const consent = String(e.consent || 'willing');
        if (!a || !b || a === b || !w.settings.adult || (consent === 'coerced' && !w.settings.coercion)) break;
        completeIntimacy(w, a, b, { data: { consent, motive: (e.motive as string[]) || ['慰藉'] } } as unknown as Action);
        break;
      }
      case 'leave': for (const p of ws()) if (!p.isPlayer) leaveForever(w, p, (e.reason as typeof LEAVE[number]) || 'fled'); break;
      case 'die': for (const p of ws()) die(w, p, fillText(String(e.cause || '死了'), ctx())); break;
      case 'join': {
        const p = makeStranger(w, String(e.kind || 'refugee'));
        w.people.push(p);
        if (e.as) cast[String(e.as)] = p.id;
        log(w, `${p.name}加入了避难所。`, { important: true });
        break;
      }
    }
  }
}

// ---------- 事件视图 ----------
function check(w: World, c: StoryChoice['check'], cast: Cast): boolean {
  if (!c) return true;
  if (typeof c.chance === 'number') return rnd(w.rng) < c.chance;
  const p = whoList(w, cast, c.who ?? 'player')[0];
  const s = c.skill ? p?.skills[c.skill] ?? 0 : 50;
  return rnd(w.rng) * 100 < clamp(s + (c.bonus || 0), 5, 95);
}
const SKILL_CN: Record<string, string> = { medic: '医疗', mechanic: '机械', cook: '烹饪', combat: '格斗', stealth: '潜行', persuade: '说服', forgery: '伪造', scavenge: '搜刮' };

function view(w: World, ev: StoryEvent, cast: Cast): EventView {
  const c = storyContext(w, cast);
  const choices: Choice[] = [];
  for (const ch of ev.choices) {
    const ok = matchWhen(ch.when, c);
    if (!ok && ch.hide) continue;
    const tags: [string, string][] = [...(ch.tags || [])];
    if (ch.check?.skill) { const p = whoList(w, cast, ch.check.who ?? 'player')[0]; tags.push([`${SKILL_CN[ch.check.skill] || ch.check.skill} ${p?.skills[ch.check.skill] ?? 0}`, '#d8b060']); }
    else if (typeof ch.check?.chance === 'number') tags.push([`${Math.round(ch.check.chance * 100)}%`, '#d8b060']);
    choices.push({
      label: fillText(ch.label, c), tags, ok, why: ok ? undefined : fillText(ch.why || '条件不满足', c),
      run: (wd) => {
        const success = check(wd, ch.check, cast);
        const br = success ? ch : { effects: ch.fail?.effects, result: ch.fail?.result, next: ch.fail?.next };
        applyEffects(wd, br.effects, cast);
        const text = br.result ? fillText(br.result, storyContext(wd, cast)) : '';
        if (br.next) {
          const nx = STORY[br.next];
          if (nx) { const cc = castFor(wd, nx, cast); if (cc) { const v = view(wd, nx, cc); if (text) v.text = text + '\n\n' + v.text; return v; } }
          else if (EVENTS[br.next]) wd.pending.push({ id: br.next, t: wd.t, ctx: {} });
        }
        return text;
      },
    });
  }
  if (!choices.length) choices.push({ label: '……', run: () => '' });
  return {
    id: ev.id, title: fillText(ev.title, c), text: fillText(ev.text, c), art: ev.art, cg: ev.cg,
    speaker: ev.speaker ? (ev.speaker === 'player' ? player(w).id : cast[ev.speaker]) : undefined,
    lines: (ev.lines || []).map((l) => ({ who: l.who === 'player' ? player(w).id : cast[l.who], text: fillText(l.text, c) })).filter((l) => l.who),
    choices,
  };
}

export function registerStory(ev: StoryEvent) {
  STORY[ev.id] = ev;
  defEvent({
    id: ev.id, needsPlayer: true,
    build: (w, ctx) => { const cast = castFor(w, ev, (ctx.cast as Cast) || {}); if (!cast) return null; if (ev.object) { w.facts['story:last:' + ev.id] = w.t; w.firedEvents[ev.id] = (w.firedEvents[ev.id] || 0) + 1; } return view(w, ev, cast); },
    auto: (w, ctx) => { const cast = castFor(w, ev, (ctx.cast as Cast) || {}); if (cast) applyEffects(w, ev.auto, cast); },
  });
}

// ---------- 物件上的剧情 ----------
export function storyObjectOptions(w: World, obj: string): { id: string; label: string; ok?: boolean; why?: string; tags?: [string, string][] }[] {
  const out: { id: string; label: string; ok?: boolean; why?: string; tags?: [string, string][] }[] = [];
  for (const ev of Object.values(STORY)) {
    if (ev.object !== obj) continue;
    const t = ev.trigger || {};
    if (t.once && w.firedEvents[ev.id]) continue;
    const last = Number(w.facts['story:last:' + ev.id] ?? -1e9);
    if (t.cooldown && w.t - last < t.cooldown * 1440) continue;
    const cast = castFor(w, ev);
    if (!cast || !matchWhen(t.when, storyContext(w, cast))) continue;
    out.push({ id: 'story:' + ev.id, label: fillText(ev.label || ev.title, storyContext(w, cast)) });
  }
  return out;
}

// ---------- 触发 ----------
function storyHourly(w: World) {
  const me = player(w);
  if (!me.alive || !me.present || w.trip || hasCond(me, 'captive') || w.ending) return;
  if (w.pending.filter((e) => STORY[e.id]).length >= 2) return;
  const h = hour(w), d = day(w);
  const ready: StoryEvent[] = [];
  for (const ev of Object.values(STORY)) {
    const t = ev.trigger || {};
    const on = t.on || 'hourly';
    if (on === 'manual' || ev.object) continue;
    if (on === 'daily' && h !== (t.hour ?? 10)) continue;
    if (t.hours && !(t.hours[0] <= t.hours[1] ? h >= t.hours[0] && h <= t.hours[1] : h >= t.hours[0] || h <= t.hours[1])) continue;
    if (t.minDay && d < t.minDay) continue;
    if (t.maxDay && d > t.maxDay) continue;
    if (t.once && w.firedEvents[ev.id]) continue;
    const last = Number(w.facts['story:last:' + ev.id] ?? -1e9);
    if (w.t - last < (t.cooldown ?? 1) * 1440) continue;
    if (w.pending.some((e) => e.id === ev.id)) continue;
    ready.push(ev);
  }
  ready.sort((a, b) => (b.trigger?.priority || 0) - (a.trigger?.priority || 0));
  for (const ev of ready) {
    if (rnd(w.rng) >= (ev.trigger?.chance ?? (ev.trigger?.on === 'daily' ? 1 : 0.1))) continue;
    const cast = castFor(w, ev);
    if (!cast) continue;
    if (!matchWhen(ev.trigger?.when, storyContext(w, cast))) continue;
    w.facts['story:last:' + ev.id] = w.t;
    w.pending.push({ id: ev.id, t: w.t, ctx: { cast } });
    return; // 每小时最多一个
  }
}
HOURLY_HOOKS.push(storyHourly);

// ---------- 校验 ----------
export function validateStory(list: StoryEvent[], file: string, builtIn: Set<string>, allIds: Set<string>): string[] {
  const errs: string[] = [];
  const E = (id: string, m: string) => errs.push(`${file} [${id}] ${m}`);
  const ROOTS = new Set(['day', 'hour', 'timeOfDay', 'night', 'warPhase', 'food', 'fuel', 'meds', 'storage', 'water', 'power', 'tempOut', 'damage', 'population', 'leader', 'regime', 'rules', 'facts', 'settings', 'player', 'leaderP']);
  for (const ev of list) {
    const id = ev?.id || '?';
    if (!ev || typeof ev.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(ev.id)) { E(id, 'id 必须是小写字母开头、只含 a-z 0-9 _'); continue; }
    if (builtIn.has(ev.id)) E(id, '和内置事件重名');
    if (!ev.title) E(id, '缺少 title');
    if (typeof ev.text !== 'string') E(id, '缺少 text');
    if (!Array.isArray(ev.choices)) E(id, 'choices 必须是数组');
    const t = ev.trigger || {};
    if (t.on && !['hourly', 'daily', 'manual'].includes(t.on)) E(id, `trigger.on 只能是 hourly / daily / manual，现在是 ${t.on}`);
    if (t.chance !== undefined && !(t.chance >= 0 && t.chance <= 1)) E(id, 'trigger.chance 要在 0~1 之间');
    const castKeys = Object.keys(ev.cast || {});
    for (const k of castKeys) if (!/^[a-z][a-z0-9_]*$/.test(k) || RESERVED.has(k) || ROOTS.has(k)) E(id, `角色名 ${k} 不合法或是保留字`);
    const roles = new Set(['player', ...castKeys]);
    const known = new Set([...ROOTS, ...castKeys]);
    const checkText = (s0: unknown, where: string) => {
      if (typeof s0 !== 'string') return;
      let s = s0;
      for (let pass = 0; pass < 3; pass++) {
        for (const m of s.matchAll(/\{([^{}]+)\}/g)) {
          const inner = m[1];
          let root = '';
          if (inner.startsWith('?')) { root = inner.slice(1).split('.')[0]; if (!/^\?[a-zA-Z0-9_.]+\.(gt|lt|eq):[^ ?]+\s*\?[^|]*\|/.test(inner)) E(id, `${where} 的条件 {${inner}} 写法不对，应为 {?路径.gt:数值 ? 文本甲 | 文本乙}`); }
          else if (inner.includes('|')) { const mm = inner.match(/^[^|]+\|[^|]+\|[^|:]+:([a-zA-Z0-9_]+)$/); root = mm ? mm[1] : ''; if (!mm) E(id, `${where} 的 {${inner}} 写法不对，性别分支应为三段 {他|她|TA:角色}`); }
          else root = inner.split('.')[0];
          if (root && !known.has(root)) E(id, `${where} 引用了不存在的变量 {${inner}}`);
          const path = inner.startsWith('?') ? inner.slice(1).split(':')[0].replace(/\.(gt|lt|eq)$/, '') : inner.includes('|') ? '' : inner;
          const seg = path.split('.');
          if ((roles.has(seg[0]) || seg[0] === 'leaderP') && seg[1] && !PERSON_FIELDS.has(seg[1])) E(id, `${where} 的 {${inner}}：人物没有字段 ${seg[1]}（可用：${[...PERSON_FIELDS].join(' ')}）`);
        }
        s = s.replace(/\{[^{}]+\}/g, '');
      }
      if (/[{}]/.test(s)) E(id, `${where} 有不成对的大括号`);
    };
    const OPS_RE = /\.(any|all|none|in|not|lt|gt|lte|gte|between|exists)$/;
    const checkWhen = (w0: Record<string, unknown> | undefined, where: string, personOnly = false) => {
      for (const k of Object.keys(w0 || {})) {
        const seg = k.replace(OPS_RE, '').split('.');
        if (personOnly) { if (!PERSON_FIELDS.has(seg[0])) E(id, `${where} 条件 ${k}：人物没有字段 ${seg[0]}`); continue; }
        if (!known.has(seg[0])) E(id, `${where} 条件 ${k}：没有 ${seg[0]} 这个变量`);
        else if ((roles.has(seg[0]) || seg[0] === 'leaderP') && seg[1] && !PERSON_FIELDS.has(seg[1])) E(id, `${where} 条件 ${k}：人物没有字段 ${seg[1]}`);
      }
    };
    checkWhen(t.when, 'trigger.when');
    for (const [k, c] of Object.entries(ev.cast || {})) { checkWhen(c?.when, `cast.${k}.when`, true); if (c?.pick && !/^(random|(max|min):[a-zA-Z0-9_.]+)$/.test(c.pick)) E(id, `cast.${k}.pick 只能是 random / max:路径 / min:路径`); }
    (ev.choices || []).forEach((c, i) => checkWhen(c.when, `choices[${i}].when`));
    checkText(ev.title, 'title'); checkText(ev.text, 'text');
    if (ev.speaker && !roles.has(ev.speaker)) E(id, `speaker ${ev.speaker} 不是角色`);
    if (ev.object && !OBJ_IDS.includes(ev.object)) E(id, `object ${ev.object} 不存在（可选：${OBJ_IDS.join(' ')}）`);
    for (const l of ev.lines || []) { if (!roles.has(l.who)) E(id, `lines 里的 ${l.who} 不是角色`); checkText(l.text, 'lines'); }
    const checkEffects = (effs: Effect[] | undefined, where: string) => {
      for (const e of effs || []) {
        if (!e || !(EFFECT_OPS as readonly string[]).includes(e.op)) { E(id, `${where} 未知效果 op: ${e?.op}`); continue; }
        const who = (k: string, extra: string[] = []) => { const v = e[k]; if (v === undefined) return; if (!['player', 'all', 'everyone', 'leader', 'keyholder', ...extra].includes(String(v)) && !castKeys.includes(String(v)) && !(e.op === 'join')) E(id, `${where} ${e.op}.${k} = ${v} 不是角色`); };
        who('who', e.op === 'item' ? ['storage'] : []); who('from'); who('to'); who('about'); who('initiator'); who('partner');
        if (e.op === 'item' && !(String(e.item) in ITEMS)) E(id, `${where} 物品 ${e.item} 不存在`);
        if (e.op === 'need' && !(NEEDS as readonly string[]).includes(String(e.need))) E(id, `${where} need 只能是 ${NEEDS.join('/')}`);
        if (e.op === 'skill' && !SKILLS.includes(e.skill as SkillKey)) E(id, `${where} skill 只能是 ${SKILLS.join('/')}`);
        if ((e.op === 'cond' || e.op === 'cure') && !CONDS.includes(e.cond as CondType)) E(id, `${where} cond 只能是 ${CONDS.join('/')}`);
        if (e.op === 'shelter' && !(SHELTER_KEYS as readonly string[]).includes(String(e.key))) E(id, `${where} shelter.key 只能是 ${SHELTER_KEYS.join('/')}`);
        if (e.op === 'leave' && e.reason && !(LEAVE as readonly string[]).includes(String(e.reason))) E(id, `${where} leave.reason 只能是 ${LEAVE.join('/')}`);
        if (e.op === 'intimacy' && !['eager', 'willing', 'reluctant', 'coerced'].includes(String(e.consent || 'willing'))) E(id, `${where} intimacy.consent 只能是 eager/willing/reluctant/coerced`);
        if (e.op === 'event' && !allIds.has(String(e.id))) E(id, `${where} event.id ${e.id} 不存在`);
        if (e.op === 'join' && e.as) known.add(String(e.as));
        if (['log', 'bark', 'memory'].includes(e.op)) { if (typeof e.text !== 'string') E(id, `${where} ${e.op} 缺少 text`); checkText(e.text, where); }
        if (e.op === 'fact' && !e.key) E(id, `${where} fact 缺少 key`);
      }
    };
    checkEffects(ev.auto, 'auto');
    (ev.choices || []).forEach((c, i) => {
      const where = `choices[${i}]`;
      if (!c.label) E(id, `${where} 缺少 label`);
      checkText(c.label, where); checkText(c.result, where); checkText(c.why, where); checkText(c.fail?.result, where);
      checkEffects(c.effects, where); checkEffects(c.fail?.effects, where + '.fail');
      for (const nx of [c.next, c.fail?.next]) if (nx && !allIds.has(nx)) E(id, `${where} next ${nx} 不存在`);
      if (c.check?.skill && !SKILLS.includes(c.check.skill)) E(id, `${where} check.skill 不对`);
    });
  }
  return errs;
}
