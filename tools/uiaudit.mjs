// 界面排版检查：找出超出所在面板 / 按钮 / 标签边框的文字。node tools/uiaudit.mjs [宽 高 pixel|clear]（需要 npm run dev 在跑）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const browser = await chromium.launch();
const [vw, vh, font] = [Number(process.argv[2] || 1920), Number(process.argv[3] || 1080), process.argv[4] || 'pixel'];
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
await page.addInitScript((f) => localStorage.setItem('shelter.font', f), font);
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1200);
const r = await page.evaluate(async () => {
  const a = window.app, ui = a.ui;
  // 钩子：记录容器与文字
  let boxes = [], texts = [];
  const wrap = (name, f) => { const o = ui[name].bind(ui); ui[name] = (...args) => { f(...args); return o(...args); }; };
  wrap('panel', (x, y, w, h) => boxes.push({ x, y, w, h, kind: 'panel' }));
  wrap('button', (x, y, w, h) => boxes.push({ x, y, w, h, kind: 'button' }));
  const oText = ui.text.bind(ui);
  ui.text = (s, x, y, col, opt = {}) => {
    const w = oText(s, x, y, col, opt);
    if (s) { let ox = x; if (opt.align === 'right') ox = x - w; else if (opt.align === 'center') ox = x - (w >> 1); texts.push({ s, x: ox, y: y + 1, w, h: 12, n: boxes.length }); }
    return w;
  };
  wrap('tag', (x, y, s) => boxes.push({ x, y, w: ui.measure(s) + 8, h: 15, kind: 'tag' }));
  const issues = new Set();
  const check = (where) => {
    for (const t of texts) {
      const cx = t.x + 1, cy = t.y + 5;
      // 即时模式：文字属于在它之前最后画的、包含它的那个框
      let best = null;
      for (let i = t.n - 1; i >= 0; i--) { const b = boxes[i]; if (cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.h) { best = b; break; } }
      if (!best) continue;
      const over = [];
      if (t.y + t.h > best.y + best.h + 1) over.push(`下边超出 ${t.y + t.h - best.y - best.h}`);
      if (t.y < best.y - 1) over.push(`上边超出 ${best.y - t.y}`);
      if (t.x + t.w > best.x + best.w + 1) over.push(`右边超出 ${t.x + t.w - best.x - best.w}`);
      if (over.length) issues.add(`[${where}] ${best.kind} 里的「${t.s.slice(0, 24)}」${over.join('，')}`);
    }
  };
  const frame = (where) => { boxes = []; texts = []; a.draw(); check(where); };

  const { newWorld } = await import('/src/sim/world.ts');
  const { stepMinute, nextEvent } = await import('/src/sim/tick.ts');
  const M = await import('/src/ui/modals.ts');
  const U = await import('/src/sim/util.ts');
  const E = await import('/src/sim/events.ts');
  await import('/src/content/events.ts');
  frame('标题'); a.screen = 'newgame'; frame('新游戏'); a.screen = 'settings'; frame('设置');
  a.w = newWorld({ seed: 99, name: '测试者', gender: 'f', origin: 'nurse', settings: { adult: true, coercion: true, pregnancy: true, speed: 1, autoPause: true, autoNeeds: true } });
  a.screen = 'play'; a.modals = [];
  const w = a.w; const me = U.player(w);
  for (let i = 0; i < 60 * 40; i++) { stepMinute(w); while (nextEvent(w)); }
  const other = U.present(w).find((p) => !p.isPlayer);
  U.addItem(me.inv, 'food', 5); U.addItem(me.inv, 'cigs', 10); U.addItem(me.inv, 'blankPermit', 1); U.addItem(me.inv, 'valuables', 5); U.addItem(me.inv, 'meds', 2);
  a.sel = other.id; frame('主界面 · 选中 NPC');
  a.sel = me.id; frame('主界面 · 选中自己');
  const open = (name, mk) => { try { a.modals = []; a.push(mk()); frame(name); } catch (e) { issues.add(`✗ ${name}: ${e.message}`); } };
  open('文本', () => new M.TextModal('测试文字，比较长的一段话。'.repeat(6), other.id));
  for (const m of ['take', 'steal', 'stash', 'put']) open('仓库 ' + m, () => new M.StorageModal(m));
  open('交易', () => { const t = new M.TradeModal(other.id); t.give = { cigs: 2 }; t.get = { food: 1 }; return t; });
  open('开会', () => new M.MeetingModal());
  open('规矩', () => new M.RulesModal());
  open('目标', () => new M.JournalModal());
  open('关系', () => new M.RelationsModal());
  open('人物', () => new M.PersonModal(other.id));
  open('物品', () => new M.InventoryModal());
  open('日志', () => new M.LogModal());
  open('帮助', () => new M.HelpModal());
  open('菜单', () => new M.PauseMenu());
  open('菜单 存档', () => { const p = new M.PauseMenu(); p.sub = 'save'; return p; });
  open('菜单 设置', () => { const p = new M.PauseMenu(); p.sub = 'settings'; return p; });
  open('分口粮', () => new M.RationsModal(a));
  open('地图', () => { const m = new M.MapModal(a); m.sel = 'camp'; return m; });
  open('暗渠', () => new M.DrainModal());
  // 对话窗口：话题列表、打听、回答
  {
    const { ConversationModal } = await import('/src/ui/conversation.ts');
    other.action = null;
    const c = new ConversationModal(a, other.id); a.modals = [c]; frame('对话 · 话题列表');
    c.rootOptions(a).find((o) => o.label.startsWith('打听')).fn(); frame('对话 · 打听');
    c.mode = { kind: 'root' }; other.needs.stress = 90; c.rootOptions(a).find((o) => o.label === '聊天').fn(); frame('对话 · 回答');
    for (let i = 0; i < 30; i++) c.add(i % 2 ? 'npc' : 'me', '很长的一句话，'.repeat(1 + (i % 5))); frame('对话 · 长记录');
  }
  a.modals = []; a.menu = null;
  // 搜刮场景：主界面、菜单、背包、被发现
  {
    const W = await import('/src/sim/war.ts');
    const X = await import('/src/sim/explore.ts');
    const { ExploreModal } = await import('/src/ui/explore.ts');
    for (const loc of ['houses', 'church', 'party']) {
      w.locs[loc].known = true; w.facts.exploreTut = true;
      W.startTrip(w, loc, []); W.tripArrive(w); w.trip.encounter = null;
      const ex = X.startExplore(w);
      const m = new ExploreModal(a, () => {}); a.modals = [m]; frame('搜刮 ' + loc);
      const sc = X.sceneOf(w, ex); const c = sc.conts[0];
      m.menu = { x: 400, y: 300, t: { on: 'cont', id: c.id, label: '衣柜（锁着）', x: c.x, y: 200, w: 20, h: 30 } }; frame('搜刮菜单 ' + loc); m.menu = null;
      ex.bag = { food: 5, cigs: 12, meds: 2, blanket: 1 }; m.bagOpen = true; frame('搜刮背包 ' + loc); m.bagOpen = false;
      const e = W.makeEncounter(w, 'patrol'); m.encounter = { text: '手电筒的光照到了你的脸上。\n\n' + e.text, options: e.options, result: null }; frame('被发现 ' + loc);
      m.encounter.result = '你们缩在断墙后面，手电的光从头顶扫过去。他们走了。'; frame('被发现结果 ' + loc); m.encounter = null;
      w.trip = null; delete w.locs[loc].scene;
    }
    a.modals = [];
    w.people.forEach((p) => { if (!p.alive) return; p.present = true; p.action = null; });
  }
  for (const id of Object.keys(E.EVENTS)) {
    try {
      const ctx = { caller: other.id, kind: 'refugee', proposal: { kind: 'leader', target: other.id, label: '测试' }, accuser: other.id, accused: me.id, item: 'food', n: 1, from: other.id, initiator: other.id, partner: me.id, consent: 'willing', motive: ['慰藉'], hook: 'scene', a: other.id, b: me.id, about: other.id, by: other.id, leader: other.id, job: 'crank', target: other.id, id: other.id };
      const v = E.EVENTS[id].build(w, ctx);
      if (v) { a.modals = []; a.openEvent(v); frame('事件 ' + id); }
    } catch (e) { /* 需要特定上下文 */ }
  }
  a.modals = [];
  try { const { computeEnding } = await import('/src/sim/ending.ts'); w.ending = computeEnding(w, 'test'); a.screen = 'ending'; frame('结局'); } catch (e) { issues.add('✗ 结局 ' + e.message); }
  return [...issues];
});
console.log(r.join('\n') || '没有发现超出边框的文字');
console.log(errs.join('\n'));
await browser.close();
