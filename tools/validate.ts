// 内容校验：npm run validate:content [-- 内容目录]（默认 public/content）
// 1. 内容包：剧情事件 / 文本 / 人物 / 图片 的格式与引用，并把每个剧情事件的每个选项实际跑一遍
// 2. 成人内容包：格式、钩子、条件、变量、余韵白名单、未成年关键词黑名单
// 3. 目标网络：每个节点都必须至少有一个不涉及成人内容的解法
import { readFileSync, existsSync } from 'fs';
import { NODES } from '../src/sim/goals';
import { EVENTS } from '../src/sim/events';
import '../src/sim/tick';
import { validateStory, registerStory, StoryEvent, STORY } from '../src/content/story';
import { validateText, validatePeople, applyText, addPeople, TextPack, PeoplePack } from '../src/content/textpack';
import { newWorld } from '../src/sim/world';
import { present, rel } from '../src/sim/util';
import type { EventView } from '../src/sim/events';

let errors = 0, warns = 0;
const err = (m: string) => { errors++; console.log('✗ ' + m); };
const warn = (m: string) => { warns++; console.log('! ' + m); };

const HOOKS = ['flirt', 'proposal', 'refusal', 'scene', 'aftermath', 'discovered', 'rumor', 'memory', 'jealousy', 'pregnancy'];
const AFTER = ['tender', 'distant', 'relief', 'shame', 'bond', 'bitter', 'noisy'];
const VARS = /^(initiator|partner)\.(name|age|gender|body|origin|mood|health|hygiene|experience)$|^relation\.(state|trust|affection|fear|desire|resentment|times)$|^deal\.(item|qty)$|^(location|privacy|temperature|timeOfDay|day|warPhase|consent|powerGap|shelterRegime)$/;
const OPS = ['any', 'all', 'none', 'in', 'not', 'lt', 'gt', 'lte', 'gte', 'between', 'exists'];
const BLACK = ['未成年', '小孩', '孩子', '儿童', '幼女', '幼童', '萝莉', '正太', '初中', '小学', '中学生', '小学生', '十二岁', '十三岁', '十四岁', '十五岁', '十六岁', '十七岁', '童'];

const root = (process.argv[2] || 'public/content').replace(/\/?$/, '/');
const readJson = (f: string): unknown => { try { return JSON.parse(readFileSync(root + f, 'utf8')); } catch (e) { err(`${f} 读取失败或不是合法的 JSON：${(e as Error).message}`); return null; } };

// ---------- 内容包 ----------
if (existsSync(root + 'manifest.json')) {
  const m = readJson('manifest.json') as { events?: string[]; text?: string[]; people?: string[]; images?: string[] } | null;
  if (m) {
    for (const f of m.people || []) { const d = readJson(f) as PeoplePack; if (!d) continue; const e = validatePeople(d, f); e.forEach(err); if (!e.length) addPeople(d); for (const t of d.people || []) for (const x of [t.bio, ...(t.secrets || []).map((y) => y.text)]) for (const b of BLACK) if (b !== '童' && String(x).includes(b)) warn(`${f} [${t.key}] 出现「${b}」，请确认没有未成年人设定`); }
    for (const f of m.text || []) { const d = readJson(f) as TextPack; if (!d) continue; validateText(d, f).forEach(err); applyText(d); }
    const files: [string, StoryEvent[]][] = [];
    for (const f of m.events || []) { const d = readJson(f); if (d) files.push([f, (Array.isArray(d) ? d : [d]) as StoryEvent[]]); }
    const builtIn = new Set(Object.keys(EVENTS));
    const all = new Set([...builtIn, ...files.flatMap(([, l]) => l.map((e) => e?.id))]);
    const seen = new Set<string>();
    for (const [f, list] of files) {
      for (const ev of list) { if (ev?.id && seen.has(ev.id)) err(`${f} [${ev.id}] id 重复`); seen.add(ev?.id); }
      validateStory(list, f, builtIn, all).forEach(err);
      for (const ev of list) if (ev?.id && !builtIn.has(ev.id)) registerStory(ev);
    }
    // 试跑：每个事件 × 每个选项（成人开关打开），抓运行时错误
    let runs = 0;
    for (const ev of Object.values(STORY)) {
      for (let ci = 0; ci < Math.max(1, ev.choices?.length || 0); ci++) {
        for (const seed of [1, 2, 3]) {
          const w = newWorld({ seed, name: '测试', gender: seed % 2 ? 'm' : 'f', origin: 'worker', settings: { adult: true, coercion: true, pregnancy: true, speed: 1, autoPause: false } });
          w.t = 1440 * 5 + 600;
          // 第 2、3 个种子：把大家对玩家的关系拉满、停电、进入战争后期，尽量满足选角和触发条件
          if (seed >= 2) { for (const p of w.people) if (!p.isPlayer) { const r = rel(w, p.id, 'player'); r.trust = r.affection = r.desire = r.respect = 75; } w.shelter.power = false; w.war.phase = 3; }
          if (seed === 3) { w.politics.leader = w.people.find((p) => !p.isPlayer)!.id; }
          try {
            const v = EVENTS[ev.id].build(w, {});
            if (!v) { if (seed === 3) warn(`${ev.id}：在测试世界里选不到符合条件的角色，选项 ${ci + 1} 没有试跑`); continue; }
            if (/\{[^{}]*\}/.test(v.title + v.text)) err(`${ev.id}：渲染后仍有未替换的变量：${(v.title + v.text).match(/\{[^{}]*\}/)![0]}`);
            const c = v.choices[ci];
            if (c && c.ok !== false) { let r: string | EventView | void = c.run(w); for (let d = 0; d < 5 && r && typeof r === 'object'; d++) { const cc = r.choices.find((x) => x.ok !== false); r = cc ? cc.run(w) : ''; } }
            EVENTS[ev.id].auto?.(w, {});
            runs++;
            if (present(w).some((p) => Object.values(p.needs).some((x) => Number.isNaN(x)))) err(`${ev.id}：选项 ${ci + 1} 让数值变成了 NaN`);
            break;
          } catch (e) { err(`${ev.id}：选项 ${ci + 1} 运行出错：${(e as Error).message}`); break; }
        }
      }
      if (ev.choices?.some((c) => c.effects?.some((x) => x.op === 'intimacy'))) for (const t of [ev.text, ...ev.choices.map((c) => c.result || '')]) for (const b of BLACK) if (b !== '童' && t.includes(b)) err(`${ev.id}：含亲密效果的事件出现禁用词「${b}」`);
    }
    // 图片
    let imgs = 0;
    for (const f of m.images || []) {
      const map = readJson(f) as Record<string, string> | null; if (!map) continue;
      const dir = f.includes('/') ? f.slice(0, f.lastIndexOf('/') + 1) : '';
      for (const [k, v] of Object.entries(map)) {
        if (k.startsWith('_')) continue;
        if (!/^(portrait|head|item|cg|ui)\./.test(k)) warn(`${f}：图片键 ${k} 不认识（应以 portrait. / head. / item. / cg. / ui. 开头）`);
        if (!existsSync(root + dir + v)) err(`${f}：图片 ${k} 的文件 ${dir + v} 不存在`);
        else { imgs++; const png = readFileSync(root + dir + v); if (png.readUInt32BE(0) === 0x89504e47) { const W = png.readUInt32BE(16), H = png.readUInt32BE(20); if (k.startsWith('portrait.') && Math.abs(W / H - 40 / 48) > 0.02) warn(`${k}：头像是 ${W}×${H}，建议 40×48 的整数倍`); if (k.startsWith('item.') && (W !== H)) warn(`${k}：物品图标建议正方形（16×16）`); } }
      }
    }
    console.log(`内容包：剧情 ${Object.keys(STORY).length} 个（试跑 ${runs} 次），文本 ${(m.text || []).length} 个文件，人物 ${(m.people || []).length} 个文件，图片 ${imgs} 张`);
  }
} else console.log(`没有内容包（${root}manifest.json），跳过。`);

const base = root + 'adult/';
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
