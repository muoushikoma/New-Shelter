// 对话窗口：你说一句，对方回一句；对方也会反问你。内置行动（聊天、打听、送东西……）与内容包的对话树混在一起
import type { App, Modal } from './app';
import { UI_W, UI_H } from '../engine/ui';
import type { Person } from '../sim/types';
import { P, player, rel, opinion, pron } from '../sim/util';
import { portraitCanvas } from '../art/actors';
import { talkOptions, subOptions, doTalk, Opt, Result } from '../sim/player';
import { openers, pickAsk, pickAfter, enter, choose, DTopic, ShownOption, DOption } from '../content/dialogue';
import { pick } from '../engine/rng';
import * as M from './modals';

type Entry = { who: 'me' | 'npc' | 'narr'; text: string };
type Mode =
  | { kind: 'root' }
  | { kind: 'sub'; id: string; label: string; opts: Opt[] }
  | { kind: 'node'; topic: DTopic; options: ShownOption[] }
  | { kind: 'next'; opts: Opt[] };

const STATE_CN: Record<string, string> = { stranger: '陌生', acquainted: '熟人', friend: '朋友', flirting: '暧昧', lovers: '恋人', affair: '情人', transactional: '交易', patronage: '庇护', domination: '支配', enemy: '仇人' };

export class ConversationModal implements Modal {
  log: Entry[] = [];
  mode: Mode = { kind: 'root' };
  scroll = 0;
  constructor(app: App, public id: string) {
    const w = app.w!, t = this.npc(app)!;
    const op = opinion(w, t.id, player(w).id);
    const asleep = t.action?.type === 'sleep' && t.action.t > 0;
    this.add('narr', asleep ? `${t.name}睡着了。` : `你走到${t.name}身边。`);
    if (asleep) return;
    this.add('npc', op < -10 ? pick(w.rng, ['……干什么。', '（没抬头）有事？', '又是你。']) : op > 35 ? pick(w.rng, ['嗯？', '你来啦。', '（往旁边挪了挪，给你让出位置）']) : pick(w.rng, ['什么事？', '嗯。', '……']));
    // 对方可能先问你
    const q = pickAsk(w, t);
    if (q) this.enterTopic(app, q);
  }
  npc(app: App): Person | undefined { return P(app.w!, this.id); }
  add(who: Entry['who'], text: string | null | undefined) { if (text) { this.log.push({ who, text }); this.scroll = 0; } if (this.log.length > 80) this.log.shift(); }
  close(app: App) { const i = app.modals.indexOf(this); if (i >= 0) app.modals.splice(i, 1); app.ui.hits = []; }

  enterTopic(app: App, t: DTopic, node?: string) {
    const npc = this.npc(app)!;
    const r = enter(app.w!, npc, t, node);
    this.add('npc', r.line);
    this.mode = r.options.length ? { kind: 'node', topic: t, options: r.options } : { kind: 'root' };
  }

  // 内置行动：打听、送东西、讨吃的、示好……
  runBuiltin(app: App, o: Opt) {
    const w = app.w!, t = this.npc(app)!;
    if (o.id === 'observe') { app.push(new M.PersonModal(t.id)); return; }
    if (o.id === 'trade') { app.push(new M.TradeModal(t.id)); return; }
    const [who, text] = myLine(o, t);
    this.add(who, text);
    const res: Result = doTalk(w, t, o.id);
    this.afterResult(app, o.id, res);
  }
  afterResult(app: App, id: string, res: Result) {
    const w = app.w!, t = this.npc(app)!;
    if (res.next && res.nextFor) { this.add('narr', res.text); this.mode = { kind: 'next', opts: res.next }; return; }
    if (res.action) { this.add(res.who === t.id ? 'npc' : 'narr', res.text); this.close(app); app.applyResult({ action: res.action }, t); if (res.text) app.toast(res.text.slice(0, 40)); return; }
    if (res.ui) { this.add(res.who === t.id ? 'npc' : 'narr', res.text); app.applyResult({ ui: res.ui, arg: res.arg }, t); this.mode = { kind: 'root' }; return; }
    this.add(res.who === t.id ? 'npc' : 'narr', res.text);
    // 打起来了、人走了：对话结束
    if (!t.present || !t.alive || id === 'fight') { this.mode = { kind: 'root' }; this.add('narr', '对话结束了。'); return; }
    const act = res.tag || id;
    const f = pickAfter(w, t, act);
    if (f) { this.enterTopic(app, f); return; }
    if (id === 'chat') { const q = pickAsk(w, t, 1.5); if (q) { this.enterTopic(app, q); return; } }
    this.mode = { kind: 'root' };
  }

  // 对话树里的回答
  answer(app: App, so: ShownOption) {
    const w = app.w!, t = this.npc(app)!;
    if (this.mode.kind !== 'node') return;
    const topic = this.mode.topic;
    this.add('me', so.label);
    const o: DOption = so.opt;
    const r = choose(w, t, o);
    this.add('npc', r.reply);
    if (r.action) {
      const a = r.action;
      if (a === 'leave') { this.close(app); return; }
      if (a === 'trade') { app.push(new M.TradeModal(t.id)); this.mode = { kind: 'root' }; return; }
      if (a === 'observe') { app.push(new M.PersonModal(t.id)); this.mode = { kind: 'root' }; return; }
      if (a.startsWith('talk:')) { const id = a.slice(5); this.afterResult(app, id, doTalk(w, t, id)); return; }
      if (a.startsWith('topic:')) { const nt = (openers(w, t, 'chat').concat(openers(w, t, 'ask'))).find((x) => x.id === a.slice(6)) || null; if (nt) { this.enterTopic(app, nt); return; } }
    }
    if (r.next) { this.enterTopic(app, topic, r.next); return; }
    this.mode = { kind: 'root' };
  }

  rootOptions(app: App): { label: string; ok: boolean; why?: string; tags?: [string, string][]; tip?: string; fn: () => void }[] {
    const w = app.w!, t = this.npc(app)!;
    const out: ReturnType<ConversationModal['rootOptions']> = [];
    for (const o of talkOptions(w, t)) {
      out.push({ label: o.label + (o.sub ? ' ›' : ''), ok: o.ok !== false, why: o.why, tags: o.tags, tip: o.tip, fn: () => {
        if (o.sub) { const opts = subOptions(w, t, o.id); const extra = o.id === 'ask' ? openers(w, t, 'ask').map((x) => ({ id: '__topic:' + x.id, label: x.label || x.id })) : []; this.mode = { kind: 'sub', id: o.id, label: o.label, opts: [...extra, ...opts] }; return; }
        this.runBuiltin(app, o);
      } });
      // 内容包里玩家可以开启的话题，排在「聊天」后面
      if (o.id === 'chat') for (const tp of openers(w, t, 'chat')) out.push({ label: tp.label || tp.id, ok: true, fn: () => { this.add('me', tp.label || ''); this.enterTopic(app, tp); } });
    }
    out.push({ label: '走开', ok: true, fn: () => this.close(app) });
    return out;
  }

  draw(app: App) {
    const ui = app.ui, w = app.w!, t = this.npc(app);
    if (!t) { this.close(app); return; }
    const me = player(w);
    const W = 800, H = 500;
    ui.blocker(0.5);
    const x = Math.round((UI_W - W) / 2), y = Math.round((UI_H - H) / 2);
    const r = rel(w, t.id, me.id);
    ui.panel(x, y, W, H, { title: `和${t.name}说话`, titleBg: '#22201c' });
    ui.button(x + W - 26, y + 3, 22, 13, '×', () => this.close(app));
    // 左栏：头像与关系
    ui.rect(x + 12, y + 24, 84, 100, '#07080a'); ui.rect(x + 13, y + 25, 82, 98, '#4a3e36');
    ui.image(portraitCanvas(t.id, { ...t.look, age: t.age } as never, { dead: !t.alive }), x + 14, y + 26, 80, 96);
    let ly = y + 132;
    ui.text(t.name, x + 14, ly, '#e8dcc0'); ly += 16;
    ui.text(t.originText, x + 14, ly, '#8a9098'); ly += 18;
    ui.text(`关系：${STATE_CN[r.state] || r.state}`, x + 14, ly, '#c8a8b8'); ly += 16;
    for (const [n, v, c] of [['信任', r.trust, '#80a0c8'], ['好感', r.affection, '#c89a80'], ['畏惧', r.fear, '#a07070']] as [string, number, string][]) { ui.text(n, x + 14, ly, '#9aa0a8'); ui.bar(x + 44, ly + 2, 52, 9, v / 100, c); ly += 15; }
    ui.text(`${pron(t)}正在：`, x + 14, ly + 4, '#6a7078'); ui.text(t.action ? (t.action.type === 'sleep' ? '睡觉' : '忙') : '闲着', x + 14, ly + 20, '#9aa0a8');
    // 右栏上：对话记录（最新的在下面）
    const tx = x + 110, tw = W - 126, top = y + 24, logH = 218;
    ui.rect(tx - 4, top - 2, tw + 8, logH + 4, 'rgba(0,0,0,0.25)');
    const items: { e: Entry; h: number }[] = [];
    let used = 0;
    for (let i = this.log.length - 1 - this.scroll; i >= 0; i--) {
      const e = this.log[i];
      const h = ui.paraHeight(this.prefix(e, t) + e.text, tw - 8, 16) + 4;
      if (used + h > logH) break;
      items.unshift({ e, h }); used += h;
    }
    let yy = top + logH - used;
    for (const { e, h } of items) {
      const col = e.who === 'me' ? '#a8c8e8' : e.who === 'npc' ? '#ece2c8' : '#8a8478';
      ui.para(this.prefix(e, t) + e.text, tx, yy, tw - 8, col, 16);
      yy += h;
    }
    if (ui.wheel && ui.hover(tx, top, tw, logH)) this.scroll = Math.max(0, Math.min(this.log.length - 1, this.scroll + ui.wheel));
    // 右栏下：可选的话
    const oy = top + logH + 10;
    ui.rect(tx - 4, oy - 4, tw + 8, 1, '#4a3e36');
    const optH = y + H - 10 - oy;
    if (this.mode.kind === 'node') {
      const opts = this.mode.options;
      let cy = oy;
      opts.forEach((so, i) => { cy = ui.option(tx - 4, cy, tw + 8, so.label, () => this.answer(app, so), { key: String(i + 1), disabled: !so.ok, tags: !so.ok && so.why ? [[so.why, '#7a6a6a']] : so.tags }); });
      return;
    }
    if (this.mode.kind === 'next' || this.mode.kind === 'sub') {
      const m = this.mode;
      let cy = oy;
      if (m.kind === 'sub') { ui.text(m.label, tx, cy, '#d8b48a'); cy += 18; }
      const two = m.opts.length > Math.floor((optH - 40) / 18);
      const colW = two ? (tw + 8) / 2 : tw + 8;
      const startY = cy;
      m.opts.forEach((o, i) => {
        const col = two && i >= Math.ceil(m.opts.length / 2) ? 1 : 0;
        const row = col ? i - Math.ceil(m.opts.length / 2) : i;
        ui.option(tx - 4 + col * colW, startY + row * 18, colW - 4, o.label, () => {
          if (o.id.startsWith('__topic:')) { const tp = openers(w, t, 'ask').find((x) => x.id === o.id.slice(8)); if (tp) { this.add('me', tp.label || ''); this.enterTopic(app, tp); } return; }
          if (m.kind === 'next') { this.add('narr', `你${o.label}。`); this.afterResult(app, o.id, doTalk(w, t, o.id)); return; }
          this.runBuiltin(app, o);
        }, { disabled: o.ok === false, tags: o.ok === false && o.why ? [[o.why, '#7a6a6a']] : o.tags, tip: o.tip });
      });
      ui.option(tx - 4, y + H - 28, 120, '‹ 返回', () => { this.mode = { kind: 'root' }; });
      return;
    }
    // 话题列表：分两列
    const opts = this.rootOptions(app);
    const half = Math.ceil(opts.length / 2), colW = (tw + 8) / 2;
    opts.forEach((o, i) => {
      const col = i >= half ? 1 : 0, row = col ? i - half : i;
      ui.option(tx - 4 + col * colW, oy + row * 18, colW - 4, o.label, o.fn, { disabled: !o.ok, tags: !o.ok && o.why ? [[o.why, '#7a6a6a']] : o.tags, tip: !o.ok ? o.why : o.tip });
    });
  }
  // 数字键选回答
  key(app: App, k: string) {
    const i = Number(k) - 1;
    if (!(i >= 0) || this.mode.kind !== 'node') return;
    const so = this.mode.options[i];
    if (so && so.ok) this.answer(app, so);
  }
  prefix(e: Entry, t: Person) { return e.who === 'me' ? '你：' : e.who === 'npc' ? `${t.name}：` : ''; }
  esc(app: App) { if (this.mode.kind === 'sub' || this.mode.kind === 'next') { this.mode = { kind: 'root' }; return false; } return true; }
}

// 玩家这一句怎么写进对话记录：问话直接说出口，动作写成旁白
function myLine(o: Opt, t: Person): [Entry['who'], string] {
  const [head] = o.id.split(':');
  const he = pron(t), sub = o.label.replace(/[（(][^）)]*[）)]/g, '').replace(/×\d+$/, '').trim();
  switch (head) {
    case 'chat': return ['narr', `你和${t.name}闲聊了几句。`];
    case 'ask': return ['me', o.label.startsWith('「') ? o.label : `「${o.label}」`];
    case 'comfort': return ['narr', `你在${t.name}身边坐下，没急着说话。`];
    case 'give': return ['narr', `你把${sub}递给${he}。`];
    case 'beg': return ['me', '「能分我一点吃的吗？」'];
    case 'flirt': return ['narr', '你凑近了一点，压低了声音。'];
    case 'intim': return ['me', '「……今晚，找个没人的地方？」'];
    case 'dealintim': return ['narr', `你把${sub}塞进${he}手里，没有松开。`];
    case 'coerce': return ['me', '「我是这里管事的。你知道该怎么做。」'];
    case 'help': return ['me', `「能帮我个忙吗——${o.label}。」`];
    case 'plan': return ['me', '「等这一切结束了，我们……」'];
    case 'pledge': return ['me', '「以后我跟着你。」'];
    case 'askkey': return ['me', '「仓库钥匙，交给我吧。」'];
    case 'askarch': return ['me', '「档案室的钥匙，借我用用。」'];
    case 'tell': case 'rumor': return ['me', '「我跟你说件事，你别往外传……」'];
    case 'threat': return ['me', o.label.startsWith('「') ? o.label : `「${o.label}。」`];
    case 'fight': return ['narr', '你动手了。'];
    case 'wake': return ['narr', `你推了推${he}。`];
    case 'pickpocket': return ['narr', `你屏住呼吸，把手伸向${he}的口袋。`];
  }
  return ['me', o.label];
}
