// 文本覆盖与新增人物。规范见 docs/CONTENT_GUIDE.md「文本」「人物」
import type { ItemKey, LocId, OriginKey, SkillKey } from '../sim/types';
import { ITEMS } from './items';
import { LOCS } from './locations';
import { POOL, ORIGINS, MALE_NAMES, FEMALE_NAMES, PersonTemplate } from './people';
import { setLines, LINE_KEYS } from './lines';
import { NODES } from '../sim/goals';

export interface TextPack {
  items?: Record<string, { name?: string; desc?: string; unit?: string }>;
  locations?: Record<string, { name?: string; desc?: string }>;
  people?: Record<string, { name?: string; bio?: string; originText?: string; traits?: string[]; secrets?: Record<string, string> }>;
  origins?: Record<string, { label?: string; desc?: string; secret?: string }>;
  names?: { male?: string[]; female?: string[] };
  lines?: Record<string, string[] | { mode?: 'add' | 'replace'; lines: string[] }>;
}
export interface PeoplePack { people: PersonTemplate[] }

const SKINS = ['pale', 'warm', 'tan'];
const STYLES = ['short', 'receding', 'shaved', 'cap', 'tied', 'bun', 'wavy', 'long', 'bald'];
const ORIGIN_KEYS: OriginKey[] = ['deserter', 'cadre', 'nurse', 'worker', 'teacher', 'foreigner', 'singer', 'miner', 'mechanic', 'priest', 'trader', 'farmer', 'soldier', 'student'];
const SKILLS: SkillKey[] = ['medic', 'mechanic', 'cook', 'combat', 'stealth', 'persuade', 'forgery', 'scavenge'];
const PERS = ['power', 'morality', 'fear', 'attach', 'lust', 'social', 'agree', 'neuro'];
const GOALS = () => NODES.map((n) => n.id);
const COLOR = /^#[0-9a-fA-F]{6}$/;

export function validateText(d: TextPack, file: string): string[] {
  const e: string[] = [];
  for (const k of Object.keys(d.items || {})) if (!(k in ITEMS)) e.push(`${file}: 物品 ${k} 不存在`);
  for (const k of Object.keys(d.locations || {})) if (!(k in LOCS)) e.push(`${file}: 地点 ${k} 不存在`);
  for (const k of Object.keys(d.origins || {})) if (!ORIGINS.some((o) => o.key === k)) e.push(`${file}: 出身 ${k} 不存在（可选：${ORIGINS.map((o) => o.key).join('/')}）`);
  for (const [k, v] of Object.entries(d.people || {})) {
    const t = POOL.find((p) => p.key === k);
    if (!t) { e.push(`${file}: 人物 ${k} 不存在`); continue; }
    for (const s of Object.keys(v.secrets || {})) if (!t.secrets.some((x) => x.id === s)) e.push(`${file}: 人物 ${k} 没有秘密 ${s}`);
  }
  for (const [k, v] of Object.entries(d.lines || {})) {
    if (!(k in LINE_KEYS)) e.push(`${file}: 台词池 ${k} 不存在（可选：${Object.keys(LINE_KEYS).join(' / ')}）`);
    const arr = Array.isArray(v) ? v : v?.lines;
    if (!Array.isArray(arr) || arr.some((x) => typeof x !== 'string')) e.push(`${file}: 台词池 ${k} 必须是字符串数组`);
  }
  return e;
}

export function applyText(d: TextPack): number {
  let n = 0;
  for (const [k, v] of Object.entries(d.items || {})) { const it = ITEMS[k as ItemKey]; if (it) { Object.assign(it, pickStr(v, ['name', 'desc', 'unit'])); n++; } }
  for (const [k, v] of Object.entries(d.locations || {})) { const l = LOCS[k as LocId]; if (l) { Object.assign(l, pickStr(v, ['name', 'desc'])); n++; } }
  for (const [k, v] of Object.entries(d.origins || {})) { const o = ORIGINS.find((x) => x.key === k); if (o) { Object.assign(o, pickStr(v, ['label', 'desc', 'secret'])); n++; } }
  for (const [k, v] of Object.entries(d.people || {})) {
    const t = POOL.find((p) => p.key === k);
    if (!t) continue;
    Object.assign(t, pickStr(v, ['name', 'bio', 'originText']));
    if (Array.isArray(v.traits)) t.traits = v.traits.filter((x) => typeof x === 'string');
    for (const [sid, txt] of Object.entries(v.secrets || {})) { const s = t.secrets.find((x) => x.id === sid); if (s && typeof txt === 'string') s.text = txt; }
    n++;
  }
  if (d.names?.male?.length) { MALE_NAMES.length = 0; MALE_NAMES.push(...d.names.male); n++; }
  if (d.names?.female?.length) { FEMALE_NAMES.length = 0; FEMALE_NAMES.push(...d.names.female); n++; }
  for (const [k, v] of Object.entries(d.lines || {})) {
    const arr = Array.isArray(v) ? v : v?.lines;
    if (!(k in LINE_KEYS) || !Array.isArray(arr)) continue;
    setLines(k, arr.filter((x) => typeof x === 'string'), Array.isArray(v) ? 'add' : v.mode || 'add');
    n++;
  }
  return n;
}
function pickStr<T extends object>(v: T, keys: string[]) {
  const o: Record<string, string> = {};
  for (const k of keys) { const x = (v as Record<string, unknown>)[k]; if (typeof x === 'string') o[k] = x; }
  return o;
}

export function validatePeople(d: PeoplePack, file: string): string[] {
  const e: string[] = [];
  if (!d || !Array.isArray(d.people)) return [`${file}: 顶层必须是 { "people": [ ... ] }`];
  for (const t of d.people) {
    const id = t?.key || '?';
    const E = (m: string) => e.push(`${file} [${id}] ${m}`);
    if (!t || typeof t.key !== 'string' || !/^[a-z][a-z0-9_]*$/.test(t.key)) { E('key 必须是小写字母开头、只含 a-z 0-9 _'); continue; }
    if (t.key === 'player' || /^v\d+$/.test(t.key)) E('key 是保留字');
    if (POOL.some((p) => p.key === t.key)) E('和已有人物重名（要修改已有人物请用 text 文件）');
    if (!t.name) E('缺少 name');
    if (!(t.age >= 18 && t.age <= 90)) E('age 必须在 18~90 之间');
    if (t.gender !== 'm' && t.gender !== 'f') E('gender 只能是 m 或 f');
    if (t.orientation && !['straight', 'gay', 'bi'].includes(t.orientation)) E('orientation 只能是 straight/gay/bi');
    if (!ORIGIN_KEYS.includes(t.origin)) E(`origin 只能是 ${ORIGIN_KEYS.join('/')}`);
    if (!t.originText || !t.bio) E('缺少 originText 或 bio');
    const l = t.look as unknown as Record<string, unknown>;
    if (!l) E('缺少 look');
    else {
      if (!SKINS.includes(String(l.skin))) E(`look.skin 只能是 ${SKINS.join('/')}`);
      if (!STYLES.includes(String(l.style))) E(`look.style 只能是 ${STYLES.join('/')}`);
      for (const k of ['hair', 'coat', 'pants']) if (!COLOR.test(String(l[k]))) E(`look.${k} 必须是 #rrggbb 颜色`);
      for (const k of ['scarf', 'cap']) if (l[k] !== undefined && !COLOR.test(String(l[k]))) E(`look.${k} 必须是 #rrggbb 颜色`);
      if (typeof l.male !== 'boolean') E('look.male 必须是 true/false（体型）');
    }
    for (const [k, v] of Object.entries(t.skills || {})) if (!SKILLS.includes(k as SkillKey) || !(Number(v) >= 0 && Number(v) <= 100)) E(`skills.${k} 不对（技能：${SKILLS.join('/')}，0~100）`);
    for (const [k, v] of Object.entries(t.pers || {})) if (k === 'regime' ? !['loyal', 'cynic', 'rebel'].includes(String(v)) : !PERS.includes(k) || !(Number(v) >= 0 && Number(v) <= 100)) E(`pers.${k} 不对`);
    if (!Array.isArray(t.traits)) E('traits 必须是数组');
    if (!Array.isArray(t.secrets) || t.secrets.some((s) => !s.id || !s.text || typeof s.severity !== 'number')) E('secrets 必须是 [{id,text,severity}]');
    if (!Array.isArray(t.goals) || t.goals.some((g) => !GOALS().includes(g))) E(`goals 只能从 ${GOALS().join('/')} 里选`);
    for (const k of Object.keys(t.inv || {})) if (!(k in ITEMS)) E(`inv 物品 ${k} 不存在`);
  }
  return e;
}
export function addPeople(d: PeoplePack): number {
  let n = 0;
  for (const t of d.people) {
    if (POOL.some((p) => p.key === t.key)) continue;
    POOL.push({ ...t, skills: t.skills || {}, pers: t.pers || {}, traits: t.traits || [], secrets: t.secrets || [], goals: t.goals || [] });
    n++;
  }
  return n;
}
