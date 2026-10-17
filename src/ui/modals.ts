// 各种窗口：事件对话、交易、仓库、会议、目标日志、关系、人物档案、物品、地图……
import type { App, Modal } from './app';
import { trim } from './app';
import { UI, UI_W, UI_H } from '../engine/ui';
import type { EventView, Choice } from '../sim/events';
import type { ItemKey, Person, World, LocId } from '../sim/types';
import { P, player, present, rel, opinion, cnt, nm, day, clock, hasCond, roomOf, isNight, isDark, addItem, takeItem, log, relAdd, awake, pron, bagValue, tagMethod } from '../sim/util';
import { ITEMS, TRADEABLE } from '../content/items';
import { portraitCanvas, headCanvas } from '../art/actors';
import { SKILL_NAMES } from '../sim/world';
import { ACTION_NAMES, mk } from '../sim/actions';
import { storageTake, storagePut, stashPut } from '../sim/player';
import { evaluateTrade, valueFor, giveItem } from '../sim/social';
import { availableProposals, support, holdVote, Proposal, RULE_TEXT, applyManualRations } from '../sim/politics';
import { NODES, journalNodes, methodReady, methodVisible, nodeOf, GoalNode } from '../sim/goals';
import { LOCS, LOC_LIST } from '../content/locations';
import { startTrip, tripArrive, tripHome, locActions, doLocAction, resolveEncounter, doTrade, TRADE_TABLES, report, crossDrain, PHASE_NAMES, tripTravel, milName } from '../sim/war';
import { stepMinute, nextEvent } from '../sim/tick';
import { buildContext, findScene, fill, SceneDef } from '../content/adult';
import { Buf } from '../engine/pixel';
import { drawSurface } from '../art/surface';
import { saveGame, loadGame, listSaves } from './screens';
import { CONSENT_NAMES, attraction } from '../sim/intimacy';

const look = (p: Person) => ({ ...p.look, age: p.age }) as never;
function frameModal(ui: UI, w: number, h: number, title: string, opt: { titleBg?: string } = {}) {
  ui.blocker(0.55);
  const x = Math.round((UI_W - w) / 2), y = Math.round((UI_H - h) / 2);
  ui.panel(x, y, w, h, { title, titleBg: opt.titleBg || '#2a1d1a' });
  return { x, y };
}
function closeBtn(ui: UI, app: App, x: number, y: number) { ui.button(x - 26, y + 1, 22, 15, '×', () => app.pop()); }
function portraitBox(ui: UI, p: Person | undefined, x: number, y: number, scale = 2) {
  ui.rect(x - 2, y - 2, 40 * scale + 4, 48 * scale + 4, '#07080a'); ui.rect(x - 1, y - 1, 40 * scale + 2, 48 * scale + 2, '#4a3e36');
  if (p) ui.image(portraitCanvas(p.id, look(p), { dead: !p.alive }), x, y, 40 * scale, 48 * scale);
}

// ---------- 右侧人物面板 ----------
export function drawPersonPanel(app: App, p: Person, x: number, y: number, w: number, h: number) {
  const ui = app.ui, W = app.w!, me = player(W);
  const isMe = p.isPlayer;
  ui.panel(x, y, w, h, { title: `${isMe ? '你 · ' : ''}${p.name}`, titleBg: isMe ? '#2a2414' : '#2a1d1a' });
  portraitBox(ui, p, x + 10, y + 22);
  const tx = x + 100;
  ui.text(`${p.age} 岁 · ${p.gender === 'f' ? '女' : '男'}`, tx, y + 24, '#c8c0b0');
  ui.text(p.originText, tx, y + 41, '#c8c0b0');
  const r = isMe ? null : rel(W, p.id, me.id);
  const know = isMe || (r && (r.trust > 45 || r.affection > 55));
  ui.text(isMe ? `${W.politics.leader === p.id ? '★ 领导者' : W.shelter.keyHolder === p.id ? '保管钥匙' : '普通成员'}` : know ? `对政权：${({ loyal: '忠诚', cynic: '犬儒', rebel: '反感' } as Record<string, string>)[p.pers.regime]}` : '对政权：？', tx, y + 58, '#a0a8b0');
  let ttx = tx;
  for (const t of p.traits.slice(0, 3)) { if (ttx > x + w - 40) break; ttx += ui.tag(ttx, y + 76, t, '#d8e8c8', '#2a3a24'); }
  if (!p.alive) { ui.text(`死于第 ${p.deathDay} 天`, tx, y + 96, '#e85a4a'); ui.text(p.deathCause || '', tx, y + 112, '#a87070'); return; }
  if (!p.present) { ui.text(p.leftReason ? ({ crossed: '过河了', joined: '留在了外面', expelled: '被赶走了', taken: '被带走了', fled: '跑了' } as Record<string, string>)[p.leftReason] || '不在' : '不在避难所', tx, y + 96, '#a0c0d8'); }
  // 需求
  let by = y + 126;
  const needs: [string, number, string][] = [['饱', p.needs.hunger, '#c8823a'], ['水', p.needs.thirst, '#5a9ad0'], ['暖', p.needs.warmth, '#7ab0e0'], ['精力', p.needs.energy, '#8a7ac0'], ['压力', p.needs.stress, '#c04a4a'], ['欲望', p.needs.desire, '#c05a9a'], ['健康', p.health, '#6ab06a']];
  for (const [n, v, c] of needs) {
    ui.text(n, x + 12, by - 2, '#9aa0a8');
    if (isMe || (r && r.trust > 35) || n === '健康' || n === '压力') ui.bar(x + 50, by, 178, 9, v / 100, c);
    else ui.text('？', x + 50, by - 2, '#5a5e64');
    by += 13;
  }
  // 状态
  const conds = p.conds.filter((c) => c.type !== 'captive').map((c) => ({ wound: '受伤', infection: '感染', fever: '发烧', flu: '流感', dysentery: '痢疾', frostbite: '冻伤', heart: '心脏病', pregnant: '怀孕', trauma: '创伤', drunk: '醉了', hypothermia: '失温', starving: '饥饿', grief: '悲伤', captive: '' }[c.type])).filter(Boolean);
  if (p.conds.some((c) => c.type === 'pregnant') && !isMe && !W.facts[`pregKnown:${p.id}`]) conds.splice(conds.indexOf('怀孕'), 1);
  by += 2;
  if (conds.length) { let cx = x + 12; for (const c of conds) cx += ui.tag(cx, by, c!, '#f0c8c0', '#4a2420'); by += 18; }
  ui.rect(x + 8, by, w - 16, 1, '#3a3e44'); by += 5;
  const act = p.action ? ACTION_NAMES[p.action.type] : '发呆';
  ui.text(`正在：${act}`, x + 12, by, '#e8dcc0'); by += 16;
  if (!isMe) {
    const intent = r && r.trust > 55 ? p.thought : r && r.trust > 35 ? (p.thought ? '（似乎在想什么）' : '') : '（看不透）';
    ui.text(`心思：${trim(ui, intent || '……', 170)}`, x + 12, by, '#8a9098'); by += 18;
    // 对你
    ui.text(`${pron(p)}对你`, x + 12, by, '#9aa0a8'); by += 16;
    const st = { stranger: '陌生', acquainted: '熟人', friend: '朋友', flirting: '暧昧', lovers: '恋人', affair: '情人', transactional: '交易', patronage: '庇护', domination: '支配', enemy: '仇人' }[r!.state];
    const vals: [string, number, string][] = [['信任', r!.trust, '#5a8ac8'], ['好感', r!.affection, '#6ab06a'], ['尊重', r!.respect, '#c8b060'], ['畏惧', r!.fear, '#8a6ac0'], ['怨恨', r!.resentment, '#c04a4a'], ['欲望', r!.desire, '#c05a9a']];
    let col = 0;
    for (const [n, v, c] of vals) {
      const vx = x + 12 + (col % 3) * 74, vy = by + Math.floor(col / 3) * 15;
      ui.rect(vx, vy + 4, 6, 6, c);
      const show = n === '欲望' ? (r!.trust > 60 || r!.state === 'lovers' || r!.state === 'flirting' ? Math.round(v) : '?') : Math.round(v);
      ui.text(`${n}${show}`, vx + 9, vy, '#c8c0b0'); col++;
    }
    by += 32;
    ui.text(`关系：${st}${me.partner === p.id ? '（伴侣）' : ''}`, x + 12, by, '#c8a8b8'); by += 18;
    if (p.present && me.present && awake(me)) {
      ui.button(x + 10, by, 70, 20, '交谈', () => { app.openTalk(p, x - 160, by); }, { hot: true });
      ui.button(x + 84, by, 70, 20, '档案', () => app.push(new PersonModal(p.id)));
      ui.button(x + 158, by, 72, 20, '跟随', () => { app.walkToPerson(p); });
    } else ui.button(x + 10, by, 70, 20, '档案', () => app.push(new PersonModal(p.id)));
  } else {
    // 自己：技能、物品
    ui.text('本事', x + 12, by, '#9aa0a8'); by += 16;
    let col = 0;
    for (const [k, n] of Object.entries(SKILL_NAMES)) { const v = p.skills[k as keyof typeof p.skills]; ui.text(`${n}${Math.round(v)}`, x + 12 + (col % 4) * 56, by + Math.floor(col / 4) * 15, v >= 50 ? '#e8d090' : '#a8a098'); col++; }
    by += 34;
    ui.text('身上', x + 12, by, '#9aa0a8'); by += 16;
    const items = Object.entries(p.inv).filter(([, v]) => v).map(([k, v]) => `${ITEMS[k as ItemKey].name}${Math.floor((v || 0) * 10) / 10}`);
    by = ui.para(items.join('　') || '空空如也', x + 12, by, w - 24, '#c8c0b0', 15);
    if (p.partner) { const q = P(W, p.partner); if (q) ui.text(`伴侣：${q.name}${q.alive ? '' : '（已故）'}`, x + 12, by + 2, '#ff9ab0'); }
  }
}

// ---------- 文本弹窗 ----------
export class TextModal implements Modal {
  constructor(public text: string, public who?: string, public opts?: { label: string; run: () => void }[]) {}
  draw(app: App) {
    const ui = app.ui, w = app.w!;
    const p = P(w, this.who || null);
    const W = 600;
    const th = ui.paraHeight(this.text, p ? W - 130 : W - 30, 17);
    const H = Math.max(p ? 130 : 80, th + 60 + (this.opts ? this.opts.length * 18 : 0));
    const { x, y } = frameModal(ui, W, H, p ? (p.isPlayer ? '你' : p.name) : '');
    let tx = x + 14;
    if (p) { portraitBox(ui, p, x + 12, y + 24); tx = x + 108; }
    let yy = ui.para(this.text, tx, y + 26, W - (tx - x) - 16, '#e8e0d0', 17);
    if (this.opts) { yy += 4; for (const o of this.opts) yy = ui.option(tx, yy, W - (tx - x) - 16, o.label, o.run); }
    else ui.button(x + W - 90, y + H - 28, 76, 20, '继续', () => app.pop(), { hot: true });
  }
}

// ---------- 事件 ----------
export class EventModal implements Modal {
  result: string | null = null;
  scene: SceneDef | null = null; page = 0; sceneTried = false;
  textPage = 0;
  constructor(public v: EventView) {}
  key(app: App, k: string) {
    if (this.result !== null || (this.scene && this.page < (this.scene.pages?.length || 0))) { if (k === 'Enter' || k === ' ') this.advance(app); return; }
    const n = Number(k);
    if (n >= 1 && n <= this.v.choices.length) this.choose(app, this.v.choices[n - 1]);
  }
  advance(app: App) {
    if (this.scene && this.page < (this.scene.pages?.length || 0)) { this.page++; return; }
    if (this.result !== null) { app.pop(); }
  }
  choose(app: App, c: Choice) {
    if (c.ok === false) return;
    const r = c.run(app.w!);
    if (r && typeof r === 'object') { this.v = r; this.sceneTried = false; this.scene = null; this.page = 0; return; }
    this.result = (r as string) || '';
    if (!this.result) app.pop();
  }
  draw(app: App) {
    const ui = app.ui, w = app.w!;
    if (!this.sceneTried && this.v.adultCtx) { this.sceneTried = true; const c = buildContext(w, this.v.adultCtx); this.scene = findScene(w, c); this.page = 0; (this as unknown as { ctx: unknown }).ctx = c; }
    const W = 760;
    const twEst = W - (this.v.speaker ? 112 : 16) - 16;
    const H = Math.min(500, Math.max(240, 70 + ui.paraHeight(this.v.text, twEst, 17) + (this.v.lines?.length || 0) * 18 + this.v.choices.length * 18 + (this.result !== null ? 30 + ui.paraHeight(this.result, twEst, 17) : 0) + (this.v.adultCtx ? 20 : 0)));
    const { x, y } = frameModal(ui, W, H, this.v.title, { titleBg: this.v.art === 'dark' ? '#2a1424' : this.v.art === 'door' ? '#1a2230' : '#2a1d1a' });
    const sp = P(w, this.v.speaker || null);
    let tx = x + 16;
    if (sp) { portraitBox(ui, sp, x + 14, y + 26); tx = x + 112; }
    const tw = W - (tx - x) - 16;
    // 成人场景分页
    if (this.scene && this.page < (this.scene.pages?.length || 0)) {
      const pg = this.scene.pages![this.page];
      const c = (this as unknown as { ctx: never }).ctx;
      const who = pg.speaker === 'initiator' ? (c as { initiator: { name: string } }).initiator.name : pg.speaker === 'partner' ? (c as { partner: { name: string } }).partner.name : '';
      let yy = y + 30;
      if (who) { ui.text(who, tx, yy, '#e8c890'); yy += 20; }
      ui.para(fill(pg.text, c), tx, yy, tw, '#e8e0d0', 18);
      ui.text(`${this.page + 1}/${this.scene.pages!.length}`, x + W - 60, y + H - 46, '#6a6058');
      ui.button(x + W - 96, y + H - 28, 80, 20, '继续', () => this.advance(app), { hot: true });
      ui.region(x, y, W, H, () => this.advance(app));
      return;
    }
    let yy = y + 28;
    const text = this.scene && this.scene.pages?.length ? '' : this.v.text;
    yy = ui.para(text, tx, yy, tw, '#e8e0d0', 17);
    if (this.v.adultCtx && !this.scene && w.settings.adult) { ui.text('[成人内容接口：此处可由内容包填充]', tx, yy + 2, '#6a4a5a'); yy += 18; }
    if (this.v.lines?.length) {
      yy += 6;
      for (const l of this.v.lines.slice(0, 7)) {
        const p = P(w, l.who);
        if (!p) continue;
        ui.image(headCanvas(p.id, look(p)), tx, yy, 16, 16);
        ui.text(`${p.name}：`, tx + 20, yy + 1, '#a8a098');
        ui.text(trim(ui, l.text, tw - 90), tx + 20 + ui.measure(`${p.name}：`), yy + 1, '#d8d0c0');
        yy += 18;
      }
    }
    if (this.result !== null) {
      yy += 8; ui.rect(tx, yy, tw, 1, '#4a3e36'); yy += 8;
      ui.para(this.result, tx, yy, tw, '#f0e0b8', 17);
      ui.button(x + W - 96, y + H - 28, 80, 20, '继续', () => app.pop(), { hot: true });
      return;
    }
    // 选项
    let cy = Math.max(yy + 10, y + H - 14 - this.v.choices.length * 18);
    if (cy + this.v.choices.length * 18 > y + H) cy = y + H - this.v.choices.length * 18 - 4;
    this.v.choices.forEach((c, i) => { cy = ui.option(tx - 4, cy, tw + 8, c.label, () => this.choose(app, c), { key: String(i + 1), disabled: c.ok === false, tags: c.ok === false && c.why ? [[c.why, '#7a6a6a']] : c.tags, tip: c.ok === false ? c.why : undefined }); });
  }
}

// ---------- 分配口粮（玩家是领导者） ----------
export class RationsModal implements Modal {
  share: Record<string, number> = {};
  constructor(app: App) {
    const w = app.w!; const size = w.politics.rules.rationSize;
    let left = Math.floor(cnt(w.storage, 'food'));
    for (const p of present(w)) { const g = Math.min(size, left); this.share[p.id] = g; left -= g; }
  }
  draw(app: App) {
    const ui = app.ui, w = app.w!;
    const ppl = present(w);
    const H = 90 + ppl.length * 24;
    const { x, y } = frameModal(ui, 520, H, '分配今天的口粮');
    const total = Object.values(this.share).reduce((a, b) => a + b, 0);
    const avail = Math.floor(cnt(w.storage, 'food'));
    ui.text(`仓库：${avail} 份　已分：${total}　剩下：${avail - total}`, x + 16, y + 26, avail - total < 0 ? '#e85a4a' : '#e8dcc0');
    let yy = y + 48;
    for (const p of ppl) {
      ui.image(headCanvas(p.id, look(p)), x + 16, yy - 2, 18, 18);
      ui.text(p.isPlayer ? '你' : p.name, x + 40, yy, '#d8d0c0');
      ui.text(`饱 ${Math.round(p.needs.hunger)}　今日劳动 ${p.work} 分钟　对你 ${p.isPlayer ? '-' : Math.round(opinion(w, p.id, player(w).id))}`, x + 120, yy, '#8a9098');
      ui.button(x + 400, yy - 2, 22, 18, '−', () => { this.share[p.id] = Math.max(0, (this.share[p.id] || 0) - 1); });
      ui.text(String(this.share[p.id] || 0), x + 436, yy, '#f0d8a0', { align: 'center' });
      ui.button(x + 452, yy - 2, 22, 18, '+', () => { if (total < avail) this.share[p.id] = (this.share[p.id] || 0) + 1; });
      yy += 24;
    }
    ui.button(x + 520 - 110, y + H - 28, 96, 20, '就这么分', () => { applyManualRations(w, this.share); w.politics.rationsDoneDay = day(w); app.pop(); }, { hot: true, disabled: total > avail });
  }
  esc() { return false; }
}

// ---------- 仓库 / 私藏 ----------
export class StorageModal implements Modal {
  constructor(public mode: string) {}
  draw(app: App) {
    const ui = app.ui, w = app.w!, me = player(w);
    const stash = this.mode === 'stash';
    const { x, y } = frameModal(ui, 640, 400, stash ? '藏东西（下层小间的床垫下）' : this.mode === 'steal' ? '仓库（偷拿）' : '仓库');
    closeBtn(ui, app, x + 640, y);
    if (!stash) {
      ui.text(this.mode === 'steal' ? '仓库上了锁，或者规矩不许自己拿。你要从铁丝网的破口伸手进去……被看见就麻烦了。' : w.politics.rules.ration === 'free' ? '规矩：自取。拿多少都行——如果你不怕别人怎么看。' : '你有钥匙。别人会看着你拿了什么。', x + 16, y + 24, this.mode === 'steal' ? '#e8a060' : '#9aa0a8');
      let yy = y + 48;
      ui.text('仓库里', x + 16, yy, '#e8c890'); yy += 18;
      const items = Object.entries(w.storage).filter(([, v]) => (v || 0) >= 1);
      for (const [k, v] of items) {
        ui.text(`${ITEMS[k as ItemKey].name}  ${Math.floor(v || 0)}`, x + 16, yy, '#d8d0c0');
        if (this.mode !== 'look') ui.button(x + 200, yy - 2, 60, 17, this.mode === 'steal' ? '偷 1' : '拿 1', () => { const t = storageTake(w, k as ItemKey, 1, this.mode === 'steal'); if (this.mode === 'steal') { app.pop(); app.toast('你凑近铁笼……'); } else app.toast(t); }, { tip: ITEMS[k as ItemKey].desc });
        yy += 19; if (yy > y + 380) break;
      }
    }
    let yy = y + 48;
    const px = stash ? x + 16 : x + 330;
    ui.text('你身上', px, yy, '#e8c890'); yy += 18;
    for (const [k, v] of Object.entries(me.inv).filter(([kk, v]) => (v || 0) > 0 && kk !== 'storageKey' && kk !== 'archiveKey')) {
      ui.text(`${ITEMS[k as ItemKey].name}  ${Math.floor((v || 0) * 10) / 10}`, px, yy, '#d8d0c0');
      if (stash) ui.button(px + 190, yy - 2, 60, 17, '藏 1', () => { stashPut(w, k as ItemKey, 1); app.pop(); app.toast('你走向下层小间……'); });
      else if (this.mode !== 'steal') ui.button(px + 190, yy - 2, 60, 17, '放 1', () => app.toast(storagePut(w, k as ItemKey, 1)));
      yy += 19; if (yy > y + 380) break;
    }
    if (stash) { let sy = y + 48; ui.text('已经藏着的', x + 330, sy, '#c89aa8'); sy += 18; for (const [k, v] of Object.entries(me.stash)) { ui.text(`${ITEMS[k as ItemKey].name}  ${Math.floor((v || 0) * 10) / 10}`, x + 330, sy, '#c8b8c0'); sy += 18; } }
  }
}

// ---------- 交易 ----------
export class TradeModal implements Modal {
  give: Partial<Record<ItemKey, number>> = {}; get: Partial<Record<ItemKey, number>> = {}; msg = '';
  constructor(public id: string) {}
  draw(app: App) {
    const ui = app.ui, w = app.w!, me = player(w), t = P(w, this.id)!;
    const { x, y } = frameModal(ui, 680, 420, `和${t.name}交易`);
    closeBtn(ui, app, x + 680, y);
    portraitBox(ui, t, x + 14, y + 24, 1.5);
    const col = (title: string, bag: Partial<Record<ItemKey, number>>, sel: Partial<Record<ItemKey, number>>, cx: number) => {
      let yy = y + 30; ui.text(title, cx, yy, '#e8c890'); yy += 18;
      for (const k of TRADEABLE) {
        const have = Math.floor(cnt(bag, k)); if (have < 1) continue;
        const n = sel[k] || 0;
        ui.text(`${ITEMS[k].name}（${have}）`, cx, yy, n ? '#f0d8a0' : '#c8c0b0');
        ui.button(cx + 150, yy - 2, 20, 16, '−', () => { sel[k] = Math.max(0, n - 1); if (!sel[k]) delete sel[k]; });
        ui.text(String(n), cx + 182, yy, '#f0d8a0', { align: 'center' });
        ui.button(cx + 194, yy - 2, 20, 16, '+', () => { if (n < have) sel[k] = n + 1; });
        yy += 18; if (yy > y + 360) break;
      }
    };
    col(`${t.name}的东西`, t.inv, this.get, x + 100);
    col('你的东西', me.inv, this.give, x + 380);
    const gv = Object.entries(this.give) as [ItemKey, number][], lv = Object.entries(this.get) as [ItemKey, number][];
    if (gv.length || lv.length) {
      const ev = evaluateTrade(w, me, t, gv, lv);
      ui.text(`${t.name}：「${ev.text}」`, x + 100, y + 372, ev.ok ? '#a0d890' : '#e8a080');
      ui.button(x + 680 - 110, y + 392, 96, 20, '成交', () => {
        if (!lv.length) { for (const [k, n] of gv) giveItem(w, me, t, k, n); this.msg = '你送出了东西。'; this.give = {}; return; }
        if (!ev.ok) { relAdd(w, t.id, me.id, { respect: -1 }); this.msg = '没谈成。'; return; }
        for (const [k, n] of gv) { takeItem(me.inv, k, n); addItem(t.inv, k, n); }
        for (const [k, n] of lv) { takeItem(t.inv, k, n); addItem(me.inv, k, n); }
        relAdd(w, t.id, me.id, { trust: 2 }); tagMethod(me, '交易');
        log(w, `你和${t.name}做了一笔交易。`); this.give = {}; this.get = {}; this.msg = '成交。';
      }, { hot: true });
    }
    if (this.msg) ui.text(this.msg, x + 380, y + 396, '#d8c8a0');
  }
}

// ---------- 会议 ----------
export class MeetingModal implements Modal {
  sel: Proposal | null = null; result: string | null = null; scroll = 0;
  draw(app: App) {
    const ui = app.ui, w = app.w!, me = player(w);
    const { x, y } = frameModal(ui, 820, 460, '召集开会');
    closeBtn(ui, app, x + 820, y);
    const props = availableProposals(w, me);
    ui.text(`决策方式：${RULE_TEXT.decision[w.politics.rules.decision]} · ${RULE_TEXT.ballot[w.politics.rules.ballot]}`, x + 16, y + 24, '#9aa0a8');
    if (this.result !== null) {
      ui.para(this.result, x + 16, y + 60, 780, '#f0e0b8', 18);
      ui.button(x + 820 - 110, y + 430, 96, 20, '散会', () => app.pop(), { hot: true });
      return;
    }
    if (ui.wheel && ui.hover(x, y, 360, 460)) this.scroll = Math.max(0, Math.min(props.length - 20, this.scroll + ui.wheel * 3));
    let yy = y + 46;
    for (const pr of props.slice(this.scroll, this.scroll + 22)) { yy = ui.option(x + 8, yy, 350, pr.label, () => { this.sel = pr; }, {}); }
    if (props.length > 22) ui.text('（滚轮翻页）', x + 16, y + 440, '#5a5e64');
    if (this.sel) {
      const pr = this.sel;
      const px = x + 380;
      ui.text(pr.label, px, y + 46, '#f0d8a0');
      ui.text('你估计大家的态度：', px, y + 70, '#9aa0a8');
      let vy = y + 92, yes = 0, no = 0;
      for (const p of present(w)) {
        if (p.isPlayer) continue;
        const r = rel(w, p.id, me.id);
        const s = support(w, p, pr, me);
        const see = r.trust > 40 || r.affection > 55 || p.pers.social > 65;
        const mark = !see ? '？' : s > 20 ? '赞成' : s > 5 ? '倾向赞成' : s < -20 ? '反对' : s < -5 ? '倾向反对' : '犹豫';
        const col = !see ? '#6a6e74' : s > 5 ? '#6ab06a' : s < -5 ? '#c05050' : '#a8a098';
        if (see && s > 8) yes++; if (see && s < -8) no++;
        ui.image(headCanvas(p.id, look(p)), px, vy - 2, 16, 16);
        ui.text(p.name, px + 22, vy, '#c8c0b0'); ui.text(mark, px + 110, vy, col);
        vy += 18;
      }
      ui.text(`看得出来的：赞成 ${yes} · 反对 ${no}（还有你自己一票）`, px, vy + 6, '#d8c8a0');
      ui.button(px, y + 420, 140, 22, '提出并表决（我赞成）', () => { this.result = holdVote(w, pr, me, 'yes').text + (pr.kind === 'punish' || pr.kind === 'depose' ? '\n\n被你提到名字的人不会忘记今天。' : ''); }, { hot: true });
    } else ui.para('选择左边的一项议题。\n\n规矩不是开关：通过了，还得有人遵守。每个人会根据自己的利益、对你的看法、对领导者的畏惧来投票。', x + 380, y + 60, 420, '#9aa0a8', 18);
  }
}

// ---------- 规矩与权力 ----------
export class RulesModal implements Modal {
  draw(app: App) {
    const ui = app.ui, w = app.w!;
    const { x, y } = frameModal(ui, 700, 440, '规矩与权力');
    closeBtn(ui, app, x + 700, y);
    const pol = w.politics; const r = pol.rules;
    const L = P(w, pol.leader);
    let yy = y + 28;
    ui.text(`领导者：${L ? (L.isPlayer ? '你' : L.name) : '没有'}${L ? `　合法性 ${Math.round(pol.legitimacy)}` : ''}`, x + 16, yy, '#f0d8a0'); yy += 18;
    ui.text(`仓库钥匙：${nm(w, w.shelter.keyHolder)}`, x + 16, yy, '#d8c8a0'); yy += 24;
    const rows: [string, string][] = [['口粮', `${RULE_TEXT.ration[r.ration]}，每人每天 ${r.rationSize} 份`], ['仓库', r.storageLocked ? '上锁' : '敞开'], ['门', RULE_TEXT.door[r.door]], ['武器', RULE_TEXT.weapons[r.weapons]], ['男女之事', RULE_TEXT.intimacy[r.intimacy]], ['决策', RULE_TEXT.decision[r.decision]], ['投票', RULE_TEXT.ballot[r.ballot]], ['守夜', r.nightWatch ? `有（${nm(w, w.people.find((p) => p.role === 'guard')?.id)}）` : '没有']];
    for (const [k, v] of rows) { ui.text(k, x + 16, yy, '#9aa0a8'); ui.text(v, x + 100, yy, '#d8d0c0'); yy += 17; }
    yy += 10;
    ui.text('派系（谁和谁站在一起）', x + 16, yy, '#e8c890'); yy += 18;
    for (const g of factions(w)) { ui.text(g.map((p) => (p.isPlayer ? '你' : p.name)).join('、'), x + 16, yy, '#c8c0b0'); yy += 16; }
    let hy = y + 28;
    ui.text('大事记', x + 380, hy, '#e8c890'); hy += 18;
    for (const h of pol.history.slice(-18).reverse()) { hy = ui.para(h, x + 380, hy, 300, '#a8a098', 15); if (hy > y + 420) break; }
  }
}
export function factions(w: World): Person[][] {
  const ppl = present(w);
  const groups: Person[][] = [];
  const used = new Set<string>();
  for (const p of ppl) {
    if (used.has(p.id)) continue;
    const g = [p]; used.add(p.id);
    for (const q of ppl) if (!used.has(q.id) && opinion(w, p.id, q.id) > 50 && opinion(w, q.id, p.id) > 50) { g.push(q); used.add(q.id); }
    groups.push(g);
  }
  return groups.sort((a, b) => b.length - a.length);
}

// ---------- 目标日志 ----------
export class JournalModal implements Modal {
  sel: string | null = null; scroll = 0;
  draw(app: App) {
    const ui = app.ui, w = app.w!, me = player(w);
    const { x, y } = frameModal(ui, 900, 500, '人生 · 目标与路线');
    closeBtn(ui, app, x + 900, y);
    const nodes = journalNodes(w, me);
    const done = w.done[me.id] || {};
    if (!this.sel && nodes.length) this.sel = nodes.find((n) => !done[n.id])?.id || nodes[0].id;
    ui.text('你唯一必须做的事：活下去。其他的，由你决定。', x + 16, y + 24, '#c8b890');
    let yy = y + 46;
    const routes = ['生存', '信息', '离开', '掌权', '财富', '爱情', '集体', '重建', '依附', '反抗', '复仇'];
    if (ui.wheel && ui.hover(x, y, 300, 500)) this.scroll = Math.max(0, this.scroll + ui.wheel * 2);
    const sorted = nodes.slice().sort((a, b) => routes.indexOf(a.routes[0]) - routes.indexOf(b.routes[0]) || (done[a.id] ? 1 : 0) - (done[b.id] ? 1 : 0));
    let lastRoute = '';
    let skip = this.scroll;
    for (const n of sorted) {
      if (n.routes[0] !== lastRoute) { lastRoute = n.routes[0]; if (skip > 0) { skip--; } else { ui.text(`— ${lastRoute} —`, x + 16, yy, '#6a7078'); yy += 16; } }
      if (skip > 0) { skip--; continue; }
      const st = done[n.id] ? '✔' : n.methods.some((m) => methodVisible(m, w, me) && methodReady(m, w, me)) ? '◆' : '○';
      const tracked = w.tracked.includes(n.id);
      yy = ui.option(x + 8, yy, 290, `${st} ${n.title}${tracked ? ' ★' : ''}`, () => { this.sel = n.id; }, {});
      if (yy > y + 486) break;
    }
    ui.text('✔ 达成　◆ 有能做的办法　○ 还差条件', x + 16, y + 484, '#5a5e64');
    const n = this.sel ? nodeOf(this.sel, w) : null;
    if (!n) return;
    const px = x + 320;
    ui.text(n.title, px, y + 46, done[n.id] ? '#a0d890' : '#f0d8a0');
    ui.text(n.routes.join(' · '), px + ui.measure(n.title) + 12, y + 46, '#6a7078');
    let dy = ui.para(n.desc, px, y + 66, 560, '#c8c0b0', 17);
    if (n.terminal) { ui.text('（达成即结束这一局）', px, dy, '#c08040'); dy += 18; }
    if (done[n.id]) { ui.text(`第 ${Math.floor((done[n.id] + 480) / 1440) + 1} 天达成。`, px, dy, '#a0d890'); dy += 20; }
    ui.button(x + 900 - 110, y + 40, 96, 20, w.tracked.includes(n.id) ? '取消追踪' : '追踪', () => { if (w.tracked.includes(n.id)) w.tracked = w.tracked.filter((t) => t !== n.id); else w.tracked.push(n.id); });
    dy += 6;
    ui.text('办法', px, dy, '#e8c890'); dy += 18;
    for (const m of n.methods) {
      if (!methodVisible(m, w, me)) continue;
      const ready = methodReady(m, w, me);
      ui.text(`${ready ? '◆' : '○'} ${m.label}`, px, dy, ready ? '#f0e0b0' : '#a8a098');
      let tx2 = px + ui.measure(`○ ${m.label}`) + 14; for (const t of m.tags) { tx2 += ui.tag(tx2, dy, t, '#c8c0b0', m.adult ? '#4a2440' : '#2c3036'); }
      dy += 17;
      for (const r of m.reqs) { const ok = r.ok(w, me); ui.text(`${ok ? '✓' : '✗'} ${r.text}`, px + 18, dy, ok ? '#80b070' : '#a06060'); dy += 15; }
      dy = ui.para(`→ ${m.how}`, px + 18, dy, 540, '#7a8a9a', 15) + 6;
      if (dy > y + 470) break;
    }
    // 别人在追什么（你能看出的）
    const others = present(w).filter((p) => !p.isPlayer && p.goals.includes(n.id) && (rel(w, p.id, me.id).trust > 55 || p.secrets.some((s) => s.known.includes(me.id))));
    if (others.length && dy < y + 470) ui.text(`你知道也想要这个的人：${others.map((p) => p.name).join('、')}`, px, dy, '#d89a6a');
  }
}

// ---------- 关系网 ----------
export class RelationsModal implements Modal {
  draw(app: App) {
    const ui = app.ui, w = app.w!, me = player(w);
    const { x, y } = frameModal(ui, 900, 500, '关系网');
    closeBtn(ui, app, x + 900, y);
    const ppl = w.people.filter((p) => !p.external && (p.present || p.isPlayer || (p.alive && !p.leftReason)) && p.alive);
    const cx = x + 300, cy = y + 260, R = 190;
    const pos: Record<string, [number, number]> = {};
    const others = ppl.filter((p) => !p.isPlayer);
    pos[me.id] = [cx, cy];
    others.forEach((p, i) => { const a = (i / others.length) * Math.PI * 2 - Math.PI / 2; pos[p.id] = [cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.85]; });
    // 连线：对你的主导情感
    const lineCol = (a: string, b: string) => { const r = rel(w, a, b); const m = Math.max(r.trust, r.affection, r.fear, r.resentment, r.desire); if (m < 45) return null; if (m === r.resentment) return '#c04040'; if (m === r.fear) return '#8a6ac0'; if (m === r.desire && (r.trust > 50 || b === me.id)) return '#c05a9a'; if (m === r.affection) return '#6ab06a'; return '#5a8ac8'; };
    const drawLine = (a: string, b: string, col: string, wd: number, dashed: boolean) => { const [x0, y0] = pos[a], [x1, y1] = pos[b]; const n = Math.hypot(x1 - x0, y1 - y0) | 0; for (let i = 0; i < n; i += 1) { if (dashed && (i >> 3) % 2) continue; ui.rect(Math.round(x0 + (x1 - x0) * i / n - wd / 2), Math.round(y0 + (y1 - y0) * i / n - wd / 2), wd, wd, col); } };
    for (const a of others) for (const b of others) if (a.id < b.id) { const r1 = rel(w, a.id, b.id); const known = rel(w, me.id, a.id).trust > 50 || r1.state === 'lovers'; const c = lineCol(a.id, b.id); if (c && known) drawLine(a.id, b.id, c, 1, true); if (['lovers', 'affair'].includes(r1.state) && (known || w.rumors.some((rr) => rr.about.includes(a.id) && rr.about.includes(b.id) && me.knows['rumor:' + rr.id]))) drawLine(a.id, b.id, '#ff7ab0', 2, false); }
    for (const p of others) { const c = lineCol(p.id, me.id); if (c) drawLine(p.id, me.id, c, 2, false); }
    for (const p of ppl) {
      const [px, py] = pos[p.id];
      const big = p.isPlayer;
      const sz = big ? 48 : 32;
      ui.rect(px - sz / 2 - 2, py - sz / 2 - 2, sz + 4, sz + 4, big ? '#f0d040' : w.politics.leader === p.id ? '#d8a040' : '#07080a');
      ui.image(headCanvas(p.id, look(p)), px - sz / 2, py - sz / 2, sz, sz);
      ui.text(p.isPlayer ? '你' : p.name, px, py + sz / 2 + 3, '#d8d0c0', { align: 'center', shadow: '#000' });
      if (!p.isPlayer) ui.region(px - sz / 2, py - sz / 2, sz, sz + 16, () => app.push(new PersonModal(p.id)));
      if (!p.isPlayer && ui.hover(px - sz / 2, py - sz / 2, sz, sz)) { const r = rel(w, p.id, me.id); ui.hoverTip = `${p.name}对你：信任${Math.round(r.trust)} 好感${Math.round(r.affection)} 畏惧${Math.round(r.fear)} 怨恨${Math.round(r.resentment)}\n点击看档案`; }
    }
    const lg: [string, string][] = [['信任', '#5a8ac8'], ['好感', '#6ab06a'], ['欲望', '#c05a9a'], ['畏惧', '#8a6ac0'], ['怨恨', '#c04040'], ['恋人', '#ff7ab0']];
    lg.forEach(([n, c], i) => { ui.rect(x + 620, y + 40 + i * 18 + 5, 14, 4, c); ui.text(n, x + 640, y + 40 + i * 18, '#a8a098'); });
    ui.text('粗线：别人对你的主导情感', x + 620, y + 160, '#6a7078'); ui.text('虚线：你知道的他们之间的关系', x + 620, y + 176, '#6a7078');
    let ly = y + 210;
    ui.text('你的名声', x + 620, ly, '#e8c890'); ly += 18;
    for (const p of others.slice().sort((a, b) => opinion(w, b.id, me.id) - opinion(w, a.id, me.id))) { const o = opinion(w, p.id, me.id); ui.text(`${p.name}`, x + 620, ly, '#c8c0b0'); ui.bar(x + 690, ly + 2, 150, 9, (o + 40) / 120, o > 40 ? '#6ab06a' : o > 10 ? '#a8a060' : '#c05050'); ly += 16; if (ly > y + 480) break; }
  }
}

// ---------- 人物档案 ----------
export class PersonModal implements Modal {
  constructor(public id: string) {}
  draw(app: App) {
    const ui = app.ui, w = app.w!, me = player(w), p = P(w, this.id)!;
    const { x, y } = frameModal(ui, 860, 480, `档案 · ${p.name}`);
    closeBtn(ui, app, x + 860, y);
    portraitBox(ui, p, x + 16, y + 26);
    const r = rel(w, p.id, me.id), mine = rel(w, me.id, p.id);
    const open = r.trust > 55 || r.affection > 65 || r.debt > 30;
    let yy = y + 26;
    const tx = x + 110;
    ui.text(`${p.name}　${p.age} 岁 · ${p.gender === 'f' ? '女' : '男'} · ${p.originText}`, tx, yy, '#f0d8a0'); yy += 18;
    yy = ui.para(p.bio, tx, yy, 300, '#c8c0b0', 16) + 4;
    let tagx = tx; for (const t of p.traits) tagx += ui.tag(tagx, yy, t, '#d8e8c8', '#2a3a24'); yy += 22;
    ui.text('本事（你看得出的）', tx, yy, '#9aa0a8'); yy += 16;
    let col = 0; for (const [k, n] of Object.entries(SKILL_NAMES)) { const v = p.skills[k as keyof typeof p.skills]; if (v >= 40 || open) { ui.text(`${n}${open ? Math.round(v) : v >= 60 ? '强' : '会'}`, tx + (col % 4) * 70, yy + Math.floor(col / 4) * 15, '#c8c0b0'); col++; } }
    yy += 36;
    // 人格推测
    const guess = (v: number) => (open ? Math.round(v) : v > 70 ? '高' : v < 30 ? '低' : '？');
    ui.text(`权力欲 ${guess(p.pers.power)}　道德底线 ${guess(p.pers.morality)}　胆量 ${guess(p.pers.fear)}　依附 ${guess(p.pers.attach)}`, tx, yy, '#a8a098'); yy += 22;
    // 他想要什么
    ui.text('想要什么', tx, yy, '#e8c890'); yy += 16;
    const g = p.goals.map((id) => nodeOf(id, w)?.title || id);
    ui.text(open ? g.slice(0, 3).join('、') || '活下去' : '（你还不够了解' + pron(p) + '）', tx, yy, open ? '#d8c8a0' : '#6a6e74'); yy += 22;
    // 秘密
    ui.text('你知道的秘密', tx, yy, '#e8c890'); yy += 16;
    const secs = p.secrets.filter((s) => s.known.includes(me.id));
    if (secs.length) for (const s of secs) { yy = ui.para('· ' + s.text, tx, yy, 330, '#e8a090', 16); }
    else { ui.text(`🔒 ${p.secrets.length} 个`, tx, yy, '#6a6e74'); yy += 16; }
    const rums = w.rumors.filter((rr) => rr.about.includes(p.id) && me.knows['rumor:' + rr.id]);
    if (rums.length) { yy += 4; ui.text('听来的', tx, yy, '#e8c890'); yy += 16; for (const rr of rums.slice(0, 4)) yy = ui.para('· ' + rr.text, tx, yy, 330, '#c8a8b8', 16); }
    // 右侧：记忆与关系
    const rx = x + 470;
    ui.text(`${pron(p)}记得的事（与你有关）`, rx, y + 26, '#e8c890');
    let my = y + 46;
    const mems = p.mem.filter((m) => m.who === me.id);
    if (!open && mems.length) ui.text('（' + pron(p) + '没跟你说过）', rx, my, '#6a6e74');
    else for (const m of mems.slice(0, 8)) { ui.text(`D${Math.floor((m.t + 480) / 1440) + 1}`, rx, my, '#6a6058'); my = ui.para(m.text, rx + 34, my, 300, m.w > 0 ? '#a0c890' : '#e8a090', 16); }
    my = Math.max(my, y + 200) + 10;
    ui.text('你们之间', rx, my, '#e8c890'); my += 18;
    const rowsR: [string, number, number][] = [['信任', r.trust, mine.trust], ['好感', r.affection, mine.affection], ['尊重', r.respect, mine.respect], ['畏惧', r.fear, mine.fear], ['怨恨', r.resentment, mine.resentment], ['欲望', r.desire, mine.desire], ['人情', r.debt, mine.debt]];
    ui.text(`${pron(p)}对你`, rx + 60, my, '#8a9098'); ui.text(`你对${pron(p)}`, rx + 220, my, '#8a9098'); my += 16;
    for (const [n, a, b] of rowsR) { ui.text(n, rx, my, '#9aa0a8'); ui.bar(rx + 40, my + 2, 140, 9, (n === '人情' ? a + 100 : a * 2) / 200, '#a8a080'); ui.bar(rx + 200, my + 2, 140, 9, (n === '人情' ? b + 100 : b * 2) / 200, '#80a0a8'); my += 15; }
    my += 6;
    const st = { stranger: '陌生', acquainted: '熟人', friend: '朋友', flirting: '暧昧', lovers: '恋人', affair: '情人', transactional: '交易', patronage: '庇护', domination: '支配', enemy: '仇人' }[r.state];
    ui.text(`关系：${st}　亲密 ${r.times} 次　吸引力 ${w.settings.adult ? Math.round(attraction(w, p, me)) : '-'}`, rx, my, '#c8a8b8');
  }
}

// ---------- 物品 ----------
export class InventoryModal implements Modal {
  draw(app: App) {
    const ui = app.ui, w = app.w!, me = player(w);
    const { x, y } = frameModal(ui, 640, 420, '你的东西');
    closeBtn(ui, app, x + 640, y);
    let yy = y + 28;
    const items = Object.entries(me.inv).filter(([, v]) => (v || 0) > 0);
    if (!items.length) ui.text('空空如也。', x + 16, yy, '#8a9098');
    for (const [k, v] of items) {
      const key = k as ItemKey;
      ui.text(`${ITEMS[key].name}　${Math.floor((v || 0) * 10) / 10}${ITEMS[key].unit || ''}`, x + 16, yy, '#e8dcc0');
      ui.text(trim(ui, ITEMS[key].desc, 300), x + 160, yy, '#8a9098');
      const act = (label: string, fn: () => void) => ui.button(x + 480, yy - 2, 70, 17, label, fn);
      if (key === 'food') act('吃', () => { me.action = { ...mk('eat', 'kitchen', { obj: 'table', dur: 12 }), playerCmd: true }; app.pop(); });
      if (key === 'cigs') act('抽一根', () => { me.action = { ...mk('smoke', roomOf(me), { x: me.x, dur: 8 }), playerCmd: true }; app.pop(); });
      if (key === 'alcohol') act('喝两口', () => { me.action = { ...mk('booze', roomOf(me), { x: me.x, dur: 25 }), playerCmd: true }; app.pop(); });
      if (key === 'blankPermit') act('伪造', () => { me.action = { ...mk('forge', 'lower', { x: 120, dur: 120 }), playerCmd: true, secret: true }; app.pop(); }, );
      if (key === 'meds' || key === 'bandage') act('用在自己身上', () => { import('../sim/social').then((s) => { s.treat(w, me, me); app.toast('你处理了一下伤病。'); }); });
      if (!['storageKey', 'archiveKey', 'pass', 'forgedPass', 'papers', 'map'].includes(key)) ui.button(x + 556, yy - 2, 70, 17, '扔掉', () => { takeItem(me.inv, key, 1); });
      yy += 20;
    }
    if (Object.keys(me.stash).length) { yy += 10; ui.text('藏起来的（下层小间）', x + 16, yy, '#c89aa8'); yy += 18; for (const [k, v] of Object.entries(me.stash)) { ui.text(`${ITEMS[k as ItemKey].name} ${Math.floor((v || 0) * 10) / 10}`, x + 16, yy, '#c8b8c0'); yy += 16; } }
    ui.text(`携带价值约 ${Math.round(bagValue(me.inv))} 份口粮`, x + 16, y + 396, '#6a7078');
  }
}

// ---------- 日志 ----------
export class LogModal implements Modal {
  scroll = 0;
  draw(app: App) {
    const ui = app.ui, w = app.w!;
    const { x, y } = frameModal(ui, 760, 480, '发生过的事');
    closeBtn(ui, app, x + 760, y);
    if (ui.wheel) this.scroll = Math.max(0, Math.min(w.log.length - 10, this.scroll + ui.wheel * 3));
    let yy = y + 26;
    for (const l of w.log.slice(this.scroll)) {
      const d = Math.floor((l.t + 480) / 1440) + 1; const m = (l.t + 480) % 1440;
      ui.text(`第${d}天 ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, x + 14, yy, '#5a6068');
      yy = ui.para(l.text, x + 120, yy, 620, l.col || '#c8c0b0', 16);
      if (yy > y + 460) break;
    }
  }
}

// ---------- 帮助 ----------
export class HelpModal implements Modal {
  draw(app: App) {
    const ui = app.ui;
    const { x, y } = frameModal(ui, 720, 460, '怎么玩');
    closeBtn(ui, app, x + 720, y);
    ui.para(`你只控制一个人。其他人有自己的需要、打算和算计——他们不会等你。

· 点地面：走过去。点人：和他说话、交易、示好、威胁……点物件（仓库、炉灶、发电机、床、收音机……）：使用它。
· 空格暂停，1~4 调速度。J 目标，R 关系，I 物品，L 日志，Esc 菜单。
· 身体：饱、水、暖、精力、健康。冷和饿会慢慢杀死你；没有电就没有暖气和灯。摇通风机，不然空气会变浑。
· 口粮：规矩决定口粮怎么分。仓库没上锁时谁都能拿——也谁都可能拿光。你可以召集开会，改规矩、推举或罢免领导者、惩罚别人。
· 外出：从气闸的防爆门或竖井出去。夜里更安全。地表上能找到吃的、药、燃料、零件，也能找到军营、黑市、红十字站——以及子弹。
· 目标：没有主线。打开「目标」看看你知道的人生方向：离开、掌权、爱一个人、让避难所活下去、攀附强者……每个目标都有好几种办法。别人也在追求他们的目标，而且可能和你抢。
· 结局：不分好坏。你是谁，由你做过的事和别人怎么看你决定。`, x + 18, y + 28, 684, '#d8d0c0', 19);
  }
}

// ---------- 暂停菜单 ----------
export class PauseMenu implements Modal {
  msg = ''; sub: 'main' | 'save' | 'load' | 'settings' = 'main';
  draw(app: App) {
    const ui = app.ui, w = app.w!;
    const { x, y } = frameModal(ui, 420, 420, '菜单');
    let yy = y + 30;
    const btn = (label: string, fn: () => void, opt = {}) => { ui.button(x + 60, yy, 300, 24, label, fn, opt); yy += 30; };
    if (this.sub === 'main') {
      btn('继续', () => app.pop(), { hot: true });
      btn('存档', () => { this.sub = 'save'; });
      btn('读档', () => { this.sub = 'load'; });
      btn('设置', () => { this.sub = 'settings'; });
      btn('怎么玩', () => app.push(new HelpModal()));
      btn('回到标题', () => { saveGame(w, 'auto'); app.modals = []; app.screen = 'title'; app.w = null; });
    } else if (this.sub === 'save' || this.sub === 'load') {
      for (const slot of ['1', '2', '3', 'auto']) {
        const info = listSaves()[slot];
        const label = `${slot === 'auto' ? '自动存档' : '存档 ' + slot}　${info ? `第 ${info.day} 天 · ${info.name}` : '（空）'}`;
        if (this.sub === 'save' && slot !== 'auto') btn(label, () => { saveGame(w, slot); this.msg = '已保存。'; });
        if (this.sub === 'load') btn(label, () => { const nw = loadGame(slot); if (nw) { app.w = nw; app.modals = []; app.sel = null; } else this.msg = '这个位置是空的。'; }, { disabled: !info });
      }
      btn('返回', () => { this.sub = 'main'; });
    } else {
      const s = w.settings;
      btn(`成人内容：${s.adult ? '开' : '关'}`, () => { s.adult = !s.adult; if (s.adult) import('../content/adult').then((m) => m.loadAdultContent()); });
      btn(`胁迫主题：${s.coercion ? '开' : '关'}`, () => { s.coercion = !s.coercion; }, { tip: '关闭时，任何人都不会使用胁迫类行动。' });
      btn(`生育：${s.pregnancy ? '开' : '关'}`, () => { s.pregnancy = !s.pregnancy; });
      btn(`自动照顾自己：${s.autoNeeds !== false ? '开' : '关'}`, () => { s.autoNeeds = s.autoNeeds === false; }, { tip: '空闲时自己去喝水、吃饭、睡觉、取暖。' });
      btn(`需求告急时暂停：${s.autoPause !== false ? '开' : '关'}`, () => { s.autoPause = s.autoPause === false; });
      btn(`音效：${app.audio.on ? '开' : '关'}`, () => { app.audio.toggle(); });
      btn('返回', () => { this.sub = 'main'; });
    }
    if (this.msg) ui.text(this.msg, x + 210, y + 356, '#a0d890', { align: 'center' });
  }
}

// ---------- 地表 / 外出 ----------
export class MapModal implements Modal {
  sel: LocId | null = null; companions: string[] = []; carry: Partial<Record<ItemKey, number>> = {};
  buf = new Buf(480, 270); key = ''; cv: HTMLCanvasElement | null = null;
  out: string[] = [];
  pausesSim = true;
  constructor(app: App) {
    const c = app.w!.facts.tripCompanion as string | undefined;
    if (c && P(app.w!, c)?.present) this.companions.push(c);
    delete app.w!.facts.tripCompanion;
  }
  esc(app: App) { return !app.w!.trip; }
  bg(app: App) {
    const w = app.w!;
    const k = `${isDark(w)}${w.war.phase}${this.sel || w.trip?.loc}`;
    if (k !== this.key) { drawSurface(this.buf, isDark(w), w.war.phase, (w.trip?.loc || this.sel) as LocId | null); this.cv = this.buf.toCanvas({ levels: 8, tint: [0.45, 0.52, 0.85] }); this.key = k; }
    return this.cv!;
  }
  draw(app: App) {
    const ui = app.ui, w = app.w!, me = player(w);
    ui.blocker(0.2);
    // 背景全景（画在 UI 层 960×540：2 倍）
    ui.image(this.bg(app), 0, 0, 960, 540);
    const tr = w.trip;
    // 地点标记
    for (const id of LOC_LIST) {
      const L = LOCS[id]; const st = w.locs[id];
      if (!st.known || (L.phases && !L.phases.includes(w.war.phase))) continue;
      const mx = L.x * 2, my = 214 * 2 - 120;
      const hot = (tr ? tr.loc : this.sel) === id;
      ui.rect(mx - 5, my - 5, 11, 11, '#07080a'); ui.rect(mx - 4, my - 4, 9, 9, hot ? '#f0d040' : id === 'camp' ? '#c8a060' : id === 'market' ? '#c080c0' : id === 'redcross' ? '#e8e8e8' : '#a0b0c0');
      const lw = ui.measure(L.name) + 8; ui.rect(mx - lw / 2, my - 24, lw, 15, 'rgba(0,0,0,0.7)'); ui.text(L.name, mx, my - 23, hot ? '#f0d040' : '#d8d0c0', { align: 'center' });
      if (!tr) ui.region(mx - 30, my - 26, 60, 40, () => { this.sel = id; });
    }
    ui.text('避难所', 30, 214 * 2 - 50, '#d8d0c0', { align: 'center' });
    if (!tr) this.planPanel(app);
    else this.tripPanel(app);
  }
  planPanel(app: App) {
    const ui = app.ui, w = app.w!, me = player(w);
    ui.panel(10, 10, 300, 120, { title: '外出', titleBg: '#1a2230', titleCol: '#a8c0e0' });
    ui.text(`${clock(w)}　${isDark(w) ? '天黑了：巡逻少，但更冷' : '白天：更容易被发现'}`, 22, 32, isDark(w) ? '#a0c0d8' : '#e8c890');
    ui.text(`体温 ${Math.round(me.needs.warmth)}　健康 ${Math.round(me.health)}　精力 ${Math.round(me.needs.energy)}`, 22, 50, '#c8c0b0');
    ui.text(`室外 ${Math.round(w.shelter.tempOut)}°C　战争阶段：${PHASE_NAMES[w.war.phase]}`, 22, 68, '#8a9098');
    ui.button(22, 96, 120, 22, '算了，回去', () => app.pop());
    if (!this.sel) { ui.panel(320, 10, 400, 40, { rivets: false }); ui.text('点一个地点。', 332, 22, '#d8d0c0'); return; }
    const L = LOCS[this.sel]; const st = w.locs[this.sel];
    const px = 590, py = 10, pw = 360, ph = 360;
    ui.panel(px, py, pw, ph, { title: L.name, titleBg: '#1a2230', titleCol: '#a8c0e0' });
    let yy = ui.para(L.desc, px + 12, py + 24, pw - 24, '#c8c0b0', 16) + 4;
    const dg = L.danger[w.war.phase - 1];
    ui.text(`危险：${dg < 20 ? '低' : dg < 40 ? '中' : dg < 60 ? '高' : '极高'}　单程约 ${Math.round(tripTravel(w, this.sel) / 60 * 10) / 10} 小时`, px + 12, yy, dg >= 45 ? '#e8806a' : '#c8c0b0'); yy += 17;
    if (L.loot) { ui.text(`搜刮程度：${Math.round(st.looted)}%　来过 ${st.visits} 次`, px + 12, yy, '#8a9098'); yy += 17; }
    if (this.sel === 'camp') { ui.text(`驻扎的是：${milName(w)}`, px + 12, yy, '#d8b060'); yy += 17; }
    yy += 4;
    ui.text('同行的人（越多越能扛，也越容易被发现）', px + 12, yy, '#e8c890'); yy += 18;
    for (const p of present(w).filter((q) => !q.isPlayer && awake(q) && !hasCond(q, 'captive'))) {
      const r = rel(w, p.id, me.id);
      const will = r.trust * 0.5 + r.affection * 0.3 + r.debt * 0.4 + p.pers.fear * 0.3 - 30;
      const on = this.companions.includes(p.id);
      const ok = will > 20 || p.partner === me.id;
      ui.option(px + 6, yy, pw - 12, `${on ? '☑' : '☐'} ${p.name}`, () => { if (!ok) { app.toast(`${p.name}：「我不去。」`); return; } this.companions = on ? this.companions.filter((c) => c !== p.id) : [...this.companions, p.id]; }, { tags: ok ? [[`格斗${Math.round(p.skills.combat)} 潜行${Math.round(p.skills.stealth)}`, '#8a9098']] : [['不愿意', '#a06060']] });
      yy += 17; if (yy > py + 250) break;
    }
    yy += 4;
    ui.text('从仓库带上（用来交易）', px + 12, yy, '#e8c890'); yy += 18;
    for (const k of ['food', 'cigs', 'alcohol', 'meds', 'valuables'] as ItemKey[]) {
      if (cnt(w.storage, k) < 1) continue;
      const n = this.carry[k] || 0;
      ui.text(`${ITEMS[k].name}（仓库 ${Math.floor(cnt(w.storage, k))}）`, px + 12, yy, '#c8c0b0');
      ui.button(px + 230, yy - 2, 20, 16, '−', () => { this.carry[k] = Math.max(0, n - 1); });
      ui.text(String(n), px + 262, yy, '#f0d8a0', { align: 'center' });
      ui.button(px + 274, yy - 2, 20, 16, '+', () => { if (n < cnt(w.storage, k)) this.carry[k] = n + 1; });
      yy += 18; if (yy > py + ph - 40) break;
    }
    const taking = Object.values(this.carry).some((v) => v);
    ui.button(px + pw - 120, py + ph - 30, 108, 22, '出发', () => {
      if (taking && !w.politics.rules.storageLocked && w.politics.rules.ration === 'free') { /* 自取 */ }
      else if (taking && w.shelter.keyHolder !== me.id && w.politics.leader !== me.id) { for (const q of present(w)) if (!q.isPlayer && awake(q)) relAdd(w, q.id, me.id, { trust: -3 }); }
      startTrip(w, this.sel!, this.companions, this.carry);
    }, { hot: true, disabled: me.health < 25 });
  }
  tripPanel(app: App) {
    const ui = app.ui, w = app.w!, tr = w.trip!;
    const L = LOCS[tr.loc];
    const px = 590, py = 10, pw = 360, ph = 520;
    ui.panel(px, py, pw, ph, { title: `${L.name}${tr.stage === 'going' ? ' · 路上' : tr.stage === 'back' ? ' · 回程' : ''}`, titleBg: '#1a2230', titleCol: '#a8c0e0' });
    const team = tr.members.map((id) => P(w, id)!).filter(Boolean);
    let yy = py + 24;
    ui.text(`${clock(w)}　${team.map((p) => (p.isPlayer ? '你' : p.name)).join('、')}`, px + 12, yy, '#c8c0b0'); yy += 18;
    const me = player(w);
    ui.text(`体温 ${Math.round(me.needs.warmth)}　健康 ${Math.round(me.health)}　身上：${trim(ui, Object.entries(me.inv).filter(([, v]) => v).map(([k, v]) => ITEMS[k as ItemKey].name + Math.floor(v || 0)).join(' '), 200)}`, px + 12, yy, '#8a9098'); yy += 20;
    if (tr.stage === 'going' || tr.stage === 'back') {
      const left = Math.max(0, tr.until - w.t);
      ui.text(tr.stage === 'going' ? `在雪地里走……还要 ${left} 分钟` : `往回走……还要 ${left} 分钟`, px + 12, yy, '#a0c0d8');
      return;
    }
    // 结果文字
    for (const t of this.out.slice(-6)) { yy = ui.para(t, px + 12, yy, pw - 24, '#e8dcc0', 16) + 4; }
    yy = Math.max(yy, py + 230);
    ui.rect(px + 8, yy, pw - 16, 1, '#3a3e44'); yy += 8;
    if (tr.encounter) {
      const e = tr.encounter;
      yy = ui.para(e.text, px + 12, yy, pw - 24, '#f0c8a0', 16) + 6;
      for (const o of e.options) yy = ui.option(px + 6, yy, pw - 12, o.label, () => { this.out.push(resolveEncounter(w, o.id)); this.advanceAfter(app, 20); });
      return;
    }
    const acts = locActions(w);
    for (const a of acts) {
      yy = ui.option(px + 6, yy, pw - 12, a.label, () => this.doAct(app, a.id, a.cost), { disabled: !a.ok, tags: !a.ok && a.why ? [[a.why, '#7a6a6a']] : a.cost ? [[`${a.cost} 分钟`, '#6a7078']] : [], tip: a.tip });
      if (yy > py + ph - 10) break;
    }
  }
  doAct(app: App, id: string, cost: number) {
    const w = app.w!;
    const r = doLocAction(w, id);
    if (r.startsWith('TRADE:')) { app.push(new LocTradeModal(r.slice(6) as 'camp' | 'market')); return; }
    if (r === 'REPORT') { app.push(new ReportModal()); return; }
    if (r.startsWith('INTIM:')) { app.push(new LocIntimModal(r.slice(6), this)); return; }
    if (r) this.out.push(r);
    this.advanceAfter(app, cost);
  }
  advanceAfter(app: App, minutes: number) {
    const w = app.w!;
    for (let i = 0; i < minutes && !w.ending; i++) { stepMinute(w); const v = nextEvent(w); if (v) { app.openEvent(v); break; } }
    if (w.ending) { app.modals = []; return; }
    if (!w.trip) { app.pop(); if (hasCond(player(w), 'captive')) app.toast('你被抓走了。', '#e85a4a'); }
  }
}
// 赶路结束的处理（由 App.updateSim 调用）
export function tripTick(app: App) {
  const w = app.w!; const tr = w.trip!;
  if (tr.stage === 'going') tripArrive(w);
  else if (tr.stage === 'back') { tripHome(w); const m = app.modals.find((x) => x instanceof MapModal); if (m) app.modals = app.modals.filter((x) => x !== m); }
}

class LocTradeModal implements Modal {
  msg = '';
  constructor(public table: 'camp' | 'market') {}
  draw(app: App) {
    const ui = app.ui, w = app.w!, me = player(w);
    const rows = TRADE_TABLES[this.table];
    const { x, y } = frameModal(ui, 480, 80 + rows.length * 22, this.table === 'camp' ? '军需官的交换单' : '倒爷的价目');
    closeBtn(ui, app, x + 480, y);
    let yy = y + 30;
    rows.forEach((r, i) => {
      const ok = cnt(me.inv, r.give[0]) >= r.give[1];
      yy = ui.option(x + 8, yy, 464, `${ITEMS[r.give[0]].name}×${r.give[1]}  →  ${ITEMS[r.get[0]].name}×${r.get[1]}`, () => { this.msg = doTrade(w, this.table, i); }, { disabled: !ok, tags: [[`你有 ${Math.floor(cnt(me.inv, r.give[0]))}`, '#6a7078']] }) + 4;
    });
    if (this.msg) ui.text(this.msg, x + 16, yy + 4, '#a0d890');
  }
}
class ReportModal implements Modal {
  draw(app: App) {
    const ui = app.ui, w = app.w!, me = player(w);
    const cands = present(w).filter((q) => !q.isPlayer && (w.war.phase < 3 ? q.secrets.some((s) => s.id.includes('deserter') && s.known.includes(me.id)) || q.origin === 'deserter' && q.secrets.some((s) => s.known.includes(me.id)) : q.origin === 'cadre' || q.pers.regime === 'loyal'));
    const { x, y } = frameModal(ui, 480, 100 + cands.length * 20, '说出一个名字');
    closeBtn(ui, app, x + 480, y);
    let yy = y + 26;
    ui.text('军需官把笔推到你面前。', x + 16, yy, '#c8c0b0'); yy += 24;
    for (const q of cands) yy = ui.option(x + 8, yy, 464, q.name, () => { const t = report(w, q.id); app.pop(); const m = app.modals.find((mm) => mm instanceof MapModal) as MapModal | undefined; m?.out.push(t); }, { tags: [['牺牲他人', '#c05050']] });
    yy = ui.option(x + 8, yy + 6, 464, '……算了', () => app.pop());
  }
}
class LocIntimModal implements Modal {
  constructor(public id: string, public map: MapModal) {}
  draw(app: App) {
    const ui = app.ui, w = app.w!, me = player(w);
    const camp = this.id === 'mil_intim';
    const { x, y } = frameModal(ui, 560, 220, camp ? '军官' : '走私头子');
    ui.para(camp ? '军官把门关上，倒了两杯酒。「你想要的东西，我这儿有。问题是——你拿什么换？」' : '戴毛线帽的男人打量着你。「名额不便宜。不过……也不一定要付钱。」', x + 16, y + 28, 528, '#e8dcc0', 17);
    ui.option(x + 8, y + 120, 544, '答应', () => {
      w.pending.push({ id: 'scene', t: w.t, ctx: { hook: 'scene', initiator: 'external', partner: me.id, consent: 'reluctant', motive: ['交易'], deal: null, location: 'outside', external: camp ? '军官' : '走私头子' } });
      tagMethod(me, '亲密'); tagMethod(me, '交易');
      if (camp) { w.facts[`C_MIL:${me.id}`] = w.war.phase >= 3 ? 'occupier' : 'regime'; if (w.war.passSlots > 0) { w.war.passSlots--; addItem(me.inv, 'pass', 1); w.facts[`passOp:${me.id}`] = w.facts[`C_MIL:${me.id}`]; this.map.out.push('天亮前，你拿着一张通行证走了出来。'); } else this.map.out.push('他说名额已经没了。但他记住了你。'); }
      else { w.facts[`C_SMUG:${me.id}`] = true; if (w.war.smugSeats > 0) { w.war.smugSeats--; w.facts[`seat:${me.id}`] = true; this.map.out.push('「夜里，浅滩。」'); } }
      app.pop(); this.map.advanceAfter(app, 60);
    }, { tags: [['亲密', '#c05a9a'], ['交易', '#c08040']] });
    ui.option(x + 8, y + 140, 544, '拒绝', () => app.pop());
  }
}

// ---------- 暗渠 ----------
export class DrainModal implements Modal {
  companions: string[] = []; result: string | null = null;
  draw(app: App) {
    const ui = app.ui, w = app.w!, me = player(w);
    const { x, y } = frameModal(ui, 560, 360, '暗渠');
    closeBtn(ui, app, x + 560, y);
    if (this.result !== null) { ui.para(this.result, x + 16, y + 30, 528, '#e8dcc0', 18); ui.button(x + 450, y + 330, 96, 20, '继续', () => app.pop(), { hot: true }); return; }
    let yy = ui.para('暗渠又矮又窄，水没过脚踝，冷得像刀。尽头应该是界河。过了河，就是另一个国家。\n\n这是一条没有回头路的路。', x + 16, y + 28, 528, '#c8c0b0', 17) + 8;
    ui.text(`你有地图吗？${cnt(me.inv, 'map') ? '有。' : '没有。'}　毛毯？${cnt(me.inv, 'blanket') ? '有。' : '没有。'}`, x + 16, yy, '#a0c0d8'); yy += 22;
    ui.text('带谁一起走？', x + 16, yy, '#e8c890'); yy += 18;
    for (const p of present(w).filter((q) => !q.isPlayer && awake(q))) {
      const r = rel(w, p.id, me.id);
      const ok = p.partner === me.id || (r.trust > 60 && p.goals.includes('E_CROSS')) || r.affection > 75;
      const on = this.companions.includes(p.id);
      yy = ui.option(x + 8, yy, 544, `${on ? '☑' : '☐'} ${p.name}`, () => { if (ok) this.companions = on ? this.companions.filter((c) => c !== p.id) : [...this.companions, p.id]; else app.toast(`${p.name}摇了摇头。`); }, { tags: ok ? [] : [['不愿意', '#a06060']] });
    }
    ui.button(x + 400, y + 330, 146, 22, '钻进去', () => { this.result = crossDrain(w, this.companions); }, { hot: true });
  }
}

export { CONSENT_NAMES };
