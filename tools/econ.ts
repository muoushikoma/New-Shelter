// 经济分析：粮食流入/流出。npm run econ -- 种子
import { newWorld } from '../src/sim/world';
import { stepMinute, nextEvent } from '../src/sim/tick';
import { present, day, cnt, alive } from '../src/sim/util';
const seed = Number(process.argv[2] || 6001);
const w = newWorld({ seed, name: '测', gender: 'm', origin: 'worker', settings: { adult: false, coercion: false, pregnancy: true, speed: 1, autoPause: false } });
w.facts.autoPlayer = true;
let lastFood = cnt(w.storage, 'food');
const totalFood = () => alive(w).reduce((s, p) => s + cnt(p.inv, 'food') + cnt(p.stash, 'food'), 0) + cnt(w.storage, 'food');
let lastTotal = totalFood();
let lastDay = 1, harvests = 0, eaten = 0;
const hungerSum = () => present(w).reduce((s, p) => s + p.needs.hunger, 0);
while (!w.ending && day(w) < 45) {
  const before = totalFood();
  stepMinute(w);
  const after = totalFood();
  if (after < before) eaten += before - after;
  for (let g = 0; g < 5; g++) { const v = nextEvent(w); if (!v) break; const c = v.choices.find((x) => x.ok !== false) || v.choices[0]; if (c) c.run(w); }
  if (day(w) !== lastDay) {
    const tot = totalFood();
    console.log(`第${lastDay}天 人${present(w).length}(外出${w.expeditions.length}) 总粮${Math.round(tot)} 变化${Math.round(tot - lastTotal)} 吃掉${Math.round(eaten)} 平均饱${Math.round(hungerSum() / Math.max(1, present(w).length))} 种植${w.shelter.farmBuilt ? Math.round(w.shelter.farm) : '-'} 收获${w.facts.harvests || 0} 死${w.stats.deaths} 外出累计${w.stats.expeditions}`);
    lastTotal = tot; eaten = 0; lastDay = day(w);
  }
}
console.log('结局', w.ending?.title);
