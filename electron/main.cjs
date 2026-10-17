// 桌面版外壳：用自定义协议 app:// 提供 dist/ 里的游戏文件。
// content/ 下的请求先找 exe 旁边的 content 文件夹（玩家自己放的内容包），找不到再用游戏自带的。
const { app, BrowserWindow, protocol, net, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

const DIST = path.join(__dirname, '..', 'dist');
// 便携版 exe 运行时会解压到临时目录，PORTABLE_EXECUTABLE_DIR 才是 exe 真正所在的位置
const EXE_DIR = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
const USER_CONTENT = path.join(EXE_DIR, 'content');

function resolveFile(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '') || 'index.html';
  if (rel.split(/[\\/]/).includes('..')) return null;
  if (rel.startsWith('content/')) {
    const user = path.join(USER_CONTENT, rel.slice('content/'.length));
    if (fs.existsSync(user) && fs.statSync(user).isFile()) return user;
  }
  const own = path.join(DIST, rel);
  return fs.existsSync(own) ? own : null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540,
    backgroundColor: '#050506', title: '避难所 · New Shelter', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL('app://game/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const file = resolveFile(new URL(req.url).pathname);
    if (!file) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
