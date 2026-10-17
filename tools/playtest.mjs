// 自动试玩：node tools/playtest.mjs [天数]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const DAYS = Number(process.argv[2] || 12);
const out = 'shots';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('http://localhost:5173/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(1200);
const click = async (ux, uy, btn = 'left') => { await page.mouse.click(ux * 2, uy * 2, { button: btn }); await page.waitForTimeout(120); };
const snap = async (n) => { await page.waitForTimeout(200); await page.screenshot({ path: `${out}/${n}.png` }); console.log('shot', n); };
const state = () => page.evaluate(() => { const a = window.app; const w = a.w; return { screen: a.screen, modals: a.modals.map((m) => m.constructor.name), day: w ? Math.floor((w.t + 480) / 1440) + 1 : 0, menu: !!a.menu, ending: !!(w && w.ending) }; });
// 标题 → 新的一局
await click(176, 283); // 新的一局（没有存档时第一个按钮）
console.log(await state());
await snap('p01_newgame');
await click(835, 493); // 走进避难所
await page.waitForTimeout(400);
console.log(await state());
await snap('p02_intro');
// 选第一个选项
await page.evaluate(() => { const a = window.app; const m = a.top(); if (m && m.v) m.choose(a, m.v.choices[0]); });
console.log(await state());
// 点一个 NPC
const npc = await page.evaluate(() => { const a = window.app; const p = a.w.people.find((q) => !q.isPlayer && q.present); const pos = a.wv.pos(a.w, p, 1); return { x: pos.x * 2, y: (pos.y - 8) * 2, id: p.id }; });
await click(npc.x, npc.y);
console.log('menu?', await state());
await snap('p03_menu');
// 选「聊天」（菜单第一项）
await page.evaluate(() => { const a = window.app; if (a.menu) a.menu.pick(a.menu.items[0]); });
await page.waitForTimeout(300);
for (let i = 0; i < 30; i++) { await page.evaluate(() => { const a = window.app; a.speed = 4; }); await page.waitForTimeout(200); const s = await state(); if (s.modals.includes('TextModal')) break; }
await snap('p04_talk');
await page.evaluate(() => { window.app.modals = []; });
// 仓库
await click(100 * 2, 100 * 2);
await snap('p05_cage_menu');
await page.evaluate(() => { const a = window.app; if (a.menu) a.menu.pick(a.menu.items[0]); });
await snap('p06_storage');
await page.evaluate(() => { window.app.modals = []; });
// 自动推进，并处理事件：选第一个可用选项
async function runUntilDay(d, shotsEvery = 3) {
  let lastShotDay = 0;
  for (let k = 0; k < 4000; k++) {
    const r = await page.evaluate(async (target) => {
      const a = window.app; const w = a.w;
      if (!w || w.ending) return { done: true };
      const { stepMinute, nextEvent } = await import('/src/sim/tick.ts');
      const M = await import('/src/ui/modals.ts');
      let evs = [];
      for (let i = 0; i < 240; i++) {
        // 处理弹窗
        while (a.modals.length) {
          const m = a.top();
          if (m instanceof M.EventModal) { evs.push(m.v.title); if (m.result !== null || (m.scene && m.page < (m.scene.pages?.length || 0))) { m.advance(a); continue; } const c = m.v.choices.find((x) => x.ok !== false) || m.v.choices[0]; if (c) m.choose(a, c); else a.pop(); continue; }
          if (m instanceof M.RationsModal) { const { applyManualRations } = await import('/src/sim/politics.ts'); applyManualRations(w, m.share); a.pop(); continue; }
          a.pop();
        }
        if (w.trip) { const { tripArrive, tripLeave, tripHome } = await import('/src/sim/war.ts'); if (w.trip.stage === 'at') tripLeave(w); else if (w.t >= w.trip.until) { if (w.trip.stage === 'going') tripArrive(w); else tripHome(w); } }
        stepMinute(w);
        const v = nextEvent(w); if (v) a.openEvent(v);
        if (w.ending) return { done: true, evs };
        if (Math.floor((w.t + 480) / 1440) + 1 >= target) break;
      }
      return { done: false, day: Math.floor((w.t + 480) / 1440) + 1, evs };
    }, d);
    if (r.evs && r.evs.length) console.log('  事件:', r.evs.join('、'));
    if (r.done) return true;
    if (r.day >= d) return false;
    if (r.day - lastShotDay >= shotsEvery) { lastShotDay = r.day; await page.waitForTimeout(100); await snap(`p_day${String(r.day).padStart(2, '0')}`); }
  }
}
// 外出：开地图 → 粮站 → 出发
await page.evaluate(async () => { const a = window.app; const M = await import('/src/ui/modals.ts'); a.push(new M.MapModal(a)); a.top().sel = 'grain'; });
await snap('p07_map');
await page.evaluate(async () => { const a = window.app; const { startTrip } = await import('/src/sim/war.ts'); startTrip(a.w, 'grain', [], {}); });
for (let i = 0; i < 60; i++) { await page.waitForTimeout(100); const st = await page.evaluate(() => window.app.w.trip?.stage); if (st === 'at') break; }
await snap('p08_trip_at');
await page.evaluate(() => { const a = window.app; const m = a.modals.find((x) => x.constructor.name === 'MapModal'); if (a.w.trip?.encounter) { const { resolveEncounter } = {}; } });
await page.evaluate(async () => { const a = window.app; const m = a.modals.find((x) => x.constructor.name === 'MapModal'); const { resolveEncounter } = await import('/src/sim/war.ts'); if (a.w.trip?.encounter) m.out.push(resolveEncounter(a.w, a.w.trip.encounter.options[0].id)); m.doAct(a, 'search', 60); });
await snap('p09_trip_search');
await page.evaluate(async () => { const a = window.app; const m = a.modals.find((x) => x.constructor.name === 'MapModal'); if (m && a.w.trip) { if (a.w.trip.encounter) { const { resolveEncounter } = await import('/src/sim/war.ts'); m.out.push(resolveEncounter(a.w, 'hide')); } m.doAct(a, 'leave', 0); } });
for (let i = 0; i < 80; i++) { await page.waitForTimeout(100); const st = await page.evaluate(() => window.app.w.trip); if (!st) break; }
await snap('p10_home');
// 开会
await page.evaluate(async () => { const a = window.app; a.modals = []; const M = await import('/src/ui/modals.ts'); a.push(new M.MeetingModal()); const m = a.top(); const { availableProposals } = await import('/src/sim/politics.ts'); m.sel = availableProposals(a.w, a.w.people.find((p) => p.isPlayer)).find((p) => p.kind === 'ration'); });
await snap('p11_meeting');
await page.evaluate(async () => { const a = window.app; const m = a.top(); const { holdVote } = await import('/src/sim/politics.ts'); m.result = holdVote(a.w, m.sel, a.w.people.find((p) => p.isPlayer), 'yes').text; });
await snap('p12_meeting_result');
await page.evaluate(() => { window.app.modals = []; });
const ended = await runUntilDay(DAYS);
await snap('p20_final_state');
const summary = await page.evaluate(() => { const w = window.app.w; return { day: Math.floor((w.t + 480) / 1440) + 1, alive: w.people.filter((p) => p.alive && p.present).map((p) => p.name), food: w.storage.food, ending: w.ending?.title, log: w.log.slice(0, 12).map((l) => l.text) }; });
console.log(JSON.stringify(summary, null, 1));
if (ended) { await page.evaluate(() => { window.app.modals = []; window.app.screen = 'ending'; }); await snap('p21_ending'); }
console.log(errs.length ? errs.join('\n') : '没有报错');
await browser.close();
