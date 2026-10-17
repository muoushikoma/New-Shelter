// 《请出示证件》式头像：低分辨率、无描边、棋盘格抖动明暗、压暗眼窝、灰褐偏绿的色调
// 设计坐标 64×80，按输出像素采样，可渲染成任意尺寸（证件照、登记表、观察窗）
const PP = (() => {
  const H = PX.hex;
  const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t));
  const sh = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  const hash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
  const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const seg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };

  // 灰褐偏绿的肤色
  const SKIN = {
    pale: ['#c9b19c', '#a99080', '#857064', '#5c4c48'].map(H),
    warm: ['#c4a080', '#a28066', '#7c624f', '#55443a'].map(H),
    tan: ['#a8885f', '#8a6c4c', '#6a523c', '#46372c'].map(H),
    sallow: ['#b8ae8a', '#968c6c', '#746c54', '#4e4a3c'].map(H),
  };

  // 夸张的辨识特征：脸宽、下巴、脸长、鼻子、眉毛、嘴
  const LOOK = {
    player:   { skin: 'warm', hair: '#2a2420', style: 'short', coat: '#4c5438', outfit: 'greatcoat', faceW: 13, jaw: 0.62, chin: 53, nose: 7, noseW: 2, brow: 2, browTilt: 0, mouthW: 7, stubble: true, male: true },
    lin:      { skin: 'pale', hair: '#18161c', style: 'tied', coat: '#8a887e', outfit: 'cardigan', scarf: '#7a2a2e', faceW: 11.5, jaw: 0.4, chin: 54, nose: 6, noseW: 1, brow: 1, browTilt: -1, mouthW: 5, lips: '#8a4a48', bags: true },
    zhou:     { skin: 'warm', hair: '#8a8680', style: 'receding', coat: '#363c44', outfit: 'tunic', faceW: 15, jaw: 0.85, chin: 54, nose: 8, noseW: 3, brow: 2, browTilt: 1, mouthW: 8, glasses: true, jowls: true, male: true, age: 56 },
    ana:      { skin: 'tan', hair: '#6a2c1c', style: 'wavy', coat: '#842628', outfit: 'redcoat', faceW: 11.5, jaw: 0.42, chin: 52, nose: 6, noseW: 1, brow: 1, browTilt: 0, mouthW: 6, lips: '#922a30', earring: true, mole: true },
    zhao:     { skin: 'tan', hair: '#1e1a18', style: 'shaved', coat: '#5c4630', outfit: 'vest', faceW: 15, jaw: 0.95, chin: 55, nose: 7, noseW: 3, brow: 2.4, browTilt: 1.2, mouthW: 8, scar: true, male: true, neck: 11 },
    su:       { skin: 'pale', hair: '#4e4038', style: 'bun', coat: '#5e4c3c', outfit: 'shawl', shawl: '#4e5a40', faceW: 12, jaw: 0.5, chin: 54, nose: 7, noseW: 1, brow: 1, browTilt: 0, mouthW: 5, grey: true, age: 45, thin: true },
    liu:      { skin: 'warm', hair: '#2a2420', style: 'cap', cap: '#2c3644', coat: '#384e68', outfit: 'overalls', faceW: 13.5, jaw: 0.7, chin: 52, nose: 5, noseW: 2, brow: 2, browTilt: -0.5, mouthW: 7, smile: true, smudge: true, male: true, ears: true },
    stranger: { skin: 'sallow', hair: '#3a3028', style: 'short', coat: '#525a3a', outfit: 'soldier', faceW: 12.5, jaw: 0.6, chin: 54, nose: 7, noseW: 2, brow: 2, browTilt: -1, mouthW: 6, bandage: true, stubble: true, male: true, bruise: true },
    visitor:  { skin: 'sallow', hair: '#3a3028', style: 'ushanka', hat: '#5a4634', coat: '#4a4038', outfit: 'scarfcoat', scarf: '#5a5a4a', faceW: 11.5, jaw: 0.55, chin: 57, nose: 9, noseW: 2, brow: 2, browTilt: -1.5, mouthW: 6, mustache: true, male: true, age: 44 },
  };

  // 返回 颜色 或 null（背景）
  function sample(L, x, y, px, py) {
    const chk = (px + py) & 1;
    const CX = 32, FY = 34;
    const sk = SKIN[L.skin];
    const RX = L.faceW, RYT = 15, chinY = L.chin;
    const hw = (yy) => {
      if (yy < FY - RYT || yy > chinY) return -1;
      if (yy < FY) return RX * Math.sqrt(Math.max(0, 1 - ((yy - FY) / RYT) ** 2));
      const t = (yy - FY) / (chinY - FY);
      return RX * (1 - (1 - L.jaw) * t ** 1.6 - (L.jowls ? -0.05 * t : 0));
    };
    const hair = H(L.hair);
    const hc = [sh(hair, 1.4), hair, sh(hair, 0.7), sh(hair, 0.5)];
    const dx = x - CX, ax = Math.abs(dx);
    const fw = hw(y);
    const inFace = fw >= 0 && ax <= fw;
    // 用连续明度 v（0 亮 → 1 暗）+ 棋盘格抖动 选色阶
    const pick = (pal, v) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * (pal.length - 1) + (chk ? 0.5 : 0))))];

    // ---------- 帽子 / 绷带 ----------
    if (L.style === 'ushanka') {
      const hat = H(L.hat), hp = [sh(hat, 1.3), hat, sh(hat, 0.72), sh(hat, 0.5)];
      const fur = [H('#a89a80'), H('#8a7c64'), H('#6a5e4a')];
      const furT = (v) => pick(fur, Math.min(1, v + (hash(px, py) < 0.3 ? 0.35 : 0)));
      // 护耳垂在两颊外侧
      if (y >= 22 && y < 47 && ax > RX - 1 && ax < RX + 5.5 && !(y > 43 && ax > RX + 3.5)) {
        if (Math.abs(ax - (RX + 2)) < 0.5 && y > 44) return H('#2a2420');
        return furT(dx > 0 ? 0.6 : 0.15);
      }
      if (inEll(x, y, CX, 18, RX + 4, 10) && y < 21) return pick(hp, (dx + RX) / (2 * RX + 8) * 0.85 + (Math.abs(dx) < 0.6 ? 0.3 : 0));
      if (y >= 20 && y < 25.5 && ax < RX + 4.5) return furT(dx / (RX + 4) * 0.4 + 0.25); // 翻起的前檐毛边
      if (ax < 0.7 && y < 21 && y > 12) return hp[3];
    }
    if (L.style === 'cap') {
      const c = H(L.cap), cp = [sh(c, 1.3), c, sh(c, 0.7), sh(c, 0.5)];
      if (inEll(x, y, CX + 1, 23, RX + 3, 9) && y < 24) return pick(cp, (dx + RX) / (2 * RX + 6) * 0.9);
      if (y >= 23 && y < 26 && x > CX - RX - 6 && x < CX + RX + 1) return y < 24 ? cp[1] : cp[3];
    }
    if (L.bandage && y >= 20 && y < 25 && inEll(x, y, CX, FY - 2, RX + 2, RYT + 3)) {
      if (inEll(x, y, CX + 7, 22, 2, 1.8)) return H('#6a2420');
      return pick(['#d8d0bc', '#bcb4a0', '#9a927e'].map(H), (dx + RX) / (2 * RX) * 0.9);
    }
    if (L.glasses) {
      for (const e of [-1, 1]) {
        const ex = CX + e * 5.5, ey = FY - 1;
        const ox = Math.abs(x - ex), oy = Math.abs(y - ey);
        if (ox <= 4 && oy <= 2.6 && !(ox < 3 && oy < 1.6)) return H('#2a2a28');
      }
      if (Math.abs(y - (FY - 2)) < 0.6 && ax < 2) return H('#2a2a28');
    }
    if (L.earring && Math.hypot(x - (CX - hw(38) - 0.5), y - 41) < 1.3) return H('#c8a848');

    // ---------- 前发 ----------
    const inSkull = inEll(x, y, CX, FY - 2, RX + 2, RYT + 3);
    const hairTone = () => {
      let v = (dx + RX) / (2 * RX + 4) * 0.85;
      if ((Math.floor(x * 0.8 + Math.sin(y * 0.5) * 1.5) % 3) === 0) v += 0.25;
      if (L.grey && hash(px, py) < 0.3) return H('#a09890');
      return pick(hc, v);
    };
    const st = L.style;
    if (st === 'short' && inSkull && (y < 23.5 + Math.sin(x * 1.3) * 1.2 || (ax > fw - 2 && y < 36 && fw > 0))) return hairTone();
    if (st === 'receding' && inSkull) {
      if (ax > RX - 3 && y < 38) return hairTone();
      if (y < 18 && hash(px, py) < 0.55) return hairTone();
    }
    if (st === 'shaved' && inSkull && y < 23 + ax * 0.06) return hash(px, py) < 0.45 ? hc[2] : sk[2];
    if ((st === 'tied' || st === 'bun') && inSkull && y < 21 + ax * (st === 'tied' ? 0.35 : 0.15)) {
      if (st === 'tied' && ax < 0.6) return sk[2];
      return hairTone();
    }
    if (st === 'tied' && fw > 0 && y < 46 && ax > fw - 2 && ax < fw + 1.5) return hairTone();
    if (st === 'wavy' && ((inSkull && y < 21 + dx * 0.3) || (fw > 0 && y < 56 && ax > fw - 1.2 && ax < fw + 4))) return hairTone();
    if ((st === 'cap' || st === 'ushanka') && fw > 0 && y < 34 && ax > fw - 1.5 && ax < fw + 0.5) return hairTone();

    // ---------- 脸 ----------
    if (inFace) {
      let v = 0.15 + (dx / Math.max(1, fw)) * 0.42 + ((y - 37) / 20) ** 2 * 0.25;
      // 眉骨下压暗的眼窝（标志性的阴沉）
      if (y > FY - 3.5 && y < FY + 1.5 && ax > 1.5 && ax < fw - 1) v += 0.32;
      // 颧骨下
      if (y > FY + 5 && y < FY + 10 && ax > fw * 0.55) v += 0.18;
      if (L.jowls && y > FY + 11 && ax > fw * 0.6) v += 0.25;
      // 鼻
      const nb = FY + 1, nl = L.nose;
      if (x >= CX + 0.5 && x < CX + 0.5 + L.noseW && y > nb && y < nb + nl) v += 0.35;
      if (x >= CX - 1.5 && x < CX - 0.5 && y > nb && y < nb + nl - 1) v -= 0.2;
      let c = pick(sk, Math.max(0, Math.min(1, v)));
      if (y >= nb + nl && y < nb + nl + 1 && x >= CX - 1.5 && x < CX + 1.5 + L.noseW) c = sk[3];
      // 眉
      for (const e of [-1, 1]) {
        const byIn = FY - 4.5 + L.browTilt * 0.6, byOut = FY - 4.5 - L.browTilt * 0.4;
        if (seg(x, y, CX + e * 2, byIn, CX + e * 9, byOut) <= L.brow / 2 + 0.25) return L.grey ? H('#6a625a') : hc[3];
      }
      // 眼：小、深、灰白一点
      for (const e of [-1, 1]) {
        const ex = CX + e * 5.5, ey = FY - 1;
        if (Math.abs(x - ex) < 2 && Math.abs(y - ey) < 0.5) return H('#141012');
        if (Math.abs(x - ex) < 2 && y >= ey + 0.5 && y < ey + 1.5) {
          if (Math.abs(x - (ex + 0.6)) < 0.5) return H('#141012');
          return Math.abs(x - ex) < 1.6 ? H('#a8a090') : sk[2];
        }
        if (L.bags && Math.abs(x - ex) < 1.6 && y >= ey + 2 && y < ey + 3) c = sk[3];
        if (L.bruise && e < 0 && inEll(x, y, ex, ey + 1, 4, 3) && chk) c = mix(c, H('#5a4458'), 0.5);
      }
      // 嘴
      const my = FY + L.nose + 5;
      const mw = L.mouthW / 2;
      const curve = L.smile ? -1 : 0.6;
      if (ax < mw && Math.abs(y - (my + (dx / mw) ** 2 * curve)) < 0.5) return L.lips ? sh(H(L.lips), 0.7) : sk[3];
      if (L.lips && !L.thin && ax < mw - 1 && y > my + 0.4 && y < my + 2) c = H(L.lips);
      if (!L.lips && ax < mw - 1 && y >= my + 1 && y < my + 2) c = sk[2];
      if (L.mustache && ax < mw + 0.5 && y > my - 3.6 && y < my - 1.6) return hc[2];
      if ((L.age || 0) >= 44) for (const e of [-1, 1]) if (seg(x, y, CX + e * 3.5, FY + 6, CX + e * 5.5, my + 1) < 0.5) c = sk[2];
      if (L.stubble && y > my - 3 && !(ax < mw && Math.abs(y - my) < 1.2) && hash(px, py) < 0.35) c = mix(c, hc[3], 0.6);
      if (L.scar && seg(x, y, CX - 10, FY - 7, CX - 3, FY + 8) < 0.6) c = H('#c08878');
      if (L.smudge && inEll(x, y, CX + 7, FY + 7, 3, 2) && chk) c = mix(c, H('#2a2620'), 0.6);
      if (L.mole && Math.hypot(x - (CX + 5), y - (my + 1)) < 0.7) c = H('#2a1a14');
      return c;
    }
    // 耳
    const ew = hw(FY + 1);
    for (const e of [-1, 1]) if (inEll(x, y, CX + e * (ew + (L.ears ? 1.4 : 0.6)), FY + 1, L.ears ? 3 : 2.2, 4)) return sk[e < 0 ? 1 : 2];

    // ---------- 衣服与颈 ----------
    const NW = L.neck || (L.male ? 6.5 : 5);
    const coat = H(L.coat), cp = [sh(coat, 1.28), coat, sh(coat, 0.72), sh(coat, 0.5)];
    const o = L.outfit;
    if (o === 'cardigan' && y > chinY + 2 && y < chinY + 12 && ax < NW + 4) return pick([H(L.scarf), sh(H(L.scarf), 0.75), sh(H(L.scarf), 0.55)], (dx + NW) / (2 * NW + 8));
    if (o === 'scarfcoat' && y > chinY + 1 && y < chinY + 9 && ax < NW + 6) return pick([sh(H(L.scarf), 1.2), H(L.scarf), sh(H(L.scarf), 0.7)], (dx + NW) / (2 * NW + 12) + ((Math.floor(y) % 3) === 0 ? 0.2 : 0));
    const neckEnd = { tunic: 60, vest: 62, overalls: 62, shawl: 61, cardigan: 65, greatcoat: 66, redcoat: 64, soldier: 64, scarfcoat: 60 }[o] || 64;
    if (ax <= NW && y > FY + 8 && y <= neckEnd) return y < chinY + 3 ? sk[3] : pick(sk, 0.55 + dx / NW * 0.3);
    // 长发在肩上
    if (st === 'wavy' && y > 30 && y < 78 && inEll(x, y, CX, 46, 22, 32)) return hairTone();
    if (st === 'tied') { const t = (y - 28) / 40; if (t >= 0 && t <= 1 && Math.abs(x - (CX + 15 + Math.sin(t * 2.4) * 3)) < 3.2 - t * 1.6) return hairTone(); }
    if (st === 'bun' && inEll(x, y, CX + 3, 13, 6, 5)) return hairTone();
    // 身体
    const SW = (L.neck ? 31 : 28);
    const yS = ax < NW + 1 ? 59 : 59 + Math.pow((ax - NW - 1) / (SW - NW - 1), 1.6) * 8;
    if (y >= yS && ax <= SW + (y - 66) * 0.25) {
      let v = 0.2 + (dx / SW) * 0.45;
      if (seg(x, y, CX - 15, 66, CX - 18, 80) < 0.6 || seg(x, y, CX + 14, 67, CX + 16, 80) < 0.6) v += 0.3;
      let c = pick(cp, v);
      if (o === 'greatcoat') {
        if (y < 68 && ax > NW - 1 && ax < NW + 6 && y > 59 + (ax - NW) * 0.7) c = dx > 0 ? cp[2] : cp[0];
        if (inEll(x, y, CX - 11, 66, 2, 1.3) || inEll(x, y, CX + 11, 66, 2, 1.3)) c = H('#7a2626');
        if (Math.abs(dx - 2) < 0.8 && (Math.abs(y - 71) < 0.8 || Math.abs(y - 77) < 0.8)) c = H('#a08848');
      } else if (o === 'tunic') {
        if (y < 62 && ax < NW + 2) c = cp[2];
        if (ax < 0.5 && y > 62) c = cp[3];
        if (ax < 1 && [65, 70, 75].some((b) => Math.abs(y - b) < 0.7)) c = H('#6a6a64');
        if (inEll(x, y, CX - 11, 65, 1.2, 1.2)) c = H('#a82828');
      } else if (o === 'cardigan') {
        if (ax < (y - 60) * 0.3 + 2) c = ax < 0.8 ? H('#b8b4a8') : H('#d8d4c8');
      } else if (o === 'redcoat') {
        if (ax < NW + 11 && y < yS + 4) c = hash(px, py) < 0.35 ? H('#8a7a5e') : H('#b0a080');
      } else if (o === 'vest') {
        if (ax < NW + 3 && y < 66) c = H('#3a3a3c');
        if ((Math.floor(y) % 4) === 0) c = sh(c, 0.85);
      } else if (o === 'shawl') {
        if (y < 72 - ax * 0.2) c = pick([sh(H(L.shawl), 1.25), H(L.shawl), sh(H(L.shawl), 0.7)], (dx + SW) / (2 * SW) + ((Math.floor(x) + Math.floor(y)) % 4 === 0 ? 0.3 : 0));
      } else if (o === 'overalls') {
        const shirt = [H('#8a8c88'), H('#6e706c'), H('#525450')];
        if (!(ax < 10 && y > 68) && !(Math.abs(ax - 8.5) < 1.5)) c = pick(shirt, v);
      } else if (o === 'soldier') {
        if (inEll(x, y, CX - 9, 72, 4, 3) && chk) c = H('#4a1a16');
      }
      return c;
    }
    return null;
  }

  function portrait(key, outW, outH, opt = {}) {
    const L = LOOK[key];
    const cv = document.createElement('canvas'); cv.width = outW; cv.height = outH;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(outW, outH);
    const bg = opt.bg || [H('#6a7270'), H('#5a6260')];
    for (let py = 0; py < outH; py++) for (let px = 0; px < outW; px++) {
      const x = (px + 0.5) * 64 / outW, y = (py + 0.5) * 80 / outH;
      let c = sample(L, x, y, px, py);
      if (!c) {
        if (opt.transparent) continue;
        c = ((px + py) & 1) && py / outH > 0.5 ? bg[1] : py / outH > 0.65 ? bg[1] : bg[0];
      }
      const i = (py * outW + px) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  return { LOOK, portrait };
})();
