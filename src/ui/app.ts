// 应用主体：主循环、输入、HUD、上下文菜单
import { UI, UI_W, UI_H } from '../engine/ui';
import { WorldView, drawOverlays, WW, WH } from './worldview';
import type { World, Person } from '../sim/types';
import { stepMinute, nextEvent } from '../sim/tick';
import type { EventView } from '../sim/events';
import { player, present, P, day, clock, cnt, hour, isNight, roomOf, rel, opinion, hasCond, nm } from '../sim/util';
import { objOptions, doObj, talkOptions, subOptions, doTalk, isNear, walkTo, Opt, Result } from '../sim/player';
import { mk, ACTION_NAMES } from '../sim/actions';
import { OBJ, ROOM, roomAt, floorY } from '../content/layout';
import { ITEMS } from '../content/items';
import { PHASE_NAMES } from '../sim/war';
import { portraitCanvas, headCanvas } from '../art/actors';
import { SKILL_NAMES } from '../sim/world';
import * as M from './modals';
import * as S from './screens';
import { Audio } from './audio';

export interface Modal { draw(app: App): void; esc?(app: App): boolean; pausesSim?: boolean }

export const SPEEDS = [0, 2, 6, 18, 60];

export class App {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D;
  ui = new UI();
  wv = new WorldView();
  screen: 'title' | 'newgame' | 'play' | 'ending' | 'settings' = 'title';
  w: World | null = null;
  speed = 1; lastSpeed = 1;
  acc = 0; alpha = 0;
  sel: string | null = null;
  hover: string | null = null; hoverObj: string | null = null;
  modals: Modal[] = [];
  menu: { x: number; y: number; title: string; items: Opt[]; pick: (o: Opt) => void } | null = null;
  pendingTalk: { id: string; opt: string } | null = null;
  toasts: { text: string; until: number; col: string }[] = [];
  lastT = performance.now();
  audio = new Audio();
  newGame = new S.NewGameState();
  mouseDown = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    canvas.addEventListener('mousemove', (e) => { const [x, y] = this.toUI(e); this.ui.mx = x; this.ui.my = y; });
    canvas.addEventListener('mousedown', (e) => { this.audio.unlock(); const [x, y] = this.toUI(e); this.onClick(x, y, e.button); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.ui.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }
  toUI(e: MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * UI_W, ((e.clientY - r.top) / r.height) * UI_H];
  }
  get me(): Person { return player(this.w!); }
  toast(text: string, col = '#e8dcc0') { this.toasts.push({ text, until: performance.now() + 3500, col }); if (this.toasts.length > 4) this.toasts.shift(); }
  push(m: Modal) { this.modals.push(m); this.menu = null; }
  pop() { this.modals.pop(); this.ui.hits = []; }
  top() { return this.modals[this.modals.length - 1]; }

  // ---------- 主循环 ----------
  frame(now: number) {
    const dt = Math.min(0.1, (now - this.lastT) / 1000); this.lastT = now;
    if (this.screen === 'play' && this.w) this.updateSim(dt);
    this.draw();
  }
  updateSim(dt: number) {
    const w = this.w!;
    if (w.ending) { if (!this.modals.length) { this.screen = 'ending'; S.saveDelete(); } return; }
    // 外出中：赶路的时候快进
    if (w.trip && (w.trip.stage === 'going' || w.trip.stage === 'back') && !this.modals.some((m) => m instanceof M.EventModal)) {
      for (let i = 0; i < 12 && w.trip && w.t < w.trip.until && !w.ending; i++) { stepMinute(w); this.handleEvents(); if (this.modals.some((m) => m instanceof M.EventModal)) break; }
      if (w.trip && w.t >= w.trip.until) { M.tripTick(this); }
      this.alpha = 1; return;
    }
    if (this.modals.some((m) => m.pausesSim !== false) || this.menu || this.speed === 0) { this.alpha = 1; return; }
    this.acc += dt * SPEEDS[this.speed];
    let steps = 0;
    while (this.acc >= 1 && steps < 120) {
      this.acc -= 1; steps++;
      const prevDay = day(w);
      stepMinute(w);
      if (day(w) !== prevDay && hour(w) >= 0) S.autosave(w);
      if (this.pendingTalk) this.tryPendingTalk();
      if (this.warnNeeds()) { this.acc = 0; break; }
      if (this.handleEvents()) { this.acc = 0; break; }
      if (w.ending) break;
    }
    this.alpha = Math.min(1, this.acc);
  }
  warned: Record<string, number> = {};
  warnNeeds(): boolean {
    const w = this.w!, me = this.me;
    if (!me.alive || !me.present) return false;
    const checks: [string, boolean, string][] = [
      ['thirst', me.needs.thirst < 15, '你渴得嘴唇都裂了。去水房喝水。'], ['hunger', me.needs.hunger < 12, '你饿得手脚发软。'],
      ['warmth', me.needs.warmth < 15, '你冷得发抖。去暖和的地方，或者睡进被子里。'], ['health', me.health < 30, '你的身体快撑不住了。'],
      ['energy', me.needs.energy < 8, '你困得站不稳了。'],
    ];
    for (const [k, bad, text] of checks) {
      if (bad && (this.warned[k] || 0) < w.t - 360) { this.warned[k] = w.t; this.toast(text, '#e8806a'); if (w.settings.autoPause !== false) { this.lastSpeed = this.speed || this.lastSpeed; this.speed = 0; return true; } }
    }
    return false;
  }
  handleEvents(): boolean {
    const v = nextEvent(this.w!);
    if (v) { this.openEvent(v); return true; }
    return false;
  }
  openEvent(v: EventView) {
    this.audio.cue(v.art || 'event');
    if (v.id === 'rations') this.push(new M.RationsModal(this));
    else this.push(new M.EventModal(v));
  }

  // ---------- 输入 ----------
  onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (this.screen !== 'play' || !this.w) { if (e.key === 'Escape' && this.screen === 'settings') this.screen = 'title'; return; }
    if (e.key === 'Escape') { if (this.menu) { this.menu = null; return; } const t = this.top(); if (t) { if (!t.esc || t.esc(this)) this.pop(); return; } this.push(new M.PauseMenu()); return; }
    if (this.modals.length) { const t = this.top(); if (t instanceof M.EventModal) t.key(this, e.key); return; }
    if (e.key === ' ') { e.preventDefault(); if (this.speed) { this.lastSpeed = this.speed; this.speed = 0; } else this.speed = this.lastSpeed || 1; }
    if (['1', '2', '3', '4'].includes(e.key)) this.speed = Number(e.key);
    if (e.key === 'j' || e.key === 'g') this.push(new M.JournalModal());
    if (e.key === 'r') this.push(new M.RelationsModal());
    if (e.key === 'i') this.push(new M.InventoryModal());
    if (e.key === 'l') this.push(new M.LogModal());
    if (e.key === 'h' || e.key === 'F1') this.push(new M.HelpModal());
  }
  onClick(x: number, y: number, button: number) {
    const ui = this.ui;
    if (ui.click(x, y)) return;
    if (this.menu) { this.menu = null; return; }
    if (this.screen !== 'play' || !this.w || this.modals.length) return;
    const w = this.w;
    // 世界区域
    if (x < 712 && y > 46 && y < 470) {
      const wx = x / 2, wy = y / 2;
      const p = this.wv.hitPerson(w, wx, wy, this.alpha);
      const me = this.me;
      if (!me.present || hasCond(me, 'captive')) return;
      if (p) {
        this.sel = p.id;
        if (button === 2 || p.isPlayer) return;
        this.openTalk(p, x, y);
        return;
      }
      const o = this.wv.hitObject(w, wx, wy);
      if (o) { this.openObj(o, x, y); return; }
      const f = this.wv.floorAt(wy);
      if (f >= 0) { const room = roomAt(f, wx); walkTo(w, room, wx); this.pendingTalk = null; }
    }
  }
  openTalk(p: Person, x: number, y: number) {
    const w = this.w!;
    const items = talkOptions(w, p);
    this.menu = { x, y, title: p.name, items, pick: (o) => this.pickTalk(p, o, x, y) };
  }
  pickTalk(p: Person, o: Opt, x: number, y: number) {
    const w = this.w!;
    if (o.sub) { this.menu = { x, y, title: o.label, items: subOptions(w, p, o.id), pick: (s) => this.pickTalk(p, s, x, y) }; return; }
    this.menu = null;
    if (o.id === 'observe') { this.push(new M.PersonModal(p.id)); return; }
    if (o.id === 'trade') { if (!isNear(w, p)) { this.pendingTalk = { id: p.id, opt: o.id }; this.walkToPerson(p); return; } this.push(new M.TradeModal(p.id)); return; }
    if (!isNear(w, p)) { this.pendingTalk = { id: p.id, opt: o.id }; this.walkToPerson(p); this.toast(`你走向${p.name}……`, '#a0a8b0'); return; }
    this.execTalk(p, o.id);
  }
  walkToPerson(p: Person) { walkTo(this.w!, roomOf(p), p.x + (this.me.x < p.x ? -6 : 6)); }
  tryPendingTalk() {
    const pt = this.pendingTalk!; const w = this.w!;
    const p = P(w, pt.id);
    if (!p || !p.present || !p.alive) { this.pendingTalk = null; return; }
    if (isNear(w, p)) { this.pendingTalk = null; this.me.action = null; if (pt.opt === 'trade') this.push(new M.TradeModal(p.id)); else this.execTalk(p, pt.opt); }
    else if (!this.me.action) this.walkToPerson(p);
  }
  execTalk(p: Person, opt: string) {
    const w = this.w!;
    const res = doTalk(w, p, opt);
    this.applyResult(res, p);
  }
  openObj(id: string, x: number, y: number) {
    const w = this.w!;
    const items = objOptions(w, id);
    if (!items.length) return;
    this.menu = { x, y, title: OBJ[id].name, items, pick: (o) => {
      this.menu = null;
      if (o.sub) { this.applyResult(doObj(w, id, o.id), null); return; }
      this.applyResult(doObj(w, id, o.id), null);
    } };
  }
  applyResult(res: Result, p: Person | null) {
    const w = this.w!;
    if (res.action) { this.me.action = res.action; this.me.queue = []; if (this.speed === 0) this.speed = this.lastSpeed || 1; }
    if (res.next && res.nextFor) { const t = P(w, res.nextFor)!; this.push(new M.TextModal(res.text || '', res.who, res.next.map((o) => ({ label: o.label, run: () => { const r2 = doTalk(w, t, o.id); this.pop(); this.applyResult(r2, t); } })))); return; }
    if (res.ui) {
      switch (res.ui) {
        case 'map': if (res.text) this.push(new M.TextModal(res.text, res.who)); this.push(new M.MapModal(this)); return;
        case 'storage': this.push(new M.StorageModal(res.arg as string || 'look')); return;
        case 'stash': this.push(new M.StorageModal('stash')); return;
        case 'meeting': this.push(new M.MeetingModal()); return;
        case 'rations': this.push(new M.RationsModal(this)); return;
        case 'trade': this.push(new M.TradeModal(res.arg as string)); return;
        case 'person': this.push(new M.PersonModal(res.arg as string)); return;
        case 'drain': this.push(new M.DrainModal()); return;
      }
    }
    if (res.text) this.push(new M.TextModal(res.text, res.who));
  }

  // ---------- 绘制 ----------
  draw() {
    const ui = this.ui;
    ui.maxLayerUnderMouse = ui.topLayerAt(ui.mx, ui.my);
    ui.begin();
    const c = this.ctx;
    c.fillStyle = '#050506'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.screen === 'title') S.drawTitle(this);
    else if (this.screen === 'newgame') S.drawNewGame(this);
    else if (this.screen === 'settings') S.drawSettings(this);
    else if (this.screen === 'ending') S.drawEnding(this);
    else if (this.screen === 'play' && this.w) {
      const w = this.w;
      this.wv.render(w, this.alpha, this.sel, this.hover);
      c.imageSmoothingEnabled = false;
      c.drawImage(this.wv.cv, 0, 0, WW * 4, WH * 4);
      // 悬停
      this.hover = null; this.hoverObj = null;
      if (!this.modals.length && !this.menu && ui.mx < 712 && ui.my > 46 && ui.my < 470) {
        const p = this.wv.hitPerson(w, ui.mx / 2, ui.my / 2, this.alpha);
        if (p) { this.hover = p.id; ui.hoverTip = `${p.isPlayer ? '你' : p.name}${p.action ? ' · ' + ACTION_NAMES[p.action.type] : ''}`; }
        else { const o = this.wv.hitObject(w, ui.mx / 2, ui.my / 2); if (o) { this.hoverObj = o; ui.hoverTip = OBJ[o].name; } }
      }
      drawOverlays(ui, this.wv, w, this.alpha, this.sel, this.hover);
      this.drawRoomLabels();
      this.drawHUD();
      if (this.menu) this.drawMenu();
      for (const m of this.modals) m.draw(this);
    }
    // 提示
    const now = performance.now();
    this.toasts = this.toasts.filter((t) => t.until > now);
    this.toasts.forEach((t, i) => { const tw = ui.measure(t.text) + 16; ui.rect(356 - tw / 2, 60 + i * 20, tw, 18, 'rgba(10,10,12,0.88)'); ui.text(t.text, 356, 62 + i * 20, t.col, { align: 'center' }); });
    ui.tooltip();
    ui.wheel = 0;
    c.drawImage(ui.cv, 0, 0, UI_W * 2, UI_H * 2);
  }

  drawRoomLabels() {
    const ui = this.ui, w = this.w!;
    const lab = (id: string, txt: string, col = '#8a9098') => { const r = ROOM[id]; const F = [78, 128, 178][r.floor]; ui.rect(r.x * 2 + 2, F * 2 + 2, ui.measure(txt) + 8, 15, 'rgba(0,0,0,0.55)'); ui.text(txt, r.x * 2 + 6, F * 2 + 3, col); };
    lab('entrance', '气闸'); lab('storage', w.politics.rules.storageLocked ? '仓库 · 上锁' : '仓库', w.politics.rules.storageLocked ? '#d89a6a' : '#8a9098'); lab('kitchen', '公共区'); lab('vent', '通风 / 水房');
    lab('dorm', '宿舍'); lab('generator', w.shelter.power ? '发电机' : '发电机 · 停', w.shelter.power ? '#8a9098' : '#e88060'); lab('infirmary', '医务室'); lab('washroom', '厕所');
    lab('archive', w.shelter.archiveOpen ? '档案室' : '档案室 · 封存', w.shelter.archiveOpen ? '#8a9098' : '#b05a5a'); lab('lower', '下层小间', '#c89aa8');
    ui.rect(162 * 2, 182 * 2, w.shelter.drainFound ? 130 : 110, 15, 'rgba(0,0,0,0.55)'); ui.text(w.shelter.drainFound ? '坍塌区 · 暗渠已打通' : `坍塌区 · ${Math.round(w.shelter.collapseWork)}%`, 162 * 2 + 4, 182 * 2 + 1, w.shelter.drainFound ? '#a0d8e8' : '#6a7078');
  }

  drawMenu() {
    const ui = this.ui, m = this.menu!;
    ui.layer++;
    const w = Math.max(160, ui.measure(m.title) + 20, ...m.items.map((o) => ui.measure(o.label) + 30 + (o.tags || []).reduce((s, [t]) => s + ui.measure(t) + 14, 0)));
    const h = 22 + m.items.length * 18 + 6;
    let x = Math.min(m.x + 8, UI_W - w - 4), y = Math.min(m.y, UI_H - h - 4);
    if (y < 4) y = 4;
    ui.panel(x, y, w, h, { title: m.title, rivets: false });
    let yy = y + 22;
    for (const o of m.items) {
      const dis = o.ok === false;
      yy = ui.option(x + 2, yy, w - 4, o.label + (o.sub ? ' ›' : ''), () => m.pick(o), { disabled: dis, tags: o.tags, tip: dis ? o.why : o.tip });
    }
  }

  drawHUD() {
    const ui = this.ui, w = this.w!, me = this.me;
    // 顶栏
    ui.panel(0, 0, 960, 30, { rivets: false, base: 'rgba(12,13,16,0.95)', rim: '#2c2f33' });
    ui.text(`第 ${day(w)} 天`, 12, 8, '#e8dcc0');
    ui.text(`${clock(w)}  ${isNight(w) ? '夜' : hour(w) < 12 ? '上午' : hour(w) < 18 ? '下午' : '傍晚'}`, 70, 8, '#9aa4b0');
    ui.rect(150, 6, 1, 18, '#3a3e44');
    const rt = w.shelter.rooms[roomOf(me)]?.temp ?? w.shelter.tempOut;
    ui.text('室温', 158, 8, '#7a828c'); ui.text(`${Math.round(rt)}°C`, 186, 8, rt < 5 ? '#8ac0e8' : '#c8c0b0');
    ui.text('外', 222, 8, '#7a828c'); ui.text(`${Math.round(w.shelter.tempOut)}°C`, 238, 8, '#6a9ad8');
    ui.rect(276, 6, 1, 18, '#3a3e44');
    const res: [string, string, string, string][] = [
      ['口粮', `${Math.floor(cnt(w.storage, 'food'))}`, cnt(w.storage, 'food') < present(w).length * 3 ? '#e85a4a' : '#e8dcc0', '仓库里的口粮（份）'],
      ['水', `${Math.round(w.shelter.water)}L`, w.shelter.water < 20 ? '#e85a4a' : '#e8dcc0', '储水罐'],
      ['燃料', `${Math.round(cnt(w.storage, 'fuel'))}+${w.shelter.genFuel.toFixed(1)}L`, cnt(w.storage, 'fuel') < 5 ? '#e8a060' : '#e8dcc0', '仓库燃料 + 发电机油箱'],
      ['药', `${cnt(w.storage, 'meds')}`, cnt(w.storage, 'meds') ? '#e8dcc0' : '#e85a4a', '药品'],
      ['烟', `${Math.floor(cnt(w.storage, 'cigs'))}`, '#e8dcc0', '香烟'],
      ['蜡烛', `${cnt(w.storage, 'candle')}`, '#e8dcc0', '蜡烛'],
    ];
    let rx = 284;
    for (const [n, v, c, tip] of res) {
      ui.text(n, rx, 8, '#7a828c'); const lw = ui.measure(n); ui.text(v, rx + lw + 4, 8, c);
      const ww = lw + ui.measure(v) + 12; if (ui.hover(rx, 4, ww, 22)) ui.hoverTip = tip; rx += ww;
    }
    ui.rect(rx, 6, 1, 18, '#3a3e44');
    ui.text('电', rx + 8, 8, '#7a828c'); ui.bar(rx + 24, 11, 40, 8, w.shelter.power ? w.shelter.genHealth / 100 : 0, w.shelter.power ? '#d8a040' : '#5a3a2a');
    if (ui.hover(rx, 4, 66, 22)) ui.hoverTip = `发电机：${w.shelter.power ? '运转' : '停机'}，状况 ${Math.round(w.shelter.genHealth)}%`;
    ui.text('气', rx + 72, 8, '#7a828c'); ui.bar(rx + 88, 11, 34, 8, 1 - w.shelter.co2 / 100, w.shelter.co2 > 60 ? '#c05050' : '#a0c060');
    if (ui.hover(rx + 70, 4, 56, 22)) ui.hoverTip = `空气（二氧化碳 ${Math.round(w.shelter.co2)}）。太闷会头痛、烦躁，严重时伤身体。去摇通风机。`;
    ui.rect(836, 4, 120, 22, '#3a1414'); ui.rect(837, 5, 118, 20, '#5a1c1a');
    ui.text(`◆ 阶段${['', '一', '二', '三', '四'][w.war.phase]} · ${PHASE_NAMES[w.war.phase]}`, 844, 8, '#f0c8a0');
    if (ui.hover(836, 4, 120, 22)) ui.hoverTip = '战争的阶段决定外面的局势：谁在城里、什么东西能用、什么关系会变成罪证。';
    // 滚动条：最新的重要消息
    ui.rect(0, 30, 712, 16, 'rgba(8,8,10,0.78)');
    const last = w.log.find((l) => l.important) || w.log[0];
    if (last) { ui.rect(6, 34, 8, 8, '#a02020'); ui.rect(8, 36, 4, 4, '#ff5040'); ui.text(trim(ui, last.text, 680), 20, 32, last.col || '#c8b890'); }

    // 右侧：人物面板
    const sp = P(w, this.sel) || me;
    M.drawPersonPanel(this, sp, 716, 34, 240, 434);

    // 底部：人员 + 日志
    const by0 = 472;
    ui.panel(0, by0, 712, 68, { rivets: false, base: 'rgba(12,13,16,0.95)' });
    let rxx = 6;
    const list = w.people.filter((p) => !p.external && (p.present || (p.alive && !p.leftReason) || p.isPlayer)).slice(0, 10);
    for (const p of list) {
      const s = p.id === (this.sel || me.id);
      const dead = !p.alive;
      ui.rect(rxx, by0 + 5, 28, 28, s ? '#d8a040' : p.isPlayer ? '#6a5a30' : '#07080a');
      ui.image(headCanvas(p.id, { ...p.look, age: p.age } as never, dead), rxx + 2, by0 + 7, 24, 24);
      if (!p.present && p.alive) { ui.rect(rxx + 2, by0 + 7, 24, 24, 'rgba(0,0,0,0.6)'); ui.text('外', rxx + 8, by0 + 13, '#a0c0d8'); }
      if (p.alive && p.present && (p.needs.hunger < 20 || p.health < 40)) ui.rect(rxx + 2, by0 + 29, 24, 2, '#c03030');
      if (p.alive && p.partner === me.id) ui.text('♥', rxx + 20, by0 + 4, '#ff9ab0');
      if (w.politics.leader === p.id) ui.text('★', rxx + 1, by0 + 4, '#f0d060');
      ui.text(p.isPlayer ? '你' : p.name.length > 2 ? p.name.slice(-2) : p.name, rxx + 14, by0 + 37, s ? '#f0d8a0' : '#8a9098', { align: 'center' });
      ui.region(rxx, by0 + 5, 28, 46, () => { this.sel = p.id; });
      if (ui.hover(rxx, by0 + 5, 28, 46)) ui.hoverTip = `${p.isPlayer ? '你' : p.name} · ${p.originText}${dead ? ` · 死于第 ${p.deathDay} 天` : !p.present ? ' · 不在避难所' : p.action ? ' · ' + ACTION_NAMES[p.action.type] : ''}`;
      rxx += 34;
    }
    ui.rect(rxx + 2, by0 + 6, 1, 56, '#3a3e44');
    const lx = rxx + 10;
    let ly = by0 + 5;
    for (const l of w.log.slice(0, 4)) { ui.text(clockOf(l.t), lx, ly, '#5a6068'); ui.text(trim(ui, l.text, 712 - lx - 50), lx + 40, ly, l.col || '#c8c0b0'); ly += 15; }
    ui.region(lx, by0 + 4, 712 - lx, 60, () => this.push(new M.LogModal()));

    // 右下：时间与菜单
    ui.panel(716, 472, 240, 68, { rivets: false, base: 'rgba(12,13,16,0.95)' });
    const ctl = ['❚❚', '▶', '▶▶', '▶▶▶', '»»'];
    for (let i = 0; i < 5; i++) ui.button(722 + i * 36, 478, 33, 20, ctl[i], () => { if (i === 0) { this.lastSpeed = this.speed || this.lastSpeed; } this.speed = i; }, { hot: this.speed === i, tip: ['暂停（空格）', '正常速度（1）', '快（2）', '很快（3）', '飞快（4）'][i] });
    const btns: [string, () => void, string][] = [['目标', () => this.push(new M.JournalModal()), '人生目标与路线（J）'], ['关系', () => this.push(new M.RelationsModal()), '关系网（R）'], ['物品', () => this.push(new M.InventoryModal()), '你的东西（I）'], ['规矩', () => this.push(new M.RulesModal()), '避难所的规矩与权力'], ['菜单', () => this.push(new M.PauseMenu()), '存档、设置（Esc）']];
    btns.forEach(([t, fn, tip], i) => ui.button(722 + i * 46, 502, 43, 20, t, fn, { tip }));
    const me2 = me;
    const status = !me2.alive ? '你已经死了' : hasCond(me2, 'captive') ? '你被关押着' : w.trip ? '你在外面' : me2.action ? `你在：${ACTION_NAMES[me2.action.type]}` : '你在发呆';
    ui.text(trim(ui, status, 220), 724, 526, '#7a8088');
  }
}

function clockOf(t: number) { const m = (t + 480) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
export function trim(ui: UI, s: string, w: number) { if (ui.measure(s) <= w) return s; let t = s; while (t.length && ui.measure(t + '…') > w) t = t.slice(0, -1); return t + '…'; }
export { portraitCanvas, headCanvas, SKILL_NAMES, ITEMS, rel, opinion, nm, mk, floorY };
