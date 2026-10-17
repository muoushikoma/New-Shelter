// 导演：根据局势推送机会与危机，保证玩家始终有事可做，又不会无事发生
import type { World } from './types';
import { present, player, cnt, hasCond, day, hour, P, rel, isNight } from './util';
import { rnd, pick } from '../engine/rng';
import { journalNodes, methodReady, methodVisible } from './goals';

const cool = (w: World, k: string, mins: number) => { const t = Number(w.facts['cd:' + k] || -1e9); if (w.t - t < mins) return false; w.facts['cd:' + k] = w.t; return true; };

export function directorHourly(w: World) {
  const me = player(w);
  if (!me.alive || !me.present || w.trip || hasCond(me, 'captive')) return;
  const ppl = present(w);
  const h = hour(w);
  const q = (id: string, ctx: Record<string, unknown> = {}, delay = 0) => { if (!w.pending.some((e) => e.id === id)) w.pending.push({ id, t: w.t + delay, ctx }); };
  // 广播里的逃兵名单
  if (w.war.phase <= 2 && !w.shelter.radioFixed && h === 19 && rnd(w.rng) < 0.18 && cool(w, 'radio_list', 1440 * 4)) {
    const d = ppl.find((p) => !p.isPlayer && (p.origin === 'deserter' || p.secrets.some((s) => s.id.includes('deserter'))));
    if (d) q('radio_list', { id: d.id });
  }
  // 仓库对不上账
  if (Number(w.facts.missing || 0) >= 3 && w.shelter.keyHolder && !P(w, w.shelter.keyHolder)?.isPlayer && cool(w, 'theft_noticed', 1440 * 2)) { q('theft_noticed', {}); w.facts.missing = 0; }
  // 最后一支药
  const sick = ppl.filter((p) => p.conds.some((c) => ['infection', 'fever', 'pneumonia'].includes(c.type)) && p.health < 70);
  if (sick.length >= 2 && cnt(w.storage, 'meds') === 1 && (me.skills.medic >= 40 || w.politics.leader === me.id || w.shelter.keyHolder === me.id) && cool(w, 'last_meds', 1440 * 3)) q('last_meds', { a: sick[0].id, b: sick[1].id });
  // 冷夜：停电又冷
  if (!w.shelter.power && isNight(w) && w.shelter.tempOut < -18 && cool(w, 'cold_night', 1440 * 3)) q('cold_night', {});
  // 推心置腹
  if (isNight(w) || h >= 20) for (const p of ppl) {
    if (p.isPlayer) continue;
    const r = rel(w, p.id, me.id);
    const sec = p.secrets.find((s) => !s.known.includes(me.id));
    if (sec && r.trust >= 68 && rnd(w.rng) < 0.08 && cool(w, 'confide:' + p.id, 1440 * 3)) { q('confide', { id: p.id, sec: sec.id }); break; }
  }
  // 机会：玩家手上能做的事太少时，给一条线索
  if (h === 10 && day(w) >= 3 && cool(w, 'hint', 1440 * 2)) {
    const ready = journalNodes(w, me).filter((n) => !w.done[me.id]?.[n.id] && n.methods.some((m) => methodVisible(m, w, me) && methodReady(m, w, me)));
    if (ready.length < 3) q('hint', {});
  }
}
export { pick };
