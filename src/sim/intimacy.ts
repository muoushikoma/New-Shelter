// 亲密与欲望：吸引力、调情、意愿度、关系后果。具体文字与画面走成人内容接口（UI 层）
import type { Action, ItemKey, Person, World, Rumor } from './types';
import { clamp, rel, relAdd, addMem, log, nm, roomOf, peopleIn, awake, bark, tagMethod, P, hasCond, addItem, takeItem, cnt, opinion } from './util';
import { rnd, chance, pick } from '../engine/rng';
import { addCond } from './env';
import { witnesses, addRumor, applyRumorJudgement } from './social';
import { ITEMS } from '../content/items';

export type Consent = 'eager' | 'willing' | 'reluctant' | 'coerced' | 'refused';
export const CONSENT_NAMES: Record<Consent, string> = { eager: '主动', willing: '情愿', reluctant: '勉强', coerced: '屈从', refused: '拒绝' };

export function orientationOk(a: Person, b: Person) {
  const ok = (x: Person, y: Person) => x.orientation === 'bi' || (x.orientation === 'straight' ? x.gender !== y.gender : x.gender === y.gender);
  return ok(a, b);
}

// a 对 b 的吸引力 0..100
export function attraction(w: World, a: Person, b: Person): number {
  if (!orientationOk(a, b)) return 0;
  const r = rel(w, a.id, b.id);
  let v = r.desire * 0.6 + r.affection * 0.25 + r.respect * 0.15;
  if (b.needs.hygiene < 25) v -= 8;
  if (b.health < 40) v -= 10;
  if (w.politics.leader === b.id) v += 8; // 权力本身会改变吸引力
  if (Math.abs(a.age - b.age) > 20) v -= 10;
  return clamp(v);
}

export function powerOf(w: World, p: Person): number {
  let v = 0;
  if (w.politics.leader === p.id) v += 40 + w.politics.legitimacy * 0.2;
  if (w.shelter.keyHolder === p.id) v += 15;
  if (cnt(p.inv, 'pistol') || cnt(p.inv, 'rifle')) v += 20;
  v += p.skills.combat * 0.1;
  return v;
}

export interface Proposal { motive: string[]; deal?: [ItemKey, number] | null; coerce?: boolean }

export function motivesOf(w: World, a: Person, b: Person, deal?: [ItemKey, number] | null, coerce?: boolean): string[] {
  const m: string[] = [];
  const r = rel(w, a.id, b.id);
  if (coerce) m.push('胁迫');
  if (deal) m.push('交易');
  if (r.affection > 65) m.push('爱慕');
  if (a.needs.stress > 60) m.push('慰藉');
  if (a.needs.warmth < 35) m.push('取暖');
  if (w.politics.leader === b.id && a.pers.attach > 55) m.push('讨好');
  if (a.pers.power > 70 && powerOf(w, a) - powerOf(w, b) > 30 && !coerce) m.push('支配');
  if (hasCond(a, 'trauma') || hasCond(a, 'grief')) m.push('逃避');
  if (!m.length) m.push(r.times === 0 ? '好奇' : '慰藉');
  return m.slice(0, 3);
}

// b 面对 a 的提议的意愿度
export function willingness(w: World, a: Person, b: Person, prop: Proposal): { consent: Consent; score: number; why: string } {
  const r = rel(w, b.id, a.id);
  const att = attraction(w, b, a);
  let s = att * 0.45 + b.needs.desire * 0.3 + r.affection * 0.2 + r.trust * 0.1 - r.resentment * 0.6 - 20;
  let why = '';
  if (b.partner && b.partner !== a.id) { s -= 25 * (b.pers.morality / 100) + 5; why = '有伴侣'; }
  if (b.needs.stress > 70) s += 6;
  if (b.needs.warmth < 30) s += 6;
  if (hasCond(b, 'trauma')) s -= 25;
  if (w.politics.rules.intimacy === 'banned') s -= 10;
  if (b.health < 35) s -= 20;
  // 交易：越缺越愿意
  let pressure = 0;
  if (prop.deal) {
    const [k, n] = prop.deal;
    const desperation = k === 'food' ? (100 - b.needs.hunger) / 50 : k === 'meds' && b.conds.length ? 2 : 1;
    pressure += ITEMS[k].value * n * 4 * desperation - (b.pers.morality - 40) * 0.4;
  }
  // 权力差：让人更难拒绝，但不会让人更想要
  const gap = powerOf(w, a) - powerOf(w, b);
  if (gap > 20) pressure += (gap - 20) * 0.3 * (r.fear / 50) * (b.pers.attach / 50);
  if (!orientationOk(b, a)) { s -= 40; why = why || '不喜欢'; }
  const score = s;
  if (prop.coerce && w.settings.coercion) {
    if (score + pressure > 45) return { consent: 'reluctant', score, why };
    if (r.fear > 45 || powerOf(w, b) < 15) return { consent: 'coerced', score, why: '害怕' };
    return { consent: 'refused', score, why: '拒绝了' };
  }
  if (score > 55) return { consent: 'eager', score, why };
  if (score > 30) return { consent: 'willing', score, why };
  if (score + pressure > 32 && pressure > 8) return { consent: 'reluctant', score, why: prop.deal ? '为了' + ITEMS[prop.deal[0]].name : '不敢得罪' };
  return { consent: 'refused', score, why: why || (att < 20 ? '没兴趣' : '还没到那一步') };
}

// 找一个合适的私密地点
export function privateSpot(w: World): { room: 'lower' | 'dorm' | 'archive'; x: number } {
  const lowerFree = !peopleIn(w, 'lower').some((q) => awake(q));
  if (lowerFree) return { room: 'lower', x: 117 };
  if (w.shelter.archiveOpen && !peopleIn(w, 'archive').length) return { room: 'archive', x: 40 };
  return { room: 'dorm', x: 104 };
}

// ---------- 调情 ----------
export function flirt(w: World, a: Person, b: Person) {
  const att = attraction(w, b, a);
  const r = rel(w, b.id, a.id);
  const ok = att + rnd(w.rng) * 30 > 45 && r.resentment < 40;
  const ra = rel(w, a.id, b.id);
  ra.flirts++;
  if (ok) {
    relAdd(w, b.id, a.id, { desire: 5, affection: 3 });
    relAdd(w, a.id, b.id, { desire: 3 });
    if (r.state === 'acquainted' || r.state === 'friend' || r.state === 'stranger') r.state = 'flirting';
    if (ra.state === 'acquainted' || ra.state === 'friend' || ra.state === 'stranger') ra.state = 'flirting';
    b.needs.desire = clamp(b.needs.desire + 6);
    if (!b.isPlayer) bark(b, w, pick(w.rng, ['……你真会说话。', '（笑了一下）', '别闹。', '冷吗？过来点。']));
    if (a.isPlayer || b.isPlayer) log(w, `${nm(w, a.id)}和${nm(w, b.id)}靠得很近地说了一会儿话。${b.isPlayer ? '' : `${b.name}没有躲开。`}`, { col: '#d8a8c0' });
  } else {
    relAdd(w, b.id, a.id, { respect: -2, affection: -1 });
    if (!b.isPlayer) bark(b, w, pick(w.rng, ['别这样。', '我没心情。', '……', '你走开。']));
    if (a.isPlayer) log(w, `${b.name}别过头去，没接你的话。`, { col: '#a8a098' });
  }
  for (const q of witnesses(w, a, [b])) { if (q.partner === a.id || q.partner === b.id || rel(w, q.id, b.id).desire > 60 || rel(w, q.id, a.id).desire > 60) jealous(w, q, q.partner === b.id || rel(w, q.id, b.id).desire > 60 ? b : a, q.partner === b.id || rel(w, q.id, b.id).desire > 60 ? a : b, 6); }
}

// ---------- 发生关系 ----------
export function beginIntimacy(w: World, a: Person, b: Person, act: Action): boolean {
  // 两人到私密处才开始；对方也要停止手上的事
  b.action = { type: 'intimacy', room: act.room, x: act.x + 4, dur: act.dur, t: 1, target: a.id, data: act.data, secret: true };
  b.floor = a.floor; b.x = act.x + 4; b.px = b.x; b.pfloor = b.floor;
  return true;
}

export function completeIntimacy(w: World, a: Person, b: Person, act: Action) {
  const consent = (act.data?.consent as Consent) || 'willing';
  const motive = (act.data?.motive as string[]) || ['慰藉'];
  const deal = (act.data?.deal as [ItemKey, number] | undefined) || undefined;
  if (b.action?.type === 'intimacy') b.action = null;
  w.stats.intimacies++;
  const ra = rel(w, a.id, b.id), rb = rel(w, b.id, a.id);
  ra.times++; rb.times++;
  // 交易兑现
  if (deal) { const got = takeItem(a.inv, deal[0], deal[1]); addItem(b.inv, deal[0], got); }
  const condomUsed = cnt(a.inv, 'condom') > 0 ? takeItem(a.inv, 'condom', 1) : cnt(b.inv, 'condom') > 0 ? takeItem(b.inv, 'condom', 1) : 0;
  // 身体
  a.needs.desire = 0; a.needs.stress = clamp(a.needs.stress - 14); a.needs.warmth = clamp(a.needs.warmth + 10);
  if (consent === 'eager' || consent === 'willing') { b.needs.desire = 0; b.needs.stress = clamp(b.needs.stress - 12); b.needs.warmth = clamp(b.needs.warmth + 10); }
  else { b.needs.stress = clamp(b.needs.stress + (consent === 'coerced' ? 30 : 10)); b.needs.warmth = clamp(b.needs.warmth + 5); }
  // 关系
  if (consent === 'eager' || consent === 'willing') {
    relAdd(w, a.id, b.id, { affection: 6, trust: 3 }); relAdd(w, b.id, a.id, { affection: consent === 'eager' ? 7 : 4, trust: 2 });
    const mutual = ra.affection > 60 && rb.affection > 60;
    const newState = deal ? 'transactional' : a.partner && a.partner !== b.id || b.partner && b.partner !== a.id ? 'affair' : mutual ? 'lovers' : 'affair';
    ra.state = rb.state = newState;
    if (newState === 'lovers' && !a.partner && !b.partner) { a.partner = b.id; b.partner = a.id; }
  } else if (consent === 'reluctant') {
    relAdd(w, b.id, a.id, { resentment: 6, affection: -2, fear: deal ? 0 : 5 });
    relAdd(w, a.id, b.id, { affection: 2 });
    ra.state = rb.state = deal ? 'transactional' : powerOf(w, a) > powerOf(w, b) + 20 ? 'patronage' : 'affair';
    addMem(b, w, { kind: 'bitter', who: a.id, w: -20, text: `我跟${a.name}睡了。${deal ? '为了' + ITEMS[deal[0]].name + '。' : '我不敢说不。'}`, tags: motive });
  } else if (consent === 'coerced') {
    relAdd(w, b.id, a.id, { resentment: 35, fear: 25, trust: -30, affection: -30 });
    ra.state = 'domination'; rb.state = 'enemy';
    addCond(w, b, 'trauma', 70);
    addMem(b, w, { kind: 'coerced', who: a.id, w: -90, text: `${a.name}对我做的事，我不会忘。`, tags: ['胁迫'] });
    w.politics.abuses += w.politics.leader === a.id ? 2 : 1;
    if (!b.goals.includes('REVENGE:' + a.id)) b.goals.unshift('REVENGE:' + a.id);
  }
  addMem(a, w, { kind: 'intimacy', who: b.id, w: consent === 'coerced' ? 5 : 25, text: `和${b.name}在一起。`, tags: motive });
  if (consent === 'eager' || consent === 'willing') addMem(b, w, { kind: 'intimacy', who: a.id, w: 25, text: `和${a.name}在一起。`, tags: motive });
  for (const t of motive) tagMethod(a, t === '交易' ? '交易' : t === '胁迫' ? '胁迫' : '亲密');
  if (consent === 'reluctant' && deal) tagMethod(b, '交易');
  // 怀孕
  if (w.settings.pregnancy && !condomUsed && a.gender !== b.gender && rnd(w.rng) < 0.04) {
    const f = a.gender === 'f' ? a : b;
    if (!hasCond(f, 'pregnant') && f.age < 46) { f.conds.push({ type: 'pregnant', sev: 0, since: w.t }); w.facts[`father:${f.id}`] = (f === a ? b : a).id; }
  }
  // 目击 / 流言
  const seen = witnesses(w, a, [b]);
  if (seen.length) {
    const fact = consent === 'coerced' ? `coerce:${a.id}:${b.id}` : `intim:${a.id}:${b.id}`;
    const text = consent === 'coerced' ? `${a.name}逼${b.name}跟他……` : deal ? `${b.name}用身子跟${a.name}换${ITEMS[deal[0]].name}。` : `${a.name}和${b.name}睡在一起。`;
    const rr = addRumor(w, seen[0], fact, text, [a.id, b.id], consent === 'coerced' ? 80 : deal ? 40 : 25);
    for (const q of seen) { q.knows['rumor:' + rr.id] = true; applyRumorJudgement(w, q, a.id, rr, 1); if (consent !== 'coerced') applyRumorJudgement(w, q, b.id, rr, 0.5); }
    log(w, `${nm(w, seen[0].id)}撞见了${nm(w, a.id)}和${nm(w, b.id)}。`, { col: '#d8a8c0', who: [a.id, b.id] });
  } else if (consent === 'coerced' && rnd(w.rng) < 0.5) {
    // 受害者可能说出来
    const conf = peopleIn(w, roomOf(b)).filter((q) => q !== a && q !== b).sort((x, y) => rel(w, b.id, y.id).trust - rel(w, b.id, x.id).trust)[0];
    if (conf) { const rr = addRumor(w, conf, `coerce:${a.id}:${b.id}`, `${b.name}说${a.name}逼了她。`.replace('她', b.gender === 'f' ? '她' : '他'), [a.id], 80); applyRumorJudgement(w, conf, a.id, rr, rel(w, conf.id, b.id).trust / 100); }
  }
  // 伴侣与暗恋者会嫉妒（即使没看见，日后通过流言触发）
  if (w.politics.rules.intimacy === 'banned' && seen.length) w.pending.push({ id: 'violation_intimacy', t: w.t + 60, ctx: { a: a.id, b: b.id } });
  if (a.isPlayer || b.isPlayer) {
    w.pending.push({ id: 'scene', t: w.t, ctx: { hook: 'scene', initiator: a.id, partner: b.id, consent, motive, deal: deal || null, location: roomOf(a) } });
  } else if (seen.some((q) => q.isPlayer)) {
    w.pending.push({ id: 'scene', t: w.t, ctx: { hook: 'discovered', initiator: a.id, partner: b.id, consent, motive, deal: deal || null, location: roomOf(a), witness: 'player' } });
  }
}

export function jealous(w: World, who: Person, beloved: Person, rival: Person, n: number) {
  if (who.isPlayer) return;
  relAdd(w, who.id, rival.id, { resentment: n, affection: -n / 2 });
  if (who.partner === beloved.id) relAdd(w, who.id, beloved.id, { trust: -n, resentment: n / 2 });
  who.needs.stress = clamp(who.needs.stress + n / 2);
  if (n > 10 && rnd(w.rng) < 0.3) {
    bark(who, w, pick(w.rng, ['……', `${rival.name}，你给我离${beloved.isPlayer ? '他' : beloved.name}远点。`, '你们当我是瞎子？']));
    if (who.pers.agree < 35 && who.pers.fear > 50 && rnd(w.rng) < 0.35) w.pending.push({ id: 'jealous_fight', t: w.t + 20, ctx: { a: who.id, b: rival.id, about: beloved.id } });
  }
}

export function jealousyCheck(w: World, judge: Person, r: Rumor) {
  if (!r.fact.startsWith('intim:') && !r.fact.startsWith('coerce:')) return;
  const [, a, b] = r.fact.split(':');
  const A = P(w, a), B = P(w, b);
  if (!A || !B) return;
  if (judge.partner === a) jealous(w, judge, A, B, 25);
  else if (judge.partner === b) jealous(w, judge, B, A, 25);
  else if (rel(w, judge.id, b).desire > 65) jealous(w, judge, B, A, 10);
  else if (rel(w, judge.id, a).desire > 65) jealous(w, judge, A, B, 10);
}

// 玩家/NPC 提出 → 计算对方意愿 → 若同意则安排行动
export function propose(w: World, a: Person, b: Person, prop: Proposal): { consent: Consent; why: string; motive: string[] } {
  const res = willingness(w, a, b, prop);
  const motive = motivesOf(w, a, b, prop.deal, prop.coerce);
  if (res.consent === 'refused') {
    relAdd(w, b.id, a.id, { respect: prop.deal ? -4 : -2, resentment: prop.coerce ? 15 : prop.deal ? 3 : 1 });
    if (prop.coerce) { relAdd(w, b.id, a.id, { fear: 10 }); addMem(b, w, { kind: 'threatened', who: a.id, w: -40, text: `${a.name}想逼我。` }); }
    return { consent: 'refused', why: res.why, motive };
  }
  const spot = privateSpot(w);
  const act: Action = { type: 'intimacy', room: spot.room, x: spot.x, dur: 35, t: 0, target: b.id, secret: true, data: { consent: res.consent, motive, deal: prop.deal || null }, reason: '找个没人的地方' };
  a.action = act; a.queue = [];
  if (!b.isPlayer) { b.queue = []; b.action = { type: 'wait', room: spot.room, x: spot.x + 4, dur: 60, t: 0, target: a.id }; }
  return { consent: res.consent, why: res.why, motive };
}

export function partnerOf(w: World, p: Person) { return P(w, p.partner || null); }
export { opinion };
