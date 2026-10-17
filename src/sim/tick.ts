// 主循环：每次推进 1 游戏分钟
import type { PendingEvent, World } from './types';
import { updateEnvironment, updateBody, contagion } from './env';
import { stepAction, interrupt, mk } from './actions';
import { BEDS } from '../content/layout';
import { decide } from './ai';
import { checkGoals } from './goals';
import { directorHourly } from './director';
import { dailyWar, tickExpeditions, hourWar } from './war';
import { distributeRations, dailyPolitics } from './politics';
import { EVENTS, EventView, HOURLY_HOOKS } from './events';
import { alive, present, player, minuteOfDay, hasCond, day, P, log, cnt, hour } from './util';
import { computeEnding } from './ending';
import { rnd } from '../engine/rng';
import '../content/events';

export function stepMinute(w: World) {
  if (w.ending) return;
  w.t++;
  updateEnvironment(w);
  for (const p of alive(w)) if (!p.external) updateBody(w, p);
  for (const p of present(w)) {
    if (!p.alive || hasCond(p, 'captive')) continue;
    // 禁闭
    const conf = Number(w.facts[`confined:${p.id}`] || 0);
    if (conf > w.t && (!p.action || p.action.room !== 'lower')) { p.action = { type: 'wait', room: 'lower', x: 100, dur: conf - w.t, t: 0, reason: '被关禁闭' }; p.queue = []; }
    if (!p.isPlayer || w.facts.autoPlayer) {
      // 紧急需求打断
      const a = p.action;
      const critical = p.needs.thirst < 12 || p.needs.hunger < 10 || p.needs.warmth < 12;
      if (a && critical && conf <= w.t && !['drink', 'eat', 'warm', 'take', 'steal', 'sleep', 'intimacy', 'wait', 'expedition', 'away'].includes(a.type) && (w.t % 15 === 0)) interrupt(w, p);
      if (!p.action) p.action = decide(w, p);
    }
    if (p.isPlayer && !w.facts.autoPlayer && w.settings.autoNeeds !== false && (!p.action || (p.action.type === 'idle' && !p.action.playerCmd))) selfCare(w, p);
    stepAction(w, p);
  }
  tickExpeditions(w);
  const m = minuteOfDay(w);
  if (w.t % 10 === 0) {
    contagion(w);
    for (const p of present(w)) if (!p.isPlayer && p.needs.stress >= 97 && rnd(w.rng) < 0.03 && !w.pending.some((e) => e.id === 'breakdown')) w.pending.push({ id: 'breakdown', t: w.t, ctx: { id: p.id } });
  }
  if (w.t % 60 === 0) {
    checkGoals(w);
    hourWar(w);
    directorHourly(w);
    for (const h of HOURLY_HOOKS) h(w);
    for (const p of alive(w)) { const c = p.conds.find((x) => x.type === 'pregnant'); if (c && c.sev > 18 && !w.facts[`pregKnown:${p.id}`]) { w.facts[`pregKnown:${p.id}`] = true; w.pending.push({ id: 'pregnant', t: w.t, ctx: { id: p.id } }); } }
  }
  if (m === 6 * 60) dailyWar(w);
  if (m === 18 * 60) distributeRations(w);
  if (m === 20 * 60) dailyPolitics(w);
  if (m === 0) w.stats.daysAlive = day(w);
  // 结局检查
  const me = player(w);
  if (!me.alive && !w.ending) w.ending = computeEnding(w, 'death');
  else if (me.leftReason && !w.ending && me.leftReason !== 'expelled') w.ending = computeEnding(w, me.leftReason);
}

// 「自动照顾自己」：玩家空闲时，满足最急迫的身体需要
function selfCare(w: World, p: import('./types').Person) {
  const n = p.needs;
  const say = (t: string) => { if ((Number(w.facts.selfCareT) || 0) < w.t - 120) { log(w, t, { col: '#8a9098' }); w.facts.selfCareT = w.t; } };
  if (n.thirst < 30 && w.shelter.water >= 0.5) { p.action = mk('drink', 'vent', { obj: 'tank', dur: 4, who: p }); say('你渴了，自己去喝了点水。'); return; }
  if (n.hunger < 30 && cnt(p.inv, 'food') + cnt(p.stash, 'food') > 0) { p.action = mk('eat', 'kitchen', { obj: 'table', dur: 12, who: p }); say('你饿了，吃了点东西。'); return; }
  if (n.energy < 20 || (n.energy < 45 && hour(w) >= 23)) { const bi = p.bed; p.action = bi !== undefined ? mk('sleep', BEDS[bi].room, { x: BEDS[bi].x, dur: 600 }) : mk('sleep', 'dorm', { dur: 600 }); say('你困得睁不开眼，去睡了。'); return; }
  if (n.warmth < 25) { p.action = mk('warm', w.shelter.power ? 'generator' : 'kitchen', { obj: w.shelter.power ? undefined : 'stove', dur: 30, who: p }); say('你冷得发抖，去暖和的地方待一会儿。'); return; }
}

// 玩家是否能亲历这个事件
function playerAvailable(w: World, id: string) {
  const me = player(w);
  if (!me.alive) return false;
  if (id === 'captive') return hasCond(me, 'captive');
  if (hasCond(me, 'captive')) return false;
  if (w.trip && !['phase2', 'phase3', 'phase4', 'final'].includes(id)) return false;
  if (!me.present && !['phase2', 'phase3', 'phase4', 'final', 'expelled'].includes(id)) return false;
  return true;
}
function playerAwake(w: World) { const me = player(w); return !(me.action?.type === 'sleep' && me.action.t > 0); }

// 取出下一个需要展示的事件；无法展示的自动处理
export function nextEvent(w: World, headless = false): EventView | null {
  for (let guard = 0; guard < 20; guard++) {
    const i = w.pending.findIndex((e) => e.t <= w.t);
    if (i < 0) return null;
    const pe = w.pending.splice(i, 1)[0];
    const def = EVENTS[pe.id];
    if (!def) continue;
    w.firedEvents[pe.id] = (w.firedEvents[pe.id] || 0) + 1;
    const canShow = !headless && playerAvailable(w, pe.id) && (def.needsPlayer || playerAwake(w) || ['knock', 'coup', 'final', 'arrest', 'meeting', 'first_meeting'].includes(pe.id));
    if (!canShow) { if (def.auto) def.auto(w, pe.ctx); continue; }
    // 被叫醒
    const me = player(w);
    if (me.action?.type === 'sleep') me.action = null;
    const v = def.build(w, pe.ctx);
    if (v) return v;
    if (def.auto && !v && headless) def.auto(w, pe.ctx);
  }
  return null;
}

export function runMinutes(w: World, n: number, onEvent?: (v: EventView) => boolean) {
  for (let i = 0; i < n && !w.ending; i++) {
    stepMinute(w);
    if (onEvent) { const v = nextEvent(w); if (v && onEvent(v)) return; }
  }
}

export function pushEvent(w: World, e: PendingEvent) { w.pending.push(e); }
export { P, log, interrupt };
