// 无头模拟：不开画面跑完整局，检查崩溃与数值。用法：npm run sim -- [局数] [种子]
import { newWorld } from '../src/sim/world';
import { stepMinute, nextEvent } from '../src/sim/tick';
import { player, present, day, cnt } from '../src/sim/util';
import { NODES } from '../src/sim/goals';
import type { World } from '../src/sim/types';

const runs = Number(process.argv[2] || 5);
const seed0 = Number(process.argv[3] || 1000);
const summary: Record<string, number> = {};
for (let k = 0; k < runs; k++) {
  const w: World = newWorld({ seed: seed0 + k, name: '测试', gender: k % 2 ? 'f' : 'm', origin: (['deserter', 'cadre', 'nurse', 'worker', 'teacher', 'foreigner'] as const)[k % 6], settings: { adult: true, coercion: k % 3 === 0, pregnancy: true, speed: 1, autoPause: false } });
  w.facts.autoPlayer = true;
  const t0 = Date.now();
  let lastDay = 0;
  while (!w.ending && day(w) < 70) {
    stepMinute(w);
    // 无人值守：自动选择第一个可用选项
    for (let g = 0; g < 5; g++) {
      const v = nextEvent(w, false);
      if (!v) break;
      const c = v.choices.find((x) => x.ok !== false) || v.choices[0];
      if (c) { let r = c.run(w); for (let d = 0; d < 3 && r && typeof r === 'object'; d++) { const cc = r.choices.find((x) => x.ok !== false) || r.choices[0]; r = cc ? cc.run(w) : ''; } }
      if (v.id === 'rations') { /* auto handled */ }
    }
    if (day(w) !== lastDay) {
      lastDay = day(w);
      const alive = present(w);
      if (lastDay % 5 === 0 || lastDay === 1) console.log(`  [种子${seed0 + k}] 第${lastDay}天 阶段${w.war.phase} 在场${alive.length} 粮${Math.round(cnt(w.storage, 'food'))} 水${Math.round(w.shelter.water)} 油${Math.round(cnt(w.storage, 'fuel'))}+${w.shelter.genFuel.toFixed(1)} 电${w.shelter.power ? '开' : '关'} 领导${w.politics.leader || '无'} 合法${Math.round(w.politics.legitimacy)} 死${w.stats.deaths} 偷${w.stats.thefts} 亲密${w.stats.intimacies} 外出${w.stats.expeditions}`);
    }
  }
  const e = w.ending;
  const me = player(w);
  console.log(`== 种子 ${seed0 + k}：${e ? e.title : '未结束'}（第${day(w)}天，${((Date.now() - t0) / 1000).toFixed(1)}s）${e ? ' / ' + e.where + ' / ' + e.who + ' / ' + e.how : ''}`);
  const doneNodes = Object.keys(w.done[me.id] || {});
  console.log(`   玩家节点：${doneNodes.join(',') || '无'}；NPC 节点：${w.people.filter((p) => !p.isPlayer).map((p) => p.name + ':' + Object.keys(w.done[p.id] || {}).join('|')).join(' ')}`);
  console.log(`   最近日志：${w.log.filter((l) => l.important).slice(0, 6).map((l) => l.text).join(' / ')}`);
  summary[e?.title || '未结束'] = (summary[e?.title || '未结束'] || 0) + 1;
}
console.log('结局分布：', summary);
