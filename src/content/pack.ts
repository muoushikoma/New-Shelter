// 内容包加载：content/manifest.json 列出的剧情、文本、人物、图片。规范见 docs/CONTENT_GUIDE.md
import { registerStory, validateStory, StoryEvent, STORY } from './story';
import { applyText, TextPack, validateText, PeoplePack, addPeople, validatePeople } from './textpack';
import { EVENTS } from '../sim/events';
import { setImage } from '../art/overrides';
import { clearPortraitCache } from '../art/actors';

export interface ContentManifest { name?: string; version?: string; author?: string; events?: string[]; text?: string[]; people?: string[]; images?: string[] }

const stats = { loaded: false, events: 0, text: 0, people: 0, images: 0, errors: [] as string[] };
export const packStats = () => stats;

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export async function loadContentPacks(base = 'content/') {
  if (stats.loaded) return stats;
  stats.loaded = true;
  let m: ContentManifest;
  try { m = (await getJson(base + 'manifest.json')) as ContentManifest; } catch { return stats; }
  const err = (s: string) => { stats.errors.push(s); console.warn('[内容包]', s); };
  // 人物（先于文本，文本可以覆盖它们）
  for (const f of m.people || []) {
    try { const d = (await getJson(base + f)) as PeoplePack; const e = validatePeople(d, f); e.forEach(err); if (!e.length) stats.people += addPeople(d); } catch (e) { err(`${f}: 读取失败 ${(e as Error).message}`); }
  }
  for (const f of m.text || []) {
    try { const d = (await getJson(base + f)) as TextPack; const e = validateText(d, f); e.forEach(err); stats.text += applyText(d); } catch (e) { err(`${f}: 读取失败 ${(e as Error).message}`); }
  }
  // 剧情：先全部读进来再校验（允许互相跳转）
  const files: [string, StoryEvent[]][] = [];
  for (const f of m.events || []) {
    try { const d = await getJson(base + f); files.push([f, (Array.isArray(d) ? d : [d]) as StoryEvent[]]); } catch (e) { err(`${f}: 读取失败 ${(e as Error).message}`); }
  }
  const builtIn = new Set(Object.keys(EVENTS).filter((k) => !STORY[k]));
  const all = new Set([...builtIn, ...files.flatMap(([, l]) => l.map((e) => e?.id))]);
  for (const [f, list] of files) {
    const e = validateStory(list, f, builtIn, all);
    e.forEach(err);
    const bad = new Set(e.map((x) => x.match(/\[([^\]]+)\]/)?.[1]));
    for (const ev of list) if (ev?.id && !bad.has(ev.id)) { registerStory(ev); stats.events++; }
  }
  // 图片
  const waits: Promise<void>[] = [];
  for (const f of m.images || []) {
    try {
      const map = (await getJson(base + f)) as Record<string, string>;
      const dir = f.includes('/') ? f.slice(0, f.lastIndexOf('/') + 1) : '';
      for (const [k, v] of Object.entries(map)) {
        if (k.startsWith('_')) continue;
        const img = new Image();
        waits.push(new Promise((res) => { img.onload = () => { stats.images++; res(); }; img.onerror = () => { err(`${f}: 图片 ${k} → ${v} 加载失败`); res(); }; }));
        img.src = base + dir + v;
        setImage(k, img);
      }
    } catch (e) { err(`${f}: 读取失败 ${(e as Error).message}`); }
  }
  await Promise.all(waits);
  clearPortraitCache();
  return stats;
}
