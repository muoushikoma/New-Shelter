// 即时模式 UI：在 960×540 画布上绘制（显示时 2× 放大），每帧重新登记可点击区域
export const UI_W = 960, UI_H = 540;
export const FONT = '"Fusion Pixel", "WenQuanYi Zen Hei Sharp", "WenQuanYi Zen Hei", "Microsoft YaHei", monospace';

type Hit = { x: number; y: number; w: number; h: number; fn: () => void; layer: number; cursor?: boolean };

export class UI {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mx = -1; my = -1;
  hits: Hit[] = [];
  layer = 0;
  hoverTip: string | null = null;
  private textCache = new Map<string, HTMLCanvasElement>();
  private measureCtx: CanvasRenderingContext2D;
  wheel = 0;

  constructor() {
    this.cv = document.createElement('canvas');
    this.cv.width = UI_W; this.cv.height = UI_H;
    this.ctx = this.cv.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    const m = document.createElement('canvas');
    this.measureCtx = m.getContext('2d')!;
  }
  begin() {
    this.ctx.clearRect(0, 0, UI_W, UI_H);
    this.hits = [];
    this.layer = 0;
    this.hoverTip = null;
  }
  // 点击：取最上层、最后登记的区域
  click(x: number, y: number): boolean {
    let best: Hit | null = null;
    for (const h of this.hits) if (x >= h.x && y >= h.y && x < h.x + h.w && y < h.y + h.h) { if (!best || h.layer >= best.layer) best = h; }
    if (best) { best.fn(); return true; }
    return false;
  }
  overAny(x: number, y: number) {
    return this.hits.some((h) => x >= h.x && y >= h.y && x < h.x + h.w && y < h.y + h.h);
  }
  topLayerAt(x: number, y: number) {
    let l = -1;
    for (const h of this.hits) if (x >= h.x && y >= h.y && x < h.x + h.w && y < h.y + h.h) l = Math.max(l, h.layer);
    return l;
  }
  hover(x: number, y: number, w: number, h: number) {
    if (!(this.mx >= x && this.my >= y && this.mx < x + w && this.my < y + h)) return false;
    // 只有当前层（或更高层）才算悬停
    return this.layer >= this.maxLayerUnderMouse;
  }
  maxLayerUnderMouse = 0;
  region(x: number, y: number, w: number, h: number, fn: () => void) { this.hits.push({ x, y, w, h, fn, layer: this.layer }); }
  // 模态遮罩：吞掉下层点击
  blocker(alpha = 0.55) {
    this.layer++;
    this.rect(0, 0, UI_W, UI_H, `rgba(4,4,6,${alpha})`);
    this.hits.push({ x: 0, y: 0, w: UI_W, h: UI_H, fn: () => {}, layer: this.layer });
  }

  rect(x: number, y: number, w: number, h: number, col: string) { this.ctx.fillStyle = col; this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  frame(x: number, y: number, w: number, h: number, col: string) {
    this.rect(x, y, w, 1, col); this.rect(x, y + h - 1, w, 1, col); this.rect(x, y, 1, h, col); this.rect(x + w - 1, y, 1, h, col);
  }
  panel(x: number, y: number, w: number, h: number, opt: { title?: string; titleBg?: string; titleCol?: string; base?: string; rim?: string; rivets?: boolean } = {}) {
    this.rect(x, y, w, h, '#07080a');
    this.rect(x + 1, y + 1, w - 2, h - 2, opt.rim || '#3a3f45');
    this.rect(x + 2, y + 2, w - 4, h - 4, opt.base || 'rgba(18,20,24,0.96)');
    this.rect(x + 2, y + 2, w - 4, 1, 'rgba(255,255,255,0.06)');
    if (opt.rivets !== false) for (const [rx, ry] of [[x + 3, y + 3], [x + w - 5, y + 3], [x + 3, y + h - 5], [x + w - 5, y + h - 5]]) { this.rect(rx, ry, 2, 2, '#5b6168'); this.rect(rx, ry, 1, 1, '#8a9097'); }
    if (opt.title) {
      this.rect(x + 2, y + 2, w - 4, 15, opt.titleBg || '#2a1d1a');
      this.text(opt.title, x + 8, y + 3, opt.titleCol || '#d9b48a');
      this.rect(x + 2, y + 17, w - 4, 1, '#07080a');
    }
  }
  bar(x: number, y: number, w: number, h: number, v: number, col: string, back = '#1a1c1f') {
    this.rect(x, y, w, h, '#050506');
    this.rect(x + 1, y + 1, w - 2, h - 2, back);
    const fw = Math.round((w - 2) * Math.max(0, Math.min(1, v)));
    this.rect(x + 1, y + 1, fw, h - 2, col);
    this.rect(x + 1, y + 1, fw, 1, 'rgba(255,255,255,0.25)');
    for (let i = 1; i < 5; i++) this.rect(x + 1 + Math.round((w - 2) * i / 5), y + 1, 1, h - 2, 'rgba(0,0,0,0.35)');
  }
  measure(s: string): number {
    this.measureCtx.font = `12px ${FONT}`;
    return Math.ceil(this.measureCtx.measureText(s).width);
  }
  private glyphs(s: string, col: string): HTMLCanvasElement {
    const key = col + '\u0000' + s;
    let c = this.textCache.get(key);
    if (c) return c;
    const w = this.measure(s) + 4;
    c = document.createElement('canvas');
    c.width = Math.max(1, w); c.height = 18;
    const t = c.getContext('2d')!;
    t.font = `12px ${FONT}`;
    t.textBaseline = 'top';
    t.fillStyle = col;
    t.fillText(s, 1, 2);
    // 阈值化成硬边像素
    const id = t.getImageData(0, 0, c.width, c.height);
    for (let i = 3; i < id.data.length; i += 4) id.data[i] = id.data[i] > 100 ? 255 : 0;
    t.putImageData(id, 0, 0);
    if (this.textCache.size > 4000) this.textCache.clear();
    this.textCache.set(key, c);
    return c;
  }
  text(s: string, x: number, y: number, col = '#d8d0c0', opt: { align?: 'left' | 'right' | 'center'; shadow?: string } = {}): number {
    if (!s) return 0;
    const g = this.glyphs(s, col);
    const w = g.width - 4;
    let ox = x;
    if (opt.align === 'right') ox = x - w;
    else if (opt.align === 'center') ox = x - (w >> 1);
    ox = Math.round(ox) - 1; const oy = Math.round(y) - 1;
    if (opt.shadow) this.ctx.drawImage(this.glyphs(s, opt.shadow), ox, oy + 1);
    this.ctx.drawImage(g, ox, oy);
    return w;
  }
  // 自动换行，返回结束 y
  para(str: string, x: number, y: number, w: number, col = '#d8d0c0', lh = 16): number {
    let line = '', yy = y;
    for (const ch of str) {
      if (ch === '\n') { this.text(line, x, yy, col); line = ''; yy += lh; continue; }
      if (this.measure(line + ch) > w && line) {
        // 避免标点出现在行首
        if ('，。！？、；：」』）…—'.includes(ch)) { line += ch; this.text(line, x, yy, col); line = ''; yy += lh; continue; }
        this.text(line, x, yy, col); line = ch; yy += lh;
      } else line += ch;
    }
    if (line) { this.text(line, x, yy, col); yy += lh; }
    return yy;
  }
  paraHeight(str: string, w: number, lh = 16): number {
    let line = '', n = 0;
    for (const ch of str) {
      if (ch === '\n') { n++; line = ''; continue; }
      if (this.measure(line + ch) > w && line) { if ('，。！？、；：」』）…—'.includes(ch)) { n++; line = ''; continue; } n++; line = ch; } else line += ch;
    }
    if (line) n++;
    return n * lh;
  }
  button(x: number, y: number, w: number, h: number, label: string, fn: () => void, opt: { hot?: boolean; disabled?: boolean; tip?: string; col?: string; bg?: string } = {}) {
    const hov = !opt.disabled && this.hover(x, y, w, h);
    this.rect(x, y, w, h, '#07080a');
    const bg = opt.disabled ? '#1c1e22' : opt.bg ? opt.bg : opt.hot ? '#5a3a24' : hov ? '#3c424a' : '#2c3036';
    this.rect(x + 1, y + 1, w - 2, h - 2, hov && opt.bg ? lighten(opt.bg) : bg);
    this.rect(x + 1, y + 1, w - 2, 1, 'rgba(255,255,255,0.12)');
    const fg = opt.disabled ? '#5a5e64' : opt.col || (opt.hot ? '#f0d8b0' : '#d0d4d8');
    this.text(label, x + (w >> 1), y + ((h - 12) >> 1), fg, { align: 'center' });
    if (!opt.disabled) this.region(x, y, w, h, fn);
    if (opt.tip && this.hover(x, y, w, h)) this.hoverTip = opt.tip;
  }
  // 选项行（对话选项、菜单项）
  option(x: number, y: number, w: number, label: string, fn: () => void, opt: { disabled?: boolean; tags?: [string, string][]; key?: string; tip?: string } = {}): number {
    const h = 17;
    const hov = !opt.disabled && this.hover(x, y - 1, w, h);
    if (hov) { this.rect(x, y - 1, w, h, '#3a2418'); this.rect(x, y - 1, 3, h, '#e8a060'); }
    let tx = x + 8;
    if (opt.key) { this.text(opt.key, tx, y, hov ? '#f0c080' : '#8a8078'); tx += 16; }
    tx += this.text(label, tx, y, opt.disabled ? '#5e5a54' : hov ? '#f8ecd8' : '#c8c0b0') + 10;
    for (const [t, c] of opt.tags || []) {
      const tw = this.measure(t) + 8;
      if (tx + tw > x + w) break;
      this.rect(tx, y, tw, 15, 'rgba(255,255,255,0.05)'); this.rect(tx, y, 2, 15, c); this.text(t, tx + 5, y, c);
      tx += tw + 6;
    }
    if (!opt.disabled) this.region(x, y - 1, w, h, fn);
    if (opt.tip && hov) this.hoverTip = opt.tip;
    return y + h;
  }
  tag(x: number, y: number, s: string, fg: string, bg: string): number {
    const w = this.measure(s) + 8;
    this.rect(x, y, w, 15, bg); this.text(s, x + 4, y + 1, fg);
    return w + 4;
  }
  tooltip() {
    if (!this.hoverTip) return;
    const lines = this.hoverTip.split('\n');
    const w = Math.min(300, Math.max(...lines.map((l) => this.measure(l))) + 12);
    let h = 6; for (const l of lines) h += this.paraHeight(l, w - 12, 15);
    let x = this.mx + 12, y = this.my + 14;
    if (x + w > UI_W) x = UI_W - w - 2;
    if (y + h > UI_H) y = this.my - h - 4;
    this.rect(x, y, w, h, '#07080a'); this.rect(x + 1, y + 1, w - 2, h - 2, '#20242a');
    let yy = y + 3; for (const l of lines) yy = this.para(l, x + 6, yy, w - 12, '#e0d8c8', 15);
  }
  image(src: CanvasImageSource, x: number, y: number, w: number, h: number) {
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(src, Math.round(x), Math.round(y), w, h);
  }
}

function lighten(c: string) {
  if (!c.startsWith('#')) return c;
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.min(255, Math.round(v * 1.25 + 8));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
