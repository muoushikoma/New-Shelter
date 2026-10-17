// 界面冒烟测试：打开每个窗口、画几帧，收集报错。node tools/uismoke.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1000);
const r = await page.evaluate(async () => {
  const a = window.app;
  const { newWorld } = await import('/src/sim/world.ts');
  const { stepMinute, nextEvent } = await import('/src/sim/tick.ts');
  const M = await import('/src/ui/modals.ts');
  const U = await import('/src/sim/util.ts');
  const E = await import('/src/sim/events.ts');
  await import('/src/content/events.ts');
  const out = [];
  a.w = newWorld({ seed: 99, name: '测', gender: 'f', origin: 'nurse', settings: { adult: true, coercion: true, pregnancy: true, speed: 1, autoPause: true, autoNeeds: true } });
  a.screen = 'play'; a.modals = [];
  const w = a.w; const me = U.player(w);
  for (let i = 0; i < 60 * 30; i++) { stepMinute(w); while (nextEvent(w)); }
  const other = U.present(w).find((p) => !p.isPlayer);
  const frame = () => { a.draw(); };
  const tryOpen = (name, mk) => { try { a.modals = []; a.push(mk()); frame(); frame(); out.push('ok ' + name); } catch (e) { out.push('✗ ' + name + ': ' + e.message); } };
  U.addItem(me.inv, 'food', 5); U.addItem(me.inv, 'cigs', 10); U.addItem(me.inv, 'blankPermit', 1); U.addItem(me.inv, 'valuables', 5);
  tryOpen('Text', () => new M.TextModal('测试文字', other.id));
  tryOpen('Storage take', () => new M.StorageModal('take'));
  tryOpen('Storage steal', () => new M.StorageModal('steal'));
  tryOpen('Storage stash', () => new M.StorageModal('stash'));
  tryOpen('Trade', () => { const t = new M.TradeModal(other.id); t.give = { cigs: 2 }; t.get = { food: 1 }; return t; });
  tryOpen('Meeting', () => { const m = new M.MeetingModal(); return m; });
  tryOpen('Rules', () => new M.RulesModal());
  tryOpen('Journal', () => new M.JournalModal());
  tryOpen('Relations', () => new M.RelationsModal());
  tryOpen('Person', () => new M.PersonModal(other.id));
  tryOpen('Inventory', () => new M.InventoryModal());
  tryOpen('Log', () => new M.LogModal());
  tryOpen('Help', () => new M.HelpModal());
  tryOpen('Pause', () => new M.PauseMenu());
  tryOpen('Pause save', () => { const p = new M.PauseMenu(); p.sub = 'save'; return p; });
  tryOpen('Pause settings', () => { const p = new M.PauseMenu(); p.sub = 'settings'; return p; });
  tryOpen('Rations', () => new M.RationsModal(a));
  tryOpen('Map', () => { const m = new M.MapModal(a); m.sel = 'camp'; return m; });
  tryOpen('Drain', () => new M.DrainModal());
  // 所有事件
  for (const id of Object.keys(E.EVENTS)) {
    try {
      const ctx = { caller: other.id, kind: 'refugee', proposal: { kind: 'leader', target: other.id, label: '测试' }, accuser: other.id, accused: me.id, item: 'food', n: 1, from: other.id, initiator: other.id, partner: me.id, consent: 'willing', motive: ['慰藉'], hook: 'scene', a: other.id, b: me.id, about: other.id, by: other.id, leader: other.id, job: 'crank', target: other.id, id: other.id };
      const v = E.EVENTS[id].build(w, ctx);
      if (v) { a.modals = []; a.openEvent(v); frame(); frame(); out.push('ok event ' + id); }
      else out.push('-- event ' + id + ' (null)');
    } catch (e) { out.push('✗ event ' + id + ': ' + e.message); }
  }
  for (const kind of ['mp', 'occupier', 'smuggler', 'redcross', 'soldiers', 'wounded', 'deserter']) { try { const v = E.EVENTS.knock.build(w, { kind }); a.modals = []; a.openEvent(v); frame(); out.push('ok knock ' + kind); } catch (e) { out.push('✗ knock ' + kind + ': ' + e.message); } }
  a.modals = [];
  // 结局画面
  try { const { computeEnding } = await import('/src/sim/ending.ts'); w.ending = computeEnding(w, 'test'); a.screen = 'ending'; frame(); out.push('ok ending'); } catch (e) { out.push('✗ ending: ' + e.message); }
  a.screen = 'title'; frame(); a.screen = 'newgame'; frame(); a.screen = 'settings'; frame();
  return out;
});
console.log(r.filter((x) => !x.startsWith('ok')).join('\n') || '全部窗口正常');
console.log(`共 ${r.length} 项，正常 ${r.filter((x) => x.startsWith('ok')).length}`);
console.log(errs.length ? errs.slice(0, 10).join('\n') : '没有报错');
await browser.close();
