// 对话树：玩家开启的话题、NPC 主动问玩家的问题、内置行动之后的追问。
// 条件 / 变量 / 检定 / 效果与剧情事件同一套语法。规范见 docs/CONTENT_GUIDE.md「对话」
// 本文件不依赖浏览器，命令行校验工具也用它
import type { Person, World } from '../sim/types';
import { player, clamp } from '../sim/util';
import { rnd } from '../engine/rng';
import { matchWhen, fillText } from './match';
import { storyContext, applyEffects, personView, validateStory, Effect, StoryChoice, StoryEvent } from './story';

export interface DLine { when?: Record<string, unknown>; text: string; weight?: number }
export interface DOption {
  label: string;
  when?: Record<string, unknown>; hide?: boolean; why?: string;
  tags?: [string, string][];
  check?: StoryChoice['check'];
  effects?: Effect[];
  reply?: string | DLine[];   // 对方马上的回应
  next?: string;              // 跳到本话题的哪个节点
  end?: boolean;              // 结束这个话题，回到话题列表
  action?: string;            // trade / observe / leave / talk:<内置选项> / topic:<话题 id>
  fail?: { effects?: Effect[]; reply?: string | DLine[]; next?: string; end?: boolean; action?: string };
}
export interface DNode { npc?: string | DLine[]; effects?: Effect[]; options?: DOption[] }
export interface DTopic {
  id: string;
  kind?: 'topic' | 'ask' | 'after';   // topic：玩家开启；ask：对方主动问你；after：内置行动之后的追问
  label?: string;                     // topic：话题列表里玩家说的第一句
  group?: 'chat' | 'ask';             // topic：放在「聊」还是「打听」下面
  after?: string;                     // after：接在哪个内置行动后面，如 chat、beg:no、ask:*
  npc?: { who?: string; when?: Record<string, unknown> };  // 哪些人会有这个话题（人物字段）
  when?: Record<string, unknown>;     // 整体条件（可引用 npc.* / player.* / 世界变量）
  chance?: number;                    // ask / after 的触发概率
  once?: boolean;                     // 对每个人只发生一次
  cooldown?: number;                  // 对同一个人，间隔多少游戏小时
  priority?: number;
  start?: string;
  nodes: Record<string, DNode>;
}

export const DIALOGUE: DTopic[] = [];
export function registerTopic(t: DTopic) { const i = DIALOGUE.findIndex((x) => x.id === t.id); if (i >= 0) DIALOGUE[i] = t; else DIALOGUE.push(t); }

const ctxOf = (w: World, npc: Person) => storyContext(w, { npc: npc.id });
const usedKey = (t: DTopic, npc: Person) => `dlg:${t.id}:${npc.id}`;

function eligible(w: World, npc: Person, t: DTopic): boolean {
  if (t.npc?.who && t.npc.who !== npc.id) return false;
  if (t.npc?.when && !matchWhen(t.npc.when, personView(w, npc))) return false;
  const last = w.facts[usedKey(t, npc)];
  if (last !== undefined) {
    if (t.once) return false;
    if (t.cooldown && w.t - Number(last) < t.cooldown * 60) return false;
  }
  return matchWhen(t.when, ctxOf(w, npc));
}
const byPriority = (a: DTopic, b: DTopic) => (b.priority || 0) - (a.priority || 0);

// 玩家可以开启的话题
export function openers(w: World, npc: Person, group: 'chat' | 'ask'): DTopic[] {
  return DIALOGUE.filter((t) => (t.kind || 'topic') === 'topic' && (t.group || 'chat') === group && eligible(w, npc, t)).sort(byPriority);
}
// 对方主动问你（每人每天最多一次）
export function pickAsk(w: World, npc: Person, boost = 1): DTopic | null {
  const dayKey = `dlgask:${npc.id}`;
  if (w.t - Number(w.facts[dayKey] ?? -1e9) < 1440) return null;
  const c = DIALOGUE.filter((t) => t.kind === 'ask' && eligible(w, npc, t)).sort(byPriority);
  for (const t of c) if (rnd(w.rng) < (t.chance ?? 0.3) * boost) { w.facts[dayKey] = w.t; return t; }
  return null;
}
// 内置行动之后的追问：after 可以写完整 id，或用 * 结尾匹配前缀
export function pickAfter(w: World, npc: Person, act: string): DTopic | null {
  const c = DIALOGUE.filter((t) => t.kind === 'after' && t.after && (t.after === act || (t.after.endsWith('*') && act.startsWith(t.after.slice(0, -1)))) && eligible(w, npc, t)).sort(byPriority);
  for (const t of c) if (rnd(w.rng) < (t.chance ?? 1)) return t;
  return null;
}

function line(w: World, npc: Person, l: string | DLine[] | undefined): string | null {
  if (!l) return null;
  const c = ctxOf(w, npc);
  if (typeof l === 'string') return fillText(l, c);
  const ok = l.filter((x) => matchWhen(x.when, c));
  if (!ok.length) return null;
  const tot = ok.reduce((s, x) => s + (x.weight ?? 1), 0);
  let r = rnd(w.rng) * tot;
  for (const x of ok) { r -= x.weight ?? 1; if (r <= 0) return fillText(x.text, c); }
  return fillText(ok[0].text, c);
}

export interface ShownOption { label: string; ok: boolean; why?: string; tags: [string, string][]; opt: DOption }
// 进入一个节点：执行节点效果，返回对方的话和玩家可选的回答
export function enter(w: World, npc: Person, t: DTopic, nodeId?: string): { line: string | null; options: ShownOption[] } {
  const id = nodeId || t.start || Object.keys(t.nodes)[0];
  const n = t.nodes[id];
  if (!n) return { line: null, options: [] };
  if (id === (t.start || Object.keys(t.nodes)[0])) w.facts[usedKey(t, npc)] = w.t;
  applyEffects(w, n.effects, { npc: npc.id });
  const said = line(w, npc, n.npc);
  const c = ctxOf(w, npc);
  const me = player(w);
  const options: ShownOption[] = [];
  for (const o of n.options || []) {
    const ok = matchWhen(o.when, c);
    if (!ok && o.hide) continue;
    const tags: [string, string][] = [...(o.tags || [])];
    if (o.check?.skill) { const who = o.check.who === 'npc' ? npc : me; tags.push([`${SKILL_CN[o.check.skill]} ${who.skills[o.check.skill]}`, '#d8b060']); }
    else if (typeof o.check?.chance === 'number') tags.push([`${Math.round(o.check.chance * 100)}%`, '#d8b060']);
    options.push({ label: fillText(o.label, c), ok, why: ok ? undefined : fillText(o.why || '条件不满足', c), tags, opt: o });
  }
  return { line: said, options };
}
const SKILL_CN: Record<string, string> = { medic: '医疗', mechanic: '机械', cook: '烹饪', combat: '格斗', stealth: '潜行', persuade: '说服', forgery: '伪造', scavenge: '搜刮' };

// 选一个回答：检定、效果、对方的回应、接下来去哪
export function choose(w: World, npc: Person, o: DOption): { reply: string | null; next?: string; end: boolean; action?: string } {
  let success = true;
  if (o.check) {
    if (typeof o.check.chance === 'number') success = rnd(w.rng) < o.check.chance;
    else { const who = o.check.who === 'npc' ? npc : player(w); const sk = o.check.skill ? who.skills[o.check.skill] : 50; success = rnd(w.rng) * 100 < clamp(sk + (o.check.bonus || 0), 5, 95); }
  }
  const br = success ? { effects: o.effects, reply: o.reply, next: o.next, end: o.end, action: o.action } : { effects: o.fail?.effects, reply: o.fail?.reply, next: o.fail?.next, end: o.fail?.end, action: o.fail?.action };
  applyEffects(w, br.effects, { npc: npc.id });
  return { reply: line(w, npc, br.reply), next: br.next, end: !!br.end || (!br.next && !br.action), action: br.action };
}

// ---------- 校验：把每个节点当成一个剧情事件交给剧情校验器，再检查节点跳转 ----------
export function validateDialogue(list: DTopic[], file: string, builtIn: Set<string>): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const t of list) {
    const id = t?.id || '?';
    if (!t || typeof t.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(t.id)) { errs.push(`${file} [${id}] id 必须是小写字母开头、只含 a-z 0-9 _`); continue; }
    if (seen.has(t.id)) errs.push(`${file} [${id}] id 重复`); seen.add(t.id);
    const kind = t.kind || 'topic';
    if (!['topic', 'ask', 'after'].includes(kind)) errs.push(`${file} [${id}] kind 只能是 topic / ask / after`);
    if (kind === 'topic' && !t.label) errs.push(`${file} [${id}] 玩家开启的话题需要 label`);
    if (kind === 'after' && !t.after) errs.push(`${file} [${id}] after 话题需要写明接在哪个行动后面`);
    if (t.group && !['chat', 'ask'].includes(t.group)) errs.push(`${file} [${id}] group 只能是 chat / ask`);
    if (!t.nodes || !Object.keys(t.nodes).length) { errs.push(`${file} [${id}] 没有 nodes`); continue; }
    const start = t.start || Object.keys(t.nodes)[0];
    if (!t.nodes[start]) errs.push(`${file} [${id}] start 节点 ${start} 不存在`);
    const asLine = (l: string | DLine[] | undefined) => (typeof l === 'string' ? l : (l || []).map((x) => x.text).join('\n'));
    const fake: StoryEvent[] = [];
    for (const [nid, n] of Object.entries(t.nodes)) {
      for (const o of n.options || []) {
        for (const nx of [o.next, o.fail?.next]) if (nx && !t.nodes[nx]) errs.push(`${file} [${id}] 节点 ${nid} 的选项「${o.label}」跳到不存在的节点 ${nx}`);
        for (const a of [o.action, o.fail?.action]) if (a && !/^(trade|observe|leave|talk:.+|topic:[a-z0-9_]+)$/.test(a)) errs.push(`${file} [${id}] action 只能是 trade / observe / leave / talk:内置选项 / topic:话题id，现在是 ${a}`);
        if (Array.isArray(o.reply)) for (const l of o.reply) if (l.when) fake.push(whenProbe(id, nid, l.when));
      }
      if (Array.isArray(n.npc)) for (const l of n.npc) if (l.when) fake.push(whenProbe(id, nid, l.when));
      fake.push({
        id: `${t.id}__${nid}`, title: 'x', text: asLine(n.npc), cast: { npc: {} }, auto: n.effects,
        choices: (n.options || []).map((o) => ({ label: o.label, when: o.when, why: o.why, check: o.check, effects: o.effects, result: asLine(o.reply), fail: o.fail ? { effects: o.fail.effects, result: asLine(o.fail.reply) } : undefined })),
      });
    }
    if (t.when) fake.push({ id: `${t.id}__when`, title: 'x', text: '', cast: { npc: {} }, trigger: { when: t.when }, choices: [] });
    if (t.npc?.when) fake.push({ id: `${t.id}__npc`, title: 'x', text: '', cast: { npc: { when: t.npc.when } }, choices: [] });
    errs.push(...validateStory(fake, file, builtIn, new Set()).map((e) => e.replace(/\[([a-z0-9_]+)__([a-z0-9_]+)\]/, '[$1 · $2]')));
  }
  return errs;
}
function whenProbe(id: string, nid: string, when: Record<string, unknown>): StoryEvent {
  return { id: `${id}__${nid}`, title: 'x', text: '', cast: { npc: {} }, choices: [{ label: 'x', when }] };
}
