// UI 用高精度像素：头像（80×96 设计单位）与物品图标（32×32 设计单位）
// 逐像素中心采样 → 硬边；赛璐璐分层着色，无抖动；自动描边与右侧冷色轮廓光
const HD = (() => {
  const H = PX.hex;
  const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t));
  const sh = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  const hash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
  const segDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

  const SKIN = {
    pale: ['#f6dcc8', '#e2b8a0', '#bf8d78', '#875a52'].map(H),
    warm: ['#efc8a4', '#d29d78', '#a96f55', '#6e4436'].map(H),
    tan: ['#dcab84', '#b98060', '#8a5842', '#57352a'].map(H),
  };
  const OUT = H('#120d0f');
  const RIM = H('#9ab4d8');

  // 每个角色的高精度外观（突出辨识特征）
  const LOOK = {
    player: { skin: 'warm', hair: '#2b2421', style: 'short', outfit: 'greatcoat', coat: '#556040', male: true, stubble: true, brow: [38.6, 38.2], browW: 2.2, mouth: 0.4, eyeBags: true, iris: '#4a3a2a' },
    lin: { skin: 'pale', hair: '#16141c', style: 'tied', outfit: 'cardigan', coat: '#9c9a92', scarf: '#8a2f36', male: false, brow: [37.6, 39.0], browW: 1.5, mouth: 0.3, eyeBags: true, iris: '#3a2a22', lip: '#b0605e', mole: false },
    zhou: { skin: 'warm', hair: '#a29e98', style: 'receding', outfit: 'tunic', coat: '#3c424c', male: true, heavy: true, glasses: true, brow: [38.0, 36.8], browW: 2.0, mouth: -0.5, age: 56, jowls: true, iris: '#2a2a2a' },
    ana: { skin: 'tan', hair: '#7a3220', style: 'wavy', outfit: 'redcoat', coat: '#9a2a2c', male: false, earring: true, brow: [38.2, 37.6], browW: 1.6, mouth: -0.2, lip: '#a8323a', mole: true, iris: '#3a2814' },
    zhao: { skin: 'tan', hair: '#221c1a', style: 'shaved', outfit: 'vest', coat: '#6a5034', male: true, heavy: true, scar: true, brow: [40.2, 37.4], browW: 2.8, mouth: 0.8, brokenNose: true, iris: '#2a1e18', neckThick: true },
    su: { skin: 'pale', hair: '#5a4a42', style: 'bun', outfit: 'shawl', coat: '#6a5442', shawl: '#5a6a4a', male: false, grey: true, brow: [38.4, 38.4], browW: 1.6, mouth: 0.7, age: 45, lip: '#a06058', iris: '#4a5a6a', thinLips: true },
    liu: { skin: 'warm', hair: '#2b2421', style: 'cap', outfit: 'overalls', coat: '#3e5878', cap: '#2e3a4c', male: true, brow: [38.0, 38.6], browW: 1.8, mouth: -0.8, smudge: true, round: true, iris: '#3a2a1e' },
    stranger: { skin: 'pale', hair: '#3a3028', style: 'short', outfit: 'soldier', coat: '#5a6140', male: true, bandage: true, bruise: true, brow: [37.6, 38.8], browW: 1.8, mouth: 0.6, iris: '#3a4a3a', stubble: true },
  };

  // 采样：返回 [颜色, 区域]  区域：0 背景 1 身体 2 颈 3 脸 4 发 5 饰品 6 耳
  function sample(L, x, y) {
    const CX = 40, FY = 42;
    const sk = SKIN[L.skin];
    const RX = L.heavy ? 18.5 : L.male ? (L.round ? 17.5 : 16.8) : 15.6;
    const RYT = 20, chinY = L.male ? 64 : 63;
    const hw = (yy) => {
      if (yy < FY - RYT || yy > chinY) return -1;
      if (yy < FY) return RX * Math.sqrt(Math.max(0, 1 - ((yy - FY) / RYT) ** 2));
      const t = (yy - FY) / (chinY - FY);
      if (L.jowls) return RX * (1 - 0.32 * t ** 3);
      return L.male ? RX * (1 - 0.46 * t ** 2.2) : RX * (1 - 0.64 * t ** 1.7);
    };
    const hair = H(L.hair);
    const hc = [sh(hair, 1.55), hair, sh(hair, 0.68), sh(hair, 0.45)];
    if (L.grey) hc[0] = H('#b4aca4');
    const NW = L.neckThick ? 11 : L.heavy ? 9.5 : L.male ? 8 : 6.5;
    const dx = x - CX, ax = Math.abs(dx);
    const faceW = hw(y);
    const inFace = faceW >= 0 && ax <= faceW;

    // ---------- 饰品（最上层） ----------
    if (L.glasses) {
      for (const e of [-1, 1]) {
        const ex = CX + e * 7.5, ey = 44;
        const ox = Math.abs(x - ex), oy = Math.abs(y - ey);
        if (ox <= 5.6 && oy <= 3.8 && !(ox < 4.6 && oy < 2.8)) return [ox > 5 || oy > 3.2 ? H('#2a2c30') : H('#6a7078'), 5];
      }
      if (y >= 42.6 && y <= 43.8 && ax <= 2.2) return [H('#4a4e54'), 5];
      if (y >= 42.8 && y <= 43.8 && ax >= 13 && ax <= faceW + 0.6 && faceW > 0) return [H('#3a3e44'), 5];
    }
    if (L.earring) {
      const ex = CX - hw(47) - 0.6, ey = 52.5;
      const d = Math.hypot(x - ex, y - ey);
      if (d >= 1.6 && d <= 2.7) return [y < ey ? H('#f0d878') : H('#b08a30'), 5];
    }
    if (L.bandage) {
      if (y >= 26.5 && y <= 33.5 && inEll(x, y, CX, FY - 2, RX + 2.6, RYT + 3)) {
        if (inEll(x, y, CX + 9, 30, 2.8, 2.4)) return [H('#7a2620'), 5];
        if (inEll(x, y, CX + 9, 30, 4.0, 3.2)) return [H('#a85a4a'), 5];
        const band = (y - 26.5 + dx * 0.25) % 3.5 < 0.8;
        return [band ? H('#b8b0a0') : dx > 8 ? H('#cfc6b4') : H('#ebe4d6'), 5];
      }
    }
    if (L.style === 'cap') {
      if (y < 33 && inEll(x, y, CX + 1, 31, RX + 3.2, 13)) {
        const c = H(L.cap);
        if (y > 30.5) return [sh(c, 0.6), 5];
        if (Math.abs(dx - 1) < 0.5 && y > 20) return [sh(c, 0.75), 5];
        return [dx < -6 ? sh(c, 1.3) : dx > 9 ? sh(c, 0.75) : c, 5];
      }
      if (y >= 32.5 && y <= 35.5 && x >= CX - RX - 7 && x <= CX + RX + 1) {
        const c = H(L.cap);
        return [y < 33.5 ? sh(c, 1.35) : sh(c, 0.55), 5];
      }
    }

    // ---------- 前发 ----------
    const fh = frontHair(L, x, y, dx, ax, faceW, RX, FY, RYT, hc);
    if (fh) return [fh, 4];

    // ---------- 脸 ----------
    if (inFace) {
      const s = dx / Math.max(1, faceW) + ((y - 47) / 24) ** 2 * 0.55;
      let t = s < -0.3 ? 0 : s < 0.42 ? 1 : s < 0.82 ? 2 : 3;
      if (y > chinY - 2.5 && s > -0.5) t = Math.max(t, 2);
      // 颧骨下的阴影（饥饿）
      if (dx > 0 && segDist(x, y, CX + faceW * 0.5, 55, CX + faceW * 0.88, 49) < 1.1) t = Math.min(3, t + 1);
      // 鼻
      const nb = L.brokenNose ? Math.sin((y - 44) * 0.9) * 0.6 : 0;
      if (x >= CX + 1.4 + nb && x <= CX + 3 + nb && y >= 44.5 && y <= 51.5) t = Math.max(t, 2);
      if (x >= CX - 1.6 && x <= CX - 0.4 && y >= 45 && y <= 50.5) t = 0;
      if (y >= 52.6 && y <= 53.8 && x >= CX - 1.5 && x <= CX + 4) t = Math.max(t, 2);
      if (inEll(x, y, CX + 0.2, 51.2, 3.4, 1.5)) t = Math.min(t, 1);
      let c = sk[t];
      for (const nx of [CX - 1.9, CX + 2.1]) if (Math.hypot(x - nx, y - 52.5) < 0.75) c = sk[3];
      // 眼窝 & 眼
      for (const e of [-1, 1]) {
        const ex = CX + e * 7.5, ey = 44;
        const exx = x - ex, eyy = y - ey;
        // 眉
        const [bi, bo] = L.brow;
        const bd = segDist(x, y, CX + e * 3.4, bi, CX + e * 12.2, bo);
        if (bd <= L.browW / 2) return [L.grey ? H('#7a706a') : hc[3], 3];
        // 眼白
        const ry = L.male ? 1.9 : 2.2;
        if ((exx / 4.1) ** 2 + (eyy / ry) ** 2 <= 1 && eyy < 1.6) {
          const ic = H(L.iris);
          const id = Math.hypot(exx - 0.3, eyy + 0.1);
          if (Math.hypot(exx + 0.3, eyy + 0.5) < 0.62) return [H('#ffffff'), 3];
          if (id < 0.85) return [H('#0c0a0c'), 3];
          if (id < 1.9) return [eyy < -0.6 ? sh(ic, 0.7) : ic, 3];
          return [e > 0 ? H('#cfc6bc') : H('#ece6de'), 3];
        }
        // 上眼睑 / 睫毛
        if (Math.abs(exx) <= 4.4 && eyy >= -2.5 && eyy <= -1.3) return [H('#1c1416'), 3];
        if (!L.male && e * exx > 3.6 && e * exx < 5.6 && eyy > -2.9 && eyy < -1.7 + (e * exx - 3.6) * -0.2) return [H('#1c1416'), 3];
        // 下眼睑与眼袋
        if (Math.abs(exx) <= 3.6 && eyy >= 1.6 && eyy <= 2.3) c = sk[2];
        if (L.eyeBags && Math.abs(exx) <= 3 && eyy >= 2.9 && eyy <= 3.5) c = sk[2];
        if (L.bruise && e < 0 && inEll(x, y, ex, ey + 1.5, 5.5, 4)) c = mix(c, H('#6a4a6a'), 0.35);
      }
      // 年龄纹
      if ((L.age || 0) >= 40) for (const e of [-1, 1]) if (segDist(x, y, CX + e * 4.2, 53.4, CX + e * 6.8, 58.6) < 0.5) c = sk[2];
      if ((L.age || 0) >= 50) for (const ly of [32.5, 35]) if (Math.abs(y - ly) < 0.45 && ax < 7) c = sk[2];
      if (L.jowls && y > 58 && ax > faceW * 0.7) c = sk[Math.min(3, t + 1)];
      // 嘴
      const mw = L.male ? 5.2 : 4.4;
      if (ax <= mw) {
        const yl = 57.9 + (dx / mw) ** 2 * L.mouth;
        const lipC = L.lip ? H(L.lip) : sk[2];
        if (Math.abs(y - yl) < 0.55) return [L.lip ? sh(lipC, 0.55) : sk[3], 3];
        if (!L.thinLips && y < yl && y > 56.5 && ax < mw - 0.8) c = L.lip ? sh(lipC, 0.85) : sk[Math.max(t, 1) === 1 ? 2 : 2];
        if (!L.thinLips && inEll(x, y, CX, 59.3, mw - 1, 1.15)) c = L.lip ? lipC : sk[Math.min(t, 1)];
        if (L.lip && inEll(x, y, CX - 1.4, 59.0, 0.9, 0.4)) c = mix(lipC, H('#ffffff'), 0.4);
      }
      if (L.mouth < -0.6 && Math.abs(y - (57.9 + L.mouth)) < 0.5 && ax > mw - 0.6 && ax < mw + 1) c = sk[2];
      // 腮红
      if (!L.male && inEll(Math.abs(dx), y, 9.5, 51.5, 3.2, 1.4)) c = mix(c, H('#d07a78'), 0.35);
      if (L.mole && Math.hypot(x - (CX + 6), y - 56.5) < 0.7) c = H('#3a2018');
      // 胡茬
      if (L.stubble && y > 55 + Math.max(0, 6 - ax) * 0.3 && !(ax < 6 && y < 57) && hash(Math.floor(x), Math.floor(y)) < 0.28) c = mix(c, hc[3], 0.4);
      if (L.scar) { const d = segDist(x, y, CX - 13, 34, CX - 4, 53); if (d < 0.6) c = H('#e8a090'); else if (d < 1.2) c = sk[2]; }
      if (L.smudge && inEll(x, y, CX + 9, 53, 3.4, 2.2) && hash(Math.floor(x), Math.floor(y)) < 0.6) c = mix(c, H('#2a2420'), 0.5);
      return [c, 3];
    }
    // 耳
    const ew = hw(45);
    for (const e of [-1, 1]) {
      if (inEll(x, y, CX + e * (ew + 0.6), 45.5, 3, 5)) {
        if (inEll(x, y, CX + e * (ew + 0.9), 45.8, 1.4, 3)) return [sk[e < 0 ? 2 : 3], 6];
        return [sk[e < 0 ? 1 : 2], 6];
      }
    }
    // ---------- 衣领 / 围巾（在颈前） ----------
    const col = collar(L, x, y, dx, ax, NW);
    if (col) return [col, 1];
    // 颈
    const neckEnd = { tunic: 69, overalls: 73, vest: 72, shawl: 71, soldier: 74, redcoat: 75, greatcoat: 77, cardigan: 76 }[L.outfit] || 76;
    if (ax <= NW && y >= 54 && y <= neckEnd) {
      let c = dx < -NW * 0.4 ? sk[1] : sk[2];
      if (y < chinY + 4.5) c = sk[3];
      return [c, 2];
    }
    // 背后的长发（盖在肩上）
    const bh = backHair(L, x, y, dx, ax, FY, hc);
    if (bh) return [bh, 4];
    // ---------- 身体 ----------
    const shoulderW = L.heavy || L.neckThick ? 40 : 36;
    let yS;
    if (ax < NW + 2) yS = 70;
    else yS = 70 + Math.pow((ax - NW - 2) / Math.max(1, shoulderW - NW - 2), 1.6) * 9;
    if (y >= yS && ax <= shoulderW + (y - 80) * 0.25) return [body(L, x, y, dx, ax, NW, shoulderW), 1];
    return [null, 0];
  }

  function frontHair(L, x, y, dx, ax, faceW, RX, FY, RYT, hc) {
    const st = L.style;
    const inSkull = inEll(x, y, 40, FY - 2, RX + 2.6, RYT + 3.2);
    const tone = () => {
      const s = dx / (RX + 3);
      let k = s < -0.35 ? 1 : s < 0.35 ? 1 : s < 0.72 ? 2 : 3;
      const strand = ((x * 0.72 + Math.sin(y * 0.33) * 2.4) % 4.6 + 4.6) % 4.6;
      if (strand < 0.9) k = Math.min(3, k + 1);
      if (s < -0.15 && s > -0.7 && strand > 2.2 && strand < 3.0 && y < FY) k = 0;
      if (L.grey && ((x * 0.8 + y * 1.1) % 6 + 6) % 6 < 1.1) return H('#b8b0aa');
      return hc[k];
    };
    if (st === 'short') {
      const hl = 30.5 + Math.sin(x * 1.25) * 1.3 + Math.sin(x * 0.5) * 1.1 + ax * 0.06;
      if (inSkull && y < hl) return tone();
      if (inSkull && ax > faceW - 2.5 && y < 46 && faceW > 0) return tone();
    } else if (st === 'receding') {
      if (!inSkull) return null;
      const hl = ax < 4 ? 23 : ax < 9 ? 27.5 : 23.5;
      if (ax > RX - 3.5 && y < 49) return tone(); // 两鬓浓密
      if (y < hl) {
        // 稀疏的梳过来的头发 + 露出的头皮
        const comb = (((x + y * 2.3) % 4) + 4) % 4 < 1.4;
        if (y < 19.5 || comb) return tone();
        return null; // 头皮由脸/背景处理
      }
    } else if (st === 'shaved') {
      if (inSkull && y < 31 + ax * 0.08) {
        const sk = SKIN[L.skin];
        const base = dx > 7 ? sk[3] : dx > -4 ? sk[2] : sk[1];
        return hash(Math.floor(x * 1.4), Math.floor(y * 1.4)) < 0.5 ? mix(base, hc[3], 0.6) : base;
      }
      if (inSkull && ax > faceW - 1.5 && y < 41 && faceW > 0) return mix(SKIN[L.skin][2], hc[3], 0.5);
    } else if (st === 'tied' || st === 'bun') {
      const hl = 27 + ax * (st === 'tied' ? 0.42 : 0.2);
      if (inSkull && y < hl) {
        if (st === 'tied' && ax < 0.7 && y > 20) return SKIN[L.skin][2]; // 中分发缝
        return tone();
      }
      if (st === 'tied' && faceW > 0 && y < 60 && ax > faceW - 3.2 && ax < faceW + 2.4) return tone(); // 垂下的鬓发
      if (st === 'bun' && faceW > 0 && y < 46 && ax > faceW - 1.8 && ax < faceW + 2.2) return tone();
    } else if (st === 'wavy') {
      const hl = 27 + dx * 0.32 + Math.sin(x * 0.55) * 1.6;
      if (inSkull && y < hl) return tone();
      if (faceW > 0 && y < 70 && ax > faceW - 1.4 - Math.sin(y * 0.5) * 0.5 && ax < faceW + 4) return tone();
    } else if (st === 'cap') {
      if (faceW > 0 && y >= 33 && y < 45 && ax > faceW - 2.2 && ax < faceW + 1.5) return tone();
    }
    return null;
  }

  function backHair(L, x, y, dx, ax, FY, hc) {
    const tone = (k0) => { const s = dx / 30; let k = s < -0.4 ? 1 : s < 0.4 ? 2 : 3; if ((((x * 0.6 + Math.sin(y * 0.3) * 2) % 5) + 5) % 5 < 1) k = Math.min(3, k + 1); return hc[Math.max(k0 || 0, k)]; };
    if (L.style === 'wavy') {
      const w = 26 + Math.sin(y * 0.42) * 2.2;
      if (y > 30 && y < 94 && ax < w && inEll(x, y, 40, 56, 30, 40)) return tone(1);
    }
    if (L.style === 'tied') {
      // 马尾：从后脑绕到右肩前
      const t = (y - 36) / 52;
      if (t >= 0 && t <= 1) { const cx = 40 + 20 + Math.sin(t * 2.4) * 4; const w = 4.2 - t * 2.4; if (Math.abs(x - cx) < w) return tone(1); }
    }
    if (L.style === 'bun' && inEll(x, y, 44, 17, 8.5, 7)) {
      const ring = Math.hypot((x - 44) / 8.5, (y - 17) / 7);
      return hc[ring > 0.8 ? 3 : (x - 44) > 2 ? 2 : (Math.floor(ring * 6) % 2 ? 1 : 0)];
    }
    return null;
  }

  function collar(L, x, y, dx, ax, NW) {
    const o = L.outfit;
    if (o === 'cardigan' && L.scarf) {
      const c = H(L.scarf);
      if (y >= 62.5 && y <= 75 && ax <= NW + 4.5 - (y - 62.5) * 0.08) {
        const fold = ((y + dx * 0.5) % 4 + 4) % 4 < 1;
        return dx > 4 ? sh(c, 0.7) : fold ? sh(c, 0.8) : y < 64 ? sh(c, 1.25) : c;
      }
      if (x >= 44 && x <= 50 - (y - 75) * 0.1 && y > 74 && y < 94) return ((y % 3) < 1) ? sh(c, 0.75) : sh(c, 0.92);
    }
    if (o === 'tunic' && y >= 68 && y <= 74 && ax <= NW + 2) return y < 69 ? sh(H(L.coat), 1.3) : sh(H(L.coat), 0.85);
    if (o === 'greatcoat' && y >= 66 && y <= 80 && ax >= NW - 1 && ax <= NW + 7 - (y - 66) * 0.25 && y > 66 + (ax - NW) * 0.6) {
      const c = H(L.coat);
      return dx > 0 ? sh(c, 0.75) : sh(c, 1.1);
    }
    return null;
  }

  function body(L, x, y, dx, ax, NW, SW) {
    const base = H(L.coat);
    const s = dx / SW;
    let c = s < -0.5 ? sh(base, 1.22) : s < 0.38 ? base : s < 0.75 ? sh(base, 0.74) : sh(base, 0.58);
    const fold = segDist(x, y, 40 - 20, 76, 40 - 24, 96) < 0.6 || segDist(x, y, 40 + 18, 78, 40 + 21, 96) < 0.6;
    if (fold) c = sh(c, 0.8);
    switch (L.outfit) {
      case 'greatcoat':
        if (inEll(x, y, 40 - 15, 80, 2.4, 1.6) || inEll(x, y, 40 + 15, 80, 2.4, 1.6)) return H('#8c2a2a');
        if (Math.abs(dx - 3) < 1.3 && (Math.abs(y - 86) < 1.3 || Math.abs(y - 93) < 1.3)) return H('#b89a50');
        if (Math.abs(dx - 1) < 0.5 && y > 78) return sh(base, 0.6);
        if (inEll(x, y, 40 - 28, 76, 4, 2) && hash(Math.floor(x), Math.floor(y)) < 0.5) return sh(base, 0.5); // 撕掉的肩章
        break;
      case 'cardigan':
        if (ax < (y - 70) * 0.32 + 2.5) return ax < 1 ? H('#c8c4bc') : H('#ecebe4');
        if (Math.abs(ax - ((y - 70) * 0.32 + 3.2)) < 0.7) return sh(base, 0.7);
        if (y > 78 && ((x * 2 + y) % 3) < 0.5) c = sh(c, 0.92); // 针织纹
        break;
      case 'tunic':
        if (Math.abs(dx) < 0.5 && y > 74) return sh(base, 0.6);
        if (Math.abs(dx) < 1.3 && [78, 85, 92].some((by) => Math.abs(y - by) < 1.1)) return H('#5a5e66');
        for (const e of [-1, 1]) {
          const px = 40 + e * 14;
          if (Math.abs(x - px) < 5.5 && y > 81 && y < 90) { if (y < 83) return sh(base, 0.68); return Math.abs(x - px) > 4.8 ? sh(base, 0.7) : c; }
        }
        if (inEll(x, y, 40 - 14, 79, 1.5, 1.5)) return H('#c03030'); // 徽章
        if (inEll(x, y, 40 - 14, 79, 0.6, 0.6)) return H('#e8c860');
        break;
      case 'redcoat': {
        const yS = ax < NW + 2 ? 70 : 70 + Math.pow((ax - NW - 2) / Math.max(1, SW - NW - 2), 1.6) * 9;
        if (ax < NW + 15 && y < yS + 5.5 + Math.sin(x * 1.9) * 0.9) {
          const fur = H('#cbb594');
          return hash(Math.floor(x), Math.floor(y)) < 0.3 ? sh(fur, 0.78) : dx > 6 ? sh(fur, 0.84) : fur;
        }
      }
        if (ax < 7 && Math.abs(y - (74 + dx * dx / 22)) < 0.6 && y > 72) return H('#e8c860');
        if (Math.abs(dx) < 0.6 && y > 82) return sh(base, 0.6);
        break;
      case 'vest': {
        if (ax < NW + 4 && y < 80) return y < 72 ? H('#5a5a5e') : H('#3a3a40');
        if (Math.abs(dx - 2) < 4 && y > 78) return H('#2e2e34');
        if ((y % 4.5) < 0.6) c = sh(c, 0.82); // 绗缝
        break;
      }
      case 'shawl': {
        const sc = H(L.shawl);
        if (y < 88 - ax * 0.25 && y > 69) {
          const dia = (Math.abs(((x + y) % 6 + 6) % 6 - 3) + Math.abs(((x - y) % 6 + 6) % 6 - 3)) < 1.5;
          let k = dx > 10 ? 0.72 : dx < -10 ? 1.18 : 1;
          return sh(dia ? sh(sc, 1.25) : sc, k);
        }
        if (inEll(x, y, 40, 86, 2.2, 2.2)) return H('#c8b070');
        break;
      }
      case 'overalls': {
        const shirt = H('#7a7c80');
        if (ax < 13 && y > 82) return dx > 6 ? sh(base, 0.75) : base;
        if (Math.abs(ax - 11) < 2 && y <= 82) return sh(base, 0.9);
        if (Math.abs(ax - 11) < 1.1 && Math.abs(y - 81) < 1.1) return H('#c8c4b0');
        if (inEll(x, y, 40 + 6, 90, 3.5, 2.2)) return H('#2a2a2e');
        return s < -0.5 ? sh(shirt, 1.15) : s < 0.4 ? shirt : sh(shirt, 0.7);
      }
      case 'soldier':
        if (inEll(x, y, 40 - 12, 86, 5, 4) && hash(Math.floor(x), Math.floor(y)) < 0.8) return H('#5a1c18');
        if (Math.abs(dx - 2) < 0.5 && y > 72) return sh(base, 0.6);
        if (segDist(x, y, 40 + 26, 74, 40 + 31, 82) < 0.8) return H('#2a2a22'); // 撕裂
        break;
    }
    return c;
  }

  // 渲染头像 → 离屏 canvas
  // view: 设计坐标中的取景框 {x, y, w, h}，默认整张 80×96
  function portrait(key, outW, outH, opt = {}) {
    const L = LOOK[key];
    const v = opt.view || { x: 0, y: 0, w: 80, h: 96 };
    const cv = document.createElement('canvas'); cv.width = outW; cv.height = outH;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(outW, outH);
    const reg = new Uint8Array(outW * outH);
    const col = new Array(outW * outH);
    for (let py = 0; py < outH; py++) for (let px = 0; px < outW; px++) {
      const x = v.x + (px + 0.5) * v.w / outW, y = v.y + (py + 0.5) * v.h / outH;
      let [c, r] = sample(L, x, y);
      // 秃顶处露出的头皮
      if (!c && L.style === 'receding' && inEll(x, y, 40, 40, 21, 23.2) && y < 30) { c = SKIN[L.skin][x > 46 ? 2 : 1]; r = 3; }
      reg[py * outW + px] = r; col[py * outW + px] = c;
    }
    const bg = opt.bg || [H('#232830'), H('#1a1e25')];
    for (let py = 0; py < outH; py++) for (let px = 0; px < outW; px++) {
      const i = py * outW + px;
      let c = col[i];
      const r = reg[i];
      if (r === 0) {
        c = opt.transparent ? null : (py / outH < 0.55 ? bg[0] : bg[1]);
        if (!opt.transparent && opt.glow !== false) { const d = Math.hypot(px / outW - 0.3, py / outH - 0.3); if (d < 0.35) c = mix(bg[0], H('#3a4250'), 0.5); }
      } else {
        const nb = (dx, dy) => { const xx = px + dx, yy = py + dy; return xx < 0 || yy < 0 || xx >= outW || yy >= outH ? -1 : reg[yy * outW + xx]; };
        if (nb(1, 0) === 0 || nb(-1, 0) === 0 || nb(0, 1) === 0 || nb(0, -1) === 0) c = OUT;
        else if (opt.rim !== false && nb(2, 0) === 0 && (r === 3 || r === 4 || r === 1 || r === 6)) c = mix(c, RIM, 0.45);
        else if (r === 3 && nb(0, -1) === 4) c = sh(c, 0.82); // 头发投在额头上的阴影
      }
      const k = i * 4;
      if (c) { img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255; }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  // 头部特写（用于名单、关系网）
  const HEAD_VIEW = { x: 13, y: 13, w: 54, h: 54 };

  // ---------------- 物品图标 ----------------
  const c = (h) => H(h);
  const ICONS = {
    can: [
      ['ell', 16, 26, 8, 2.6, '#4a4e52'], ['rect', 8, 9, 16, 17, '#8a9096'], ['rect', 8, 13, 16, 10, '#a83a2c'],
      ['rect', 8, 13, 16, 1.2, '#d06a4a'], ['rect', 12, 15.5, 8, 5, '#e8d8b0'], ['rect', 13.5, 17, 5, 1.2, '#7a2a20'],
      ['rect', 9.5, 9, 2, 17, '#c8ccd0'], ['rect', 20.5, 9, 3.5, 17, '#5a6066'], ['rect', 20.5, 13, 3.5, 10, '#7a2820'],
      ['ell', 16, 9, 8, 2.6, '#c8ccd0'], ['ell', 16, 9, 6, 1.6, '#8a9096'], ['line', 14, 8.4, 19, 8.4, 0.8, '#5a6066'],
    ],
    candle: [
      ['ell', 16, 27.5, 9, 2.4, '#6a6e74'], ['ell', 16, 27, 7.5, 1.6, '#9aa0a6'],
      ['rect', 12, 12, 8, 15, '#e8dcc0'], ['rect', 17.5, 12, 2.5, 15, '#c8b896'], ['rect', 12.5, 12, 1.4, 15, '#fff6e0'],
      ['ell', 16, 12, 4, 1.2, '#f4ead4'], ['rect', 13, 12, 2, 5, '#f4ead4'], ['ell', 14, 17, 1, 1.3, '#f4ead4'],
      ['line', 16, 11.5, 16, 9, 0.7, '#2a2020'], ['ell', 16, 6.5, 2.6, 4.4, '#e8702a'], ['ell', 16, 7.5, 1.4, 2.6, '#ffe8a0'],
    ],
    bandage: [
      ['rect', 6, 10, 15, 14, '#e8e2d4'], ['rect', 6, 10, 15, 2, '#ffffff'], ['rect', 6, 21, 15, 3, '#bdb4a2'],
      ['rect', 14, 23, 13, 3.5, '#ddd4c2'], ['ell', 21, 17, 4.5, 7, '#f4efe4'], ['ell', 21, 17, 3, 4.8, '#d8d0c0'],
      ['ell', 21, 17, 1.6, 2.6, '#f4efe4'], ['ell', 21, 17, 0.6, 1, '#bdb4a2'],
      ['rect', 10, 14, 2, 6, '#c03030'], ['rect', 8, 16, 6, 2, '#c03030'],
    ],
    cig: [
      ['rect', 8, 8, 16, 20, '#e8e4dc'], ['rect', 8, 8, 16, 7, '#9a2a2a'], ['rect', 20, 8, 4, 20, '#bdb8ae'], ['rect', 20, 8, 4, 7, '#6a1e1e'],
      ['rect', 11, 18, 7, 6, '#c8a050'], ['ell', 14.5, 21, 2.2, 2.2, '#9a2a2a'],
      ['rect', 10, 3, 2.6, 6, '#f4f0e8'], ['rect', 10, 3, 2.6, 2, '#d88a40'], ['rect', 14, 4.5, 2.6, 4.5, '#f4f0e8'], ['rect', 14, 4.5, 2.6, 2, '#d88a40'],
    ],
    permit: [
      ['rect', 7, 5, 18, 23, '#6a1414'], ['rect', 7, 5, 18, 23, '#8c2020'], ['rect', 7, 5, 2, 23, '#b03a30'], ['rect', 23, 5, 2, 23, '#5a1010'],
      ['ell', 16, 13, 4.5, 4.5, '#d8b050'], ['ell', 16, 13, 3.2, 3.2, '#8c2020'], ['ell', 16, 13, 1.5, 1.5, '#e8c860'],
      ['rect', 11, 20, 10, 1.3, '#d8b050'], ['rect', 12.5, 23, 7, 1.1, '#c09040'],
    ],
    photo: [
      ['rect', 5, 7, 22, 19, '#ece6d6'], ['rect', 7, 9, 18, 13, '#8a7458'], ['rect', 7, 9, 18, 4, '#a08a6a'],
      ['ell', 13, 15, 2.4, 2.8, '#d8c4a0'], ['rect', 10, 17.5, 6, 4.5, '#4a3a2a'], ['ell', 19.5, 15.5, 2.2, 2.6, '#d8c4a0'], ['rect', 17, 18, 5, 4, '#6a3a3a'],
      ['tri', 22, 26, 27, 26, 27, 21, '#c8c0ae'],
    ],
    water: [
      ['tri', 16, 4, 8.5, 18, 23.5, 18, '#3a7ab0'], ['ell', 16, 19.5, 8, 7.5, '#3a7ab0'], ['ell', 16, 20, 6.3, 5.8, '#5aa0d8'],
      ['ell', 12.8, 19, 1.6, 3, '#c8e8ff'], ['tri', 16, 7, 12, 15, 15, 15, '#5aa0d8'],
    ],
    fuel: [
      ['rect', 7, 9, 18, 19, '#4a6a3a'], ['rect', 7, 9, 3, 19, '#6a8a50'], ['rect', 21, 9, 4, 19, '#324a28'],
      ['line', 10, 12, 22, 25, 1.4, '#3a5430'], ['line', 22, 12, 10, 25, 1.4, '#3a5430'],
      ['rect', 9, 4, 9, 5, '#324a28'], ['rect', 11, 5.5, 5, 2, '#141414'], ['rect', 19, 4, 4, 5, '#8a8e90'], ['rect', 19, 4, 4, 1.4, '#c8ccd0'],
    ],
    med: [
      ['rect', 5, 9, 22, 17, '#e8e6e0'], ['rect', 5, 9, 22, 3, '#ffffff'], ['rect', 22, 9, 5, 17, '#bdbab2'], ['rect', 12, 5, 8, 4, '#8a8e90'],
      ['rect', 13.5, 12.5, 5, 11, '#c02828'], ['rect', 10.5, 15.5, 11, 5, '#c02828'], ['rect', 13.5, 12.5, 1.4, 11, '#e05a50'],
    ],
    ammo: [
      ['rect', 7, 13, 5, 14, '#c89a40'], ['ell', 9.5, 12, 2.5, 4.5, '#b06a3a'], ['rect', 7, 13, 1.4, 14, '#f0d080'],
      ['rect', 13.5, 11, 5, 16, '#c89a40'], ['ell', 16, 10, 2.5, 4.5, '#b06a3a'], ['rect', 13.5, 11, 1.4, 16, '#f0d080'],
      ['rect', 20, 13, 5, 14, '#c89a40'], ['ell', 22.5, 12, 2.5, 4.5, '#b06a3a'], ['rect', 20, 13, 1.4, 14, '#f0d080'],
      ['rect', 6, 24, 20, 1.4, '#8a6a20'],
    ],
  };
  function triHit(x, y, a) {
    const [x1, y1, x2, y2, x3, y3] = a;
    const d = (px, py, ax, ay, bx, by) => (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d1 = d(x, y, x1, y1, x2, y2), d2 = d(x, y, x2, y2, x3, y3), d3 = d(x, y, x3, y3, x1, y1);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  }
  function icon(name, size) {
    const ops = ICONS[name];
    const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const cols = new Array(size * size).fill(null);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const x = (px + 0.5) * 32 / size, y = (py + 0.5) * 32 / size;
      let hit = null;
      for (const op of ops) {
        const t = op[0];
        let ok = false;
        if (t === 'rect') ok = x >= op[1] && x < op[1] + op[3] && y >= op[2] && y < op[2] + op[4];
        else if (t === 'ell') ok = inEll(x, y, op[1], op[2], op[3], op[4]);
        else if (t === 'line') ok = segDist(x, y, op[1], op[2], op[3], op[4]) <= op[5] / 2;
        else if (t === 'tri') ok = triHit(x, y, op.slice(1, 7));
        if (ok) hit = op[op.length - 1];
      }
      cols[py * size + px] = hit ? c(hit) : null;
    }
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const i = py * size + px;
      let col = cols[i];
      if (!col) {
        const n = (dx, dy) => { const xx = px + dx, yy = py + dy; return xx >= 0 && yy >= 0 && xx < size && yy < size && cols[yy * size + xx]; };
        if (n(1, 0) || n(-1, 0) || n(0, 1) || n(0, -1)) col = OUT;
      }
      if (col) { img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255; }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // 绘制到 UI（UI 坐标，1:1）
  function draw(ui, cv, x, y) { ui.ctx.imageSmoothingEnabled = false; ui.ctx.drawImage(cv, Math.round(x), Math.round(y)); }

  return { LOOK, portrait, icon, draw, HEAD_VIEW };
})();
