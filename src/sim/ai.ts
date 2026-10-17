// NPC 决策：效用评分 + 目标网络里的长期打算
import type { Action, ItemKey, Person, RoomId, World } from './types';
import { mk, canTakeFromStorage, foodAvailable } from './actions';
import { clamp, cnt, rel, opinion, present, roomOf, peopleIn, awake, hour, isNight, P, hasCond, minuteOfDay, has, day } from './util';
import { rnd, chance, pick } from '../engine/rng';
import { attraction, propose, willingness, orientationOk } from './intimacy';
import { feelsWatched } from './social';
import { anyoneSick } from './env';
import { hasMil } from './goals';
import { BEDS, ROOM } from '../content/layout';
import { planExpedition } from './war';
import { npcCallsMeeting } from './politics';

interface Cand { s: number; a: () => Action | null; why: string }

export function decide(w: World, p: Person): Action | null {
  const c: Cand[] = [];
  const n = p.needs, s = w.shelter;
  const h = hour(w);
  const night = isNight(w);
  const add = (s0: number, why: string, a: () => Action | null) => { if (s0 > 0) c.push({ s: s0, a, why }); };

  // ---------- 身体 ----------
  if (n.thirst < 65 && s.water >= 0.5) add(((100 - n.thirst) ** 1.5) / 9, '渴了', () => mk('drink', 'vent', { obj: 'tank', dur: 4, who: p }));
  if (n.hunger < 60) {
    const urgent = ((100 - n.hunger) ** 1.45) / 8;
    if (foodAvailable(w, p) > 0) {
      const mealTime = (h >= 11 && h <= 13) || (h >= 18 && h <= 20);
      add(urgent * (mealTime ? 1.3 : 1) + (n.hunger < 30 ? 30 : 0), '饿了', () => mk('eat', 'kitchen', { obj: 'table', dur: 12, who: p }));
    } else if (cnt(w.storage, 'food') > 0 && canTakeFromStorage(w, p)) {
      add(urgent, '去仓库拿吃的', () => mk('take', 'storage', { obj: 'cage', dur: 3, item: 'food', who: p }));
    } else if (n.hunger < 35) {
      // 偷，还是忍着，还是去求人
      const m = p.pers.morality / 100;
      const desperation = (40 - n.hunger) * 1.6;
      if (cnt(w.storage, 'food') > 0 && !feelsWatched(w, p, 'storage') && (night || peopleIn(w, 'storage').length === 0)) add(desperation * (1.1 - m) - 5, '饿得受不了了，仓库那边没人', () => mk('steal', 'storage', { obj: 'cage', dur: 6, item: 'food', secret: true, who: p }));
      const keeper = P(w, w.shelter.keyHolder) || P(w, w.politics.leader);
      if (keeper && keeper !== p && keeper.present && awake(keeper) && cnt(w.storage, 'food') > 0 && (Number(p.agenda.begT) || 0) < w.t) add(desperation * 0.9 + 10, `去找${keeper.name}要口粮`, () => { p.agenda.begT = w.t + 180; return mk('chat', roomOf(keeper), { x: keeper.x, target: keeper.id, dur: 8, data: { beg: 'food' } }); });
      const donor = present(w).filter((q) => q !== p && cnt(q.inv, 'food') >= 2 && awake(q)).sort((a, b) => opinion(w, b.id, p.id) - opinion(w, a.id, p.id))[0];
      if (donor && (Number(p.agenda.begT2) || 0) < w.t) add(desperation * 0.7, `去求${donor.name}分点吃的`, () => { p.agenda.begT2 = w.t + 240; return mk('chat', roomOf(donor), { x: donor.x, target: donor.id, dur: 10, data: { beg: 'food' } }); });
    }
  }
  const sleepy = n.energy < 25 ? 90 : night && n.energy < 80 ? 55 + (h >= 23 || h < 5 ? 25 : 0) : n.energy < 40 ? 35 : 0;
  if (sleepy) add(sleepy, '困了', () => sleepAction(w, p));
  if (n.warmth < 45) {
    const warmest = warmestRoom(w);
    add((50 - n.warmth) * 1.6, '冷得发抖', () => (warmest === 'kitchen' && cnt(w.storage, 'fuel') > 2 ? mk('warm', 'kitchen', { obj: 'stove', dur: 30, who: p }) : mk('warm', warmest, { dur: 30 })));
  }
  if (n.hygiene < 25 && s.water > 15) add((30 - n.hygiene) * 1.2, '身上太脏了', () => mk('wash', 'washroom', { obj: 'bucket', dur: 12, who: p }));
  if (p.health < 50 && !hasCond(p, 'heart')) add((55 - p.health) * 1.2, '撑不住了，躺一会儿', () => mk('rest', 'infirmary', { obj: 'cot', dur: 120, who: p }));

  // ---------- 情绪 ----------
  if (n.stress > 55) {
    const st = (n.stress - 50) * 1.2;
    if (cnt(p.inv, 'cigs') > 0) add(st * (p.traits.includes('烟瘾') ? 1.5 : 0.9), '抽根烟', () => mk('smoke', roomOf(p), { x: p.x, dur: 8 }));
    if (cnt(p.inv, 'alcohol') >= 0.5) add(st * (p.traits.includes('酗酒') ? 1.4 : 0.6), '喝两口', () => mk('booze', roomOf(p), { x: p.x, dur: 25 }));
    if (p.traits.includes('虔诚')) add(st * 1.2, '祈祷', () => mk('pray', 'lower', { dur: 25 }));
    const friend = bestFriend(w, p);
    if (friend) add(st * 0.9, `想找${friend.name}说说话`, () => mk('chat', roomOf(friend), { x: friend.x, target: friend.id, dur: 20 }));
    if (n.stress > 80) add(st * 0.5, '躲起来哭', () => mk('cry', pick(w.rng, ['lower', 'washroom', 'dorm'] as RoomId[]), { dur: 15 }));
    if (p.traits.includes('乐观') || p.origin === 'singer') add(st * 0.6, '哼首歌', () => mk('sing', roomOf(p), { x: p.x, dur: 15 }));
  }
  // 安慰别人
  for (const q of present(w)) {
    if (q === p || !awake(q) || q.needs.stress < 70) continue;
    const r = rel(w, p.id, q.id);
    if (r.affection > 55 || p.partner === q.id) add((q.needs.stress - 60) * (p.pers.agree / 60) * (r.affection / 60), `${q.name}看起来快撑不住了`, () => mk('comfort', roomOf(q), { x: q.x, target: q.id, dur: 20 }));
  }

  // ---------- 欲望 ----------
  if (n.desire > 55 && !night || n.desire > 70) {
    const t = bestCrush(w, p);
    if (t) {
      const r = rel(w, p.id, t.id), rt = rel(w, t.id, p.id);
      const ready = ['lovers', 'affair', 'transactional', 'patronage'].includes(r.state) || r.flirts >= 2;
      const want = (n.desire - 45) * (0.6 + p.pers.lust / 100);
      if (ready && awake(t) && !t.isPlayer) add(want, `想和${t.name}在一起`, () => { const res = propose(w, p, t, { motive: [] }); return res.consent === 'refused' ? null : p.action; });
      else if (ready && t.isPlayer && awake(t) && !w.pending.some((e) => e.id === 'proposal')) add(want * 0.8, `想和你在一起`, () => { w.pending.push({ id: 'proposal', t: w.t, ctx: { from: p.id } }); return mk('wait', roomOf(t), { x: t.x + 6, dur: 20 }); });
      else if (awake(t)) add(want * 0.8, `想接近${t.name}`, () => mk('flirt', roomOf(t), { x: t.x, target: t.id, dur: 12 }));
    }
    // 交易：饿着的人 + 有吃的、欲望强又不讲道德的人
    if (p.pers.morality < 40 && cnt(p.inv, 'food') + cnt(p.stash, 'food') >= 3) {
      const t2 = present(w).filter((q) => q !== p && !q.isPlayer && awake(q) && q.needs.hunger < 35 && orientationOk(p, q) && attraction(w, p, q) > 30)[0];
      if (t2) add((n.desire - 40) * 0.7, `${t2.name}饿坏了……`, () => { const res = propose(w, p, t2, { motive: ['交易'], deal: ['food', 2] }); return res.consent === 'refused' ? null : p.action; });
    }
  }

  // ---------- 劳动与公共事务 ----------
  const duty = 0.4 + p.pers.agree / 200 + p.pers.morality / 300 + (p.traits.includes('勤劳') ? 0.3 : 0) - (p.traits.includes('懒惰') ? 0.3 : 0);
  if (s.co2 > 45) add((s.co2 - 38) * 1.3 * duty, '空气太闷了', () => mk('crank', 'vent', { obj: 'crank', dur: 30, who: p }));
  if (!s.power && s.genHealth > 0 && cnt(w.storage, 'fuel') > 0 && !w.facts.powerOffByRule) add(70 * duty, '发电机没油了', () => mk('refuel', 'generator', { obj: 'barrels', dur: 10, who: p }));
  if (s.power && s.genFuel < 2.5 && cnt(w.storage, 'fuel') > 0) add(45 * duty, '给发电机加油', () => mk('refuel', 'generator', { obj: 'barrels', dur: 10, who: p }));
  if (s.genHealth < 45 && p.skills.mechanic >= 30) add((50 - s.genHealth) * 1.4 * duty + p.skills.mechanic / 4, '发电机快不行了', () => mk('repair', 'generator', { obj: 'gen', dur: 60, who: p }));
  if (s.water < 30 && !s.filterBuilt) add((35 - s.water) * 1.6 * duty + (s.water < 8 ? 30 : 0), '水快没了，化点雪', () => mk('melt', 'kitchen', { obj: 'stove', dur: 40, who: p }));
  const mt = minuteOfDay(w);
  if (((mt > 10.5 * 60 && mt < 12 * 60) || (mt > 17 * 60 && mt < 18.5 * 60)) && !Number(w.facts.meals) && cnt(w.storage, 'fuel') > 2 && !present(w).some((q) => q.action?.type === 'cook')) add((25 + p.skills.cook / 2) * duty, '该做饭了', () => mk('cook', 'kitchen', { obj: 'stove', dur: 40, who: p }));
  if (p.skills.medic >= 35) {
    const sick = anyoneSick(w).filter((q) => q !== p && !(w.facts[`treated:${q.id}`] as number > w.t - 240)).sort((a, b) => a.health - b.health)[0];
    if (sick) add((60 - sick.health / 2) * duty + p.skills.medic / 4, `${sick.name}病了`, () => { w.facts[`treated:${sick.id}`] = w.t; return mk('treat', roomOf(sick), { x: sick.x, target: sick.id, dur: 25 }); });
  }
  if (p.role === 'guard' && (night || w.politics.rules.nightWatch)) add(45, '站岗', () => mk('guard', 'storage', { obj: 'post', dur: 120, who: p }));
  if (s.farmBuilt && s.farm >= 100 && !present(w).some((q) => q.action?.type === 'farm')) add(60, '种植床可以收了', () => mk('farm', 'lower', { obj: 'farmbed', dur: 30, who: p }));
  else if (s.farmBuilt && !present(w).some((q) => q.action?.type === 'farm') && (w.facts[`farmT`] as number || 0) < w.t - 600) add(25 * duty + (p.origin === 'farmer' ? 25 : 0), '去看看种植床', () => { w.facts.farmT = w.t; return mk('farm', 'lower', { obj: 'farmbed', dur: 30, who: p }); });
  if (!s.farmBuilt && cnt(w.storage, 'seeds') + cnt(p.inv, 'seeds') > 0) add(30 + (p.origin === 'farmer' || p.goals.some((g) => g.startsWith('S_')) ? 25 : 0), '把种子种下去', () => mk('farm', 'lower', { obj: 'farmbed', dur: 60, who: p }));
  if (!s.filterBuilt && cnt(w.storage, 'filter') + cnt(p.inv, 'filter') > 0 && p.skills.mechanic >= 30) add(50, '装滤水器', () => mk('buildfilter', 'vent', { obj: 'tank', dur: 90, who: p }));
  if (!s.radioFixed && p.skills.mechanic >= 40 && (cnt(w.storage, 'radioParts') + cnt(p.inv, 'radioParts') > 0 || s.radioWork > 0)) add(30 + (p.goals.includes('R_RADIO') ? 25 : 0), '修电台', () => mk('fixradio', 'kitchen', { obj: 'radio', dur: 60, who: p }));
  if (w.politics.leader && (w.facts[`job:${p.id}`] as string)) {
    const job = w.facts[`job:${p.id}`] as string;
    const comply = rel(w, p.id, w.politics.leader).respect * 0.5 + rel(w, p.id, w.politics.leader).fear * 0.5 + w.politics.legitimacy * 0.3;
    if (comply > 45) add(35 + comply / 5, '领导安排的活', () => jobAction(w, p, job));
  }
  if (s.archiveOpen && !w.facts.archiveLooted) add(30 + (p.pers.power > 60 ? 15 : 0), '翻翻档案室', () => mk('search', 'archive', { obj: 'files', dur: 30, who: p }));

  // ---------- 社交 ----------
  const lonely = Math.min(60, (w.t - lastTalk(w, p)) / 12) * (p.pers.social / 60);
  if (lonely > 8) {
    const others = present(w).filter((q) => q !== p && awake(q) && !q.isPlayer && q.action?.type !== 'intimacy' && q.action?.type !== 'sleep');
    if (others.length) {
      const t = others.sort((a, b) => scoreChat(w, p, b) - scoreChat(w, p, a))[0];
      add(lonely, `找${t.name}聊聊`, () => mk('chat', roomOf(t), { x: t.x, target: t.id, dur: 18 }));
    }
  }
  // 分吃的给亲近的人
  if (cnt(p.inv, 'food') >= 2 && p.needs.hunger > 50) {
    const t = present(w).filter((q) => q !== p && q.needs.hunger < 30 && (rel(w, p.id, q.id).affection > 55 || p.partner === q.id || p.pers.morality > 75)).sort((a, b) => a.needs.hunger - b.needs.hunger)[0];
    if (t) add(30 + p.pers.morality / 4, `${t.name}饿坏了，分点给${t.gender === 'f' ? '她' : '他'}`, () => mk('give', roomOf(t), { x: t.x, target: t.id, item: 'food', dur: 3, data: { n: 1 } }));
  }
  // 私藏
  if (cnt(p.inv, 'food') >= 3 && (p.pers.morality < 55 || p.goals.includes('W_HOARD')) && !feelsWatched(w, p, 'lower')) add(20 + (p.goals.includes('W_HOARD') ? 20 : 0), '把多的藏起来', () => mk('hoard', 'lower', { dur: 6, item: 'food', secret: true, data: { n: cnt(p.inv, 'food') - 1 } }));

  // ---------- 长期目标 ----------
  goalCandidates(w, p, add);

  // ---------- 闲着 ----------
  add(6, '发呆', () => mk('idle', roomOf(p) === 'outside' ? 'kitchen' : pick(w.rng, ['kitchen', 'dorm', roomOf(p)] as RoomId[]), { dur: 15 + Math.floor(rnd(w.rng) * 20) }));
  if (cnt(p.inv, 'cigs') > 0) add(5, '抽根烟', () => mk('smoke', roomOf(p), { x: p.x, dur: 8 }));
  if (!w.shelter.radioFixed && h >= 19 && h <= 21) add(8, '听听广播', () => mk('listen', 'kitchen', { obj: 'radio', dur: 25, who: p }));
  if (w.shelter.radioFixed) add(12 + (p.goals.some((g) => g.startsWith('E_') || g.startsWith('S_RC')) ? 15 : 0), '听听电台', () => mk('listen', 'kitchen', { obj: 'radio', dur: 25, who: p }));

  // 选择：最高分 + 一点随机
  for (const x of c) x.s += rnd(w.rng) * 8;
  c.sort((a, b) => b.s - a.s);
  for (const x of c.slice(0, 4)) {
    const a = x.a();
    if (a) { if (!a.reason) a.reason = x.why; p.thought = x.why; return a; }
  }
  return mk('idle', 'kitchen', { dur: 20 });
}

function sleepAction(w: World, p: Person): Action {
  if (p.bed !== undefined) { const b = BEDS[p.bed]; return mk('sleep', b.room, { x: b.x, dur: 600 }); }
  // 没床的人：挤在别人床边，或睡在发电机房（暖和）
  const warm = w.shelter.power ? 'generator' : 'dorm';
  return mk('sleep', warm, { dur: 600 });
}

function warmestRoom(w: World): RoomId {
  let best: RoomId = 'dorm', t = -99;
  for (const id of ['generator', 'dorm', 'kitchen', 'infirmary'] as RoomId[]) { const v = w.shelter.rooms[id]?.temp ?? -99; if (v > t) { t = v; best = id; } }
  return best;
}

function lastTalk(w: World, p: Person) {
  const r = w.rel[p.id] || {};
  let m = -9999; for (const k in r) m = Math.max(m, r[k].lastTalk); return m;
}
function scoreChat(w: World, p: Person, q: Person) { return opinion(w, p.id, q.id) + (roomOf(q) === roomOf(p) ? 15 : 0) - Math.abs(q.x - p.x) / 20 + rnd(w.rng) * 15; }
function bestFriend(w: World, p: Person) {
  return present(w).filter((q) => q !== p && awake(q) && !q.isPlayer && q.action?.type !== 'intimacy').sort((a, b) => opinion(w, p.id, b.id) - opinion(w, p.id, a.id))[0] as Person | undefined;
}
export function bestCrush(w: World, p: Person): Person | undefined {
  if (p.partner) { const q = P(w, p.partner); if (q && q.alive && q.present && rnd(w.rng) < 0.85) return q; }
  const list = present(w).filter((q) => q !== p && !hasCond(q, 'captive') && attraction(w, p, q) > 35);
  return list.sort((a, b) => attraction(w, p, b) - attraction(w, p, a))[0];
}

function jobAction(w: World, p: Person, job: string): Action | null {
  switch (job) {
    case 'crank': return mk('crank', 'vent', { obj: 'crank', dur: 45, who: p });
    case 'clear': return mk('clear', 'collapse', { obj: 'rubble', dur: 90, who: p });
    case 'cook': return mk('cook', 'kitchen', { obj: 'stove', dur: 40, who: p });
    case 'guard': return mk('guard', 'storage', { obj: 'post', dur: 120, who: p });
    case 'repair': return mk('repair', 'generator', { obj: 'gen', dur: 60, who: p });
    case 'farm': return w.shelter.farmBuilt ? mk('farm', 'lower', { obj: 'farmbed', dur: 40, who: p }) : null;
    case 'melt': return mk('melt', 'kitchen', { obj: 'stove', dur: 40, who: p });
    case 'treat': { const sick = anyoneSick(w)[0]; return sick ? mk('treat', roomOf(sick), { x: sick.x, target: sick.id, dur: 25 }) : null; }
  }
  return null;
}

// 目标网络上的打算
function goalCandidates(w: World, p: Person, add: (s: number, why: string, a: () => Action | null) => void) {
  const night = isNight(w), h = hour(w);
  const canTrip = () => !p.isPlayer && !w.expeditions.some((e) => e.members.includes(p.id)) && p.health > 55 && p.needs.hunger > 35 && p.needs.energy > 35 && (h >= 20 || h < 2) && (Number(p.agenda.tripCool) || 0) < w.t;
  // 公共：存粮快见底时，胆子大的人会出去找吃的
  const need = present(w).length * 4;
  if (cnt(w.storage, 'food') < need && canTrip() && w.expeditions.length < 2) {
    const urgency = (need - cnt(w.storage, 'food')) / Math.max(1, need);
    add(urgency * (25 + p.pers.fear / 3 + p.skills.scavenge / 4) * (0.6 + p.pers.agree / 150), '存粮不多了，出去找吃的', () => planExpedition(w, p, !w.shelter.farmBuilt && !cnt(w.storage, 'seeds') && rnd(w.rng) < 0.5 ? 'grain' : pick(w.rng, ['grain', 'houses', 'station', 'church', 'houses'] as const), 'food'));
  }
  if (cnt(w.storage, 'fuel') < 6 && canTrip() && w.expeditions.length < 2) add(25 + p.pers.fear / 4, '燃料快没了', () => planExpedition(w, p, pick(w.rng, ['station', 'grain'] as const), 'fuel'));
  for (const g of p.goals.slice(0, 3)) {
    const wt = g === p.goals[0] ? 1 : 0.7;
    switch (g) {
      case 'E_CROSS': case 'E_PASS': case 'C_MIL': case 'K_MIL': {
        const done = w.done[p.id] || {};
        if (g === 'E_CROSS' && (cnt(p.inv, 'pass') + cnt(p.inv, 'forgedPass') > 0 || w.facts[`seat:${p.id}`]) && canTrip()) add(70 * wt, '是时候走了', () => planExpedition(w, p, 'border', 'cross'));
        else if (g === 'E_CROSS' && w.shelter.drainFound && p.knows.K_DRAIN && night && p.pers.fear > 55 && canTrip()) add(55 * wt, '从暗渠走', () => planExpedition(w, p, 'drain', 'cross'));
        else if (!p.knows.K_MIL && !p.knows.K_SMUG && canTrip()) add(22 * wt, '出去打探消息', () => planExpedition(w, p, 'station', 'scout'));
        else if (p.knows.K_MIL && !hasMil(w, p) && canTrip() && (cnt(p.inv, 'food') + cnt(p.stash, 'food') >= 6 || cnt(p.inv, 'cigs') >= 5 || cnt(p.inv, 'alcohol') >= 1)) add(40 * wt, '去军营打点', () => planExpedition(w, p, 'camp', 'contact'));
        else if (hasMil(w, p) && !done.E_PASS && canTrip() && (cnt(p.inv, 'food') + cnt(p.stash, 'food') >= 12 || cnt(p.inv, 'meds') >= 2 || cnt(p.inv, 'valuables') >= 4) && w.war.passSlots > 0) add(55 * wt, '去换通行证', () => planExpedition(w, p, 'camp', 'pass'));
        else if (cnt(p.inv, 'blankPermit') && p.skills.forgery >= 40 && !feelsWatched(w, p, 'lower')) add(50 * wt, '做一张证件', () => mk('forge', 'lower', { dur: 120, secret: true }));
        else if (!w.shelter.archiveOpen && p.goals.includes('E_PASS')) archiveCands(w, p, add, 0.6 * wt);
        else if (g === 'E_CROSS' && p.knows.K_SMUG && !w.facts[`C_SMUG:${p.id}`] && (cnt(p.inv, 'valuables') >= 2 || cnt(p.inv, 'meds') >= 2) && canTrip()) add(45 * wt, '去黑市找走私的人', () => planExpedition(w, p, 'market', 'smug'));
        else if (g === 'E_CROSS' && w.facts[`C_SMUG:${p.id}`] && !w.facts[`seat:${p.id}`] && canTrip() && (cnt(p.inv, 'valuables') >= 4 || cnt(p.inv, 'meds') >= 3)) add(50 * wt, '去买偷渡名额', () => planExpedition(w, p, 'market', 'seat'));
        else hoardFor(w, p, add, 0.6 * wt);
        if (g === 'E_CROSS' && !w.shelter.drainFound && w.shelter.collapseWork > 30) add(18 * wt, '清理坍塌区', () => mk('clear', 'collapse', { obj: 'rubble', dur: 90, who: p }));
        break;
      }
      case 'P_LEADER': case 'P_KEY': {
        if (!w.politics.leader || w.politics.leader !== p.id) {
          if (h >= 18 && h <= 21 && w.t - w.politics.lastMeeting > 1440 * 2 && day(w) >= 2) add(35 * wt + p.pers.power / 4, '该有人站出来管事了', () => { npcCallsMeeting(w, p); return null; });
          if (w.shelter.keyHolder && w.shelter.keyHolder !== p.id && p.pers.morality < 40 && night) { const k = P(w, w.shelter.keyHolder); if (k && k.action?.type === 'sleep' && k.action.t > 30) add(25 * wt, `趁${k.name}睡着拿钥匙`, () => mk('steal', roomOf(k), { x: k.x, dur: 5, item: 'storageKey', secret: true, data: { from: k.id } })); }
        }
        // 拉拢人
        const t = present(w).filter((q) => q !== p && !q.isPlayer && awake(q) && rel(w, q.id, p.id).trust < 60).sort(() => rnd(w.rng) - 0.5)[0];
        if (t) add(15 * wt, `拉拢${t.name}`, () => mk('chat', roomOf(t), { x: t.x, target: t.id, dur: 20 }));
        break;
      }
      case 'W_HOARD': case 'W_MARKET': hoardFor(w, p, add, wt); break;
      case 'S_SELF': case 'S_REBUILD': case 'S_FOOD': case 'S_WATER': case 'S_RESCUE': case 'S_RC': {
        if (!w.shelter.farmBuilt && cnt(w.storage, 'seeds') + cnt(p.inv, 'seeds') === 0 && canTrip() && !w.expeditions.some((e) => e.loc === 'grain')) add(30 * wt, '去粮站找种子', () => planExpedition(w, p, pick(w.rng, ['grain', 'church'] as const), 'seeds'));
        else if (!w.shelter.filterBuilt && cnt(w.storage, 'filter') + cnt(p.inv, 'filter') === 0 && canTrip() && !w.expeditions.some((e) => e.loc === 'hospital')) add(26 * wt, '去医院找滤水器材', () => planExpedition(w, p, 'hospital', 'filter'));
        else if (w.war.phase >= 3 && p.knows.K_REDCROSS && !w.facts.rcRegistered && canTrip()) add(40 * wt, '去红十字站登记', () => planExpedition(w, p, 'redcross', 'register'));
        else if (cnt(w.storage, 'food') < 15 && canTrip()) add(30 * wt, '出去找吃的', () => planExpedition(w, p, pick(w.rng, ['grain', 'houses', 'station'] as const), 'food'));
        break;
      }
      case 'L_PARTNER': {
        if (!p.partner) { const t = bestCrush(w, p); if (t && awake(t) && !t.isPlayer) add(18 * wt, `想多跟${t.name}待一会儿`, () => mk(rel(w, p.id, t.id).affection > 50 ? 'flirt' : 'chat', roomOf(t), { x: t.x, target: t.id, dur: 15 })); }
        break;
      }
      case 'D_PATRON': {
        const l = P(w, w.politics.leader);
        if (l && l !== p && awake(l) && !l.isPlayer) add(20 * wt, `去讨好${l.name}`, () => mk('chat', roomOf(l), { x: l.x, target: l.id, dur: 15 }));
        break;
      }
      case 'R_EXPOSE': case 'R_DEPOSE': {
        const l = P(w, w.politics.leader);
        if (l && l !== p && opinion(w, p.id, l.id) < 20 && h >= 18 && h <= 21 && w.t - w.politics.lastMeeting > 1440) add(30 * wt, `${l.name}不能再这么下去了`, () => { npcCallsMeeting(w, p, 'depose'); return null; });
        break;
      }
      case 'R_RADIO': if (!w.shelter.radioFixed && cnt(w.storage, 'radioParts') + cnt(p.inv, 'radioParts') === 0 && canTrip()) add(25 * wt, '去找电台零件', () => planExpedition(w, p, pick(w.rng, ['station', 'party'] as const), 'radio')); break;
      default:
        if (g.startsWith('REVENGE:')) {
          const t = P(w, g.slice(8));
          if (t && t.alive && t.present) {
            if (h >= 18 && h <= 21 && w.t - w.politics.lastMeeting > 1440) add(25 * wt, `让${t.name}付出代价`, () => { npcCallsMeeting(w, p, 'punish', t.id); return null; });
            if (p.pers.fear > 60 && p.skills.combat > t.skills.combat && rnd(w.rng) < 0.3) add(20 * wt, `找${t.name}算账`, () => mk('fight', roomOf(t), { x: t.x, target: t.id, dur: 5, data: { reason: '旧账' } }));
          }
        }
    }
  }
}

function hoardFor(w: World, p: Person, add: (s: number, why: string, a: () => Action | null) => void, wt: number) {
  if (cnt(w.storage, 'food') > 0 && p.pers.morality < 45 && !feelsWatched(w, p, 'storage') && isNight(w) && p.needs.hunger < 70) add(14 * wt * (1 - p.pers.morality / 100) * 2, '多攒点，以防万一', () => mk('steal', 'storage', { obj: 'cage', dur: 6, item: pick(w.rng, ['food', 'food', 'cigs', 'meds', 'alcohol'] as ItemKey[]), secret: true, data: { n: 1 }, who: p }));
}
function archiveCands(w: World, p: Person, add: (s: number, why: string, a: () => Action | null) => void, wt: number) {
  const holder = w.people.find((q) => q.alive && q !== p && cnt(q.inv, 'archiveKey') > 0);
  if (holder && holder.action?.type === 'sleep' && holder.action.t > 30 && p.pers.morality < 50) add(30 * wt, `趁${holder.name}睡着拿档案室钥匙`, () => mk('steal', roomOf(holder), { x: holder.x, dur: 5, item: 'archiveKey', secret: true, data: { from: holder.id } }));
  if (cnt(p.inv, 'archiveKey') || cnt(p.inv, 'crowbar')) add(45 * wt, '打开档案室', () => { w.shelter.archiveOpen = true; w.facts.archiveOpenedBy = p.id; return mk('search', 'archive', { obj: 'files', dur: 30, who: p }); });
}

export { willingness };
