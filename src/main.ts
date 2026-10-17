import { App } from './ui/app';
import { loadAdultContent } from './content/adult';
import { loadContentPacks } from './content/pack';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = 1920; canvas.height = 1080;

function fit() {
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  canvas.style.width = `${Math.floor(1920 * s)}px`;
  canvas.style.height = `${Math.floor(1080 * s)}px`;
}
window.addEventListener('resize', fit); fit();

const app = new App(canvas);
(window as unknown as { app: App }).app = app;

async function start() {
  try { await document.fonts.load('12px "Fusion Pixel"'); } catch { /* 字体加载失败时用系统字体 */ }
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
