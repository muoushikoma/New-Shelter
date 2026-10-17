// 像素绘图基础库：低分辨率缓冲区 + 调色板 + 光照 + Bayer 抖动
const PX = (() => {
  const BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const bayer = (x, y) => (BAYER4[y & 3][x & 3] + 0.5) / 16;

  function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // 可复现的伪随机
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  class Buf {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.c = new Uint8ClampedArray(w * h * 3);
      this.light = new Float32Array(w * h);   // 环境亮度乘子
      this.lr = new Float32Array(w * h);      // 彩色光
      this.lg = new Float32Array(w * h);
      this.lb = new Float32Array(w * h);
      this.emit = new Uint8Array(w * h);      // 自发光像素不受暗化影响
    }
    set(x, y, col) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = (y * this.w + x) * 3;
      this.c[i] = col[0]; this.c[i + 1] = col[1]; this.c[i + 2] = col[2];
    }
    get(x, y) {
      const i = (y * this.w + x) * 3;
      return [this.c[i], this.c[i + 1], this.c[i + 2]];
    }
    glow(x, y) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.emit[(y | 0) * this.w + (x | 0)] = 1; }
    rect(x, y, w, h, col) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col);
    }
    rectGlow(x, y, w, h, col) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { this.set(x + i, y + j, col); this.glow(x + i, y + j); }
    }
    hline(x, y, w, col) { this.rect(x, y, w, 1, col); }
    vline(x, y, h, col) { this.rect(x, y, 1, h, col); }
    // 两色之间抖动渐变（竖直）
    vgrad(x, y, w, h, a, b) {
      for (let j = 0; j < h; j++) {
        const t = h <= 1 ? 0 : j / (h - 1);
        for (let i = 0; i < w; i++) this.set(x + i, y + j, t > bayer(x + i, y + j) ? b : a);
      }
    }
    // 多段调色板抖动渐变
    vramp(x, y, w, h, cols) {
      const n = cols.length - 1;
      for (let j = 0; j < h; j++) {
        const t = (j / Math.max(1, h - 1)) * n;
        const k = Math.min(n - 1, Math.floor(t));
        const f = t - k;
        for (let i = 0; i < w; i++) this.set(x + i, y + j, f > bayer(x + i, y + j) ? cols[k + 1] : cols[k]);
      }
    }
    dither(x, y, w, h, col, density) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++)
        if (bayer(x + i, y + j) < density) this.set(x + i, y + j, col);
    }
    line(x0, y0, x1, y1, col) {
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this.set(x0, y0, col);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    ellipse(cx, cy, rx, ry, col) {
      for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++)
        if ((x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5) <= 1) this.set(cx + x, cy + y, col);
    }
    // 字符画精灵：map 中每个字符对应调色板键，'.' 透明
    sprite(x, y, rows, pal, flip = false) {
      for (let j = 0; j < rows.length; j++) {
        const r = rows[j];
        for (let i = 0; i < r.length; i++) {
          const ch = r[flip ? r.length - 1 - i : i];
          if (ch === '.' || ch === ' ') continue;
          const col = pal[ch];
          if (col) this.set(x + i, y + j, col);
        }
      }
    }
    // 光照：环境光 amb，然后叠加点光源
    clearLight(amb) { this.light.fill(amb); this.lr.fill(0); this.lg.fill(0); this.lb.fill(0); }
    addLight(cx, cy, radius, col, intensity = 1, clip = null, cone = null) {
      const [r, g, b] = col;
      const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(this.w - 1, Math.ceil(cx + radius));
      const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(this.h - 1, Math.ceil(cy + radius));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (clip && (x < clip[0] || y < clip[1] || x >= clip[0] + clip[2] || y >= clip[1] + clip[3])) continue;
        const dx = x - cx, dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy) / radius;
        if (d >= 1) continue;
        let f = (1 - d) * (1 - d) * intensity;
        if (cone) {
          // cone: [方向弧度, 半角弧度]
          const a = Math.atan2(dy, dx);
          let da = Math.abs(a - cone[0]); if (da > Math.PI) da = 2 * Math.PI - da;
          if (da > cone[1]) continue;
          f *= 1 - (da / cone[1]) * 0.6;
        }
        const i = y * this.w + x;
        this.light[i] += f;
        this.lr[i] += f * r / 255; this.lg[i] += f * g / 255; this.lb[i] += f * b / 255;
      }
    }
    // 光照量化 + 抖动，输出到 ImageData
    toImageData(ctx, levels = 6, tint = [0.55, 0.62, 0.85]) {
      const img = ctx.createImageData(this.w, this.h);
      const d = img.data;
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        let r = this.c[i * 3], g = this.c[i * 3 + 1], b = this.c[i * 3 + 2];
        if (!this.emit[i]) {
          let L = Math.min(1.25, this.light[i]);
          // 量化亮度，用 Bayer 在相邻级之间抖动
          const q = L * levels;
          const k = Math.floor(q);
          L = (q - k > bayer(x, y) ? k + 1 : k) / levels;
          const tot = this.light[i] + 1e-4;
          const cr = this.lr[i] / tot, cg = this.lg[i] / tot, cb = this.lb[i] / tot;
          // 暗部偏冷，光照处染光源色
          const w = Math.min(1, this.light[i] * 1.4);
          const mr = tint[0] * (1 - w) + (0.5 + cr * 0.7) * w;
          const mg = tint[1] * (1 - w) + (0.5 + cg * 0.7) * w;
          const mb = tint[2] * (1 - w) + (0.5 + cb * 0.7) * w;
          r = r * L * mr * 1.25; g = g * L * mg * 1.25; b = b * L * mb * 1.25;
        }
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
      }
      return img;
    }
  }

  // 输出到可见画布（整数放大）
  function present(buf, canvas, scale, opts = {}) {
    const off = document.createElement('canvas');
    off.width = buf.w; off.height = buf.h;
    const octx = off.getContext('2d');
    octx.putImageData(buf.toImageData(octx, opts.levels, opts.tint), 0, 0);
    canvas.width = buf.w * scale; canvas.height = buf.h * scale;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    return ctx;
  }

  // ---------- UI 层：2× 像素 UI，文字做阈值处理成硬边像素字 ----------
  const UI_FONT = '"WenQuanYi Zen Hei Sharp","WenQuanYi Zen Hei","Noto Sans CJK SC","Microsoft YaHei",monospace';
  class UI {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.cv = document.createElement('canvas');
      this.cv.width = w; this.cv.height = h;
      this.ctx = this.cv.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
    }
    rect(x, y, w, h, col) { this.ctx.fillStyle = col; this.ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
    // 铁皮面板：外框 + 高光 + 铆钉
    panel(x, y, w, h, opt = {}) {
      const c = this.ctx;
      const base = opt.base || 'rgba(18,20,24,0.92)';
      this.rect(x, y, w, h, '#07080a');
      this.rect(x + 1, y + 1, w - 2, h - 2, opt.rim || '#3a3f45');
      this.rect(x + 2, y + 2, w - 4, h - 4, base);
      this.rect(x + 2, y + 2, w - 4, 1, 'rgba(255,255,255,0.06)');
      if (opt.rivets !== false) {
        for (const [rx, ry] of [[x + 3, y + 3], [x + w - 5, y + 3], [x + 3, y + h - 5], [x + w - 5, y + h - 5]]) {
          this.rect(rx, ry, 2, 2, '#5b6168'); this.rect(rx, ry, 1, 1, '#8a9097');
        }
      }
      if (opt.title) {
        this.rect(x + 2, y + 2, w - 4, 12, opt.titleBg || '#2a1d1a');
        this.text(opt.title, x + 7, y + 3, opt.titleCol || '#d9b48a', 12);
        this.rect(x + 2, y + 14, w - 4, 1, '#07080a');
      }
      c.globalAlpha = 1;
    }
    bar(x, y, w, h, v, col, back = '#1a1c1f') {
      this.rect(x, y, w, h, '#050506');
      this.rect(x + 1, y + 1, w - 2, h - 2, back);
      const fw = Math.round((w - 2) * Math.max(0, Math.min(1, v)));
      this.rect(x + 1, y + 1, fw, h - 2, col);
      this.rect(x + 1, y + 1, fw, 1, 'rgba(255,255,255,0.25)');
      // 刻度
      for (let i = 1; i < 5; i++) this.rect(x + 1 + Math.round((w - 2) * i / 5), y + 1, 1, h - 2, 'rgba(0,0,0,0.35)');
    }
    // 硬边像素文字
    text(str, x, y, col, size = 12, opt = {}) {
      const tmp = document.createElement('canvas');
      const tctx = tmp.getContext('2d');
      tctx.font = `${size}px ${UI_FONT}`;
      const tw = Math.ceil(tctx.measureText(str).width) + 4;
      tmp.width = tw; tmp.height = size + 6;
      tctx.font = `${size}px ${UI_FONT}`;
      tctx.textBaseline = 'top';
      tctx.fillStyle = '#fff';
      tctx.fillText(str, 1, 1);
      const id = tctx.getImageData(0, 0, tw, size + 6);
      const [r, g, b] = typeof col === 'string' ? hex(col) : col;
      for (let i = 0; i < id.data.length; i += 4) {
        const a = id.data[i + 3];
        id.data[i] = r; id.data[i + 1] = g; id.data[i + 2] = b;
        id.data[i + 3] = a > 110 ? 255 : 0;
      }
      tctx.putImageData(id, 0, 0);
      let ox = x;
      if (opt.align === 'right') ox = x - tw + 2;
      if (opt.align === 'center') ox = x - (tw >> 1);
      if (opt.shadow) {
        // 阴影：用黑色版本
        const sh = document.createElement('canvas'); sh.width = tw; sh.height = size + 6;
        const sctx = sh.getContext('2d');
        sctx.drawImage(tmp, 0, 0);
        sctx.globalCompositeOperation = 'source-in'; sctx.fillStyle = opt.shadow; sctx.fillRect(0, 0, tw, size + 6);
        this.ctx.drawImage(sh, ox, y + 1);
      }
      this.ctx.drawImage(tmp, ox, y);
      return tw - 4;
    }
    measure(str, size = 12) {
      const c = this.ctx; c.font = `${size}px ${UI_FONT}`;
      return Math.ceil(c.measureText(str).width);
    }
    // 自动换行
    para(str, x, y, w, col, size = 12, lh = 16) {
      let line = '', yy = y;
      for (const ch of str) {
        if (ch === '\n') { this.text(line, x, yy, col, size); line = ''; yy += lh; continue; }
        if (this.measure(line + ch, size) > w) { this.text(line, x, yy, col, size); line = ch; yy += lh; }
        else line += ch;
      }
      if (line) this.text(line, x, yy, col, size);
      return yy + lh;
    }
    // 小图标（8×8 字符画）
    icon(x, y, rows, pal, s = 1) {
      for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
        const ch = rows[j][i]; if (ch === '.') continue;
        this.rect(x + i * s, y + j * s, s, s, pal[ch]);
      }
    }
    blit(canvas, scale) {
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.cv, 0, 0, this.w * scale, this.h * scale);
    }
    blitImage(buf, x, y, scale, opts = {}) {
      const off = document.createElement('canvas'); off.width = buf.w; off.height = buf.h;
      const octx = off.getContext('2d');
      octx.putImageData(buf.toImageData(octx, opts.levels, opts.tint), 0, 0);
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(off, x, y, buf.w * scale, buf.h * scale);
    }
  }

  return { Buf, UI, hex, rng, bayer, present };
})();
