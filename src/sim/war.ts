// 外部世界：战争时钟、敲门的人、地表探索、军营/黑市/红十字
import type { Action, ItemKey, LocId, Person, World, Encounter } from './types';
import { LOCS } from '../content/locations';
import { ITEMS } from '../content/items';
import { clamp, cnt, addItem, takeItem, log, nm, P, player, present, alive, rel, relAdd, day, hour, isNight, isDark, addMem, knowFact, tagMethod, hasCond, fmtItems, opinion, bark } from './util';
import { rnd, chance, pick, rint, weighted } from '../engine/rng';
import { addCond, die } from './env';
import { makeStranger } from './world';
import { hasMil } from './goals';
import { ROOM } from '../content/layout';

export const PHASE_NAMES = ['', '崩溃', '炮火', '占领', '终局'];
export const milOperator = (w: World) => (w.war.phase >= 3 ? 'occupier' : 'regime');
export const milName = (w: World) => (w.war.phase >= 3 ? '占领军' : '政府军');

// ---------- 战争时钟 ----------
export function dailyWar(w: World) {
  const d = day(w);
  const ws = w.war;
  for (let ph = 2; ph <= 4; ph++) {
    if (ws.phase < ph && d >= ws.phaseStart[ph - 1]) {
      ws.phase = ph;
      w.pending.push({ id: 'phase' + ph, t: w.t, ctx: {} });
      if (ph === 2) { ws.passSlots += 2; ws.smugSeats = 3; w.locs.market.known = w.locs.market.known || !!player(w).knows.K_MARKET; }
      if (ph === 3) { ws.passSlots = 3; ws.smugSeats += 2; for (const p of alive(w)) if (w.facts[`C_MIL:${p.id}`] === 'regime') w.facts[`oldRegimeContact:${p.id}`] = true; }
      if (ph === 4) { ws.passSlots += 1; }
    }
  }
  if (d >= ws.endDay && !w.firedEvents.final) w.pending.push({ id: 'final', t: w.t, ctx: {} });
  // 炮击
  if (ws.phase === 2 && rnd(w.rng) < 0.45) w.pending.push({ id: 'shelling', t: w.t + rint(w.rng, 60, 900), ctx: {} });
  // 敲门的人
  const knockP = [0, 0.45, 0.4, 0.45, 0.3][ws.phase];
  if (rnd(w.rng) < knockP && d >= 2) {
    const kinds: [string, number][] = ws.phase === 1 ? [['refugee', 3], ['deserter', 2], ['mp', 2]]
      : ws.phase === 2 ? [['refugee', 2], ['wounded', 2], ['mp', 2], ['smuggler', 1]]
      : ws.phase === 3 ? [['occupier', 3], ['refugee', 2], ['redcross', 1], ['smuggler', 1]]
      : [['refugee', 2], ['occupier', 1], ['soldiers', 2]];
    const kind = weighted(w.rng, kinds);
    w.pending.push({ id: 'knock', t: w.t + rint(w.rng, 120, 900), ctx: { kind } });
  }
}

// ---------- NPC 外出 ----------
export function planExpedition(w: World, p: Person, loc: LocId | 'drain', purpose: string): Action | null {
  if (loc === 'drain') {
    // 从暗渠离开：直接走
    return { type: 'expedition', room: 'collapse', x: 340, dur: 1, t: 0, data: { loc, purpose }, reason: '从暗渠走' };
  }
  const L = LOCS[loc];
  if (L.phases && !L.phases.includes(w.war.phase)) return null;
  if (w.expeditions.length >= 2 || w.expeditions.some((e) => e.loc === loc) || day(w) < 2) return null;
  const carry: Partial<Record<ItemKey, number>> = {};
  if (purpose === 'contact') { const f = Math.min(6, cnt(p.inv, 'food') + cnt(p.stash, 'food')); if (f >= 6) { moveToInv(p, 'food', 6); carry.food = 6; } else if (cnt(p.inv, 'cigs') >= 5) carry.cigs = 5; else if (cnt(p.inv, 'alcohol') >= 1) carry.alcohol = 1; }
  if (purpose === 'pass') { if (cnt(p.inv, 'meds') >= 2) carry.meds = 2; else if (cnt(p.inv, 'valuables') >= 4) carry.valuables = 4; else { moveToInv(p, 'food', 12); carry.food = Math.min(12, cnt(p.inv, 'food')); } }
  for (const [k, v] of Object.entries(carry)) { takeItem(p.inv, k as ItemKey, v || 0); }
  w.expeditions.push({ members: [p.id], loc, leaveAt: w.t, returnAt: w.t + L.travel * 2 + 90 + rint(w.rng, 0, 60), purpose, carry, resolved: false, npcOnly: true });
  p.present = false;
  p.agenda.tripCool = w.t + 1440 * 2;
  w.stats.expeditions++;
  const said = purpose === 'cross' ? '说出去找点东西' : purpose === 'contact' || purpose === 'pass' ? '没说去哪' : `说去${L.name}`;
  log(w, `${p.name}从竖井爬了出去，${said}。`, { who: [p.id] });
  return { type: 'away', room: 'outside', x: 0, dur: 99999, t: 0, reason: '不在避难所' };
}
function moveToInv(p: Person, k: ItemKey, n: number) { const need = n - cnt(p.inv, k); if (need > 0) addItem(p.inv, k, takeItem(p.stash, k, need)); }

export function tickExpeditions(w: World) {
  for (const e of w.expeditions) {
    if (e.resolved || e.returnAt > w.t) continue;
    e.resolved = true;
    resolveNpcExpedition(w, e);
  }
  w.expeditions = w.expeditions.filter((e) => !e.resolved);
}

function resolveNpcExpedition(w: World, e: World['expeditions'][0]) {
  const p = P(w, e.members[0]);
  if (!p || !p.alive) return;
  const L = LOCS[e.loc];
  const danger = L.danger[w.war.phase - 1] / 100;
  const skill = (p.skills.stealth + p.skills.combat) / 200;
  const roll = rnd(w.rng);
  const comeBack = () => { p.present = true; p.floor = 0; p.x = ROOM.entrance.x + 30; p.px = p.x; p.pfloor = 0; p.action = null; };
  // 死亡 / 被抓 / 受伤
  if (roll < danger * 0.07 * (1.2 - skill)) { p.present = false; die(w, p, `死在了${L.name}附近`); log(w, `${p.name}再也没有回来。后来有人在${L.name}附近看见了${p.gender === 'f' ? '她' : '他'}的围巾。`, { col: '#e85a4a', important: true }); return; }
  if (roll < danger * 0.12 * (1.2 - skill)) { log(w, `${p.name}一夜没回来。`, { col: '#e8a060', important: true }); w.facts[`missing:${p.id}`] = w.t; w.pending.push({ id: 'npc_return', t: w.t + rint(w.rng, 1440, 3 * 1440), ctx: { id: p.id, captured: true } }); return; }
  if (roll < danger * 0.35) addCond(w, p, 'wound', rint(w.rng, 15, 40));
  p.needs.warmth = clamp(p.needs.warmth - 25); p.needs.energy = clamp(p.needs.energy - 20);
  const got: Partial<Record<ItemKey, number>> = {};
  const loot = () => { for (const [k, a, b, pr] of L.loot || []) if (rnd(w.rng) < pr * (1 - w.locs[e.loc].looted / 140)) { const n = rint(w.rng, a, b); got[k] = (got[k] || 0) + n; } w.locs[e.loc].looted = clamp(w.locs[e.loc].looted + 8); };
  const result: string[] = [];
  switch (e.purpose) {
    case 'cross': {
      // 离开：持证/名额
      const ok = cnt(p.inv, 'pass') > 0 ? 0.9 : cnt(p.inv, 'forgedPass') > 0 ? 0.55 + Number(w.facts[`forgeQ:${p.id}`] || 40) / 250 : w.facts[`seat:${p.id}`] ? 0.8 : 0.4;
      if (rnd(w.rng) < ok) { leaveForever(w, p, 'crossed'); return; }
      if (rnd(w.rng) < 0.5) { die(w, p, '在过境时被打死'); return; }
      result.push('没能过去'); break;
    }
    case 'contact': if (rnd(w.rng) < 0.75) { w.facts[`C_MIL:${p.id}`] = milOperator(w); knowFact(w, p, 'K_MIL'); result.push('和军营里的人搭上了话'); } break;
    case 'pass': if (hasMil(w, p) && w.war.passSlots > 0 && rnd(w.rng) < 0.8) { w.war.passSlots--; addItem(p.inv, 'pass', 1); w.facts[`passOp:${p.id}`] = milOperator(w); result.push('换到了一张通行证'); } break;
    case 'smug': if (rnd(w.rng) < 0.7) { takeItem(p.inv, 'valuables', 2) || takeItem(p.inv, 'meds', 2); w.facts[`C_SMUG:${p.id}`] = true; result.push('见到了走私的人'); } break;
    case 'seat': if (w.war.smugSeats > 0 && rnd(w.rng) < 0.8) { takeItem(p.inv, 'valuables', 4) || takeItem(p.inv, 'meds', 3); w.war.smugSeats--; w.facts[`seat:${p.id}`] = true; result.push('买到了一个过河的名额'); } break;
    case 'register': if (rnd(w.rng) < 0.85) { w.facts.rcRegistered = true; w.facts.rcBy = p.id; result.push('在红十字站登记了避难所'); log(w, `${p.name}在红十字站登记了避难所。外面终于有人知道这里还有活人。`, { col: '#a0d8e8', important: true }); } break;
    case 'scout': loot(); if (e.loc === 'station' && rnd(w.rng) < 0.6) { knowFact(w, p, 'K_MIL'); result.push('看到了火车站旁边的军营'); } break;
    default: loot();
  }
  if (e.purpose !== 'scout' && !['cross', 'contact', 'pass', 'smug', 'seat', 'register'].includes(e.purpose)) {/* loot already */}
  // 带回来的东西：多数上交，私心重的人留一部分
  const keep = p.pers.morality < 45 ? 0.5 : p.pers.morality < 65 ? 0.2 : 0;
  const share: Partial<Record<ItemKey, number>> = {};
  for (const [k, v] of Object.entries(got)) {
    const n = v || 0; const mine = ['pass', 'papers', 'map', 'pistol', 'blankPermit', 'valuables'].includes(k) ? n : Math.round(n * keep);
    addItem(p.inv, k as ItemKey, mine); addItem(w.storage, k as ItemKey, n - mine); if (n - mine > 0) share[k as ItemKey] = n - mine;
  }
  for (const [k, v] of Object.entries(e.carry)) addItem(p.inv, k as ItemKey, v || 0);
  comeBack();
  w.locs[e.loc].visits++;
  const shared = fmtItems(share);
  log(w, `${p.name}回来了，冻得嘴唇发紫。${shared !== '无' ? '带回：' + shared + '。' : '几乎空着手。'}${result.length && (p.pers.social > 60 || chance(w.rng, 0.3)) ? '（' + result.join('，') + '）' : ''}`, { col: '#c8d0a0', who: [p.id] });
  if (Object.keys(share).length) for (const q of present(w)) if (q !== p) relAdd(w, q.id, p.id, { respect: 3, trust: 2 });
}

export function leaveForever(w: World, p: Person, reason: 'crossed' | 'joined' | 'expelled' | 'taken' | 'fled') {
  p.present = false; p.leftReason = reason; p.action = null;
  if (w.shelter.keyHolder === p.id) { w.shelter.keyHolder = null; w.facts.keyGone = true; }
  if (w.politics.leader === p.id) { w.politics.leader = null; w.politics.legitimacy = 0; }
  const txt = { crossed: `${p.name}没有回来。后来有人说，${p.gender === 'f' ? '她' : '他'}过了河。`, joined: `${p.name}留在了外面，换了一身衣服。`, expelled: `${p.name}被赶了出去。`, taken: `${p.name}被带走了。`, fled: `${p.name}跑了。` }[reason];
  if (!p.isPlayer) log(w, txt, { col: '#c8c0b0', important: true });
  // 伴侣
  const partner = P(w, p.partner || null);
  if (partner && partner.alive && partner.present && reason === 'crossed') { addCond(w, partner, 'grief', 50); addMem(partner, w, { kind: 'left', who: p.id, w: -50, text: `${p.name}一个人走了。` }); relAdd(w, partner.id, p.id, { trust: -30, resentment: 20 }); partner.partner = null; }
  if (reason === 'crossed') w.done[p.id] = { ...(w.done[p.id] || {}), E_CROSS: w.t };
  if (reason === 'joined') w.done[p.id] = { ...(w.done[p.id] || {}), D_ORG: w.t };
}

// ---------- 玩家外出 ----------
export function tripTravel(w: World, loc: LocId) {
  const base = LOCS[loc].travel;
  return Math.round(base * (isDark(w) ? 1 : 1.2));
}
export function startTrip(w: World, loc: LocId, members: string[], carryFromStorage: Partial<Record<ItemKey, number>> = {}) {
  const me = player(w);
  for (const [k, v] of Object.entries(carryFromStorage)) addItem(me.inv, k as ItemKey, takeItem(w.storage, k as ItemKey, v || 0));
  w.trip = { loc, members: [me.id, ...members], stage: 'going', until: w.t + tripTravel(w, loc), notes: [], encounter: null, searches: 0, arrivedAt: 0, result: [] };
  for (const id of w.trip.members) { const p = P(w, id)!; p.present = false; p.action = { type: 'expedition', room: 'outside', x: 0, dur: 99999, t: 0 }; p.queue = []; }
  w.stats.expeditions++;
  log(w, `你${members.length ? '和' + members.map((m) => nm(w, m)).join('、') : ''}从竖井爬了出去，往${LOCS[loc].name}去。`, { col: '#a0c0d8', important: true });
}
export function tripArrive(w: World) {
  const tr = w.trip!; tr.stage = 'at'; tr.arrivedAt = w.t;
  w.locs[tr.loc].visits++;
  tr.notes.push(`${LOCS[tr.loc].desc}`);
  rollEncounter(w, 0.7);
}
export function tripLeave(w: World) {
  const tr = w.trip!; tr.stage = 'back'; tr.until = w.t + tripTravel(w, tr.loc); tr.encounter = null;
}
export function tripHome(w: World) {
  const tr = w.trip!;
  for (const id of tr.members) { const p = P(w, id); if (!p || !p.alive || p.leftReason) continue; p.present = true; p.floor = 0; p.x = ROOM.entrance.x + 30 + tr.members.indexOf(id) * 6; p.px = p.x; p.pfloor = 0; p.action = null; p.needs.warmth = clamp(p.needs.warmth - 15); }
  log(w, `你们回到了避难所。${tr.result.length ? tr.result.join(' ') : ''}`, { col: '#a0c0d8', important: true });
  w.trip = null;
}

const team = (w: World) => (w.trip ? w.trip.members.map((id) => P(w, id)!).filter((p) => p && p.alive) : []);
const teamSkill = (w: World, k: 'stealth' | 'combat' | 'persuade' | 'scavenge') => Math.max(...team(w).map((p) => p.skills[k]));
const armed = (w: World) => team(w).some((p) => cnt(p.inv, 'pistol') + cnt(p.inv, 'rifle') > 0);

function rollEncounter(w: World, mult: number) {
  const tr = w.trip!;
  const L = LOCS[tr.loc];
  const danger = L.danger[w.war.phase - 1] / 100 * mult * (isDark(w) ? 0.8 : 1.4);
  if (rnd(w.rng) > danger * 0.6) return;
  const kinds: [string, number][] = [['patrol', 3], ['scavengers', 2], ['corpse', 2], ['survivor', 1], ['sniper', tr.loc === 'station' || tr.loc === 'party' ? 1 : 0.3]];
  if (tr.loc === 'border') kinds.push(['mines', 3]);
  if (['camp', 'market', 'redcross'].includes(tr.loc)) { kinds.length = 0; kinds.push(['corpse', 1], ['scavengers', 1], ['patrol', tr.loc === 'camp' ? 0.5 : 1]); }
  const kind = weighted(w.rng, kinds);
  tr.encounter = makeEncounter(w, kind);
}

function makeEncounter(w: World, kind: string): Encounter {
  const op = milName(w);
  switch (kind) {
    case 'patrol': return { kind, text: `一队${w.war.phase >= 3 ? '占领军' : '宪兵'}打着手电过来了。${w.war.phase < 3 ? '他们在抓逃兵。' : '他们在搜捕「阵线分子」。'}`, options: [
      { id: 'hide', label: '躲起来（潜行）' }, { id: 'bribe', label: '塞点东西（烟、酒或值钱物件）' }, { id: 'talk', label: '站出来说话（说服）' }, { id: 'fight', label: armed(w) ? '开枪' : '动手' }, { id: 'run', label: '跑' }] };
    case 'scavengers': return { kind, text: '另一伙拾荒的人。三个，眼睛盯着你们的背包。', options: [{ id: 'trade', label: '谈谈，换点东西' }, { id: 'threaten', label: '亮出家伙吓走他们' }, { id: 'avoid', label: '绕开' }] };
    case 'corpse': return { kind, text: '雪地里趴着一个人，已经冻硬了。', options: [{ id: 'search', label: '搜他的口袋' }, { id: 'leave', label: '走开' }] };
    case 'survivor': return { kind, text: '瓦砾下面有人在呻吟。是个活人，腿被压住了。', options: [{ id: 'rescue', label: '把人挖出来，带回去' }, { id: 'give', label: '留一份吃的给他' }, { id: 'leave', label: '装作没听见' }] };
    case 'sniper': return { kind, text: '「啪」——一颗子弹打在你脚边的墙上。', options: [{ id: 'dive', label: '扑倒，爬过去' }, { id: 'run', label: '往回跑' }] };
    case 'mines': return { kind, text: '雪下面露出半截木牌：雷区。路只有这一条。', options: [{ id: 'careful', label: '一步一步探着走' }, { id: 'map', label: '照地图上的路走' }, { id: 'back', label: '不走了' }] };
  }
  return { kind, text: op, options: [{ id: 'leave', label: '走' }] };
}

// 处理遭遇的选择，返回描述
export function resolveEncounter(w: World, opt: string): string {
  const tr = w.trip!; const e = tr.encounter!; tr.encounter = null;
  const me = player(w);
  const r = rnd(w.rng);
  const hurt = (p: Person, sev: number, why: string) => { addCond(w, p, 'wound', sev); p.health = clamp(p.health - sev / 3); return `${p.isPlayer ? '你' : p.name}${why}。`; };
  const anyTeam = () => pick(w.rng, team(w));
  switch (e.kind) {
    case 'patrol': {
      const deserterInTeam = team(w).some((p) => p.origin === 'deserter' || p.secrets.some((s) => s.id.includes('deserter')));
      if (opt === 'hide') { if (r < 0.35 + teamSkill(w, 'stealth') / 160 - (team(w).length - 1) * 0.08) return '你们缩在断墙后面，手电的光从头顶扫过去。他们走了。'; return capturedOrHurt(w, deserterInTeam); }
      if (opt === 'bribe') { const k: ItemKey | null = cnt(me.inv, 'alcohol') ? 'alcohol' : cnt(me.inv, 'cigs') >= 5 ? 'cigs' : cnt(me.inv, 'valuables') ? 'valuables' : null; if (!k) return capturedOrHurt(w, deserterInTeam, '你掏遍口袋也没东西可塞。'); takeItem(me.inv, k, k === 'cigs' ? 5 : 1); if (r < 0.75) { tagMethod(me, '交易'); return `你塞过去${ITEMS[k].name}。领头的掂了掂，挥挥手让你们滚。`; } return capturedOrHurt(w, deserterInTeam, '东西被收下了，人也没放过。'); }
      if (opt === 'talk') { if (!deserterInTeam && r < 0.3 + teamSkill(w, 'persuade') / 150) return '你说你们是出来找吃的平民。他们看了看你们冻僵的脸，没多问。'; return capturedOrHurt(w, deserterInTeam); }
      if (opt === 'fight') { const win = r < 0.2 + teamSkill(w, 'combat') / 200 + (armed(w) ? 0.25 : 0); tagMethod(me, '暴力'); if (win) { addItem(me.inv, 'ammo', rint(w.rng, 1, 4)); if (rnd(w.rng) < 0.3) addItem(me.inv, 'rifle', 1); return '枪声在废墟里回荡了很久。他们倒下了，你们没有。你从尸体上摸到了些东西。' + hurt(anyTeam(), rint(w.rng, 0, 20), '擦伤了'); } const v = anyTeam(); if (r > 0.92) { die(w, v, '被巡逻队打死'); return `${v.isPlayer ? '你' : v.name}中枪倒下了。`; } return hurt(v, rint(w.rng, 25, 50), '中了一枪') + ' 你们拼命跑了回来。'; }
      if (opt === 'run') { if (r < 0.55 + teamSkill(w, 'stealth') / 300) { tr.stage = 'back'; tr.until = w.t + tripTravel(w, tr.loc); return '你们扔下一切往回跑，子弹追着你们的脚后跟。'; } return hurt(anyTeam(), rint(w.rng, 20, 40), '跑的时候中了一枪'); }
      break;
    }
    case 'scavengers':
      if (opt === 'trade') { if (cnt(me.inv, 'cigs') >= 3) { takeItem(me.inv, 'cigs', 3); addItem(me.inv, pick(w.rng, ['food', 'bandage', 'candle'] as ItemKey[]), 2); return '你们用烟换了点东西。对方的手一直没离开刀柄。'; } return '你们没什么可换的。双方慢慢退开。'; }
      if (opt === 'threaten') { if (armed(w) || teamSkill(w, 'combat') > 55) { if (r < 0.7) { addItem(me.inv, 'food', rint(w.rng, 1, 3)); tagMethod(me, '暴力'); return '他们扔下一个袋子跑了。里面有吃的。'; } } return hurt(anyTeam(), rint(w.rng, 15, 35), '挨了一刀'); }
      return '你们绕了一大圈。';
    case 'corpse':
      if (opt === 'search') { const got: string[] = []; if (r < 0.5) { addItem(me.inv, 'cigs', rint(w.rng, 1, 5)); got.push('烟'); } if (r < 0.25) { addItem(me.inv, 'valuables', 1); got.push('一块手表'); } if (tr.loc === 'border' || rnd(w.rng) < 0.15) { addItem(me.inv, 'papers', 1); got.push('一份证件——照片上的人和你有几分像'); w.discovered.E_PASS = true; } return got.length ? `你从他身上摸出了：${got.join('、')}。` : '口袋是空的。早有人搜过了。'; }
      return '你没有回头。';
    case 'survivor':
      if (opt === 'rescue') { const s = makeStranger(w, chance(w.rng, 0.5) ? 'wounded' : 'refugee'); w.people.push(s); s.present = false; tr.members.push(s.id); addCond(w, s, 'wound', 40); relAdd(w, s.id, me.id, { trust: 40, affection: 30, debt: 50 }); tagMethod(me, '合作'); return `你们把${s.name}挖了出来。${s.gender === 'f' ? '她' : '他'}会跟你们回去。避难所多了一张嘴。`; }
      if (opt === 'give') { if (takeItem(me.inv, 'food', 1)) { me.needs.stress = clamp(me.needs.stress - 5); return '你把一罐吃的塞到他手里，没有回头。'; } return '你身上没有吃的。'; }
      me.needs.stress = clamp(me.needs.stress + 8); return '呻吟声在身后越来越小。';
    case 'sniper':
      if (opt === 'dive') { if (r < 0.7) return '你在雪里爬了五十米。手肘全磨破了。'; return hurt(anyTeam(), rint(w.rng, 20, 45), '被打中了'); }
      tr.stage = 'back'; tr.until = w.t + tripTravel(w, tr.loc); return '你们掉头就跑。';
    case 'mines':
      if (opt === 'map' && team(w).some((p) => cnt(p.inv, 'map'))) return '地图上的路是对的。你们踩着前人的脚印过去了。';
      if (opt === 'back') { tr.stage = 'back'; tr.until = w.t + tripTravel(w, tr.loc); return '你们原路退了回去。'; }
      if (r < 0.75) return '你用一根树枝一寸一寸地探。一个小时后，你们过去了。';
      { const v = anyTeam(); if (r > 0.95) { die(w, v, '踩到了地雷'); return `一声闷响。${v.isPlayer ? '你' : v.name}……`; } return hurt(v, rint(w.rng, 40, 60), '被地雷炸伤了'); }
  }
  return '……';
}

function capturedOrHurt(w: World, deserter: boolean, pre = ''): string {
  const me = player(w);
  const r = rnd(w.rng);
  if (deserter && r < 0.5 && w.war.phase < 3) {
    // 逃兵被抓：致命
    const d = team(w).find((p) => p.origin === 'deserter' || p.secrets.some((s) => s.id.includes('deserter')))!;
    if (d.isPlayer) { capturePlayer(w, '宪兵认出了你的军裤。'); return pre + '宪兵认出了你的军裤。'; }
    leaveForever(w, d, 'taken'); w.trip!.members = w.trip!.members.filter((x) => x !== d.id);
    return pre + `他们认出了${d.name}是逃兵，把${d.gender === 'f' ? '她' : '他'}拖走了。你们眼睁睁地看着。`;
  }
  if (r < 0.3) { capturePlayer(w, '你们被押上了卡车。'); return pre + '你们被押上了卡车。'; }
  const v = pick(w.rng, team(w));
  addCond(w, v, 'wound', rint(w.rng, 15, 35));
  takeItem(me.inv, 'food', 99);
  return pre + `他们搜走了你们身上的吃的，用枪托招呼了${v.isPlayer ? '你' : v.name}一顿。`;
}

export function capturePlayer(w: World, why: string) {
  const me = player(w);
  for (const id of w.trip?.members || []) { const p = P(w, id); if (p && !p.isPlayer && p.alive) { p.present = true; p.floor = 0; p.x = ROOM.entrance.x + 30; p.action = null; log(w, `${p.name}一个人跑了回来，说你被抓走了。`, { col: '#e8a060', important: true }); } }
  w.trip = null;
  me.present = false;
  me.conds.push({ type: 'captive', sev: 100, since: w.t });
  w.facts.captiveSince = w.t; w.facts.captiveWhy = why;
  w.pending.push({ id: 'captive', t: w.t + 60, ctx: {} });
}

// ---------- 地点上的行动 ----------
export interface LocAction { id: string; label: string; tip?: string; ok: boolean; why?: string; cost: number; method?: string; adult?: boolean }

export function locActions(w: World): LocAction[] {
  const tr = w.trip!; const me = player(w); const loc = tr.loc;
  const L = LOCS[loc];
  const A: LocAction[] = [];
  const add = (id: string, label: string, ok: boolean, why = '', cost = 30, tip = '', method?: string, adult = false) => { if (adult && !w.settings.adult) return; A.push({ id, label, ok, why, cost, tip, method, adult }); };
  const mil = hasMil(w, me);
  if (L.loot) add('search', '搜刮', w.locs[loc].looted < 95, '已经搜空了', 60, `这里还剩约 ${Math.max(0, 100 - w.locs[loc].looted)}%`);
  if (loc === 'camp') {
    add('mil_supply', '送物资（6 份口粮）', cnt(me.inv, 'food') >= 6, '需要带 6 份口粮', 30, '建立与军方的联系', 'cmil_supply');
    add('mil_gift', '打点关系（5 支烟或 1 瓶酒）', cnt(me.inv, 'cigs') >= 5 || cnt(me.inv, 'alcohol') >= 1, '需要烟或酒', 30, '结交军需官', 'cmil_gifts');
    add('mil_trade', '和军需官交换物资', true, '', 20, '用烟、酒、值钱物件换口粮、燃料、药');
    if (w.war.phase < 3) add('mil_report', '举报逃兵', w.people.some((q) => q.alive && q.present && !q.isPlayer && q.secrets.some((s) => s.id.includes('deserter') && s.known.includes(me.id))), '你不知道谁是逃兵', 20, '奖励口粮 5 份。被举报的人会被带走。', 'cmil_inform');
    if (w.war.phase >= 3) add('mil_report', '举报「阵线分子」', w.people.some((q) => q.alive && q.present && !q.isPlayer && (q.origin === 'cadre' || q.pers.regime === 'loyal')), '', 20, '占领军在清算旧政权的人。', 'cmil_inform');
    add('pass_buy', '换通行证', mil && w.war.passSlots > 0 && (cnt(me.inv, 'food') >= 12 || cnt(me.inv, 'meds') >= 2 || cnt(me.inv, 'valuables') >= 4), !mil ? '军方还不认识你' : w.war.passSlots <= 0 ? '这一阶段的名额没了' : '要 12 份口粮、或 2 支药、或 4 件值钱物件', 30, '', 'pass_buy');
    add('pass_favor', '求个人情（要一张通行证）', mil && Number(w.facts[`milFavor:${me.id}`] || 0) >= 2 && w.war.passSlots > 0, '交情还不够', 30, '', 'pass_favor');
    if (w.politics.leader === me.id) add('pass_leader', '以避难所名义交换（仓库 20 份口粮）', mil && cnt(w.storage, 'food') >= 20, '需要军方联系与仓库存粮', 30, '其他人会知道的', 'pass_leader');
    add('pass_steal', '偷军官的通行证', true, '', 40, '潜行检定。失败会被抓', 'pass_steal');
    add('mil_intim', '接近军官（私下交易）', mil, '先建立联系', 60, '成人内容', 'pass_intim', true);
    if (w.war.phase < 3 && w.politics.leader !== me.id) add('mil_appoint', '请求任命为避难所负责人', mil, '先建立联系', 30, '', 'lead_mil');
    add('mil_informant', '当他们的眼线', mil, '先建立联系', 30, '每隔几天回来报告避难所里的事', 'patron_mil');
    add('mil_join', '留下来当差（离开避难所）', mil, '先建立联系', 10, '结束这一局', 'org_mil');
  }
  if (loc === 'market') {
    add('mk_trade', '和倒爷换东西', true, '', 20);
    add('mk_smug', '找走私的人（2 件值钱物件或 2 支药）', !!me.knows.K_SMUG && (cnt(me.inv, 'valuables') >= 2 || cnt(me.inv, 'meds') >= 2), !me.knows.K_SMUG ? '你不知道该找谁' : '需要值钱物件或药', 30, '', 'csmug_pay');
    const smug = !!w.facts[`C_SMUG:${me.id}`];
    add('mk_seat', '买偷渡名额（4 件值钱物件或 3 支药）', smug && w.war.smugSeats > 0 && (cnt(me.inv, 'valuables') >= 4 || cnt(me.inv, 'meds') >= 3), !smug ? '还没搭上线' : '代价不够或没名额', 30, '', 'seat_pay');
    add('mk_job', '接活：替他们送一趟货', smug || !!me.knows.K_SMUG, '你不知道该找谁', 120, '有风险，有报酬', 'csmug_job');
    add('mk_work', '用跑货的交情抵账（换名额）', smug && !!w.facts[`smugJob:${me.id}`] && w.war.smugSeats > 0, '还没替他们干过活', 20, '', 'seat_work');
    add('mk_intim', '和走私头子私下交易', smug, '还没搭上线', 60, '成人内容', 'seat_intim', true);
    add('mk_join', '入伙（离开避难所）', smug && !!w.facts[`smugJob:${me.id}`], '他们还不信任你', 10, '结束这一局', 'org_smug');
  }
  if (loc === 'redcross') {
    add('rc_register', '登记避难所', !w.facts.rcRegistered, '已经登记过了', 30, '救援车队会知道这里还有人', 'rc_visit');
    add('rc_meds', '领一点药', !w.facts.rcMedsTaken, '已经领过了', 20);
    add('rc_evac', '申请撤离（离开避难所）', !!w.facts.rcRegistered && (me.origin === 'foreigner' || me.health < 50 || hasCond(me, 'pregnant')), '只接收外国人、伤病员和孕妇', 10, '结束这一局', 'cross_rc');
  }
  if (loc === 'border') {
    add('cross_pass', '过检查站（出示证件）', cnt(me.inv, 'pass') + cnt(me.inv, 'forgedPass') + cnt(me.inv, 'papers') > 0, '你没有证件', 30, '结束这一局（若成功）', 'cross_pass');
    add('cross_boat', '等走私船', !!w.facts[`seat:${me.id}`] && isNight(w), !w.facts[`seat:${me.id}`] ? '你没有名额' : '船只在夜里来', 60, '结束这一局（若成功）', 'cross_boat');
  }
  if (loc === 'station' && !me.knows.K_MIL) add('scout', '往探照灯那边看看', true, '', 30, '也许能找到军方驻点');
  if (loc === 'church' && !me.knows.K_SMUG) add('scout_church', '翻翻神父的旧笔记', true, '', 30);
  add('leave', '回避难所', true, '', 0);
  return A;
}

// 执行地点行动；返回描述
export function doLocAction(w: World, id: string): string {
  const tr = w.trip!; const me = player(w); const loc = tr.loc; const L = LOCS[loc];
  const out: string[] = [];
  const op = milOperator(w);
  switch (id) {
    case 'search': {
      tr.searches++;
      const got: Partial<Record<ItemKey, number>> = {};
      const bonus = 1 + teamSkill(w, 'scavenge') / 150 + (team(w).length - 1) * 0.25;
      for (const [k, a, b, pr] of L.loot || []) if (rnd(w.rng) < pr * (1 - w.locs[loc].looted / 120)) { const n = Math.max(1, Math.round(rint(w.rng, a, b) * bonus * (1 - w.locs[loc].looted / 150))); got[k] = (got[k] || 0) + n; }
      w.locs[loc].looted = clamp(w.locs[loc].looted + 20 + team(w).length * 4);
      for (const [k, v] of Object.entries(got)) addItem(me.inv, k as ItemKey, v || 0);
      out.push(Object.keys(got).length ? `找到了：${fmtItems(got)}。` : '翻了个底朝天，什么都没有。');
      if (loc === 'station' && !me.knows.K_MIL && rnd(w.rng) < 0.4) { knowFact(w, me, 'K_MIL'); w.locs.camp.known = true; out.push('站台尽头，探照灯照着一排帐篷和卡车——军方的物资交换点。'); }
      if (loc === 'church' && !me.knows.K_SMUG && rnd(w.rng) < 0.35) { knowFact(w, me, 'K_SMUG'); w.locs.market.known = true; out.push('祭坛后面有张纸条：「过河的人，周四，老电影院」。'); }
      if (loc === 'houses' && !me.knows.K_MARKET && rnd(w.rng) < 0.2) { knowFact(w, me, 'K_MARKET'); w.locs.market.known = true; out.push('一张传单：老电影院地下室，以物易物。'); }
      rollEncounter(w, 1);
      break;
    }
    case 'scout': if (rnd(w.rng) < 0.7) { knowFact(w, me, 'K_MIL'); w.locs.camp.known = true; out.push('你看见了：站台旁一排帐篷，卡车，探照灯。是军方的物资交换点。'); } else out.push('探照灯太亮，你不敢靠近。'); rollEncounter(w, 0.8); break;
    case 'scout_church': knowFact(w, me, 'K_SMUG'); w.locs.market.known = true; out.push('神父的笔记里夹着一张纸：「过河的人，周四，老电影院地下室」。'); break;
    case 'mil_supply': takeItem(me.inv, 'food', 6); w.facts[`C_MIL:${me.id}`] = op; out.push(`你把六罐吃的放在桌上。军需官看了你一眼，在本子上记下了你的名字。从今天起，${milName(w)}认识你了。`); tagMethod(me, '交易'); break;
    case 'mil_gift': { if (cnt(me.inv, 'alcohol') >= 1) takeItem(me.inv, 'alcohol', 1); else takeItem(me.inv, 'cigs', 5); w.facts[`milFavor:${me.id}`] = Number(w.facts[`milFavor:${me.id}`] || 0) + 1; if (!hasMil(w, me)) w.facts[`C_MIL:${me.id}`] = op; out.push('军需官把东西收进抽屉，给你倒了一杯热茶。「常来。」'); tagMethod(me, '交易'); break; }
    case 'mil_trade': out.push('TRADE:camp'); break;
    case 'mil_report': out.push('REPORT'); break;
    case 'pass_buy': { if (cnt(me.inv, 'meds') >= 2) takeItem(me.inv, 'meds', 2); else if (cnt(me.inv, 'valuables') >= 4) takeItem(me.inv, 'valuables', 4); else takeItem(me.inv, 'food', 12); w.war.passSlots--; addItem(me.inv, 'pass', 1); w.facts[`passOp:${me.id}`] = op; out.push('一张盖着红章的纸。你的名字，你的照片。它比你带来的所有东西都值钱。'); tagMethod(me, '交易'); break; }
    case 'pass_favor': w.war.passSlots--; addItem(me.inv, 'pass', 1); w.facts[`passOp:${me.id}`] = op; out.push('「看在你的面子上。」军需官把通行证推过来。「别跟别人说。」'); tagMethod(me, '合作'); break;
    case 'pass_leader': takeItem(w.storage, 'food', 20); w.war.passSlots--; addItem(me.inv, 'pass', 1); w.facts[`passOp:${me.id}`] = op; w.facts.soldStorage = Number(w.facts.soldStorage || 0) + 20; w.politics.abuses += 2; out.push('你代表避难所签了字。二十份口粮会有人去搬。通行证在你的口袋里。'); tagMethod(me, '牺牲他人'); break;
    case 'pass_steal': { if (rnd(w.rng) < 0.25 + me.skills.stealth / 140) { addItem(me.inv, 'pass', 1); w.facts[`passOp:${me.id}`] = op; out.push('你从挂着的大衣口袋里抽出了一张通行证。没人注意。'); tagMethod(me, '偷窃'); } else { out.push('一只手抓住了你的手腕。'); capturePlayer(w, '你偷通行证被当场抓住。'); return out.join('\n'); } break; }
    case 'mil_intim': case 'mk_intim': out.push('INTIM:' + id); break;
    case 'mil_appoint': { w.politics.leader = me.id; w.politics.legitimacy = 25; w.facts.leaderSince = w.t; w.facts.appointedByMil = true; w.politics.history.push(`第${day(w)}天：被${milName(w)}任命`); out.push(`你拿到了一张盖章的委任状：「第 7 号民防避难所负责人」。回去以后，有人会服，有人不会。`); tagMethod(me, '依附'); break; }
    case 'mil_informant': w.facts[`patron:${me.id}`] = 'mil'; w.facts.informant = w.t; out.push('「每三天，告诉我们里面的人在说什么。」你点了点头。'); tagMethod(me, '告密'); break;
    case 'mil_join': leaveForever(w, me, 'joined'); w.facts.joinedOrg = 'mil'; out.push('你脱下了旧外套。'); return out.join('\n');
    case 'mk_trade': out.push('TRADE:market'); break;
    case 'mk_smug': { if (cnt(me.inv, 'valuables') >= 2) takeItem(me.inv, 'valuables', 2); else takeItem(me.inv, 'meds', 2); w.facts[`C_SMUG:${me.id}`] = true; knowFact(w, me, 'K_SMUG'); out.push('一个戴毛线帽的男人收下了东西。「有船的时候，会有人告诉你。」'); tagMethod(me, '交易'); break; }
    case 'mk_seat': { if (cnt(me.inv, 'valuables') >= 4) takeItem(me.inv, 'valuables', 4); else takeItem(me.inv, 'meds', 3); w.war.smugSeats--; w.facts[`seat:${me.id}`] = true; out.push('「夜里，边境哨所下游的浅滩。别带行李。」'); tagMethod(me, '交易'); break; }
    case 'mk_job': { if (rnd(w.rng) < 0.6 + me.skills.stealth / 300) { w.facts[`smugJob:${me.id}`] = true; w.facts[`C_SMUG:${me.id}`] = true; addItem(me.inv, 'valuables', 2); addItem(me.inv, 'cigs', 10); out.push('你背着一个沉甸甸的包穿过半个镇子。没问里面是什么。报酬：两件值钱物件，一条烟。'); tagMethod(me, '冒险'); } else { addCond(w, me, 'wound', 30); out.push('半路上有人开枪。你扔下包跑了回来，肩膀在流血。'); } break; }
    case 'mk_work': w.war.smugSeats--; w.facts[`seat:${me.id}`] = true; out.push('「你帮过我们。夜里，浅滩。」'); break;
    case 'mk_join': leaveForever(w, me, 'joined'); w.facts.joinedOrg = 'smug'; out.push('你留在了地下室里。'); return out.join('\n');
    case 'rc_register': w.facts.rcRegistered = true; w.facts.rcBy = me.id; out.push('一个戴眼镜的女人在本子上写下：第 7 号民防避难所，人数……她抬头看你。你说了一个数字。'); tagMethod(me, '合作'); for (const q of present(w)) relAdd(w, q.id, me.id, { respect: 6 }); break;
    case 'rc_meds': w.facts.rcMedsTaken = true; addItem(me.inv, 'meds', 2); addItem(me.inv, 'bandage', 2); out.push('两支抗生素，两卷绷带。'); break;
    case 'rc_evac': leaveForever(w, me, 'crossed'); w.facts.crossedBy = 'redcross'; out.push('你上了白色的卡车。'); return out.join('\n');
    case 'cross_pass': return crossCheckpoint(w);
    case 'cross_boat': { if (rnd(w.rng) < 0.85) { leaveForever(w, me, 'crossed'); w.facts.crossedBy = 'boat'; return '船没有点灯。你趴在船底，听着桨声，听着对岸的狗叫。'; } addCond(w, me, 'hypothermia', 60); return '船在河中间被探照灯照到了。你跳进了冰水里。等你爬回岸上，船已经不见了。'; }
    case 'leave': tripLeave(w); return '你们往回走。';
  }
  return out.join('\n');
}

function crossCheckpoint(w: World): string {
  const me = player(w);
  const op = milOperator(w);
  if (cnt(me.inv, 'pass')) {
    const issued = w.facts[`passOp:${me.id}`];
    if (issued && issued !== op) {
      if (rnd(w.rng) < 0.6) { capturePlayer(w, '你拿出的是旧政权的通行证。'); return '士兵看了一眼你的通行证，脸色变了：「旧政权的东西？」'; }
      return '士兵把通行证撕成两半，扔回你脸上。你被赶了回来。';
    }
    leaveForever(w, me, 'crossed'); w.facts.crossedBy = 'pass';
    return '栏杆抬起来了。你走过那座桥的时候，没有回头。';
  }
  const q = cnt(me.inv, 'forgedPass') ? Number(w.facts[`forgeQ:${me.id}`] || 40) : 35;
  const scrutiny = 30 + w.war.phase * 8 + rnd(w.rng) * 40;
  if (q + me.skills.persuade / 4 > scrutiny) { leaveForever(w, me, 'crossed'); w.facts.crossedBy = cnt(me.inv, 'papers') ? 'papers' : 'forged'; return '士兵对着灯看了很久。然后，他把证件还给了你。'; }
  if (rnd(w.rng) < 0.6) { capturePlayer(w, '你的证件被识破了。'); return '「假的。」士兵拉开了枪栓。'; }
  takeItem(me.inv, 'forgedPass', 1); takeItem(me.inv, 'papers', 1);
  return '士兵没收了你的证件，骂了一句，让你滚。';
}

// 从暗渠离开（玩家）
export function crossDrain(w: World, companions: string[]): string {
  const me = player(w);
  const risk = 0.35 - (cnt(me.inv, 'map') ? 0.15 : 0) - (cnt(me.inv, 'blanket') ? 0.05 : 0) + (w.war.phase === 2 ? 0.05 : 0);
  if (rnd(w.rng) > risk) {
    for (const id of companions) { const p = P(w, id); if (p) leaveForever(w, p, 'crossed'); }
    leaveForever(w, me, 'crossed'); w.facts.crossedBy = 'drain'; w.facts.crossedWith = companions.join(',');
    return '暗渠尽头是界河。水没过了胸口，冷得像刀。你们一步一步，走到了对岸。';
  }
  if (rnd(w.rng) < 0.4) { die(w, me, '淹死在界河里'); return '水太急了。'; }
  addCond(w, me, 'hypothermia', 80); addCond(w, me, 'frostbite', 50);
  return '你在河中间被冲倒了。等你爬回暗渠，手脚已经没有知觉。';
}

// 军营与黑市的交换表
export const TRADE_TABLES: Record<'camp' | 'market', { give: [ItemKey, number]; get: [ItemKey, number] }[]> = {
  camp: [
    { give: ['cigs', 6], get: ['food', 2] }, { give: ['alcohol', 1], get: ['food', 3] }, { give: ['valuables', 1], get: ['food', 4] },
    { give: ['valuables', 2], get: ['meds', 1] }, { give: ['food', 3], get: ['fuel', 4] }, { give: ['valuables', 1], get: ['fuel', 5] },
  ],
  market: [
    { give: ['cigs', 5], get: ['food', 2] }, { give: ['food', 3], get: ['valuables', 1] }, { give: ['meds', 1], get: ['valuables', 3] },
    { give: ['valuables', 2], get: ['meds', 1] }, { give: ['alcohol', 1], get: ['cigs', 6] }, { give: ['valuables', 1], get: ['condom', 3] },
    { give: ['valuables', 3], get: ['crowbar', 1] }, { give: ['valuables', 3], get: ['radioParts', 1] }, { give: ['food', 6], get: ['map', 1] },
    { give: ['valuables', 4], get: ['blankPermit', 1] }, { give: ['valuables', 6], get: ['pistol', 1] }, { give: ['food', 2], get: ['seeds', 1] },
  ],
};
export function doTrade(w: World, table: 'camp' | 'market', i: number): string {
  const me = player(w); const t = TRADE_TABLES[table][i];
  if (cnt(me.inv, t.give[0]) < t.give[1]) return '你的东西不够。';
  takeItem(me.inv, t.give[0], t.give[1]); addItem(me.inv, t.get[0], t.get[1]);
  if (table === 'market') { w.facts[`marketDeals:${me.id}`] = Number(w.facts[`marketDeals:${me.id}`] || 0) + 1; knowFact(w, me, 'K_MARKET'); }
  tagMethod(me, '交易');
  return `用${ITEMS[t.give[0]].name}×${t.give[1]}换了${ITEMS[t.get[0]].name}×${t.get[1]}。`;
}

// 举报：被举报者会在 1~2 天后被带走
export function report(w: World, targetId: string): string {
  const me = player(w); const t = P(w, targetId)!;
  addItem(me.inv, 'food', 5);
  if (!hasMil(w, me)) w.facts[`C_MIL:${me.id}`] = milOperator(w);
  w.pending.push({ id: 'arrest', t: w.t + rint(w.rng, 600, 2000), ctx: { target: t.id, by: me.id } });
  tagMethod(me, '告密'); tagMethod(me, '牺牲他人');
  addMem(me, w, { kind: 'reported', who: t.id, w: -10, text: `我举报了${t.name}。` });
  return `你说出了${t.name}的名字。军需官推过来五罐吃的。「我们会去的。」`;
}

export function hourWar(w: World) {
  // 被抓的玩家：时间流逝
  // 军方眼线的义务
  if (w.facts.informant && w.t - Number(w.facts.informant) > 3 * 1440 && !w.firedEvents[`informant:${day(w)}`]) {
    w.firedEvents[`informant:${day(w)}`] = 1;
    w.pending.push({ id: 'informant_due', t: w.t, ctx: {} });
    w.facts.informant = w.t;
  }
}

export { LOCS, milOperator as op, opinion, bark, hour };
