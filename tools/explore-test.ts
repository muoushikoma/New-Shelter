// 场景化搜刮的自动测试：每个地点生成若干建筑，检查连通性，再让一个自动玩家把能搜的都搜一遍。npx tsx tools/explore-test.ts
import { newWorld } from '../src/sim/world';
import { stepMinute } from '../src/sim/tick';
import { startTrip, tripArrive, resolveEncounter, makeEncounter } from '../src/sim/war';
import { genScene, findPath, startExplore, exploreStep, orderAct, actionsFor, sceneOf, afterEncounter, hasScene, weightOf, XScene } from '../src/sim/explore';
import { player, present } from '../src/sim/util';
import { LOC_LIST } from '../src/content/locations';
import { ITEMS } from '../src/content/items';
import type { LocId } from '../src/sim/types';

let bad = 0;
const locs = LOC_LIST.filter(hasScene);
for (const loc of locs) {
  const stats = { conts: 0, loot: 0, minutes: 0, spotted: 0, searched: 0, weight: 0 };
  for (let seed = 1; seed <= 6; seed++) {
    const w = newWorld({ seed: seed * 101, name: '测', gender: 'm', origin: 'worker', settings: { adult: false, coercion: false, pregnancy: true, speed: 1, autoPause: false } });
    w.war.phase = 1 + (seed % 3);
    // 连通性：假设所有锁和瓦砾都能打开，每件家具都应该到得了
    const sc: XScene = genScene(w, loc as LocId);
    const open: XScene = JSON.parse(JSON.stringify(sc)); open.gates.forEach((g) => (g.state = 'open')); open.stairs.forEach((s) => (s.state = 'open'));
    for (const c of open.conts) if (!findPath(open, sc.entrance, c)) { bad++; console.log(`✗ ${loc} 种子${seed}：到不了 ${c.kind} @${c.floor}/${c.x}`); }
    for (let i = 0; i < sc.conts.length; i++) for (let j = i + 1; j < sc.conts.length; j++) { const a = sc.conts[i], b = sc.conts[j]; if (a.floor === b.floor && Math.abs(a.x - b.x) < 8) { bad++; console.log(`✗ ${loc} 家具重叠`); } }
    stats.conts += sc.conts.length;
    stats.loot += sc.conts.reduce((s, c) => s + Object.values(c.loot).reduce((a, b) => a + (b || 0), 0), 0);
    // 自动玩家
    const me = player(w);
    w.locs[loc as LocId].known = true;
    const mate = present(w).find((p) => !p.isPlayer)!;
    startTrip(w, loc as LocId, [mate.id]);
    tripArrive(w); w.trip!.encounter = null;
    const ex = startExplore(w);
    let guard = 0;
    while (!ex.done && guard++ < 20000) {
      if (ex.spotted) { stats.spotted++; w.trip!.encounter = makeEncounter(w, ex.spotted); const opt = w.trip!.encounter.options[0].id; resolveEncounter(w, opt); afterEncounter(w, ex); if (ex.done || !w.trip) break; continue; }
      if (!ex.act && !ex.path.length && !ex.pending && !ex.climb) {
        const s = sceneOf(w, ex);
        // 背包快满 / 搜够两小时就走
        if (weightOf(ex.bag) > ex.carryMax - 1 || ex.minutes > 150) { orderAct(w, ex, 'exit', 0, 'leave'); continue; }
        const next = s.conts.find((c) => (!c.searched || c.locked) && findPath(s, ex, c));
        if (next) { const a = actionsFor(w, ex, 'cont', next.id).find((x) => x.kind !== 'hide'); if (a) { orderAct(w, ex, 'cont', next.id, a.kind); continue; } }
        const g = s.gates.find((x) => x.state !== 'open' && (findPath(s, ex, { floor: x.floor, x: x.x - 6 }) || findPath(s, ex, { floor: x.floor, x: x.x + 6 })));
        if (g) { const a = actionsFor(w, ex, 'gate', g.id)[0]; orderAct(w, ex, 'gate', g.id, a.kind); continue; }
        const st = s.stairs.find((x) => x.state !== 'open' && (findPath(s, ex, { floor: x.a, x: x.x }) || findPath(s, ex, { floor: x.b, x: x.x })));
        if (st) { const a = actionsFor(w, ex, 'stair', st.id)[0]; orderAct(w, ex, 'stair', st.id, a.kind); continue; }
        orderAct(w, ex, 'exit', 0, 'leave'); continue;
      }
      const r = exploreStep(w, ex, 0.1);
      for (let i = 0; i < r.minutes; i++) stepMinute(w);
    }
    if (guard >= 20000) { bad++; console.log(`✗ ${loc} 种子${seed}：自动玩家卡住了 ${JSON.stringify({ x: ex.x, f: ex.floor, act: ex.act, pending: ex.pending, path: ex.path })}`); }
    const s = w.locs[loc as LocId].scene!;
    stats.searched += s.conts.filter((c) => c.searched).length;
    stats.minutes += ex.minutes;
    stats.weight += Object.entries(me.inv).reduce((a, [k, v]) => a + ITEMS[k as keyof typeof ITEMS].weight * (v || 0), 0);
  }
  console.log(`${loc}：平均 ${(stats.conts / 6).toFixed(1)} 件家具、物资 ${(stats.loot / 6).toFixed(1)} 件，搜了 ${(stats.searched / 6).toFixed(1)} 件，用时 ${(stats.minutes / 6).toFixed(0)} 分钟，被发现 ${stats.spotted} 次，带回 ${(stats.weight / 6).toFixed(1)} kg`);
}
console.log(bad ? `\n${bad} 个问题` : '\n全部通过');
process.exit(bad ? 1 : 0);
