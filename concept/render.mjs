// 用 Playwright 渲染概念图为 PNG：node render.mjs [scene...]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
import { fileURLToPath } from 'url';
import path from 'path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ['main', 'meeting', 'dossier', 'surface'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
for (const s of scenes) {
  await page.goto('file://' + path.join(dir, 'index.html') + '?scene=' + s);
  await page.waitForFunction(() => window.__done === true, null, { timeout: 30000 });
  await page.locator('#cv').screenshot({ path: path.join(dir, 'out', `${s}.png`) });
  console.log('rendered', s);
}
await browser.close();
