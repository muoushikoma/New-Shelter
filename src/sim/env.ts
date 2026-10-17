// 环境与身体：每分钟更新电力、温度、空气、需求、伤病与死亡
import type { Person, World, CondType } from './types';
import { ROOMS } from '../content/layout';
import { clamp, present, roomOf, peopleIn, hasCond, cond, log, addMem, rel, alive, day, hour, isNight, nm, relAdd, bark } from './util';
import { rnd, chance } from '../engine/rng';

const HEAT: Record<string, number> = { generator: 14, dorm: 9, infirmary: 8, kitchen: 7, washroom: 6, storage: 5, vent: 4, entrance: 2, lower: 4, archive: 2, collapse: 0 };

export function updateEnvironment(w: World) {
  const s = w.shelter;
  const h = hour(w);
  // 室外温度：日夜波动 + 每天随机
  const base = -13 - ((day(w) * 7919) % 9);
  const diurnal = Math.cos(((h - 14) / 24) * Math.PI * 2) * 4;
  s.tempOut = base + diurnal;
  // 发电机
  if (s.power) {
    if (s.genFuel <= 0 || s.genHealth <= 0) {
      s.power = false;
      log(w, s.genFuel <= 0 ? '发电机没油了，灯一盏一盏地灭了。' : '发电机咳了两声，停了。', { col: '#e8a060', important: true });
    } else {
      s.genFuel = Math.max(0, s.genFuel - 0.16 / 60);
      s.genHealth = Math.max(0, s.genHealth - 0.0035);
      if (s.genHealth < 25 && rnd(w.rng) < 0.0006) { s.genHealth = 0; }
    }
  }
  const ppl = present(w);
  // 房间温度与照明
  for (const r of ROOMS) {
    const st = s.rooms[r.id] || (s.rooms[r.id] = { temp: 0, lit: false });
    const n = ppl.filter((p) => roomOf(p) === r.id).length;
    let target = s.tempOut * 0.15 + 4 + n * 0.5 - s.damage * 0.04;
    if (s.power) target += HEAT[r.id] || 0;
    if (r.id === 'kitchen' && ppl.some((p) => p.action && (p.action.type === 'cook' || p.action.type === 'melt') && p.action.t > 0)) target += 8;
    if (r.id === 'collapse') target = s.tempOut * 0.6;
    st.temp += (target - st.temp) * 0.02;
    const candle = n > 0 && s.candles > 0 && !s.power && (r.id === 'dorm' || r.id === 'kitchen' || r.id === 'lower' || r.id === 'infirmary');
    st.lit = (s.power && r.id !== 'collapse' && r.id !== 'archive' && r.id !== 'lower') || candle || (r.id === 'lower' && n > 0 && s.candles > 0) || (r.id === 'archive' && s.archiveOpen && s.power);
  }
  // 蜡烛消耗：没电时每小时点 1 根
  if (!s.power && w.t % 60 === 0 && ppl.length) {
    const c = w.storage.candle || 0;
    if (c > 0) { w.storage.candle = c - 1; s.candles = 1; } else s.candles = 0;
  } else if (s.power) s.candles = (w.storage.candle || 0) > 0 ? 1 : 0;
  // 空气
  s.co2 = clamp(s.co2 + ppl.length * 0.0065 - (s.power ? 0.03 : 0.004));
  // 水罐自然损耗（渗漏）与渗水过滤
  if (s.filterBuilt && w.t % 60 === 0 && s.water < 200) s.water += 0.7;
  // 种植
  if (s.farmBuilt && w.t % 60 === 0) {
    const lit = s.power || s.candles > 0;
    s.farm = clamp(s.farm + (lit ? 1.1 : 0.4) * (s.water > 10 ? 1 : 0), 0, 100);
    if (s.water > 10) s.water -= 0.15;
  }
}

export function roomTemp(w: World, p: Person) {
  if (!p.present) return w.shelter.tempOut;
  return w.shelter.rooms[roomOf(p)]?.temp ?? 0;
}

export function updateBody(w: World, p: Person) {
  if (!p.alive || hasCond(p, 'captive')) return;
  const n = p.needs;
  const act = p.action?.type;
  const sleeping = act === 'sleep' && p.action!.t > 0;
  const outside = !p.present;
  const temp = outside ? w.shelter.tempOut : roomTemp(w, p);
  const heavyWork = act && ['work', 'crank', 'clear', 'repair', 'refuel', 'expedition', 'fight'].includes(act);
  n.hunger = clamp(n.hunger - (heavyWork ? 0.052 : 0.038) - (temp < 0 ? 0.005 : 0));
  n.thirst = clamp(n.thirst - (heavyWork ? 0.09 : 0.068));
  n.hygiene = clamp(n.hygiene - 0.028);
  if (sleeping) n.energy = clamp(n.energy + (p.bed !== undefined || roomOf(p) === 'lower' ? 0.21 : 0.15));
  else n.energy = clamp(n.energy - (heavyWork ? 0.1 : 0.062) - (p.traits.includes('失眠') ? 0.01 : 0));
  // 体温
  let warmD = (temp - 12) * 0.0045;
  if (sleeping) { warmD += 0.03 + (p.bed !== undefined ? 0.02 : 0) + ((p.inv.blanket || 0) > 0 ? 0.03 : 0); }
  if (act === 'warm' && p.action!.t > 0) warmD += 0.25;
  if (act === 'intimacy' && p.action!.t > 0) warmD += 0.2;
  if (outside) warmD -= 0.05;
  // 挤在一起取暖
  if (sleeping) { const huddle = peopleIn(w, roomOf(p)).filter((q) => q !== p && q.action?.type === 'sleep').length; warmD += Math.min(3, huddle) * 0.012; }
  if (p.conds.some((c) => c.type === 'drunk')) warmD += 0.02;
  n.warmth = clamp(n.warmth + warmD);
  // 欲望
  n.desire = clamp(n.desire + (p.pers.lust / 100) * 0.028 * (n.hunger < 20 ? 0.3 : 1) * (sleeping ? 0.3 : 1));
  // 压力
  let ds = -0.012;
  if (n.hunger < 30) ds += 0.012;
  if (n.warmth < 30) ds += 0.012;
  if (n.thirst < 25) ds += 0.012;
  if (p.present && !w.shelter.rooms[roomOf(p)]?.lit && !sleeping) ds += 0.01;
  if (w.shelter.co2 > 60) ds += 0.012;
  if (sleeping) ds -= 0.025;
  if (p.health < 40) ds += 0.01;
  if (hasCond(p, 'trauma')) ds += 0.008;
  if (hasCond(p, 'grief')) ds += 0.006;
  ds *= 0.6 + p.pers.neuro / 100;
  n.stress = clamp(n.stress + ds);

  // 健康
  let dh = 0;
  if (n.hunger < 5) { dh -= 0.0065; n.energy = clamp(n.energy - 0.02); }
  if (n.thirst < 5) dh -= 0.03;
  if (n.warmth < 8) dh -= 0.014;
  if (w.shelter.co2 > 85 && p.present) dh -= 0.02;
  if (n.hunger > 30 && n.thirst > 30 && n.warmth > 25 && dh === 0) dh += sleeping ? 0.02 : 0.006;
  // 伤病
  for (const c of p.conds) {
    switch (c.type) {
      case 'wound': dh -= c.sev * 0.0003; if (c.sev > 20 && n.hygiene < 30 && rnd(w.rng) < 0.0002) addCond(w, p, 'infection', 30); c.sev = clamp(c.sev - (sleeping ? 0.012 : 0.004)); break;
      case 'infection': dh -= 0.012 + c.sev * 0.0004; c.sev = clamp(c.sev + 0.004); break;
      case 'fever': case 'flu': dh -= 0.006; c.sev = clamp(c.sev - (sleeping ? 0.01 : 0.003)); n.energy = clamp(n.energy - 0.02); break;
      case 'dysentery': dh -= 0.01; n.thirst = clamp(n.thirst - 0.05); c.sev = clamp(c.sev - 0.004); break;
      case 'frostbite': dh -= 0.003; c.sev = clamp(c.sev - 0.002); break;
      case 'heart': if (n.stress > 85 && rnd(w.rng) < 0.00012) { dh -= 25; log(w, `${nm(w, p.id)}捂着胸口倒下了。`, { col: '#e85a4a', important: true }); } break;
      case 'drunk': c.sev -= 0.15; break;
      case 'hypothermia': dh -= 0.03; c.sev = clamp(c.sev - (n.warmth > 40 ? 0.1 : -0.02)); break;
      case 'trauma': c.sev = clamp(c.sev - 0.0015); break;
      case 'grief': c.sev = clamp(c.sev - 0.003); break;
      case 'pregnant': n.hunger = clamp(n.hunger - 0.012); c.sev += 1 / 1440; break;
    }
  }
  p.conds = p.conds.filter((c) => c.sev > 0 || c.type === 'heart' || c.type === 'pregnant' || c.type === 'captive');
  if (n.warmth < 6 && !hasCond(p, 'hypothermia')) addCond(w, p, 'hypothermia', 40);
  if (n.warmth < 3 && outside && rnd(w.rng) < 0.001) addCond(w, p, 'frostbite', 40);
  p.health = clamp(p.health + dh);
  if (p.health <= 0) die(w, p, causeOf(p));
}

export function addCond(w: World, p: Person, t: CondType, sev: number) {
  const c = cond(p, t);
  if (c) c.sev = clamp(Math.max(c.sev, sev));
  else p.conds.push({ type: t, sev, since: w.t });
}

function causeOf(p: Person): string {
  if (p.needs.thirst < 5) return '渴死';
  if (p.needs.hunger < 5) return '饿死';
  if (p.needs.warmth < 8) return '冻死';
  if (hasCond(p, 'infection')) return '伤口感染';
  if (hasCond(p, 'wound')) return '伤重不治';
  if (hasCond(p, 'heart')) return '心脏病发作';
  if (hasCond(p, 'flu') || hasCond(p, 'fever')) return '病死';
  return '死去';
}

export function die(w: World, p: Person, cause: string) {
  if (!p.alive) return;
  p.alive = false; p.deathCause = cause; p.deathDay = day(w); p.action = null; p.queue = [];
  w.stats.deaths++;
  log(w, `${p.isPlayer ? '你' : p.name}${cause === '死去' ? '死了' : '死了——' + cause}。`, { col: '#e85a4a', important: true, who: [p.id] });
  if (w.shelter.keyHolder === p.id) w.shelter.keyHolder = null;
  if (w.politics.leader === p.id) { w.politics.leader = null; w.politics.legitimacy = 0; log(w, '避难所又没有了领头的人。', { col: '#d8b080' }); }
  // 遗物留在原地 → 进公共库存（被发现时）
  if (p.present && (p.inv.storageKey || p.inv.archiveKey)) { /* 钥匙掉在地上，谁先捡到算谁的 */ w.facts['keyOnFloor'] = p.inv.storageKey ? 1 : 0; w.facts['archiveKeyOnFloor'] = p.inv.archiveKey ? 1 : 0; }
  if (p.present && (p.inv.storageKey || p.inv.archiveKey)) { const finder = alive(w).filter((q) => q.present && q !== p && !q.isPlayer).sort((a, b) => b.pers.power - a.pers.power)[0]; if (finder) { if (p.inv.storageKey) { finder.inv.storageKey = 1; w.shelter.keyHolder = finder.id; } if (p.inv.archiveKey) finder.inv.archiveKey = 1; } delete p.inv.storageKey; delete p.inv.archiveKey; }
  if (p.present && !p.isPlayer) w.pending.push({ id: 'body', t: w.t + 20, ctx: { id: p.id, room: roomOf(p) } });
  for (const q of alive(w)) {
    if (q === p) continue;
    const r = rel(w, q.id, p.id);
    const bond = r.affection + r.trust - r.resentment;
    if (bond > 90 || q.partner === p.id) { addCond(w, q, 'grief', 70); q.needs.stress = clamp(q.needs.stress + 30); addMem(q, w, { kind: 'death', who: p.id, w: -60, text: `${p.name}死了。` }); if (q.partner === p.id) q.partner = null; }
    else { q.needs.stress = clamp(q.needs.stress + 8); }
    if (p.isPlayer === false && q.present && !q.isPlayer && chance(w.rng, 0.4)) bark(q, w, pickDeathLine(r.resentment > 50));
  }
}
function pickDeathLine(hated: boolean) {
  return hated ? '……活该。' : ['……', '又少了一个。', '谁去把他盖上。', '我们都会这样吗？'][Math.floor(Math.random() * 4)];
}

export function anyoneSick(w: World) { return present(w).filter((p) => p.conds.some((c) => ['wound', 'infection', 'fever', 'flu', 'dysentery', 'hypothermia', 'frostbite'].includes(c.type))); }

// 传染：同房间的人之间
export function contagion(w: World) {
  const ppl = present(w);
  for (const p of ppl) {
    if (!p.conds.some((c) => c.type === 'flu' || c.type === 'dysentery')) continue;
    for (const q of peopleIn(w, roomOf(p))) {
      if (q === p || hasCond(q, 'flu')) continue;
      const risk = 0.004 * (q.needs.hunger < 30 ? 2 : 1) * (q.needs.hygiene < 30 ? 1.5 : 1);
      if (rnd(w.rng) < risk) { addCond(w, q, 'flu', 45); log(w, `${nm(w, q.id)}开始发烧咳嗽。`, { col: '#d8b080' }); }
    }
  }
  // 卫生太差 → 痢疾
  for (const p of ppl) if (p.needs.hygiene < 12 && rnd(w.rng) < 0.0004) { addCond(w, p, 'dysentery', 50); log(w, `${nm(w, p.id)}拉肚子拉得站不起来。`, { col: '#d8b080' }); }
  // 冬天，偶发流感
  if (isNight(w) && rnd(w.rng) < 0.00008 && ppl.length) { const p = ppl[Math.floor(rnd(w.rng) * ppl.length)]; addCond(w, p, 'flu', 40); log(w, `${nm(w, p.id)}着凉了。`, { col: '#d8b080' }); }
}

export function relGrief(w: World, a: string, b: string) { relAdd(w, a, b, { affection: 5 }); }
