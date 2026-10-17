// 社交：聊天、流言、目击、偷窃、私藏、治疗、打架、亲密的入口
import type { Action, ItemKey, Person, World, Rumor } from './types';
import { clamp, rel, relAdd, opinion, addMem, log, nm, roomOf, peopleIn, awake, present, cnt, addItem, takeItem, bark, hasCond, knowFact, P, tagMethod, uid, pron, isNight } from './util';
import { rnd, chance, pick } from '../engine/rng';
import { addCond } from './env';
import * as intimacy from './intimacy';
import { ITEMS } from '../content/items';

// ---------- 目击 ----------
export function witnesses(w: World, p: Person, extra: Person[] = []): Person[] {
  const room = roomOf(p);
  const lit = w.shelter.rooms[room]?.lit;
  return peopleIn(w, room).filter((q) => q !== p && !extra.includes(q) && awake(q) && (lit || Math.abs(q.x - p.x) < 16));
}
// 主观：这个人觉得会不会被看见（只看同房间醒着的人）
export function feelsWatched(w: World, p: Person, room = roomOf(p)) {
  return peopleIn(w, room).some((q) => q !== p && awake(q));
}

// ---------- 流言 ----------
export function addRumor(w: World, knower: Person, fact: string, text: string, about: string[], severity: number, truth = true): Rumor {
  let r = w.rumors.find((x) => x.fact === fact);
  if (!r) { r = { id: uid(w, 'r'), fact, text, about, t: w.t, truth, severity }; w.rumors.unshift(r); if (w.rumors.length > 80) w.rumors.length = 80; }
  knower.knows['rumor:' + r.id] = true;
  return r;
}
export const knowsRumor = (p: Person, r: Rumor) => !!p.knows['rumor:' + r.id];

function spreadRumor(w: World, teller: Person, listener: Person) {
  const known = w.rumors.filter((r) => knowsRumor(teller, r) && !knowsRumor(listener, r) && !r.about.includes(listener.id));
  if (!known.length) return;
  // 越劲爆越想说；外向的人更爱说
  const r = known.sort((a, b) => b.severity - a.severity)[0];
  if (rnd(w.rng) > 0.25 + teller.pers.social / 200) return;
  // 不说自己的坏话；不跟被议论者的伴侣说
  if (r.about.includes(teller.id)) return;
  listener.knows['rumor:' + r.id] = true;
  const belief = rel(w, listener.id, teller.id).trust / 100;
  for (const who of r.about) {
    if (who === listener.id) continue;
    applyRumorJudgement(w, listener, who, r, belief);
  }
  if (listener.isPlayer) log(w, `${teller.name}压低声音告诉你：${r.text}`, { col: '#c8a8b8', who: [teller.id] });
}

export function applyRumorJudgement(w: World, judge: Person, who: string, r: Rumor, belief: number) {
  const m = judge.pers.morality / 100;
  const sev = r.severity * belief;
  if (r.fact.startsWith('steal:')) relAdd(w, judge.id, who, { trust: -sev * 0.3, respect: -sev * 0.15, resentment: sev * 0.1 * m });
  else if (r.fact.startsWith('intim:')) { relAdd(w, judge.id, who, { respect: -sev * 0.08 * m }); intimacy.jealousyCheck(w, judge, r); }
  else if (r.fact.startsWith('hoard:')) relAdd(w, judge.id, who, { trust: -sev * 0.25, resentment: sev * 0.12 });
  else if (r.fact.startsWith('secret:')) relAdd(w, judge.id, who, { trust: -sev * 0.15 });
  else if (r.fact.startsWith('abuse:')) relAdd(w, judge.id, who, { respect: -sev * 0.2, resentment: sev * 0.2 * m });
  else if (r.fact.startsWith('coerce:')) relAdd(w, judge.id, who, { trust: -sev * 0.3, respect: -sev * 0.3, resentment: sev * 0.3 * m, fear: sev * 0.1 });
  else if (r.fact.startsWith('good:')) relAdd(w, judge.id, who, { respect: sev * 0.15, trust: sev * 0.1 });
}

// ---------- 聊天等社交行动 ----------
export function beginSocial(w: World, p: Person, t: Person, a: Action): boolean {
  if (!awake(t) && a.type !== 'fight') return false;
  if (t.action && ['intimacy', 'meeting', 'expedition'].includes(t.action.type)) return false;
  // 对方停下来配合（除非对方是玩家）
  if (!t.isPlayer && t.action && !['sleep'].includes(t.action.type)) {
    if (t.action.t > 0 || a.type === 'fight') {
      t.queue.unshift({ ...t.action });
    }
    t.action = { type: 'wait', room: roomOf(t), x: t.x, dur: a.dur, t: 0, target: p.id };
  }
  t.facing = p.x < t.x ? -1 : 1; p.facing = -t.facing;
  if (a.type === 'intimacy') return intimacy.beginIntimacy(w, p, t, a);
  return true;
}

export function completeSocial(w: World, p: Person, t: Person, a: Action) {
  if (!t) return;
  switch (a.type) {
    case 'chat': chat(w, p, t, a.data); break;
    case 'comfort': comfort(w, p, t); break;
    case 'flirt': intimacy.flirt(w, p, t); break;
    case 'intimacy': intimacy.completeIntimacy(w, p, t, a); break;
    case 'fight': fight(w, p, t, (a.data?.reason as string) || ''); break;
  }
  if (t.action?.type === 'wait' && t.action.target === p.id) { t.action = t.queue.shift() || null; }
}

export function chat(w: World, a: Person, b: Person, data?: Record<string, unknown>) {
  if (data?.beg) { beg(w, a, b, data.beg as ItemKey); }
  const ra = rel(w, a.id, b.id), rb = rel(w, b.id, a.id);
  const compat = 1 - Math.abs(a.pers.regime === b.pers.regime ? 0 : 0.3) - Math.abs(a.pers.social - b.pers.social) / 300;
  const gain = 2.5 * compat + (b.pers.agree - 50) / 40;
  relAdd(w, a.id, b.id, { affection: gain, trust: gain * 0.6 });
  relAdd(w, b.id, a.id, { affection: gain, trust: gain * 0.6 });
  ra.lastTalk = rb.lastTalk = w.t;
  if (ra.state === 'stranger') ra.state = 'acquainted';
  if (rb.state === 'stranger') rb.state = 'acquainted';
  if (ra.affection > 60 && ra.trust > 55 && ra.state === 'acquainted') ra.state = 'friend';
  if (rb.affection > 60 && rb.trust > 55 && rb.state === 'acquainted') rb.state = 'friend';
  a.needs.stress = clamp(a.needs.stress - 3); b.needs.stress = clamp(b.needs.stress - 3);
  if (!a.isPlayer && !b.isPlayer && rnd(w.rng) < 0.6) { bark(a, w, smallTalk(w, a, b), 50); if (rnd(w.rng) < 0.6) bark(b, w, reply(w, b, a), 60); }
  spreadRumor(w, a, b); spreadRumor(w, b, a);
  // 交换知识（信任足够时）
  shareKnowledge(w, a, b); shareKnowledge(w, b, a);
  // 吵起来
  if (ra.resentment > 55 && chance(w.rng, 0.25)) { relAdd(w, a.id, b.id, { resentment: 3 }); relAdd(w, b.id, a.id, { resentment: 3, affection: -3 }); bark(a, w, pick(w.rng, ['你什么意思？', '别跟我来这套。', '我早就看你不顺眼。'])); }
}

// NPC 之间的闲聊（头顶对白），让玩家看得到他们在交往
function smallTalk(w: World, a: Person, b: Person): string {
  const r = rel(w, a.id, b.id);
  const n = a.needs;
  const lead = P(w, w.politics.leader);
  const pool: string[] = [];
  if (n.hunger < 35) pool.push('饿死了……', '你还有吃的吗？');
  if (n.warmth < 35) pool.push('冷……', '今晚挤一挤吧。');
  if (n.stress > 65) pool.push('我睡不着。', '炮声又近了。', '我们会死在这儿吗？');
  if (r.state === 'lovers' || r.state === 'flirting') pool.push('（凑近耳边说了什么）', '……晚上来找我。', '你冷不冷？');
  if (r.resentment > 45) pool.push('你什么意思？', '别跟我装。');
  if (lead && lead !== a && lead !== b) pool.push(opinion(w, a.id, lead.id) < 15 ? `${lead.name}那个人……（压低声音）` : `${lead.name}还算靠得住。`);
  if (w.rumors.some((x) => a.knows['rumor:' + x.id] && !x.about.includes(b.id))) pool.push('（压低声音）你听说了吗……');
  if (w.war.phase === 2) pool.push('镇子西边全炸平了。');
  if (w.war.phase === 3) pool.push('外面说的是另一种话了。');
  if (a.goals[0] === 'E_CROSS') pool.push('要是能过河就好了。');
  if (a.goals[0] === 'S_SELF' || a.goals[0] === 'S_REBUILD') pool.push('得想办法自己种点东西。');
  if (!pool.length) pool.push('……', '你以前是干什么的？', '天什么时候才亮。', '有烟吗？');
  return pick(w.rng, pool);
}
function reply(w: World, b: Person, a: Person): string {
  const o = opinion(w, b.id, a.id);
  if (o < 0) return pick(w.rng, ['关你什么事。', '……', '离我远点。']);
  if (o > 50) return pick(w.rng, ['嗯。', '我也是。', '（点头）', '会好的。', '别想太多。']);
  return pick(w.rng, ['……', '谁知道呢。', '是吗。', '嗯。']);
}

const SHAREABLE = ['K_MIL', 'K_SMUG', 'K_REDCROSS', 'K_MARKET', 'K_DRAIN', 'K_ARCHIVE_FILES'];
export function shareKnowledge(w: World, teller: Person, listener: Person) {
  const r = rel(w, teller.id, listener.id);
  if (r.trust < 55) return;
  for (const f of SHAREABLE) {
    if (teller.knows[f] && !listener.knows[f] && rnd(w.rng) < 0.25) {
      knowFact(w, listener, f);
      if (listener.isPlayer) {
        const t = { K_MIL: '军方在火车站附近设了物资交换点，能弄到通行证。', K_SMUG: '河对岸有人在偷渡，只要付得起。', K_REDCROSS: '红十字会的人可能会来这一带。', K_MARKET: '镇上有个黑市，什么都能换。', K_DRAIN: '坍塌区下面有条排水渠通到河边。', K_ARCHIVE_FILES: '档案室里有能要人命的东西。' } as Record<string, string>;
        log(w, `${teller.name}告诉你：「${t[f]}」`, { col: '#a0d8e8', important: true, who: [teller.id] });
        if (f === 'K_MIL') w.locs.camp.known = true;
        if (f === 'K_MARKET' || f === 'K_SMUG') w.locs.market.known = true;
        if (f === 'K_REDCROSS') w.locs.redcross.known = true;
      }
      return;
    }
  }
}

export function comfort(w: World, a: Person, b: Person) {
  const r = rel(w, b.id, a.id);
  const eff = 6 + r.affection / 10 + a.pers.agree / 20;
  b.needs.stress = clamp(b.needs.stress - eff);
  relAdd(w, b.id, a.id, { affection: 4, trust: 3, debt: 2 });
  relAdd(w, a.id, b.id, { affection: 2 });
  if (hasCond(b, 'grief')) { const c = b.conds.find((x) => x.type === 'grief')!; c.sev = clamp(c.sev - 15); }
  if (hasCond(b, 'trauma')) { const c = b.conds.find((x) => x.type === 'trauma')!; c.sev = clamp(c.sev - 6); }
  addMem(b, w, { kind: 'comforted', who: a.id, w: 15, text: `${a.name}陪我坐了一会儿。` });
}

export function gainRespect(w: World, p: Person, n: number) {
  for (const q of present(w)) if (q !== p) relAdd(w, q.id, p.id, { respect: n * 0.4 });
}

// 求人分点东西（或向保管人要配给）
export function beg(w: World, a: Person, b: Person, item: ItemKey) {
  const r = rel(w, b.id, a.id);
  const keeper = w.shelter.keyHolder === b.id || w.politics.leader === b.id;
  const fromStore = keeper && cnt(w.storage, item) > 0;
  const has = cnt(b.inv, item) > (b.needs.hunger < 40 ? 1 : 0);
  if (!fromStore && !has) { if (!b.isPlayer) bark(b, w, '我自己都没有。'); return; }
  const will = r.affection * 0.4 + r.trust * 0.2 + b.pers.morality * 0.4 + b.pers.agree * 0.2 - r.resentment * 0.6 + (fromStore ? 25 : 0) + (a.needs.hunger < 15 ? 15 : 0) - (b.traits.includes('吝啬') ? 25 : 0) + rnd(w.rng) * 20;
  if (b.isPlayer) { w.pending.push({ id: 'beg_player', t: w.t, ctx: { from: a.id, item } }); return; }
  if (will > 55) {
    if (fromStore) { takeItem(w.storage, item, 1); addItem(a.inv, item, 1); relAdd(w, a.id, b.id, { trust: 3, debt: 3 }); if (a.isPlayer) log(w, `${b.name}从仓库里给了你一份${ITEMS[item].name}。`, { col: '#a0d890' }); }
    else giveItem(w, b, a, item, 1);
    bark(b, w, pick(w.rng, ['拿去吧。', '……就这一次。', '省着点吃。']));
  } else { relAdd(w, a.id, b.id, { resentment: 3 }); bark(b, w, pick(w.rng, ['不行。', '大家都一样饿。', '规矩就是规矩。'])); }
}

// ---------- 偷窃 ----------
export function beginSteal(w: World, p: Person, a: Action): boolean {
  // 有人看着就放弃（NPC 自己判断）；玩家由 UI 承担风险
  if (!p.isPlayer && feelsWatched(w, p)) { p.thought = '有人在，下次吧。'; return false; }
  return true;
}
export function completeSteal(w: World, p: Person, a: Action) {
  const item = (a.item || 'food') as ItemKey;
  const n = (a.data?.n as number) || 1;
  const from = a.data?.from as string | undefined; // 人物 id 或 storage
  let got = 0;
  if (!from || from === 'storage') got = takeItem(w.storage, item, n);
  else { const v = P(w, from); if (v) { got = takeItem(v.stash, item, n); if (!got) got = takeItem(v.inv, item, n); } }
  if (!got) return;
  addItem(p.inv, item, got);
  w.stats.thefts++;
  tagMethod(p, '偷窃');
  const seen = witnesses(w, p);
  const guard = w.people.find((q) => q.role === 'guard' && q.alive && q.present && roomOf(q) === 'storage' && awake(q));
  if (guard && !seen.includes(guard)) seen.push(guard);
  const desc = `${p.name}偷拿了${ITEMS[item].name}×${got}`;
  if (seen.length) {
    const r = addRumor(w, seen[0], `steal:${p.id}:${w.t}`, `${desc}。`, [p.id], 45);
    for (const q of seen) {
      q.knows['rumor:' + r.id] = true;
      applyRumorJudgement(w, q, p.id, r, 1);
      addMem(q, w, { kind: 'saw_steal', who: p.id, w: -20, text: `${desc}，被我看见了。` });
      if (!q.isPlayer && q.pers.morality > 60 && opinion(w, q.id, p.id) < 40) w.pending.push({ id: 'accuse', t: w.t + 30, ctx: { accuser: q.id, accused: p.id, item, n: got } });
    }
    log(w, `${nm(w, seen[0].id)}看见${nm(w, p.id)}从${from && from !== 'storage' ? nm(w, from) + '那里' : '仓库里'}拿走了${ITEMS[item].name}。`, { col: '#e8a060', who: [p.id, seen[0].id], important: p.isPlayer || seen.some((q) => q.isPlayer) });
    if (p.isPlayer) w.facts.playerCaughtStealing = ((w.facts.playerCaughtStealing as number) || 0) + 1;
  } else if (p.isPlayer) {
    log(w, `你拿到了${ITEMS[item].name}×${got}。没人看见。`, { col: '#c8c0b0' });
  }
  // 失窃会被发现（库存对不上）
  if (!from || from === 'storage') w.facts.missing = ((w.facts.missing as number) || 0) + got * ITEMS[item].value;
  else { const v = P(w, from); if (v && !v.isPlayer) { addMem(v, w, { kind: 'robbed', w: -25, text: `我的${ITEMS[item].name}少了。` }); v.needs.stress = clamp(v.needs.stress + 8); } else if (v?.isPlayer) log(w, `你发现自己的${ITEMS[item].name}少了。`, { col: '#e8a060', important: true }); }
}

export function completeHoard(w: World, p: Person, a: Action) {
  const item = (a.item || 'food') as ItemKey;
  const n = takeItem(p.inv, item, (a.data?.n as number) || 99);
  addItem(p.stash, item, n);
  const seen = witnesses(w, p);
  if (seen.length) {
    const r = addRumor(w, seen[0], `hoard:${p.id}`, `${p.name}把东西藏在了${roomOf(p) === 'lower' ? '下层小间' : roomOf(p) === 'archive' ? '档案室' : '床底下'}。`, [p.id], 30);
    for (const q of seen) { q.knows['rumor:' + r.id] = true; q.knows['stash:' + p.id] = true; }
  }
}

// ---------- 治疗 ----------
export function treat(w: World, medic: Person, t: Person) {
  const skill = medic.skills.medic;
  let did = '';
  for (const c of t.conds) {
    if (c.type === 'wound' && (cnt(w.storage, 'bandage') || cnt(medic.inv, 'bandage'))) { takeItem(medic.inv, 'bandage', 1) || takeItem(w.storage, 'bandage', 1); c.sev = clamp(c.sev - 15 - skill / 4); did = '包扎了伤口'; }
    else if ((c.type === 'infection' || c.type === 'fever' || c.type === 'flu') && (cnt(w.storage, 'meds') || cnt(medic.inv, 'meds'))) {
      if (c.type !== 'flu' || c.sev > 50) { takeItem(medic.inv, 'meds', 1) || takeItem(w.storage, 'meds', 1); c.sev = clamp(c.sev - 40 - skill / 3); did = '用了一支药'; }
    } else if (c.type === 'hypothermia' || c.type === 'frostbite') { c.sev = clamp(c.sev - 10 - skill / 6); did = did || '处理了冻伤'; }
    else if (c.type === 'dysentery') { c.sev = clamp(c.sev - 10 - skill / 5); did = did || '给了些盐水'; }
  }
  t.health = clamp(t.health + 3 + skill / 20);
  if (!did) did = '检查了一下';
  relAdd(w, t.id, medic.id, { trust: 5, affection: 4, debt: 6 });
  addMem(t, w, { kind: 'treated', who: medic.id, w: 20, text: `${medic.name}给我${did}。` });
  if (medic.isPlayer || t.isPlayer) log(w, `${nm(w, medic.id)}给${nm(w, t.id)}${did}。`, { col: '#a0d890' });
  tagMethod(medic, '合作');
}

// ---------- 打架 ----------
export function fight(w: World, a: Person, b: Person, reason: string) {
  const pa = a.skills.combat + (a.look.heavy ? 10 : 0) + (cnt(a.inv, 'knife') ? 10 : 0) + rnd(w.rng) * 40 - (100 - a.health) / 4;
  const pb = b.skills.combat + (b.look.heavy ? 10 : 0) + (cnt(b.inv, 'knife') ? 10 : 0) + rnd(w.rng) * 40 - (100 - b.health) / 4;
  const [win, lose] = pa >= pb ? [a, b] : [b, a];
  addCond(w, lose, 'wound', 15 + rnd(w.rng) * 25);
  lose.health = clamp(lose.health - 8);
  addCond(w, win, 'wound', rnd(w.rng) * 10);
  relAdd(w, lose.id, win.id, { fear: 15, resentment: 20, affection: -10 });
  relAdd(w, win.id, lose.id, { resentment: 5, affection: -5 });
  for (const q of witnesses(w, a, [b])) { relAdd(w, q.id, win.id, { fear: 6, respect: 2 }); relAdd(w, q.id, a.id, { trust: -4 }); }
  log(w, `${nm(w, a.id)}和${nm(w, b.id)}打了起来${reason ? '——' + reason : ''}。${nm(w, win.id)}占了上风。`, { col: '#e8705a', important: true, who: [a.id, b.id] });
  tagMethod(a, '暴力');
}

export function drunkTrouble(w: World, p: Person) {
  const others = peopleIn(w, roomOf(p)).filter((q) => q !== p && awake(q));
  if (!others.length) return;
  const t = others.sort((x, y) => opinion(w, p.id, x.id) - opinion(w, p.id, y.id))[0];
  bark(p, w, pick(w.rng, ['看什么看！', '你他妈的……', '都是你们害的！']));
  if (opinion(w, p.id, t.id) < 15) fight(w, p, t, '他喝醉了');
  else relAdd(w, t.id, p.id, { respect: -3, fear: 3 });
}

// ---------- 给予 / 交易 ----------
export function giveItem(w: World, from: Person, to: Person, item: ItemKey, n: number) {
  const got = takeItem(from.inv, item, n);
  if (!got) return 0;
  addItem(to.inv, item, got);
  const v = ITEMS[item].value * got;
  const needBonus = item === 'food' && to.needs.hunger < 40 ? 2 : item === 'meds' && to.conds.length ? 2 : 1;
  relAdd(w, to.id, from.id, { affection: Math.min(15, v * 1.5 * needBonus), trust: Math.min(10, v * needBonus), debt: Math.min(20, v * 2) });
  addMem(to, w, { kind: 'gift', who: from.id, w: Math.min(40, v * 4 * needBonus), text: `${from.name}给了我${ITEMS[item].name}。` });
  for (const q of witnesses(w, from, [to])) relAdd(w, q.id, from.id, { respect: 1 });
  return got;
}

// NPC 对物品的估价（越缺越值钱）
export function valueFor(w: World, p: Person, item: ItemKey): number {
  let v = ITEMS[item].value;
  if (item === 'food') v *= p.needs.hunger < 30 ? 2.2 : p.needs.hunger < 55 ? 1.4 : 1;
  if (item === 'meds' && p.conds.some((c) => ['infection', 'fever', 'flu', 'heart'].includes(c.type))) v *= 2;
  if (item === 'cigs' && p.traits.includes('烟瘾')) v *= 2.5;
  if (item === 'alcohol' && p.traits.includes('酗酒')) v *= 2;
  if (item === 'pass' || item === 'forgedPass') v *= p.goals.includes('E_CROSS') || p.goals.includes('E_PASS') ? 2 : 0.6;
  if (item === 'map') v *= p.goals.includes('E_CROSS') ? 2 : 0.5;
  if (item === 'condom') v *= p.needs.desire > 50 ? 2 : 0.5;
  if (item === 'pistol') v *= p.pers.power > 60 || p.pers.fear < 40 ? 1.5 : 0.7;
  return v;
}
// 交易：b 是否接受用 give 换 get
export function evaluateTrade(w: World, a: Person, b: Person, give: [ItemKey, number][], get: [ItemKey, number][]): { ok: boolean; ratio: number; text: string } {
  const gv = give.reduce((s, [k, n]) => s + valueFor(w, b, k) * n, 0);
  const lv = get.reduce((s, [k, n]) => s + valueFor(w, b, k) * n * (k === 'food' && cnt(b.inv, 'food') <= n ? 1.6 : 1), 0);
  const r = rel(w, b.id, a.id);
  const friendly = 1 + (r.affection - 40) / 200 + (r.debt > 0 ? r.debt / 200 : 0) + (b.traits.includes('吝啬') ? -0.25 : 0) + (b.traits.includes('慷慨') ? 0.2 : 0);
  const ratio = (gv * friendly) / Math.max(0.1, lv);
  const ok = ratio >= 1;
  const text = ok ? pick(w.rng, ['成交。', '行吧。', '……好。', '算你会做生意。']) : ratio > 0.7 ? pick(w.rng, ['再加点。', '这点东西可不够。', '你在开玩笑吧。']) : pick(w.rng, ['不换。', '想都别想。', '你当我傻？']);
  return { ok, ratio, text };
}

export function nightAt(w: World) { return isNight(w); }
export { pron };
