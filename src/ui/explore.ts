// 搜刮场景的界面：点地面走过去，点家具 / 门 / 楼梯做事；危险值满了会有人进来，打着手电一间间找
import type { App, Modal } from './app';
import { UI_W, UI_H } from '../engine/ui';
import { Buf, hex } from '../engine/pixel';
import type { ItemKey, Person, World } from '../sim/types';
import { P, player, clock, cnt, isDark, hasCond } from '../sim/util';
import { stepMinute, nextEvent } from '../sim/tick';
import { makeEncounter, resolveEncounter } from '../sim/war';
import {
  Explore, XScene, sceneOf, exploreStep, orderMove, orderAct, actionsFor, afterEncounter, finishExplore, dropItem, weightOf,
  surfaceY, roomAt, SX0, SX1, ROOM_H, CONT_NAME, CONT_W, SEC_PER_MIN, XEnemy,
} from '../sim/explore';
import { drawScene } from '../art/explore';
import { person } from '../art/actors';
import { LOCS } from '../content/locations';
import { ITEMS } from '../content/items';
import { TextModal } from './modals';

const WW = 480, WH = 270;
type Target = { on: 'cont' | 'gate' | 'stair' | 'exit'; id: number; label: string; x: number; y: number; w: number; h: number };
const ENEMY_LOOKS = [
  { skin: 'warm', hair: '#2a2522', style: 'cap', coat: '#4e5639', pants: '#3a3a30', male: true, cap: '#3e4630', stubble: true },
  { skin: 'pale', hair: '#3a3028', style: 'cap', coat: '#4a5236', pants: '#34342c', male: true, cap: '#3a422c' },
  { skin: 'tan', hair: '#1c1a1f', style: 'shaved', coat: '#565a3e', pants: '#3a3a30', male: true, scar: true },
] as const;
const SCAV_LOOKS = [
  { skin: 'warm', hair: '#3a3028', style: 'short', coat: '#4a4038', pants: '#2e2a26', male: true, scarf: '#5a3a2a', stubble: true, smudge: true },
  { skin: 'pale', hair: '#5a4a40', style: 'long', coat: '#3e4a5a', pants: '#2a2a30', male: false, smudge: true },
] as const;

export class ExploreModal implements Modal {
  pausesSim = true;
  bg = new Buf(WW, WH); frame = new Buf(WW, WH);
  cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData;
  bgKey = ''; lightBase = new Buf(WW, WH); lightKey = '';
  last = performance.now(); t = 0;
  menu: { x: number; y: number; t: Target } | null = null;
  bagOpen = false;
  encounter: { text: string; options: { id: string; label: string }[]; result: string | null } | null = null;
  constructor(app: App, public onDone: (summary: string) => void) {
    this.cv = document.createElement('canvas'); this.cv.width = WW; this.cv.height = WH;
    this.ctx = this.cv.getContext('2d')!; this.img = this.ctx.createImageData(WW, WH);
    const w = app.w!;
    if (!w.facts.exploreTut) {
      w.facts.exploreTut = true;
      app.push(new TextModal('点地面：走过去。\n点家具、门、楼梯：翻找、撬锁、清理瓦砾。翻东西要花时间，背包有重量上限。\n\n待得越久、弄出的动静越大（撬锁、清理瓦砾），右上角的「危险」涨得越快。满了就会有人进楼来，打着手电一间一间搜。\n\n听到动静：躲进衣柜、床底、长椅下、柜台后面，等他们走；或者回到入口撤离。被手电照到就躲不掉了。\n\n回到入口点「撤离」，背包里的东西就是这趟的收获。'));
    }
  }
  get ex(): Explore | undefined { return this.w?.trip?.explore; }
  w: World | null = null;

  close(app: App, summary: string) {
    const i = app.modals.indexOf(this); if (i >= 0) app.modals.splice(i, 1);
    app.ui.hits = [];
    this.onDone(summary);
  }

  // ---------- 推进 ----------
  update(app: App) {
    const w = app.w!; this.w = w;
    const now = performance.now(); const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const ex = this.ex;
    if (!ex) return;
    if (app.top() !== this || this.encounter || this.bagOpen) return; // 有别的窗口在上面时暂停
    this.t += dt;
    const ev = exploreStep(w, ex, dt);
    for (let i = 0; i < ev.minutes && !w.ending; i++) {
      stepMinute(w);
      const v = nextEvent(w);
      if (v) { app.openEvent(v); break; }
    }
    if (w.ending) { app.modals = []; return; }
    if (ev.spotted) { const e = makeEncounter(w, ev.spotted); this.encounter = { text: (ev.spotted === 'patrol' ? '手电筒的光照到了你的脸上。\n\n' : '有人看见了你。\n\n') + e.text, options: e.options, result: null }; w.trip!.encounter = e; }
    if (ex.done) this.close(app, ex.log[ex.log.length - 1] || '');
  }

  // ---------- 画面 ----------
  render(app: App) {
    const w = app.w!, ex = this.ex!, sc = sceneOf(w, ex);
    const night = isDark(w);
    const key = JSON.stringify([night, sc.gates.map((g) => g.state), sc.stairs.map((s) => s.state), sc.conts.map((c) => [c.searched, c.locked, c.kind === 'pile'])]);
    if (key !== this.bgKey) { drawScene(this.bg, sc, { night }); this.bgKey = key; }
    if (this.lightKey !== String(night)) { this.lightKey = String(night); this.bakeLight(sc, night); }
    const f = this.frame;
    f.copyFrom(this.bg); f.copyLight(this.lightBase);
    // 人
    const me = player(w);
    const mates = (w.trip?.members || []).map((id) => P(w, id)).filter((p): p is Person => !!p && !p.isPlayer && p.alive);
    const pos = (x: number, floor: number, climb: { to: number; t: number } | null) => {
      if (!climb) return { x, y: surfaceY(sc, floor) - 2 };
      const a = surfaceY(sc, floor), b = surfaceY(sc, climb.to);
      return { x, y: a + (b - a) * Math.min(1, climb.t / 1.1) - 2 };
    };
    const walking = ex.path.length > 0 && !ex.climb;
    const frameN = Math.floor(this.t * 8) % 4;
    mates.forEach((m, i) => {
      const off = (i + 1) * 9 * -ex.facing;
      const p = pos(ex.x + off, ex.floor, ex.climb);
      if (ex.hidden !== null) return;
      person(f, Math.round(p.x), Math.round(p.y), m.look, walking ? 'walk' : ex.act ? 'crouch' : 'stand', ex.facing, walking ? (frameN + 2) % 4 : 0);
    });
    const pp = pos(ex.x, ex.floor, ex.climb);
    if (ex.hidden === null) person(f, Math.round(pp.x), Math.round(pp.y), me.look, walking ? 'walk' : ex.act ? 'work' : 'stand', ex.facing, walking ? frameN : Math.floor(this.t * 6));
    for (const e of ex.enemies) {
      const p = pos(e.x, e.floor, e.climb);
      const look = (e.kind === 'patrol' ? ENEMY_LOOKS : SCAV_LOOKS)[e.look % (e.kind === 'patrol' ? ENEMY_LOOKS.length : SCAV_LOOKS.length)];
      person(f, Math.round(p.x), Math.round(p.y), look as never, e.path.length && !e.climb ? 'walk' : 'stand', e.facing, frameN);
    }
    // 动态光：你手里的灯、敌人的手电
    const lamp = cnt(me.inv, 'candle') > 0 ? 58 : 40;
    f.addLight(pp.x + ex.facing * 3, pp.y - 12, ex.hidden !== null ? 14 : lamp, [255, 196, 120], night ? 1.05 : 0.6, clipFloor(sc, ex.floor));
    for (const e of ex.enemies) {
      const p = pos(e.x, e.floor, e.climb);
      f.addLight(p.x + e.facing * 4, p.y - 14, 110, [230, 236, 255], 1.3, clipFloor(sc, e.floor), [e.facing > 0 ? 0.1 : Math.PI - 0.1, 0.32]);
      f.addLight(p.x, p.y - 12, 16, [200, 210, 230], 0.5);
    }
    f.shadeInto(this.img, 8, night ? [0.42, 0.5, 0.78] : [0.55, 0.6, 0.72]);
    this.ctx.putImageData(this.img, 0, 0);
    app.ctx.imageSmoothingEnabled = false;
    app.ctx.drawImage(this.cv, 0, 0, 1920, 1080);
  }
  bakeLight(sc: XScene, night: boolean) {
    const L = this.lightBase;
    L.clearLight(night ? 0.08 : 0.27);
    for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) { const inside = x >= SX0 - 6 && x < SX1 + 6 && y >= surfaceY(sc, 0) - ROOM_H - 6 && y < surfaceY(sc, sc.floors - 1) + 8; if (!inside) L.light[y * WW + x] = night ? 0.5 : 1.05; }
    for (const win of sc.windows) L.addLight(win.x, surfaceY(sc, win.floor) - ROOM_H + 18, night ? 34 : 70, night ? [120, 140, 190] : [200, 210, 225], night ? 0.35 : 0.9, clipFloor(sc, win.floor));
    const ey = surfaceY(sc, sc.entrance.floor);
    L.addLight(SX0, ey - 12, 40, night ? [120, 140, 190] : [210, 215, 225], night ? 0.5 : 0.9, clipFloor(sc, sc.entrance.floor));
  }

  // 鼠标下的东西（世界坐标）
  targetAt(sc: XScene, wx: number, wy: number): Target | null {
    for (const c of sc.conts) {
      const sy = surfaceY(sc, c.floor), w = CONT_W[c.kind] + 4, h = c.kind === 'corpse' || c.kind === 'pile' ? 10 : 32;
      if (wx >= c.x - w / 2 && wx <= c.x + w / 2 && wy >= sy - h && wy <= sy + 2) return { on: 'cont', id: c.id, label: CONT_NAME[c.kind] + (c.locked ? '（锁着）' : c.searched ? (Object.values(c.loot).some((v) => v) ? '（还有东西）' : '（翻过了）') : ''), x: c.x, y: sy, w, h };
    }
    for (const g of sc.gates) if (g.state !== 'open') { const sy = surfaceY(sc, g.floor); if (Math.abs(wx - g.x) < 8 && wy > sy - 30 && wy < sy + 2) return { on: 'gate', id: g.id, label: g.state === 'locked' ? '锁着的门' : '堵住门口的瓦砾', x: g.x, y: sy, w: 14, h: 30 }; }
    for (const s of sc.stairs) if (s.state !== 'open') { const sy = surfaceY(sc, s.b); if (Math.abs(wx - s.x) < 10 && wy > sy - 22 && wy < sy + 2) return { on: 'stair', id: s.id, label: '楼梯被瓦砾堵住了', x: s.x, y: sy, w: 20, h: 22 }; }
    const ey = surfaceY(sc, sc.entrance.floor);
    if (wx < SX0 + 6 && wx > SX0 - 12 && wy > ey - 30 && wy < ey + 2) return { on: 'exit', id: 0, label: '出口', x: SX0, y: ey, w: 14, h: 30 };
    return null;
  }

  draw(app: App) {
    this.update(app);
    const w = app.w!, ex = this.ex;
    if (!ex || !w.trip) { this.close(app, ''); return; }
    const sc = sceneOf(w, ex), ui = app.ui, me = player(w);
    ui.ctx.clearRect(0, 0, UI_W, UI_H); // 盖住避难所的界面
    this.render(app);
    ui.layer++;
    const wx = ui.mx / 2, wy = ui.my / 2;
    // 点击：地面走路（最底层）
    ui.region(0, 40, UI_W, UI_H - 40, () => {
      if (this.encounter || this.bagOpen) return;
      if (this.menu) { this.menu = null; return; }
      const t = this.targetAt(sc, wx, wy);
      if (t) { this.menu = { x: ui.mx, y: ui.my, t }; return; }
      // 点在哪一层
      let fl = -1; for (let f = 0; f < sc.floors; f++) { const s = surfaceY(sc, f); if (wy >= s - ROOM_H - 4 && wy <= s + 8) fl = f; }
      if (fl >= 0 && wx > SX0 && wx < SX1) orderMove(w, ex, fl, wx);
    });
    // 悬停提示
    const hov = !this.menu && !this.encounter && !this.bagOpen ? this.targetAt(sc, wx, wy) : null;
    if (hov) { ui.rect(hov.x * 2 - hov.w, (hov.y - hov.h) * 2 - 4, hov.w * 2, 2, '#e8c070'); ui.hoverTip = hov.label; }
    // 正在做的事：进度条
    if (ex.act) {
      const px = ex.x * 2, py = (surfaceY(sc, ex.floor) - 30) * 2;
      const k = Math.min(1, ex.act.t / (ex.act.dur * SEC_PER_MIN));
      ui.rect(px - 22, py, 44, 6, '#07080a'); ui.rect(px - 21, py + 1, Math.round(42 * k), 4, '#e8c070');
    }
    if (ex.hidden !== null) { const c = sc.conts.find((x) => x.id === ex.hidden); if (c) { const y = (surfaceY(sc, c.floor) - 40) * 2; ui.rect(c.x * 2 - 26, y - 2, 52, 16, 'rgba(0,0,0,0.6)'); ui.text('（躲着）', c.x * 2, y, '#a0c0d8', { align: 'center' }); } }
    // 敌人头上的标记
    for (const e of ex.enemies) { const y = (surfaceY(sc, e.floor) - 30) * 2; ui.text(e.calm ? '…' : '!', e.x * 2, y, e.calm ? '#8a8a8a' : '#e85a4a', { align: 'center' }); }
    this.drawHud(app, sc, ex, me);
    if (this.menu) this.drawMenu(app, sc, ex);
    if (this.bagOpen) this.drawBag(app, ex);
    if (this.encounter) this.drawEncounter(app, ex);
  }

  drawHud(app: App, sc: XScene, ex: Explore, me: Person) {
    const ui = app.ui, w = app.w!;
    ui.panel(0, 0, UI_W, 36, { rivets: false, base: 'rgba(10,11,14,0.92)', rim: '#2c2f33' });
    const rm = roomAt(sc, ex.floor, ex.x);
    ui.text(`${LOCS[ex.loc].name} · ${rm.name}`, 12, 4, '#e8dcc0');
    ui.text(`${clock(w)}　已待 ${ex.minutes} 分钟　体温 ${Math.round(me.needs.warmth)}`, 12, 19, '#8a9098');
    // 危险
    const th = Math.min(100, ex.threat);
    ui.text('危险', 330, 4, ex.enemies.length ? '#e85a4a' : '#9aa0a8');
    ui.bar(366, 6, 150, 9, th / 100, th > 75 || ex.enemies.length ? '#c84a3a' : th > 45 ? '#c8904a' : '#7a8a6a');
    if (ex.enemies.length) ui.text(ex.enemies.some((e) => !e.calm) ? '有人在楼里！' : '他们在往外走', 366, 19, '#e8806a');
    // 负重
    const wt = weightOf(ex.bag);
    ui.text('背包', 540, 4, '#9aa0a8');
    ui.bar(576, 6, 120, 9, wt / ex.carryMax, wt > ex.carryMax - 0.6 ? '#c8904a' : '#6a8aa8');
    ui.text(`${wt.toFixed(1)} / ${ex.carryMax.toFixed(0)} kg`, 576, 19, '#8a9098');
    ui.button(712, 7, 90, 22, '看背包', () => { this.bagOpen = true; this.menu = null; });
    ui.button(810, 7, 140, 22, '回入口撤离', () => { this.menu = null; orderAct(w, ex, 'exit', 0, 'leave'); }, { hot: true });
    // 日志：顶栏下面（不挡住楼里的人）
    const lines = ex.log.slice(-3);
    const h = lines.length * 16 + 6;
    ui.rect(0, 36, 620, h, 'rgba(6,7,9,0.72)');
    lines.forEach((l, i) => ui.text(l, 12, 39 + i * 16, i === lines.length - 1 ? '#e8dcc0' : '#8a8478'));
  }

  drawMenu(app: App, sc: XScene, ex: Explore) {
    const ui = app.ui, w = app.w!, m = this.menu!;
    const acts = m.t.on === 'exit' ? [{ kind: 'leave' as const, label: '撤离（离开这栋楼）', min: 1 }] : actionsFor(w, ex, m.t.on, m.t.id);
    ui.layer++;
    const opts = [...acts.map((a) => ({ label: a.label + (a.min ? `（${a.min} 分钟）` : ''), tip: 'tip' in a ? a.tip : undefined, fn: () => orderAct(w, ex, m.t.on, m.t.id, a.kind) })), { label: '走过去', tip: undefined, fn: () => orderMove(w, ex, m.t.on === 'stair' ? ex.floor : sc.conts.find((c) => c.id === m.t.id)?.floor ?? sc.gates.find((g) => g.id === m.t.id)?.floor ?? sc.entrance.floor, m.t.x) }];
    const mw = Math.max(170, ...opts.map((o) => ui.measure(o.label) + 30));
    const mh = 22 + opts.length * 18 + 4;
    const x = Math.min(m.x + 6, UI_W - mw - 4), y = Math.min(Math.max(40, m.y - 10), UI_H - mh - 4);
    ui.panel(x, y, mw, mh, { title: m.t.label, rivets: false });
    let yy = y + 22;
    for (const o of opts) yy = ui.option(x + 2, yy, mw - 4, o.label, () => { o.fn(); this.menu = null; }, { tip: o.tip });
  }

  drawBag(app: App, ex: Explore) {
    const ui = app.ui, w = app.w!;
    ui.layer++; ui.blocker(0.5);
    const items = Object.entries(ex.bag).filter(([, v]) => v);
    const W = 460, H = 90 + Math.max(1, items.length) * 20;
    const x = (UI_W - W) / 2, y = (UI_H - H) / 2;
    ui.panel(x, y, W, H, { title: `背包　${weightOf(ex.bag).toFixed(1)} / ${ex.carryMax.toFixed(0)} kg` });
    let yy = y + 28;
    if (!items.length) ui.text('还什么都没找到。', x + 16, yy, '#8a9098');
    for (const [k0, v] of items) {
      const k = k0 as ItemKey;
      ui.text(`${ITEMS[k].name} ×${Math.floor(v || 0)}`, x + 16, yy, '#e8dcc0');
      ui.text(`${(ITEMS[k].weight * (v || 0)).toFixed(1)} kg`, x + 200, yy, '#8a9098');
      ui.button(x + 290, yy - 2, 70, 17, '放下 1', () => dropItem(w, ex, k, 1));
      ui.button(x + 366, yy - 2, 70, 17, '全放下', () => dropItem(w, ex, k, v || 0));
      yy += 20;
    }
    ui.text('放下的东西留在原地，下次来还能拿。', x + 16, y + H - 46, '#6a7078');
    ui.button(x + W - 100, y + H - 28, 84, 20, '关上', () => { this.bagOpen = false; }, { hot: true });
  }

  drawEncounter(app: App, ex: Explore) {
    const ui = app.ui, w = app.w!, e = this.encounter!;
    ui.layer++; ui.blocker(0.45);
    const W = 560, tw = W - 32;
    const H = 70 + ui.paraHeight(e.text, tw, 17) + (e.result ? ui.paraHeight(e.result, tw, 17) + 40 : e.options.length * 20);
    const x = (UI_W - W) / 2, y = (UI_H - H) / 2;
    ui.panel(x, y, W, H, { title: '被发现了', titleBg: '#3a1a1a' });
    let yy = ui.para(e.text, x + 16, y + 28, tw, '#f0c8a0', 17) + 8;
    if (e.result === null) {
      for (const o of e.options) yy = ui.option(x + 8, yy, W - 16, o.label, () => { e.result = resolveEncounter(w, o.id); }) + 2;
      return;
    }
    ui.para(e.result, x + 16, yy, tw, '#e8dcc0', 17);
    ui.button(x + W - 100, y + H - 28, 84, 20, '继续', () => {
      this.encounter = null;
      afterEncounter(w, ex);
      // 被抓 / 跑了：这趟搜刮结束；跑的时候东西都扔了
      if (!w.trip || w.trip.stage !== 'at' || hasCond(player(w), 'captive')) { finishExplore(w, ex, false); this.close(app, e.result || ''); }
    }, { hot: true });
  }
  esc(): boolean { if (this.menu) { this.menu = null; return false; } if (this.bagOpen) { this.bagOpen = false; return false; } return false; }
}

const clipFloor = (sc: XScene, f: number) => [SX0, surfaceY(sc, f) - ROOM_H, SX1 - SX0, ROOM_H];
export type { XEnemy };
