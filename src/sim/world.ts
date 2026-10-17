import { makeRng, rnd, rint, shuffle, pick, chance } from '../engine/rng';
import type { ItemKey, LocId, OriginKey, Person, Settings, World, SkillKey, Personality } from './types';
import { POOL, ORIGINS, MALE_NAMES, FEMALE_NAMES, PersonTemplate } from '../content/people';
import { floorY, spotIn, ROOM } from '../content/layout';
import { clamp, rel, log, knowFact } from './util';
import type { Look } from '../art/actors';

export const SKILLS: SkillKey[] = ['medic', 'mechanic', 'cook', 'combat', 'stealth', 'persuade', 'forgery', 'scavenge'];
export const SKILL_NAMES: Record<SkillKey, string> = { medic: '医疗', mechanic: '机械', cook: '烹饪', combat: '格斗', stealth: '潜行', persuade: '说服', forgery: '伪造', scavenge: '搜刮' };

export interface NewGameOpts {
  seed?: number; name: string; gender: 'm' | 'f'; origin: OriginKey; orientation?: 'straight' | 'gay' | 'bi'; settings: Settings; npcCount?: number;
}

function basePerson(id: string): Person {
  return {
    id, name: '', age: 30, gender: 'm', orientation: 'straight', origin: 'worker', originText: '', bio: '',
    isPlayer: false, alive: true, present: true,
    look: { skin: 'warm', hair: '#222', style: 'short', coat: '#444', pants: '#333', male: true },
    skills: { medic: 10, mechanic: 10, cook: 15, combat: 15, stealth: 15, persuade: 15, forgery: 5, scavenge: 20 },
    pers: { power: 40, morality: 50, fear: 50, attach: 40, lust: 40, social: 50, agree: 50, neuro: 50, regime: 'cynic' },
    traits: [], needs: { hunger: 70, thirst: 70, warmth: 60, energy: 70, hygiene: 50, stress: 35, desire: 15 },
    health: 90, conds: [], inv: {}, stash: {}, floor: 0, x: 200, px: 200, pfloor: 0, facing: 1, walkFrame: 0, climb: null,
    action: null, queue: [], goals: [], agenda: {}, secrets: [], knows: {}, mem: [], role: null, work: 0, workTotal: 0, tags: {},
    thought: '', joinedDay: 1, partner: null,
  };
}

export function personFromTemplate(w: World, t: PersonTemplate, id?: string): Person {
  const r = w.rng;
  const p = basePerson(id || t.key);
  p.name = t.name; p.age = t.age + rint(r, -2, 2); p.gender = t.gender;
  p.orientation = t.orientation || (chance(r, 0.08) ? 'bi' : 'straight');
  p.origin = t.origin; p.originText = t.originText; p.bio = t.bio;
  p.look = { ...t.look };
  for (const k of SKILLS) p.skills[k] = clamp((t.skills[k] ?? rint(r, 5, 25)) + rint(r, -8, 8));
  const pp = p.pers as unknown as Record<string, number | string>;
  for (const [k, v] of Object.entries(t.pers)) pp[k] = typeof v === 'number' ? clamp(v + rint(r, -10, 10)) : v;
  p.traits = [...t.traits];
  p.secrets = t.secrets.map((s) => ({ ...s, known: [] }));
  p.goals = [...t.goals];
  for (const [k, v] of Object.entries(t.inv || {})) p.inv[k as ItemKey] = v;
  for (const f of t.knows || []) p.knows[f] = true;
  for (const c of t.conds || []) p.conds.push({ type: c as Person['conds'][0]['type'], sev: 30, since: 0 });
  p.needs.hunger = rint(r, 45, 75); p.needs.thirst = rint(r, 45, 75); p.needs.energy = rint(r, 40, 80); p.needs.stress = rint(r, 30, 55);
  p.needs.desire = rint(r, 5, 30);
  return p;
}

export function newWorld(o: NewGameOpts): World {
  const seed = o.seed ?? Math.floor(Math.random() * 1e9);
  const w: World = {
    version: 1, seed, rng: makeRng(seed), t: 0, people: [], rel: {}, storage: {},
    shelter: {
      power: true, genFuel: 6, genHealth: 70, co2: 25, water: 0, tempOut: -15, rooms: {},
      archiveOpen: false, collapseWork: 0, drainFound: false, radioWork: 0, radioFixed: false,
      farm: 0, farmBuilt: false, filterBuilt: false, candles: 0, doorOpen: false, keyHolder: null, damage: 0,
    },
    politics: {
      leader: null, legitimacy: 0, lastMeeting: -9999, meetings: 0, abuses: 0, history: [], rationsDoneDay: 0,
      rules: { ration: 'free', rationSize: 2, door: 'vote', weapons: 'own', intimacy: 'free', punishment: 'warning', decision: 'assembly', ballot: 'open', storageLocked: false, nightWatch: false },
    },
    war: { phase: 1, phaseStart: [1, 0, 0, 0], endDay: 0, outcome: null, passSlots: 2, smugSeats: 2 },
    locs: {} as World['locs'], expeditions: [], trip: null, facts: {}, log: [], rumors: [], pending: [], firedEvents: {},
    discovered: {}, done: {}, tracked: [], visitors: [], settings: o.settings, ending: null,
    stats: { deaths: 0, births: 0, thefts: 0, intimacies: 0, expeditions: 0, daysAlive: 0 }, nextId: 1,
  };
  const r = w.rng;
  // 战争时钟
  const p2 = rint(r, 6, 9), p3 = p2 + rint(r, 11, 14), p4 = p3 + rint(r, 10, 13);
  w.war.phaseStart = [1, p2, p3, p4];
  w.war.endDay = p4 + rint(r, 4, 7);
  // 地点
  const locs: LocId[] = ['grain', 'hospital', 'party', 'station', 'church', 'houses', 'border', 'camp', 'market', 'redcross'];
  for (const l of locs) w.locs[l] = { looted: 0, known: !['camp', 'market', 'redcross'].includes(l), visits: 0 };

  // 主角
  const org = ORIGINS.find((x) => x.key === o.origin) || ORIGINS[0];
  const me = basePerson('player');
  me.isPlayer = true; me.name = o.name || pick(r, o.gender === 'm' ? MALE_NAMES : FEMALE_NAMES);
  me.gender = o.gender; me.orientation = o.orientation || 'straight'; me.age = rint(r, 24, 34);
  me.origin = org.key; me.originText = org.label; me.bio = org.desc;
  me.look = { skin: pick(r, ['warm', 'pale', 'tan'] as const), hair: pick(r, ['#2a2522', '#3a2a20', '#1c1a1f']), style: org.style === 'bun' && o.gender === 'm' ? 'short' : org.style === 'long' && o.gender === 'm' ? 'short' : org.style === 'tied' && o.gender === 'm' ? 'short' : org.style, coat: org.coat, pants: org.pants, male: o.gender === 'm', stubble: o.gender === 'm', cap: '#2f3a48' };
  for (const k of SKILLS) me.skills[k] = clamp((org.skills[k] ?? rint(r, 10, 25)) + rint(r, -5, 5));
  me.pers = { power: 50, morality: 50, fear: 50, attach: 40, lust: 50, social: 50, agree: 50, neuro: 50, regime: 'cynic' } as Personality;
  for (const [k, v] of Object.entries(org.inv)) me.inv[k as ItemKey] = v;
  me.inv.food = 1; me.inv.cigs = (me.inv.cigs || 0) + 3;
  me.secrets = [{ id: 'player_secret', text: org.secret, severity: o.origin === 'deserter' ? 80 : 50, known: [] }];
  w.people.push(me);
  for (const f of org.knows) knowFact(w, me, f);

  // NPC
  const n = o.npcCount ?? rint(r, 5, 7);
  const pool = shuffle(r, POOL.filter((t) => !(o.origin === 'cadre' && t.key === 'zhou')).slice());
  const chosen = pool.slice(0, n);
  // 尽量保证至少有一个会治病的人
  if (!chosen.some((t) => (t.skills.medic || 0) > 50) && chance(r, 0.6)) { const med = POOL.find((t) => t.key === 'lin')!; if (!chosen.includes(med)) chosen[n - 1] = med; }
  for (const t of chosen) w.people.push(personFromTemplate(w, t));

  // 初始位置：都在公共区（第一个早晨）
  w.people.forEach((p, i) => { p.floor = 0; p.x = spotIn('kitchen', i); p.px = p.x; p.pfloor = 0; p.facing = i % 2 ? -1 : 1; });

  // 初始关系：大多陌生，少数人原本认识
  for (const a of w.people) for (const b of w.people) if (a !== b) {
    const rr = rel(w, a.id, b.id);
    rr.trust = rint(r, 20, 40); rr.affection = rint(r, 20, 40); rr.respect = rint(r, 20, 40);
    rr.state = 'stranger';
  }
  const others = w.people.filter((p) => !p.isPlayer);
  for (let i = 0; i < 2 && others.length > 2; i++) {
    const a = pick(r, others), b = pick(r, others.filter((x) => x !== a));
    const ra = rel(w, a.id, b.id), rb = rel(w, b.id, a.id);
    ra.trust += 20; rb.trust += 20; ra.affection += 15; rb.affection += 15; ra.state = rb.state = 'acquainted';
    w.facts[`knew:${a.id}:${b.id}`] = true;
  }
  // 吸引力的随机部分
  for (const a of w.people) for (const b of w.people) if (a !== b) rel(w, a.id, b.id).desire = rint(r, 0, 35);
  // 干部的名声
  for (const p of w.people) if (p.origin === 'cadre') for (const q of w.people) if (q !== p && q.pers.regime === 'rebel') { relAddInit(w, q.id, p.id, -10); }

  // 仓库
  w.storage = {
    food: rint(r, 55, 85), fuel: rint(r, 18, 30), meds: rint(r, 1, 3), bandage: rint(r, 3, 6), cigs: rint(r, 10, 24),
    alcohol: rint(r, 1, 3), candle: rint(r, 6, 12), blanket: 3, ammo: rint(r, 0, 4), condom: rint(r, 0, 4),
  };
  if (!w.people.some((p) => p.inv.pistol)) w.storage.pistol = 1;
  w.shelter.water = rint(r, 70, 120);
  // 档案室钥匙：在干部手里，否则不知道在哪
  if (o.origin === 'cadre') me.inv.archiveKey = 1;
  // 床位
  shuffle(r, w.people.slice()).forEach((p, i) => { p.bed = i < 6 ? i : undefined; });

  // 已知目标节点
  for (const id of ['N_SURVIVE', 'E_PASS', 'P_LEADER', 'L_PARTNER', 'S_SELF', 'W_HOARD']) w.discovered[id] = true;
  w.pending.push({ id: 'intro', t: 0, ctx: {} });
  log(w, '第一个早晨。没有人知道外面的炮声什么时候会停。', { important: true, col: '#e8c890' });
  for (const p of w.people) { w.done[p.id] = {}; }
  return w;
}

function relAddInit(w: World, a: string, b: string, d: number) {
  const r = rel(w, a, b);
  r.trust = clamp(r.trust + d); r.affection = clamp(r.affection + d); r.resentment = clamp(r.resentment - d / 2);
}

// 新来的人（访客）
export function makeStranger(w: World, kind: string): Person {
  const r = w.rng;
  const t = POOL.filter((x) => !w.people.some((p) => p.id === x.key));
  let p: Person;
  if (t.length && kind !== 'deserter' && kind !== 'wounded' && chance(r, 0.6)) {
    p = personFromTemplate(w, pick(r, t));
  } else {
    const male = kind === 'deserter' || kind === 'wounded' ? chance(r, 0.8) : chance(r, 0.5);
    p = basePerson(`v${w.nextId++}`);
    p.gender = male ? 'm' : 'f';
    p.name = pick(r, male ? ['孙立新', '马德胜', '钱伟', '黄海', '田野', '冯刚', '吕强'] : ['赵小梅', '刘芳', '吴静', '郑红', '周雅', '何琴', '许兰']);
    if (w.people.some((q) => q.name === p.name)) p.name += '·' + (w.nextId % 10);
    p.age = rint(r, 20, 58);
    p.origin = kind === 'deserter' || kind === 'wounded' ? 'soldier' : pick(r, ['worker', 'farmer', 'student', 'trader'] as const);
    p.originText = kind === 'deserter' ? '逃兵' : kind === 'wounded' ? '伤兵' : pick(r, ['难民', '邮递员', '纺织工', '会计', '司机']);
    p.bio = kind === 'deserter' ? '从前线跑回来的兵。' : kind === 'wounded' ? '被炮弹震晕的兵，说不清自己是哪个部队的。' : '镇上的居民，家被炸了。';
    p.look = { skin: pick(r, ['warm', 'pale', 'tan'] as const), hair: pick(r, ['#2a2522', '#3a3028', '#5a4a40', '#1c1a1f']), style: male ? pick(r, ['short', 'cap', 'shaved'] as const) : pick(r, ['tied', 'bun', 'long'] as const), coat: kind === 'deserter' || kind === 'wounded' ? '#59603f' : pick(r, ['#4a4038', '#5a4a6a', '#3e4a5a', '#6a5a40']), pants: '#3a3a30', male, bandage: kind === 'wounded', stubble: male && chance(r, 0.5), cap: '#3a4a30' };
    for (const k of SKILLS) p.skills[k] = rint(r, 5, 45);
    if (kind === 'deserter' || kind === 'wounded') { p.skills.combat = rint(r, 40, 65); p.secrets.push({ id: `${p.id}_deserter`, text: `${p.name}是逃兵。`, severity: 70, known: [] }); }
    p.pers = { power: rint(r, 10, 80), morality: rint(r, 20, 80), fear: rint(r, 20, 80), attach: rint(r, 20, 70), lust: rint(r, 20, 70), social: rint(r, 20, 80), agree: rint(r, 20, 80), neuro: rint(r, 20, 80), regime: pick(r, ['loyal', 'cynic', 'rebel'] as const) };
    p.goals = [pick(r, ['E_CROSS', 'S_SELF', 'W_HOARD', 'P_LEADER', 'L_PARTNER'])];
    if (kind === 'wounded') p.conds.push({ type: 'wound', sev: 55, since: w.t });
    p.needs.hunger = rint(r, 15, 40); p.needs.warmth = rint(r, 10, 30);
  }
  p.joinedDay = Math.floor((w.t + 480) / 1440) + 1;
  for (const q of w.people) { rel(w, p.id, q.id); rel(w, q.id, p.id).trust = 20; rel(w, q.id, p.id).desire = rint(r, 0, 30); rel(w, p.id, q.id).desire = rint(r, 0, 30); }
  w.done[p.id] = {};
  p.floor = 0; p.x = ROOM.entrance.x + 12; p.px = p.x; p.pfloor = 0;
  return p;
}

export function ensureRandomness(w: World) { return rnd(w.rng); }
export { floorY };
