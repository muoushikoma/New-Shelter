// 标题、新游戏、设置、结局；存档
import type { App } from './app';
import type { World, OriginKey, Settings } from '../sim/types';
import { newWorld } from '../sim/world';
import { ORIGINS, MALE_NAMES, FEMALE_NAMES } from '../content/people';
import { UI_W, UI_H } from '../engine/ui';
import { portraitCanvas, headCanvas } from '../art/actors';
import { day, P, player } from '../sim/util';
import { loadAdultContent, adultStats } from '../content/adult';
import { Buf } from '../engine/pixel';
import { drawBackground } from '../art/shelter';
import { getImage } from '../art/overrides';
import { packStats } from '../content/pack';

const SAVE_PREFIX = 'shelter.save.';
export function saveGame(w: World, slot: string) {
  try { localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(w)); localStorage.setItem(SAVE_PREFIX + slot + '.meta', JSON.stringify({ day: day(w), name: player(w).name, t: Date.now() })); } catch (e) { console.warn('存档失败', e); }
}
export function loadGame(slot: string): World | null {
  try { const s = localStorage.getItem(SAVE_PREFIX + slot); return s ? (JSON.parse(s) as World) : null; } catch { return null; }
}
export function listSaves(): Record<string, { day: number; name: string; t: number } | null> {
  const out: Record<string, { day: number; name: string; t: number } | null> = {};
  for (const s of ['1', '2', '3', 'auto']) { try { const m = localStorage.getItem(SAVE_PREFIX + s + '.meta'); out[s] = m ? JSON.parse(m) : null; } catch { out[s] = null; } }
  return out;
}
export function autosave(w: World) { saveGame(w, 'auto'); }
export function saveDelete() { /* 结局后保留自动存档以便回看 */ }

let titleBg: HTMLCanvasElement | null = null;
function titleBackground(): CanvasImageSource {
  const custom = getImage('ui.title');
  if (custom) return custom;
  if (titleBg) return titleBg;
  const b = new Buf(480, 270);
  drawBackground(b, { power: true, archiveOpen: false, collapse: 0, drain: false, farmBuilt: false, farm: 0, cans: 14, night: true, dusk: false, phase: 2, damage: 20, filter: false, radioFixed: false, water: 60, fuelBarrels: 2, meds: 2, occupied: false });
  b.clearLight(0.22);
  b.addLight(228, 92, 70, [255, 208, 138], 1.3); b.addLight(170, 158, 50, [255, 106, 42], 1.0); b.addLight(342, 19, 240, [232, 240, 255], 1.2, [0, 0, 480, 66], [Math.PI * 0.9, 0.05]);
  for (let y = 0; y < 66; y++) for (let x = 0; x < 480; x++) { const i = y * 480 + x; b.light[i] = 0.55; }
  titleBg = b.toCanvas({ levels: 8, tint: [0.42, 0.5, 0.78] });
  return titleBg;
}

export function drawTitle(app: App) {
  const ui = app.ui, c = app.ctx;
  c.imageSmoothingEnabled = false;
  c.drawImage(titleBackground(), 0, 0, 1920, 1080);
  ui.rect(0, 0, UI_W, UI_H, 'rgba(4,4,6,0.45)');
  // 标题：放大的像素字
  const big = document.createElement('canvas'); big.width = 120; big.height = 30;
  const g = big.getContext('2d')!; g.font = '24px "Fusion Pixel", "WenQuanYi Zen Hei Sharp", monospace'; g.textBaseline = 'top'; g.fillStyle = '#e8d8b0'; g.fillText('避难所', 2, 2);
  const id = g.getImageData(0, 0, 120, 30); for (let i = 3; i < id.data.length; i += 4) id.data[i] = id.data[i] > 100 ? 255 : 0; g.putImageData(id, 0, 0);
  ui.ctx.imageSmoothingEnabled = false;
  ui.ctx.globalAlpha = 0.6; ui.ctx.drawImage(big, 64, 84, 360, 90); ui.ctx.globalAlpha = 1;
  ui.ctx.drawImage(big, 60, 80, 360, 90);
  ui.text('NEW SHELTER', 66, 172, '#8a7a60');
  ui.text('战争爆发的那一夜，几个互不相识的人逃进了边境上一座废弃的民防避难所。', 66, 200, '#c8b890');
  ui.text('门关上以后，这里就成了一个新的国家。', 66, 218, '#c8b890');
  const saves = listSaves();
  let y = 270;
  const btn = (label: string, fn: () => void, opt = {}) => { ui.button(66, y, 220, 26, label, fn, opt); y += 34; };
  if (saves.auto) btn(`继续（第 ${saves.auto.day} 天 · ${saves.auto.name}）`, () => { const w = loadGame('auto'); if (w) { app.w = w; app.screen = 'play'; app.modals = []; if (w.settings.adult) loadAdultContent(); } }, { hot: true });
  btn('新的一局', () => { app.screen = 'newgame'; app.newGame = new NewGameState(); }, { hot: !saves.auto });
  for (const s of ['1', '2', '3']) if (saves[s]) btn(`读取存档 ${s}（第 ${saves[s]!.day} 天 · ${saves[s]!.name}）`, () => { const w = loadGame(s); if (w) { app.w = w; app.screen = 'play'; app.modals = []; } });
  btn('设置', () => { app.screen = 'settings'; });
  ui.text('18+ · 含成人主题、暴力与政治压迫的描写。成人内容默认关闭。', 66, UI_H - 40, '#6a6058');
  ui.text('像素字体：Fusion Pixel（OFL）', 66, UI_H - 22, '#4a4840');
  const ps = packStats();
  if (ps.loaded && (ps.events + ps.text + ps.people + ps.images || ps.errors.length)) ui.text(`内容包：剧情 ${ps.events} · 对话 ${ps.dialogue} · 文本 ${ps.text} · 人物 ${ps.people} · 图片 ${ps.images}${ps.errors.length ? ` · ${ps.errors.length} 个错误（按 F12 看控制台）` : ''}`, UI_W - 16, UI_H - 22, ps.errors.length ? '#c87060' : '#6a6858', { align: 'right' });
}

export class NewGameState {
  origin: OriginKey = 'deserter'; gender: 'm' | 'f' = 'm'; orientation: 'straight' | 'gay' | 'bi' = 'straight';
  name = MALE_NAMES[Math.floor(Math.random() * MALE_NAMES.length)];
  settings: Settings = { adult: false, coercion: false, pregnancy: true, speed: 1, autoPause: true, autoNeeds: true };
  seed = Math.floor(Math.random() * 1e9);
  input: HTMLInputElement | null = null;
}

export function drawNewGame(app: App) {
  const ui = app.ui, ng = app.newGame;
  app.ctx.drawImage(titleBackground(), 0, 0, 1920, 1080);
  ui.rect(0, 0, UI_W, UI_H, 'rgba(4,4,6,0.75)');
  ui.panel(30, 20, 900, 500, { title: '你是谁' });
  // 出身
  ui.text('出身', 50, 48, '#e8c890');
  ORIGINS.forEach((o, i) => {
    const x = 50 + (i % 3) * 290, y = 66 + Math.floor(i / 3) * 96;
    const on = ng.origin === o.key;
    ui.rect(x, y, 280, 88, on ? '#5a3a24' : '#1e2126'); ui.frame(x, y, 280, 88, on ? '#e8a060' : '#3a3e44');
    ui.text(o.label, x + 10, y + 6, on ? '#f0d8a0' : '#d8d0c0');
    ui.para(o.desc, x + 10, y + 24, 260, '#a8a098', 15);
    ui.region(x, y, 280, 88, () => { ng.origin = o.key; });
  });
  let y = 270;
  ui.text('性别', 50, y, '#e8c890');
  ui.button(110, y - 3, 60, 20, '男', () => { ng.gender = 'm'; if (FEMALE_NAMES.includes(ng.name)) ng.name = MALE_NAMES[0]; }, { hot: ng.gender === 'm' });
  ui.button(176, y - 3, 60, 20, '女', () => { ng.gender = 'f'; if (MALE_NAMES.includes(ng.name) && !FEMALE_NAMES.includes(ng.name)) ng.name = FEMALE_NAMES[1]; }, { hot: ng.gender === 'f' });
  ui.text('喜欢', 270, y, '#e8c890');
  ([['straight', '异性'], ['gay', '同性'], ['bi', '都可以']] as const).forEach(([k, l], i) => ui.button(320 + i * 70, y - 3, 64, 20, l, () => { ng.orientation = k; }, { hot: ng.orientation === k }));
  y += 32;
  ui.text('名字', 50, y, '#e8c890');
  ui.rect(110, y - 3, 160, 20, '#0a0b0d'); ui.frame(110, y - 3, 160, 20, '#5a5e64'); ui.text(ng.name, 118, y, '#f0e0c0');
  ui.region(110, y - 3, 160, 20, () => { const n = prompt('名字（1~4 个字）', ng.name); if (n && n.trim()) ng.name = n.trim().slice(0, 6); });
  ui.button(278, y - 3, 60, 20, '随机', () => { const pool = ng.gender === 'm' ? MALE_NAMES : FEMALE_NAMES; ng.name = pool[Math.floor(Math.random() * pool.length)]; });
  y += 36;
  ui.text('内容设置', 50, y, '#e8c890'); y += 22;
  const toggle = (label: string, v: boolean, fn: () => void, tip: string) => { ui.button(50, y - 3, 280, 20, `${v ? '☑' : '☐'} ${label}`, fn, { tip }); y += 26; };
  toggle('成人内容（需要内容包）', ng.settings.adult, () => { ng.settings.adult = !ng.settings.adult; if (ng.settings.adult) loadAdultContent(); }, '关闭时，亲密关系以省略的方式呈现，系统后果照常发生。内容包放在 content/adult/ 目录。');
  toggle('胁迫主题', ng.settings.coercion, () => { ng.settings.coercion = !ng.settings.coercion; }, '关闭时，任何角色都不会使用胁迫类行动。');
  toggle('生育', ng.settings.pregnancy, () => { ng.settings.pregnancy = !ng.settings.pregnancy; }, '');
  toggle('自动照顾自己（推荐）', ng.settings.autoNeeds !== false, () => { ng.settings.autoNeeds = ng.settings.autoNeeds === false; }, '空闲时自己去喝水、吃饭、睡觉、取暖。');
  if (ng.settings.adult) { const st = adultStats(); ui.text(st.loaded ? `已加载 ${st.count} 条成人内容${st.error ? '（有错误）' : ''}` : '加载中……', 340, y - 102, st.count ? '#a0d890' : '#a08070'); }
  ui.text(`种子 ${ng.seed}`, 50, 490, '#5a5e64');
  ui.button(130, 487, 60, 18, '换一个', () => { ng.seed = Math.floor(Math.random() * 1e9); });
  // 右下：说明
  ui.para('每一局的同伴、他们的性格与秘密、战争的节奏都是随机的。\n\n没有主线。唯一的目标是活下去——其他的，由你决定。', 560, 300, 340, '#a8a098', 18);
  ui.button(760, 480, 150, 26, '走进避难所', () => {
    const w = newWorld({ seed: ng.seed, name: ng.name, gender: ng.gender, origin: ng.origin, orientation: ng.orientation, settings: { ...ng.settings } });
    app.w = w; app.screen = 'play'; app.sel = null; app.modals = []; app.speed = 1;
  }, { hot: true });
  ui.button(600, 480, 140, 26, '返回', () => { app.screen = 'title'; });
}

export function drawSettings(app: App) {
  const ui = app.ui;
  app.ctx.drawImage(titleBackground(), 0, 0, 1920, 1080);
  ui.rect(0, 0, UI_W, UI_H, 'rgba(4,4,6,0.75)');
  ui.panel(280, 90, 400, 364, { title: '设置' });
  let y = 124;
  ui.button(320, y, 320, 24, `音效：${app.audio.on ? '开' : '关'}`, () => app.audio.toggle()); y += 32;
  const mu = app.audio.music;
  ui.button(320, y, 200, 24, `音乐：${mu.on ? '开' : '关'}`, () => { mu.toggle(); app.audio.unlock(); });
  ui.button(528, y, 112, 24, `音量 ${Math.round(mu.volume * 10)}`, () => mu.setVolume(mu.volume >= 0.95 ? 0.2 : mu.volume + 0.2)); y += 32;
  ui.button(320, y, 320, 24, `字体：${ui.fontMode === 'clear' ? '清晰（系统黑体）' : '像素'}`, () => ui.setFontMode(ui.fontMode === 'clear' ? 'pixel' : 'clear')); y += 32;
  ui.button(320, y, 320, 24, '全屏（F11 或点这里）', () => { document.documentElement.requestFullscreen?.(); }); y += 32;
  ui.button(320, y, 320, 24, '清除所有存档', () => { if (confirm('确定删除所有存档？')) for (const s of ['1', '2', '3', 'auto']) { localStorage.removeItem('shelter.save.' + s); localStorage.removeItem('shelter.save.' + s + '.meta'); } }); y += 32;
  ui.para('成人内容、胁迫主题等在开始新的一局时设置，游戏中也可以从菜单修改。', 320, y + 6, 320, '#8a9098', 16);
  ui.button(320, 418, 320, 24, '返回', () => { app.screen = 'title'; }, { hot: true });
}

export function drawEnding(app: App) {
  const ui = app.ui, w = app.w!;
  const e = w.ending!;
  app.ctx.drawImage(titleBackground(), 0, 0, 1920, 1080);
  ui.rect(0, 0, UI_W, UI_H, 'rgba(4,4,6,0.82)');
  const me = player(w);
  ui.rect(40, 30, 84, 100, '#07080a'); ui.image(portraitCanvas(me.id, { ...me.look, age: me.age } as never, { dead: !me.alive }), 42, 32, 80, 96);
  // 标题
  const big = document.createElement('canvas'); big.width = 240; big.height = 20;
  const g = big.getContext('2d')!; g.font = '12px "Fusion Pixel", monospace'; g.textBaseline = 'top'; g.fillStyle = '#f0d8a0'; g.fillText(e.title, 1, 2);
  const id = g.getImageData(0, 0, 240, 20); for (let i = 3; i < id.data.length; i += 4) id.data[i] = id.data[i] > 100 ? 255 : 0; g.putImageData(id, 0, 0);
  ui.ctx.drawImage(big, 140, 30, 720, 60);
  ui.para(e.subtitle, 140, 92, 760, '#d8c8a8', 17);
  let y = 150;
  const row = (k: string, v: string) => { ui.text(k, 40, y, '#8a8070'); y = ui.para(v, 140, y, 780, '#e8e0d0', 16) + 2; };
  row('你在哪里', e.where); row('你是谁', e.who); row('和谁', e.withWhom); row('避难所', e.shelter); row('外面', e.world); row('你靠的是', e.how);
  y += 6;
  for (const l of e.lines) y = ui.para(l, 40, y, 880, '#c8c0b0', 16) + 2;
  y += 8;
  ui.text('后来', 40, y, '#e8c890'); y += 18;
  for (const ep of e.epilogues) {
    const p = P(w, ep.id);
    if (p) ui.image(headCanvas(p.id, { ...p.look, age: p.age } as never, !p.alive), 40, y - 2, 16, 16);
    y = ui.para(ep.text, 62, y, 860, '#a8a098', 16) + 2;
    if (y > UI_H - 40) break;
  }
  ui.button(UI_W - 330, UI_H - 34, 150, 24, '新的一局', () => { app.screen = 'newgame'; app.newGame = new NewGameState(); app.w = null; }, { hot: true });
  ui.button(UI_W - 170, UI_H - 34, 150, 24, '回到标题', () => { app.screen = 'title'; app.w = null; });
}
