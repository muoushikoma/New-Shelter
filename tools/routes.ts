// 路线测试：直接调用模拟层，检查每条人生路线的关键动作能走通。npm run test:routes
import { newWorld } from '../src/sim/world';
import { stepMinute, nextEvent } from '../src/sim/tick';
import { player, present, day, cnt, addItem, rel } from '../src/sim/util';
import { startTrip, tripArrive, tripLeave, tripHome, locActions, doLocAction, resolveEncounter, crossDrain } from '../src/sim/war';
import { doTalk } from '../src/sim/player';
import { holdVote, availableProposals } from '../src/sim/politics';
import { checkGoals } from '../src/sim/goals';
import type { World, OriginKey, LocId } from '../src/sim/types';

const T0 = Date.now();
function mkw(seed: number, origin: OriginKey = 'deserter'): World {
  return newWorld({ seed, name: '测', gender: 'm', origin, settings: { adult: true, coercion: true, pregnancy: true, speed: 1, autoPause: false } });
}
function settle(w: World) {
  for (let n = 0; n < 30; n++) {
    const v = nextEvent(w); if (!v) return;
    const c = v.choices.find((x) => x.ok !== false) || v.choices[0];
    if (c) { let r: unknown = c.run(w); for (let k = 0; k < 3 && r && typeof r === 'object'; k++) { const rv = r as { choices: { ok?: boolean; run: (w: World) => unknown }[] }; const cc = rv.choices.find((x) => x.ok !== false) || rv.choices[0]; r = cc ? cc.run(w) : ''; } }
  }
  throw new Error('事件死循环');
}
function run(w: World, mins: number) { for (let i = 0; i < mins && !w.ending; i++) { stepMinute(w); settle(w); } }
function trip(w: World, loc: LocId, acts: string[]) {
  startTrip(w, loc, [], {});
  while (w.trip && w.t < w.trip.until && !w.ending) stepMinute(w);
  if (!w.trip) return ['（路上出事了）'];
  tripArrive(w);
  const out: string[] = [];
  for (const a of acts) {
    if (!w.trip) break;
    if (w.trip.encounter) out.push('遭遇:' + resolveEncounter(w, w.trip.encounter.options[0].id).slice(0, 30));
    if (!w.trip) break;
    const la = locActions(w).find((x) => x.id === a);
    if (!la) { out.push(`(没有 ${a})`); continue; }
    if (!la.ok) { out.push(`(${a} 不可用：${la.why})`); continue; }
    out.push(a + ': ' + doLocAction(w, a).slice(0, 40));
    for (let i = 0; i < la.cost && !w.ending; i++) stepMinute(w);
  }
  if (w.trip) { if (w.trip.stage === 'at') tripLeave(w); while (w.trip && w.t < w.trip.until && !w.ending) stepMinute(w); if (w.trip) tripHome(w); }
  return out;
}
const t = (label: string, f: () => void) => { const s = Date.now(); try { f(); } catch (e) { console.log(`✗ ${label} 出错：`, e); } console.log(`   （${Date.now() - s}ms）`); };

t('1 离开：军营→通行证→检查站', () => {
  const w = mkw(11); const me = player(w);
  me.knows.K_MIL = true; w.locs.camp.known = true; addItem(me.inv, 'food', 20);
  run(w, 60 * 12);
  console.log('1 军营:', trip(w, 'camp', ['mil_supply', 'pass_buy']).join(' | '));
  checkGoals(w);
  console.log('  通行证:', cnt(me.inv, 'pass'), Object.keys(w.done[me.id]).join(','));
  console.log('  边境:', trip(w, 'border', ['cross_pass']).join(' | '));
  console.log('  结局:', w.ending?.title, '/', w.ending?.where);
});
t('2 掌权：推举自己', () => {
  const w = mkw(12, 'cadre'); const me = player(w);
  run(w, 60 * 30);
  const pr = availableProposals(w, me).find((p) => p.kind === 'leader' && p.target === me.id)!;
  console.log('2 推举自己:', holdVote(w, pr, me, 'yes').text, '领导者=', w.politics.leader);
});
t('3 爱情：示好 + 求欢', () => {
  const w = mkw(13); const me = player(w);
  const tg = present(w).find((p) => !p.isPlayer && p.gender === 'f')!;
  addItem(me.inv, 'cigs', 20); addItem(me.inv, 'food', 10);
  for (let i = 0; i < 8; i++) { doTalk(w, tg, 'chat'); doTalk(w, tg, 'give:cigs'); doTalk(w, tg, 'flirt'); run(w, 120); }
  const r = rel(w, tg.id, me.id);
  console.log('3 关系:', tg.name, '好感', Math.round(r.affection), '信任', Math.round(r.trust), '欲望', Math.round(r.desire), r.state);
  console.log('  求欢:', doTalk(w, tg, 'intim').text);
  run(w, 90);
  console.log('  之后:', rel(w, tg.id, me.id).state, me.partner, '|', w.log.slice(0, 3).map((l) => l.text).join(' / '));
});
t('4 暗渠', () => {
  const w = mkw(14); const me = player(w);
  w.shelter.collapseWork = 99; w.shelter.drainFound = true; me.knows.K_DRAIN = true;
  console.log('4 暗渠:', crossDrain(w, []), '→', w.ending?.title || (me.alive ? '活着' : '死'));
});
t('5 黑市→走私→名额', () => {
  const w = mkw(15); const me = player(w);
  me.knows.K_SMUG = true; w.locs.market.known = true; addItem(me.inv, 'valuables', 8); w.war.phase = 2;
  run(w, 60 * 12);
  console.log('5 黑市:', trip(w, 'market', ['mk_smug', 'mk_seat', 'mk_trade']).join(' | '));
  checkGoals(w); console.log('  节点:', Object.keys(w.done[me.id]).join(','));
});
t('6 自动跑完一局', () => {
  const w = mkw(16); w.facts.autoPlayer = true;
  run(w, 60 * 24 * 60);
  console.log('6 终局:', w.ending?.title, '/', w.ending?.where, '/', w.ending?.who, '天数', day(w), '战争', w.war.phase, w.war.outcome);
});
console.log(`总耗时 ${Date.now() - T0}ms`);
