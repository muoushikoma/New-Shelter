// 内容校验：npm run validate:content
// 1. 成人内容包：格式、钩子、条件、变量、余韵白名单、未成年关键词黑名单
// 2. 目标网络：每个节点都必须至少有一个不涉及成人内容的解法
import { readFileSync, existsSync } from 'fs';
import { NODES } from '../src/sim/goals';

let errors = 0, warns = 0;
const err = (m: string) => { errors++; console.log('✗ ' + m); };
const warn = (m: string) => { warns++; console.log('! ' + m); };

const HOOKS = ['flirt', 'proposal', 'refusal', 'scene', 'aftermath', 'discovered', 'rumor', 'memory', 'jealousy', 'pregnancy'];
const AFTER = ['tender', 'distant', 'relief', 'shame', 'bond', 'bitter', 'noisy'];
const VARS = /^(initiator|partner)\.(name|age|gender|body|origin|mood|health|hygiene|experience)$|^relation\.(state|trust|affection|fear|desire|resentment|times)$|^deal\.(item|qty)$|^(location|privacy|temperature|timeOfDay|day|warPhase|consent|powerGap|shelterRegime)$/;
const OPS = ['any', 'in', 'lt', 'gt', 'lte', 'gte', 'between', 'exists'];
const BLACK = ['未成年', '小孩', '孩子', '儿童', '幼女', '幼童', '萝莉', '正太', '初中', '小学', '中学生', '小学生', '十二岁', '十三岁', '十四岁', '十五岁', '十六岁', '十七岁', '童'];

const base = 'public/content/adult/';
if (existsSync(base + 'manifest.json')) {
  const m = JSON.parse(readFileSync(base + 'manifest.json', 'utf8'));
  const ids = new Set<string>();
  let count = 0, filled = 0;
  for (const f of m.files || []) {
    if (!existsSync(base + f)) { err(`manifest 列出的文件不存在：${f}`); continue; }
    let data: unknown;
    try { data = JSON.parse(readFileSync(base + f, 'utf8')); } catch (e) { err(`${f} 不是合法的 JSON：${(e as Error).message}`); continue; }
    const arr = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
    for (const s of arr) {
      count++;
      const where = `${f} / ${s.id}`;
      if (!s.id) { err(`${f}：有条目缺少 id`); continue; }
      if (ids.has(s.id as string)) err(`${where}：id 重复`); ids.add(s.id as string);
      if (!HOOKS.includes(s.hook as string)) err(`${where}：未知的 hook「${s.hook}」`);
      for (const k of Object.keys((s.when as object) || {})) { const mm = k.match(/^(.*)\.([a-z]+)$/); if (mm && !OPS.includes(mm[2]) && !VARS.test(k)) warn(`${where}：条件「${k}」无法识别`); }
      for (const a of (s.aftertaste as string[]) || []) if (!AFTER.includes(a)) err(`${where}：余韵「${a}」不在白名单里`);
      const texts = [...(((s.pages as { text: string }[]) || []).map((p) => p.text)), ...((s.lines as string[]) || [])];
      if (!texts.length) err(`${where}：没有任何文本（pages 或 lines）`);
      const placeholder = texts.every((t) => /^\s*【.*】\s*$/.test(t));
      if (!placeholder) filled++;
      for (const t of texts) {
        for (const v of t.matchAll(/\{([a-zA-Z.]+)\}/g)) if (!VARS.test(v[1])) err(`${where}：未知变量 {${v[1]}}`);
        if (!placeholder) for (const b of BLACK) if (t.includes(b)) err(`${where}：出现禁用词「${b}」——所有角色必须是成年人`);
      }
      if (((s.when as Record<string, unknown>)?.['consent.in'] as string[] | undefined)?.includes('coerced') && !(s.tags as string[] || []).includes('coercion')) warn(`${where}：涉及 coerced 的条目应带 tags: ["coercion"]，才能被设置开关过滤`);
    }
  }
  console.log(`成人内容：${count} 条，其中已填写 ${filled} 条（只有占位符的条目游戏不会加载）`);
} else console.log('没有成人内容包（content/adult/manifest.json），跳过。');

for (const n of NODES) {
  if (!n.methods.some((m) => !m.adult)) err(`目标节点「${n.title}」只有成人解法——每个节点都必须至少有一个非成人解法`);
}
console.log(`目标网络：${NODES.length} 个节点，${NODES.reduce((s, n) => s + n.methods.length, 0)} 个解法（成人解法 ${NODES.reduce((s, n) => s + n.methods.filter((m) => m.adult).length, 0)} 个）`);
console.log(errors ? `\n${errors} 个错误，${warns} 个警告` : `\n通过（${warns} 个警告）`);
process.exit(errors ? 1 : 0);
