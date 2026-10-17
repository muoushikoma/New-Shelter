// 生成成人内容空白模板：npm run template:adult
// 输出到 public/content/adult/scenes/_template.json（只有占位符的条目游戏不会加载）
import { writeFileSync } from 'fs';

const hooks = ['flirt', 'proposal', 'refusal', 'scene', 'aftermath', 'discovered', 'rumor', 'memory', 'jealousy', 'pregnancy'];
const consents = ['eager', 'willing', 'reluctant', 'coerced'];
const motives = ['爱慕', '慰藉', '取暖', '交易', '讨好', '依附', '支配', '报复', '胁迫', '好奇', '逃避'];
const locations = ['dormitory', 'lower', 'archive', 'storage', 'outside'];
const out: unknown[] = [];
let n = 0;
const P = (t: string) => `【${t}】`;
for (const hook of hooks) {
  if (hook === 'scene' || hook === 'aftermath') {
    for (const consent of consents) for (const motive of motives) {
      if (motive === '胁迫' && consent !== 'coerced') continue;
      if (consent === 'coerced' && motive !== '胁迫' && motive !== '支配') continue;
      for (const loc of hook === 'scene' ? locations : ['any']) {
        n++;
        out.push({
          id: `${hook}.${loc}.${motive}.${consent}.01`, hook,
          when: { 'motive.any': [motive], 'consent.in': [consent], ...(loc !== 'any' ? { 'location.in': [loc === 'dormitory' ? 'dorm' : loc] } : {}) },
          weight: 10, tags: consent === 'coerced' ? ['coercion'] : motive === '交易' ? ['transaction'] : ['vanilla'],
          pages: hook === 'scene' ? [
            { speaker: null, text: P(`旁白：${loc === 'outside' ? '外面某处' : '{location}'}，{temperature}°C。写环境与身体感受，体现动机「${motive}」`) },
            { speaker: 'partner', text: P('{partner.name} 的话或反应，体现意愿度 ' + consent) },
            { speaker: 'initiator', text: P('{initiator.name} 的话或动作') },
            { speaker: null, text: P('主体内容（由内容作者决定写到什么程度）') },
          ] : [{ speaker: null, text: P('事后：两人的状态、沉默或对白') }],
          aftertaste: consent === 'reluctant' ? ['bitter'] : consent === 'coerced' ? [] : ['tender'],
        });
      }
    }
  } else {
    n++;
    out.push({ id: `${hook}.generic.01`, hook, when: {}, weight: 10, tags: ['vanilla'], lines: [P(`${hook} 的一句话，可用 {initiator.name} {partner.name}`), P('再写 5~10 条变体')] });
  }
}
writeFileSync('public/content/adult/scenes/_template.json', JSON.stringify(out, null, 2));
console.log(`生成了 ${n} 条占位模板`);
