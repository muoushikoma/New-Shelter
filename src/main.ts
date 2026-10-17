import { App } from './ui/app';
import { loadAdultContent } from './content/adult';
import { loadContentPacks } from './content/pack';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const app = new App(canvas);
(window as unknown as { app: App }).app = app;

// 按 16:9 适配窗口；画布按屏幕实际像素（含系统缩放）创建，保证文字清晰
function fit() {
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  const cw = Math.floor(1920 * s), ch = Math.floor(1080 * s);
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  const dpr = window.devicePixelRatio || 1;
  app.resize(Math.round(cw * dpr), Math.round(ch * dpr));
}
window.addEventListener('resize', fit); fit();
// 拖到另一块缩放比例不同的屏幕上时也重新适配
const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { fit(); watchDpr(); }, { once: true });
watchDpr();
async function start() {
  try { await document.fonts.load('12px "Fusion Pixel"'); } catch { /* 字体加载失败时用系统字体 */ }
  app.ui.setFontMode(app.ui.fontMode); // 字体到位后清掉用后备字体缓存的文字
  await loadContentPacks();
  if (app.w?.settings.adult) loadAdultContent();
  const loop = (t: number) => { app.frame(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
start();

// 安卓：返回键 = Esc（标题画面按返回键退出）
const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
if (cap?.isNativePlatform?.()) {
  import('@capacitor/app').then(({ App }) => {
    App.addListener('backButton', () => {
      if (app.screen === 'title') App.exitApp();
      else app.onKey(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
  });
}
