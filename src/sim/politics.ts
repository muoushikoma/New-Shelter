// 权力：规矩、配给、开会表决、领导者合法性、惩罚、政变
import type { Person, Rules, World } from './types';
import { clamp, cnt, addItem, takeItem, rel, relAdd, opinion, present, alive, P, log, nm, day, addMem, bark, tagMethod, hasCond, awake, roomOf, player } from './util';
import { rnd, chance, pick } from '../engine/rng';
import { leaveForever } from './war';
import { powerOf } from './intimacy';

export interface Proposal { kind: string; target?: string; value?: string; label: string }

export const RULE_TEXT = {
  ration: { equal: '平均分配', contribution: '按劳分配', leader: '由领导者分配', free: '自取（无制度）' },
  door: { closed: '天黑后一律不开门', vote: '大家决定', useful: '只放有用的人进来', open: '谁都可以进来' },
  weapons: { common: '武器上交公共保管', leader: '武器由领导者保管', own: '各自持有' },
  intimacy: { free: '不干涉', banned: '禁止（维持秩序）', leaderPrivilege: '领导者有特权' },
  punishment: { warning: '训诫', ration: '扣口粮', confine: '关禁闭', expel: '驱逐' },
  decision: { assembly: '全体表决', leader: '领导者说了算' },
  ballot: { open: '举手表决', secret: '无记名投票' },
} as const;

export function proposalLabel(w: World, pr: Proposal) { return pr.label; }

// 玩家可以提出的议题
export function availableProposals(w: World, proposer: Person): Proposal[] {
  const L: Proposal[] = [];
  const r = w.politics.rules;
  const lead = w.politics.leader;
  for (const p of present(w)) if (p.id !== lead && !hasCond(p, 'captive')) L.push({ kind: 'leader', target: p.id, label: `推举${p.isPlayer ? '自己' : p.name}为领导者` });
  if (lead) L.push({ kind: 'depose', target: lead, label: `罢免${nm(w, lead)}` });
  for (const v of ['equal', 'contribution', 'leader', 'free'] as const) if (r.ration !== v) L.push({ kind: 'ration', value: v, label: `口粮：${RULE_TEXT.ration[v]}` });
  if (r.rationSize !== 1) L.push({ kind: 'rationSize', value: '1', label: '每人每天减到 1 份（节省）' });
  if (r.rationSize !== 2) L.push({ kind: 'rationSize', value: '2', label: '每人每天 2 份' });
  for (const p of present(w)) if (w.shelter.keyHolder !== p.id) L.push({ kind: 'keeper', target: p.id, label: `锁上仓库，钥匙交给${p.isPlayer ? '我' : p.name}` });
  if (r.storageLocked) L.push({ kind: 'unlock', label: '打开仓库的锁，谁都能拿' });
  for (const v of ['closed', 'vote', 'useful', 'open'] as const) if (r.door !== v) L.push({ kind: 'door', value: v, label: `门：${RULE_TEXT.door[v]}` });
  for (const v of ['common', 'own'] as const) if (r.weapons !== v) L.push({ kind: 'weapons', value: v, label: `武器：${RULE_TEXT.weapons[v]}` });
  for (const v of ['free', 'banned'] as const) if (r.intimacy !== v) L.push({ kind: 'intimacy', value: v, label: `男女之事：${RULE_TEXT.intimacy[v]}` });
  if (r.ballot !== 'secret') L.push({ kind: 'ballot', value: 'secret', label: '以后无记名投票' });
  if (!r.nightWatch) for (const p of present(w)) L.push({ kind: 'guard', target: p.id, label: `安排${p.isPlayer ? '我' : p.name}守夜看仓库` });
  for (const p of present(w)) if (p !== proposer) {
    for (const v of ['ration', 'confine', 'expel'] as const) L.push({ kind: 'punish', target: p.id, value: v, label: `惩罚${p.name}：${RULE_TEXT.punishment[v]}` });
  }
  return L;
}

// 一个人对一项提议的支持度（-100..100）
export function support(w: World, v: Person, pr: Proposal, proposer: Person): number {
  let s = opinion(w, v.id, proposer.id) * 0.25 - 5;
  const leader = P(w, w.politics.leader);
  const t = P(w, pr.target || null);
  const hungry = v.needs.hunger < 40 ? 1 : 0;
  switch (pr.kind) {
    case 'leader':
      if (!t) break;
      if (t === v) return 100;
      s = opinion(w, v.id, t.id) * 0.6 + rel(w, v.id, t.id).respect * 0.3 - 20;
      if (t.origin === 'cadre' && v.pers.regime === 'rebel') s -= 20;
      if (t.origin === 'cadre' && v.pers.regime === 'loyal') s += 10;
      if (v.pers.power > 70) s -= 15;
      s += rel(w, v.id, t.id).fear * 0.2 + rel(w, v.id, t.id).debt * 0.2;
      if (leader && leader !== t) s -= rel(w, v.id, leader.id).fear * 0.2;
      break;
    case 'depose':
      if (!leader) break;
      if (leader === v) return -100;
      s = -opinion(w, v.id, leader.id) * 0.7 + w.politics.abuses * 4 + (50 - w.politics.legitimacy) * 0.3;
      if (w.politics.rules.ballot === 'open') s -= rel(w, v.id, leader.id).fear * 0.4;
      break;
    case 'ration':
      if (pr.value === 'equal') s += (v.pers.morality - 50) * 0.4 + hungry * 15 - (v.pers.power - 50) * 0.3 + (v.health < 50 ? 15 : 0);
      if (pr.value === 'contribution') s += (v.workTotal > avgWork(w) ? 25 : -15) + (v.pers.power - 50) * 0.2;
      if (pr.value === 'leader') s += leader === v ? 60 : leader ? opinion(w, v.id, leader.id) * 0.4 - 25 : -40;
      if (pr.value === 'free') s += (50 - v.pers.morality) * 0.4 - (cnt(w.storage, 'food') < 25 ? 30 : 0);
      break;
    case 'rationSize': s += pr.value === '1' ? (cnt(w.storage, 'food') < present(w).length * 8 ? 20 : -25) - hungry * 20 : (hungry * 20 + (cnt(w.storage, 'food') > present(w).length * 6 ? 15 : -20));
      break;
    case 'keeper':
      if (!t) break;
      if (t === v) return 80;
      s = opinion(w, v.id, t.id) * 0.5 + rel(w, v.id, t.id).trust * 0.3 - 25 + (w.facts.missing ? 10 : 0);
      break;
    case 'unlock': s += (50 - v.pers.morality) * 0.3 + (w.shelter.keyHolder ? -opinion(w, v.id, w.shelter.keyHolder) * 0.3 : 0) - 5; break;
    case 'door':
      if (pr.value === 'closed') s += (60 - v.pers.fear) * 0.4 + (cnt(w.storage, 'food') < 30 ? 15 : 0) - (v.pers.morality - 50) * 0.3;
      if (pr.value === 'open') s += (v.pers.morality - 55) * 0.6 - (cnt(w.storage, 'food') < 30 ? 25 : 0);
      if (pr.value === 'useful') s += 5 + (v.pers.power - 50) * 0.2;
      if (pr.value === 'vote') s += 5;
      break;
    case 'weapons':
      if (pr.value === 'common') s += (cnt(v.inv, 'pistol') + cnt(v.inv, 'rifle') ? -60 : 20) + (50 - v.pers.fear) * 0.2;
      if (pr.value === 'own') s += (cnt(v.inv, 'pistol') ? 40 : -10);
      break;
    case 'intimacy':
      if (pr.value === 'banned') s += (v.pers.morality - 55) * 0.5 - (v.partner ? 35 : 0) - (v.pers.lust - 50) * 0.4 + (v.mem.some((m) => m.kind === 'coerced') ? 30 : 0);
      if (pr.value === 'free') s += (v.pers.lust - 45) * 0.4 + (v.partner ? 25 : 0) - (v.pers.morality - 60) * 0.3;
      break;
    case 'ballot': s += pr.value === 'secret' ? (leader && leader !== v ? 15 : -10) + (v.pers.regime === 'rebel' ? 15 : 0) : 0; break;
    case 'guard': if (t === v) return 30 + v.pers.agree / 4; s += t ? rel(w, v.id, t.id).trust * 0.4 - 15 : 0; break;
    case 'punish': {
      if (!t) break;
      if (t === v) return -100;
      const crimes = Number(w.facts[`crimes:${t.id}`] || 0) + (v.mem.some((m) => m.who === t.id && ['saw_steal', 'coerced', 'robbed', 'threatened'].includes(m.kind)) ? 2 : 0);
      s = -opinion(w, v.id, t.id) * 0.5 + crimes * 15 - 15 + rel(w, v.id, t.id).resentment * 0.4;
      if (pr.value === 'expel') s -= (v.pers.morality - 40) * 0.5;
      if (pr.value === 'confine') s -= 5;
      break;
    }
  }
  // 会上大家看着领导者
  if (leader && leader !== v && w.politics.rules.ballot === 'open' && pr.kind !== 'depose') { const lp = leaderPref(w, leader, pr, proposer); s += lp * rel(w, v.id, leader.id).fear / 200; }
  return clamp(s, -100, 100);
}

function avgWork(w: World) { const a = present(w); return a.reduce((s, p) => s + p.workTotal, 0) / Math.max(1, a.length); }

// 领导者（NPC）对议题的倾向
function leaderPref(w: World, l: Person, pr: Proposal, proposer: Person): number {
  if (l.isPlayer) return 0;
  return support(wNoLeader(w), l, pr, proposer);
}
function wNoLeader(w: World): World { return { ...w, politics: { ...w.politics, rules: { ...w.politics.rules, ballot: 'secret' } } }; }

export interface VoteResult { yes: string[]; no: string[]; abstain: string[]; passed: boolean; decidedBy: 'vote' | 'leader'; text: string }

export function predictVotes(w: World, pr: Proposal, proposer: Person): { id: string; s: number }[] {
  return present(w).filter((p) => !p.isPlayer && awake(p) || (!p.isPlayer && !hasCond(p, 'captive'))).map((p) => ({ id: p.id, s: support(w, p, pr, proposer) }));
}

export function holdVote(w: World, pr: Proposal, proposer: Person, playerVote: 'yes' | 'no' | 'abstain' = 'yes'): VoteResult {
  const yes: string[] = [], no: string[] = [], abstain: string[] = [];
  for (const p of present(w)) {
    if (hasCond(p, 'captive')) continue;
    if (p.isPlayer) { (playerVote === 'yes' ? yes : playerVote === 'no' ? no : abstain).push(p.id); continue; }
    const s = support(w, p, pr, proposer) + (rnd(w.rng) - 0.5) * 20;
    if (s > 8) yes.push(p.id); else if (s < -8) no.push(p.id); else abstain.push(p.id);
  }
  let passed = yes.length > no.length;
  let decidedBy: VoteResult['decidedBy'] = 'vote';
  const leader = P(w, w.politics.leader);
  // 领导者说了算的制度下，领导者可以否决（罢免除外）
  if (w.politics.rules.decision === 'leader' && leader && pr.kind !== 'depose' && leader.present) {
    const lp = leader.isPlayer ? (playerVote === 'yes' ? 50 : -50) : leaderPref(w, leader, pr, proposer);
    const lpass = lp > 0;
    if (lpass !== passed) { decidedBy = 'leader'; passed = lpass; for (const id of passed ? no : yes) relAdd(w, id, leader.id, { resentment: 4 }); }
  }
  const res: VoteResult = { yes, no, abstain, passed, decidedBy, text: '' };
  res.text = `${pr.label}：赞成 ${yes.length}，反对 ${no.length}，弃权 ${abstain.length}。${decidedBy === 'leader' ? `${nm(w, leader!.id)}拍板：${passed ? '通过' : '不通过'}。` : passed ? '通过。' : '没有通过。'}`;
  // 关系：投反对票的人记住了
  if (w.politics.rules.ballot === 'open') {
    for (const id of no) relAdd(w, proposer.id, id, { resentment: pr.kind === 'punish' || pr.kind === 'depose' ? 4 : 1.5 });
    if (pr.target) for (const id of yes) if (pr.kind === 'punish' || pr.kind === 'depose') relAdd(w, pr.target, id, { resentment: 8, trust: -6 });
  }
  if (passed) applyProposal(w, pr, proposer, yes.length / Math.max(1, yes.length + no.length + abstain.length));
  w.politics.meetings++;
  w.politics.lastMeeting = w.t;
  w.politics.history.push(`第${day(w)}天：${res.text}`);
  log(w, `【会议】${res.text}`, { col: '#e8c890', important: true });
  if (proposer.isPlayer) tagMethod(proposer, pr.kind === 'punish' || pr.kind === 'depose' ? '揭发' : '威望');
  return res;
}

export function applyProposal(w: World, pr: Proposal, proposer: Person, share: number) {
  const r = w.politics.rules as unknown as Record<string, string | number | boolean>;
  const t = P(w, pr.target || null);
  switch (pr.kind) {
    case 'leader':
      if (!t) return;
      setLeader(w, t, 35 + share * 50, '会上选出');
      break;
    case 'depose': {
      const l = P(w, w.politics.leader);
      if (l) { w.politics.leader = null; w.politics.legitimacy = 0; relAdd(w, l.id, proposer.id, { resentment: 30 }); addMem(l, w, { kind: 'deposed', who: proposer.id, w: -60, text: `${proposer.name}把我拉下了台。` }); w.facts[`deposed:${proposer.id}`] = w.t; if (w.politics.rules.decision === 'leader') w.politics.rules.decision = 'assembly'; log(w, `${l.isPlayer ? '你' : l.name}不再是领导者了。`, { col: '#e8c890', important: true }); }
      break;
    }
    case 'ration': r.ration = pr.value!; if (pr.value === 'leader' && w.politics.leader) w.politics.rules.storageLocked = true; break;
    case 'rationSize': w.politics.rules.rationSize = Number(pr.value); break;
    case 'keeper': if (t) giveKey(w, t); w.politics.rules.storageLocked = true; if (w.politics.rules.ration === 'free') w.politics.rules.ration = 'equal'; break;
    case 'unlock': w.politics.rules.storageLocked = false; w.politics.rules.ration = 'free'; takeKeyBack(w); break;
    case 'door': r.door = pr.value!; break;
    case 'weapons':
      r.weapons = pr.value!;
      if (pr.value === 'common') for (const p of present(w)) for (const k of ['pistol', 'rifle'] as const) { const n = cnt(p.inv, k); if (n) { const comply = p.pers.agree + w.politics.legitimacy * 0.3 + rel(w, p.id, proposer.id).fear * 0.3 - p.pers.power * 0.4; if (comply > 25 || p.isPlayer) { if (!p.isPlayer) { takeItem(p.inv, k, n); addItem(w.storage, k, n); log(w, `${p.name}把枪交了出来。`); } } else { log(w, `${p.name}没有交枪。`, { col: '#e8a060' }); relAdd(w, proposer.id, p.id, { resentment: 10 }); } } }
      break;
    case 'intimacy': r.intimacy = pr.value!; break;
    case 'ballot': r.ballot = pr.value!; break;
    case 'guard': if (t) { for (const p of w.people) if (p.role === 'guard') p.role = null; t.role = 'guard'; w.politics.rules.nightWatch = true; } break;
    case 'punish': if (t) punish(w, t, pr.value as 'ration' | 'confine' | 'expel', proposer); break;
  }
}

export function setLeader(w: World, p: Person, legit: number, how: string) {
  const old = P(w, w.politics.leader);
  w.politics.leader = p.id; w.politics.legitimacy = clamp(legit); w.facts.leaderSince = w.t;
  p.role = 'leader';
  if (old && old !== p) { old.role = null; relAdd(w, old.id, p.id, { resentment: 15 }); }
  log(w, `${p.isPlayer ? '你' : p.name}成了避难所的领导者（${how}）。`, { col: '#f0d060', important: true });
  w.politics.history.push(`第${day(w)}天：${p.name}成为领导者（${how}）`);
  if (!w.shelter.keyHolder) giveKey(w, p);
}

export function giveKey(w: World, p: Person) {
  const old = P(w, w.shelter.keyHolder);
  if (old) takeItem(old.inv, 'storageKey', 1);
  w.shelter.keyHolder = p.id; addItem(p.inv, 'storageKey', 1);
  w.politics.rules.storageLocked = true;
  if (w.politics.rules.ration === 'free') w.politics.rules.ration = 'equal';
  if (old && old !== p) relAdd(w, old.id, p.id, { resentment: 6 });
}
function takeKeyBack(w: World) { const old = P(w, w.shelter.keyHolder); if (old) takeItem(old.inv, 'storageKey', 1); w.shelter.keyHolder = null; }

export function punish(w: World, t: Person, kind: 'ration' | 'confine' | 'expel' | 'warning', by: Person) {
  w.facts[`punished:${t.id}`] = true;
  addMem(t, w, { kind: 'punished', who: by.id, w: -40, text: `他们${kind === 'expel' ? '把我赶了出去' : kind === 'confine' ? '把我关了起来' : kind === 'ration' ? '扣了我的口粮' : '当众训了我'}。` });
  relAdd(w, t.id, by.id, { resentment: kind === 'expel' ? 50 : 20, fear: 10 });
  t.needs.stress = clamp(t.needs.stress + 20);
  switch (kind) {
    case 'ration': w.facts[`rationCut:${t.id}`] = day(w) + 3; log(w, `${nm(w, t.id)}接下来三天只发一份口粮。`, { col: '#e8a060', important: true }); break;
    case 'confine': w.facts[`confined:${t.id}`] = w.t + 1440; t.action = { type: 'wait', room: 'lower', x: 100, dur: 1440, t: 0, reason: '被关禁闭' }; log(w, `${nm(w, t.id)}被关进了下层小间，一天一夜。`, { col: '#e8a060', important: true }); break;
    case 'expel':
      if (t.isPlayer) { w.pending.push({ id: 'expelled', t: w.t, ctx: {} }); break; }
      for (const [k, v] of Object.entries(t.inv)) if (!['storageKey'].includes(k)) { /* 带走自己的东西 */ }
      leaveForever(w, t, 'expelled');
      w.facts[`expelledAt:${t.id}`] = w.t;
      for (const q of present(w)) { if (q.pers.morality > 65) q.needs.stress = clamp(q.needs.stress + 10); if (q.partner === t.id) { relAdd(w, q.id, by.id, { resentment: 40 }); q.partner = null; } }
      // 被赶出去的人可能会回来敲门，或者带着人回来
      if (chance(w.rng, 0.5)) w.pending.push({ id: 'exile_returns', t: w.t + 1440 * (1 + Math.floor(rnd(w.rng) * 3)), ctx: { id: t.id } });
      break;
    case 'warning': relAdd(w, t.id, by.id, { resentment: 5 }); break;
  }
}

// ---------- 每天 18:00 配给 ----------
export function distributeRations(w: World) {
  const r = w.politics.rules;
  if (r.ration === 'free' && !r.storageLocked) return;
  if (w.politics.rationsDoneDay === day(w)) return;
  w.politics.rationsDoneDay = day(w);
  const ppl = present(w).filter((p) => !hasCond(p, 'captive'));
  const avail = Math.floor(cnt(w.storage, 'food'));
  if (!avail) { log(w, '仓库里已经没有吃的了。', { col: '#e85a4a', important: true }); return; }
  const leader = P(w, w.politics.leader);
  const share: Record<string, number> = {};
  const size = r.rationSize;
  if (r.ration === 'leader' && leader?.isPlayer && leader.present) { w.pending.push({ id: 'rations', t: w.t, ctx: {} }); return; }
  if (r.ration === 'equal' || r.ration === 'free' || (r.ration === 'leader' && !leader)) {
    const each = Math.min(size, Math.floor(avail / ppl.length));
    for (const p of ppl) share[p.id] = each;
    let rest = Math.min(avail - each * ppl.length, ppl.length * size - each * ppl.length);
    for (const p of ppl.sort((a, b) => a.needs.hunger - b.needs.hunger)) if (rest > 0 && share[p.id] < size) { share[p.id]++; rest--; }
  } else if (r.ration === 'contribution') {
    const sorted = ppl.slice().sort((a, b) => b.work - a.work);
    let left = avail;
    for (const p of sorted) { const want = p.work > 120 ? size + 1 : p.work > 30 ? size : Math.max(1, size - 1); const g = Math.min(want, left); share[p.id] = g; left -= g; }
  } else if (r.ration === 'leader' && leader) {
    // NPC 领导者：自己和亲信多拿，对头少拿
    let left = avail;
    const order = ppl.slice().sort((a, b) => (b === leader ? 999 : opinion(w, leader.id, b.id)) - (a === leader ? 999 : opinion(w, leader.id, a.id)));
    for (const p of order) {
      let want = size;
      if (p === leader) want = size + (leader.pers.morality < 50 ? 2 : 0);
      else if (opinion(w, leader.id, p.id) > 55) want = size + (leader.pers.morality < 60 ? 1 : 0);
      else if (opinion(w, leader.id, p.id) < 15) want = Math.max(1, size - 1);
      const g = Math.min(want, left); share[p.id] = g; left -= g;
    }
    if (leader.pers.morality < 50) w.politics.abuses += 0.3;
  }
  for (const p of ppl) {
    let g = share[p.id] || 0;
    if (Number(w.facts[`rationCut:${p.id}`] || 0) >= day(w)) g = Math.min(g, 1);
    takeItem(w.storage, 'food', g); addItem(p.inv, 'food', g);
    share[p.id] = g;
  }
  judgeFairness(w, share);
  for (const p of ppl) p.work = 0;
  const me = player(w);
  log(w, `配给发下来了。${me.present ? `你分到 ${share[me.id] || 0} 份。` : ''}（${ppl.map((p) => `${p.isPlayer ? '你' : p.name}${share[p.id]}`).join(' ')}）`, { col: '#d8c8a0' });
}

export function judgeFairness(w: World, share: Record<string, number>) {
  const vals = Object.values(share);
  const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  const distributor = P(w, w.politics.leader) || P(w, w.shelter.keyHolder);
  for (const [id, g] of Object.entries(share)) {
    const p = P(w, id)!;
    if (!distributor || p === distributor) continue;
    const dg = share[distributor.id] || 0;
    const unfair = (avg - g) + Math.max(0, dg - avg) * 0.7;
    if (unfair > 0.4) { relAdd(w, id, distributor.id, { resentment: unfair * 5, trust: -unfair * 3 }); if (unfair > 1 && !p.isPlayer && chance(w.rng, 0.4)) bark(p, w, pick(w.rng, ['凭什么他多拿？', '……又是我少。', '记住了。'])); }
    else relAdd(w, id, distributor.id, { trust: 0.8, respect: 0.5 });
  }
  if (distributor && w.politics.leader === distributor.id) {
    const lavg = share[distributor.id] - avg;
    w.politics.legitimacy = clamp(w.politics.legitimacy + (lavg > 0.6 ? -3 : 1));
  }
}

// 玩家领导者手动分配
export function applyManualRations(w: World, share: Record<string, number>) {
  for (const [id, g] of Object.entries(share)) { const p = P(w, id); if (!p) continue; const got = takeItem(w.storage, 'food', g); addItem(p.inv, 'food', got); }
  judgeFairness(w, share);
  for (const p of present(w)) p.work = 0;
  const me = player(w);
  const mine = share[me.id] || 0, avg = Object.values(share).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(share).length);
  if (mine > avg + 0.6) { w.politics.abuses += 0.5; tagMethod(me, '特权'); }
  log(w, `你分完了今天的口粮。（${Object.entries(share).map(([id, g]) => `${nm(w, id)}${g}`).join(' ')}）`, { col: '#d8c8a0' });
}

// ---------- 每天 20:00 政治过程 ----------
export function dailyPolitics(w: World) {
  const pol = w.politics;
  const leader = P(w, pol.leader);
  if (leader && (!leader.alive || !leader.present)) { pol.leader = null; pol.legitimacy = 0; }
  if (leader && leader.present) {
    const others = present(w).filter((p) => p !== leader);
    const avgOp = others.reduce((s, p) => s + opinion(w, p.id, leader.id), 0) / Math.max(1, others.length);
    pol.legitimacy = clamp(pol.legitimacy + (avgOp - 38) * 0.08 - pol.abuses * 0.4 + (w.facts.appointedByMil && w.war.phase < 3 ? 0.5 : 0));
    pol.abuses = Math.max(0, pol.abuses - 0.2);
    // 占领后，被旧政权任命的领导者岌岌可危
    if (w.facts.appointedByMil && w.war.phase >= 3) pol.legitimacy = clamp(pol.legitimacy - 3);
    if (!leader.isPlayer) npcLeaderActs(w, leader);
    // 政变
    for (const p of others) {
      if (p.isPlayer || !p.present) continue;
      const armed = cnt(p.inv, 'pistol') + cnt(p.inv, 'rifle') > 0;
      const allies = others.filter((q) => q !== p && opinion(w, q.id, p.id) > 45 && opinion(w, q.id, leader.id) < 25).length;
      if (armed && p.pers.power > 70 && p.pers.morality < 50 && allies >= 2 && pol.legitimacy < 40 && rnd(w.rng) < 0.25) { w.pending.push({ id: 'coup', t: w.t + 30, ctx: { by: p.id } }); break; }
    }
  }
  // NPC 发起会议
  if (w.t - pol.lastMeeting < 1440) return;
  if (!pol.meetings && day(w) >= 2) {
    const caller = present(w).filter((p) => !p.isPlayer).sort((a, b) => b.pers.power - a.pers.power)[0];
    if (caller) w.pending.push({ id: 'first_meeting', t: w.t, ctx: { caller: caller.id } });
    return;
  }
  if (leader && pol.legitimacy < 25) {
    const angry = present(w).filter((p) => !p.isPlayer && p !== leader).sort((a, b) => opinion(w, a.id, leader.id) - opinion(w, b.id, leader.id))[0];
    if (angry && opinion(w, angry.id, leader.id) < 10) { npcCallsMeeting(w, angry, 'depose'); return; }
  }
  // 偷窃太多 → 有人要求锁仓库
  if (Number(w.facts.missing || 0) > 4 && !pol.rules.storageLocked) {
    const caller = present(w).filter((p) => !p.isPlayer).sort((a, b) => b.pers.morality - a.pers.morality)[0];
    if (caller) { npcCallsMeeting(w, caller, 'keeper'); w.facts.missing = 0; }
  }
}

function npcLeaderActs(w: World, l: Person) {
  // 粮食紧张时减配给
  const n = present(w).length;
  if (cnt(w.storage, 'food') < n * 5 && w.politics.rules.rationSize > 1) { w.politics.rules.rationSize = 1; log(w, `${l.name}宣布：从明天起每人每天只发一份。`, { col: '#e8a060', important: true }); }
  else if (cnt(w.storage, 'food') > n * 10 && w.politics.rules.rationSize < 2) w.politics.rules.rationSize = 2;
  // 分派活计
  const jobs = ['crank', 'clear', 'cook', 'guard', 'repair', 'farm', 'melt'];
  for (const p of present(w)) { if (p === l || p.isPlayer) continue; if (rnd(w.rng) < 0.4) w.facts[`job:${p.id}`] = p.skills.mechanic > 50 ? 'repair' : p.skills.cook > 45 ? 'cook' : p.skills.medic > 50 ? 'treat' : pick(w.rng, jobs); }
  const me = player(w);
  if (me.present && rnd(w.rng) < 0.5) { const j = pick(w.rng, ['crank', 'clear', 'guard', 'melt']); w.facts[`job:${me.id}`] = j; w.pending.push({ id: 'leader_order', t: w.t, ctx: { leader: l.id, job: j } }); }
  // 独裁倾向：改成领导者说了算
  if (l.pers.power > 75 && w.politics.rules.decision !== 'leader' && w.politics.legitimacy > 45 && rnd(w.rng) < 0.3) {
    w.politics.rules.decision = 'leader'; w.politics.rules.ration = 'leader';
    log(w, `${l.name}宣布：「非常时期，以后的事我来定。」`, { col: '#e8a060', important: true });
    w.politics.abuses += 1;
  }
  // 惩罚异见者
  if (l.pers.morality < 40 && l.pers.power > 70) {
    const critic = present(w).filter((p) => p !== l && opinion(w, p.id, l.id) < 0).sort((a, b) => opinion(w, a.id, l.id) - opinion(w, b.id, l.id))[0];
    if (critic && rnd(w.rng) < 0.3) { punish(w, critic, critic.pers.fear > 60 ? 'confine' : 'ration', l); w.politics.abuses += 1; for (const q of present(w)) if (q !== l && q !== critic) relAdd(w, q.id, l.id, { fear: 5 }); }
  }
  // 特权：对饥饿的人提出交易（系统层，内容走接口）
  if (l.pers.morality < 35 && l.pers.lust > 55 && w.settings.adult) {
    const t = present(w).filter((p) => p !== l && p.needs.hunger < 40 && !p.isPlayer && rel(w, l.id, p.id).desire > 30)[0];
    if (t && rnd(w.rng) < 0.3) { w.facts[`leaderDemand:${t.id}`] = w.t; }
  }
  if (me.present && l.pers.morality < 40 && w.settings.adult && rel(w, l.id, me.id).desire > 45 && me.needs.hunger < 45 && rnd(w.rng) < 0.25 && !w.pending.some((e) => e.id === 'leader_demand')) w.pending.push({ id: 'leader_demand', t: w.t + 60, ctx: { leader: l.id } });
}

// NPC 召集会议（玩家会收到会议事件）
export function npcCallsMeeting(w: World, caller: Person, kind?: string, target?: string) {
  if (w.pending.some((e) => e.id === 'meeting')) return;
  let pr: { kind: string; target?: string; value?: string; label: string } | null = null;
  const lead = P(w, w.politics.leader);
  if (kind === 'depose' && lead) pr = { kind: 'depose', target: lead.id, label: `罢免${nm(w, lead.id)}` };
  else if (kind === 'punish' && target) pr = { kind: 'punish', target, value: caller.pers.morality > 55 ? 'ration' : 'expel', label: `惩罚${nm(w, target)}：${caller.pers.morality > 55 ? '扣口粮' : '驱逐'}` };
  else if (kind === 'keeper') pr = { kind: 'keeper', target: caller.id, label: `锁上仓库，钥匙交给${caller.name}` };
  else if (!lead || lead !== caller) pr = { kind: 'leader', target: caller.id, label: `推举${caller.name}为领导者` };
  if (!pr) return;
  w.politics.lastMeeting = w.t;
  w.pending.push({ id: 'meeting', t: w.t, ctx: { caller: caller.id, proposal: pr } });
}

export function coup(w: World, by: Person): string {
  const old = P(w, w.politics.leader);
  setLeader(w, by, 15, '夺权');
  w.politics.rules.decision = 'leader'; w.politics.rules.ballot = 'open';
  for (const q of present(w)) if (q !== by) relAdd(w, q.id, by.id, { fear: 20, trust: -10 });
  w.politics.abuses += 2;
  tagMethod(by, '暴力');
  if (old) { relAdd(w, old.id, by.id, { resentment: 40, fear: 20 }); punish(w, old, 'confine', by); }
  return old ? `${by.name}拿着枪站在桌子上。${old.isPlayer ? '你' : old.name}被推进了下层小间。` : `${by.name}拿着枪宣布：从今天起，这里听他的。`;
}

export { powerOf };
