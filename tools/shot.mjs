// 截图：node tools/shot.mjs [url]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'shots';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForTimeout(1500);
const snap = async (n) => { await page.waitForTimeout(250); await page.screenshot({ path: `${out}/${n}.png` }); console.log('shot', n); };
await snap('01_title');
await page.evaluate(() => { const a = window.app; a.screen = 'newgame'; });
await snap('02_newgame');
await page.evaluate(() => { localStorage.clear(); });
// 开始游戏
await page.evaluate(async () => {
  const a = window.app;
  const { newWorld } = await import('/src/sim/world.ts');
  a.w = newWorld({ seed: 7, name: '陈默', gender: 'm', origin: 'deserter', settings: { adult: true, coercion: false, pregnancy: true, speed: 1, autoPause: true } });
  a.screen = 'play'; a.modals = []; a.speed = 1;
});
await page.waitForTimeout(600);
await snap('03_intro_event');
await page.evaluate(() => { window.app.modals = []; });
// 快进几个小时
await page.evaluate(async () => {
  const a = window.app; const { stepMinute, nextEvent } = await import('/src/sim/tick.ts');
  for (let i = 0; i < 60 * 13; i++) { stepMinute(a.w); const v = nextEvent(a.w); if (v) { a.openEvent(v); break; } }
});
await snap('04_play');
await page.evaluate(() => { window.app.modals = []; });
await page.evaluate(() => { const a = window.app; const m = window.app.modals; });
for (const [n, cls] of [['05_journal', 'JournalModal'], ['06_relations', 'RelationsModal'], ['07_rules', 'RulesModal'], ['08_inventory', 'InventoryModal']]) {
  await page.evaluate(async (c) => { const a = window.app; const M = await import('/src/ui/modals.ts'); a.modals = []; a.push(new M[c]()); }, cls);
  await snap(n);
}
await page.evaluate(async () => { const a = window.app; const M = await import('/src/ui/modals.ts'); a.modals = []; a.push(new M.MeetingModal()); });
await snap('09_meeting');
await page.evaluate(async () => { const a = window.app; const M = await import('/src/ui/modals.ts'); a.modals = []; a.push(new M.MapModal(a)); a.modals[0].sel = 'grain'; });
await snap('10_map');
await page.evaluate(async () => { const a = window.app; a.modals = []; const t = a.w.people.find((p) => !p.isPlayer); a.openTalk(t, 300, 200); });
await snap('11_talkmenu');
await page.evaluate(async () => { const a = window.app; a.menu = null; const M = await import('/src/ui/modals.ts'); const t = a.w.people.find((p) => !p.isPlayer); a.push(new M.PersonModal(t.id)); });
await snap('12_person');
console.log(errs.join('\n') || 'no errors');
await browser.close();
