// 成人内容接口：加载 content/adult/ 下的 JSON，按上下文匹配场景。格式见 docs/ADULT_CONTENT_INTERFACE.md
import type { World, ItemKey, Person } from '../sim/types';
import { P, rel, roomOf, day } from '../sim/util';
import { ITEMS } from './items';
import { powerOf } from '../sim/intimacy';

export interface ScenePage { speaker: 'initiator' | 'partner' | 'witness' | null; text: string }
export interface SceneDef {
  id: string; hook: string; when?: Record<string, unknown>; weight?: number; once?: boolean; tags?: string[];
  cg?: string; pages?: ScenePage[]; lines?: string[]; aftertaste?: string[];
}
interface Manifest { name?: string; version?: string; files: string[] }

let loaded = false;
let scenes: SceneDef[] = [];
let loadError = '';
const seenOnce = new Set<string>();

export async function loadAdultContent(base = 'content/adult/'): Promise<{ count: number; error: string }> {
  if (loaded) return { count: scenes.length, error: loadError };
  loaded = true;
  try {
    const m = await fetch(base + 'manifest.json').then((r) => { if (!r.ok) throw new Error('没有找到 manifest.json'); return r.json() as Promise<Manifest>; });
    for (const f of m.files || []) {
      try {
        const data = await fetch(base + f).then((r) => r.json());
        const arr: SceneDef[] = Array.isArray(data) ? data : [data];
        for (const s of arr) if (s && s.id && s.hook && !isPlaceholderOnly(s)) scenes.push(s);
      } catch (e) { loadError += `${f}: ${(e as Error).message}\n`; }
    }
  } catch (e) { loadError = (e as Error).message; }
  return { count: scenes.length, error: loadError };
}
export const adultStats = () => ({ count: scenes.length, error: loadError, loaded });

// 只有占位符的条目不加载（避免玩家看到【……】）
function isPlaceholderOnly(s: SceneDef) {
  const texts = [...(s.pages || []).map((p) => p.text), ...(s.lines || [])];
  return texts.length > 0 && texts.every((t) => /^\s*【.*】\s*$/.test(t));
}

export interface SceneContext {
  hook: string;
  initiator: Record<string, unknown>; partner: Record<string, unknown>;
  relation: Record<string, unknown>; motive: string[]; consent: string; powerGap: number;
  isLeader: { initiator: boolean; partner: boolean }; deal: { item: string; qty: number } | null;
  location: string; privacy: string; temperature: number; timeOfDay: string; day: number; warPhase: number; witnesses: unknown[]; shelterRegime: string;
}

function personCtx(w: World, p: Person | undefined, other: Person | undefined, ext?: string): Record<string, unknown> {
  if (!p) return { id: 'external', name: ext || '那个人', age: 35, gender: 'male', body: 'average', origin: 'soldier', traits: [], mood: 'calm', health: 'healthy', hygiene: 'dirty', experience: 'none' };
  const r = other ? rel(w, p.id, other.id) : null;
  const mood = p.needs.stress > 75 ? 'desperate' : p.needs.stress > 55 ? 'anxious' : p.conds.some((c) => c.type === 'grief') ? 'grieving' : p.conds.some((c) => c.type === 'trauma') ? 'numb' : p.needs.desire > 70 ? 'aroused' : 'calm';
  return {
    id: p.id, name: p.isPlayer ? p.name : p.name, age: p.age, gender: p.gender === 'm' ? 'male' : 'female',
    body: p.look.heavy ? 'sturdy' : 'average', origin: p.origin, traits: p.traits, mood,
    health: p.health < 40 ? 'sick' : p.conds.some((c) => c.type === 'wound') ? 'injured' : p.health < 70 ? 'weak' : 'healthy',
    hygiene: p.needs.hygiene < 20 ? 'filthy' : p.needs.hygiene < 50 ? 'dirty' : 'clean',
    experience: !r ? 'none' : r.times === 0 ? 'none' : r.times < 4 ? 'some' : 'much', isPlayer: p.isPlayer,
  };
}

export function buildContext(w: World, ctx: Record<string, unknown>): SceneContext {
  const a = P(w, ctx.initiator as string), b = P(w, ctx.partner as string);
  const r = a && b ? rel(w, b.id, a.id) : null;
  const deal = ctx.deal as [ItemKey, number] | null;
  const loc = (ctx.location as string) || (a ? roomOf(a) : 'outside');
  const priv = loc === 'lower' || loc === 'archive' ? 'locked' : loc === 'dorm' ? 'curtain' : w.shelter.rooms[loc]?.lit === false ? 'dark' : 'none';
  const h = Math.floor(((w.t + 480) % 1440) / 60);
  return {
    hook: ctx.hook as string,
    initiator: personCtx(w, a, b, ctx.external as string), partner: personCtx(w, b, a),
    relation: r ? { state: r.state, trust: Math.round(r.trust), affection: Math.round(r.affection), fear: Math.round(r.fear), desire: Math.round(r.desire), resentment: Math.round(r.resentment), times: r.times } : { state: 'stranger', trust: 0, affection: 0, fear: 30, desire: 0, resentment: 0, times: 0 },
    motive: (ctx.motive as string[]) || [], consent: (ctx.consent as string) || 'willing',
    powerGap: a && b ? Math.round(Math.max(-100, Math.min(100, powerOf(w, a) - powerOf(w, b)))) : 40,
    isLeader: { initiator: !!a && w.politics.leader === a.id, partner: !!b && w.politics.leader === b.id },
    deal: deal ? { item: ITEMS[deal[0]].name, qty: deal[1] } : null,
    location: loc, privacy: priv, temperature: Math.round(w.shelter.rooms[loc]?.temp ?? w.shelter.tempOut),
    timeOfDay: h < 6 || h >= 22 ? 'night' : h < 9 ? 'dawn' : h < 17 ? 'day' : 'dusk', day: day(w), warPhase: w.war.phase,
    witnesses: ctx.witness ? [personCtx(w, P(w, 'player'), undefined)] : [],
    shelterRegime: !w.politics.leader ? (w.politics.meetings ? 'commune' : 'anarchy') : w.politics.rules.decision === 'leader' ? 'dictatorship' : 'oligarchy',
  };
}

function getPath(o: unknown, path: string): unknown {
  let cur: unknown = o;
  for (const k of path.split('.')) { if (cur == null) return undefined; cur = (cur as Record<string, unknown>)[k]; }
  return cur;
}
function matches(s: SceneDef, c: SceneContext, w: World): boolean {
  if (s.hook !== c.hook) return false;
  if (s.once && seenOnce.has(s.id)) return false;
  const tags = s.tags || [];
  if (!w.settings.coercion && (tags.includes('coercion') || c.consent === 'coerced')) { if (tags.includes('coercion')) return false; }
  for (const [k, v] of Object.entries(s.when || {})) {
    const m = k.match(/^(.*)\.(any|in|lt|gt|lte|gte|between|exists)$/);
    if (!m) { if (getPath(c, k) !== v) return false; continue; }
    const [, path, op] = m;
    const val = getPath(c, path);
    switch (op) {
      case 'any': if (!Array.isArray(val) || !(v as unknown[]).some((x) => (val as unknown[]).includes(x))) return false; break;
      case 'in': if (!(v as unknown[]).includes(val)) return false; break;
      case 'lt': if (!(Number(val) < Number(v))) return false; break;
      case 'gt': if (!(Number(val) > Number(v))) return false; break;
      case 'lte': if (!(Number(val) <= Number(v))) return false; break;
      case 'gte': if (!(Number(val) >= Number(v))) return false; break;
      case 'between': { const [a, b] = v as number[]; if (!(Number(val) >= a && Number(val) <= b)) return false; break; }
      case 'exists': if (!!val !== !!v) return false; break;
    }
  }
  return true;
}

export function findScene(w: World, c: SceneContext): SceneDef | null {
  if (!w.settings.adult) return null;
  const cands = scenes.filter((s) => matches(s, c, w));
  if (!cands.length) return null;
  const tot = cands.reduce((s, x) => s + (x.weight || 10), 0);
  let r = Math.random() * tot;
  for (const s of cands) { r -= s.weight || 10; if (r <= 0) { if (s.once) seenOnce.add(s.id); return s; } }
  return cands[0];
}

// 文本变量替换
export function fill(text: string, c: SceneContext): string {
  return text
    .replace(/\{\?([a-zA-Z.]+)\.(gt|lt|eq):([^ ?]+)\s*\?\s*([^|}]*)\|([^}]*)\}/g, (_, p, op, v, a, b) => { const x = getPath(c, p); const ok = op === 'gt' ? Number(x) > Number(v) : op === 'lt' ? Number(x) < Number(v) : String(x) === v; return (ok ? a : b).trim(); })
    .replace(/\{([^{}|]+)\|([^{}|]+)\|([^{}|:]+):(initiator|partner)\}/g, (_, m, f, n, who) => { const g = getPath(c, who + '.gender'); return g === 'male' ? m : g === 'female' ? f : n; })
    .replace(/\{([a-zA-Z.]+)\}/g, (_, p) => { const v = getPath(c, p); return v == null ? '' : String(v); });
}
