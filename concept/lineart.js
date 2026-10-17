// 「平涂 + 墨线」低分辨率肖像（56×70 原生像素）
// 每个角色一条单色系色阶：高光 / 亮 / 中 / 暗 / 墨线；五官用墨线画，颧骨和鼻尖点亮色块；不抖动
const LA = (() => {
  const H = PX.hex;
  const W = 56, HT = 70, CX = 28, FY = 30;

  const P = (a) => a.map(H);
  // 角色：肤色色阶（高光、亮、中、暗、墨）、头发色阶（亮、中、暗）、衣服色阶（亮、中、暗）
  const CAST = {
    player: { skin: P(['#d8c27e', '#b08a5e', '#8a6648', '#5e4230', '#2c1c14']), hair: P(['#6a5444', '#3e3028', '#221a16']), cloth: P(['#7a8456', '#5a6440', '#3c4430']), style: 'short', rx: 12, chin: 47, jaw: 0.62, stubble: true, brows: 'flat', mouth: 'flat', tired: true, collar: 'coat' },
    lin: { skin: P(['#ccd4aa', '#9ca88a', '#7a8670', '#4e5a48', '#242a20']), hair: P(['#4a504a', '#262a28', '#121414']), cloth: P(['#b8b6aa', '#929086', '#6a6860']), scarf: P(['#c04848', '#8a2a2e', '#5a1a1e']), style: 'tied', rx: 10.5, chin: 47, jaw: 0.4, brows: 'worried', mouth: 'small', tired: true, female: true, collar: 'scarf' },
    zhou: { skin: P(['#e4cc7a', '#b89c6a', '#94785a', '#644c3a', '#2e2018']), hair: P(['#b4aea2', '#8a8478', '#5a564e']), cloth: P(['#5a6270', '#3e4450', '#282c34']), style: 'bald', rx: 13.5, chin: 48, jaw: 0.82, glasses: true, brows: 'raised', mouth: 'smug', jowls: true, collar: 'tunic', old: true },
    ana: { skin: P(['#ecc472', '#c48a5e', '#9c6646', '#6a3e2c', '#321a10']), hair: P(['#b06a3a', '#7a3a1e', '#4a1e10']), cloth: P(['#e05a8a', '#b03a6a', '#7a2448']), style: 'long', rx: 10.5, chin: 46, jaw: 0.42, brows: 'arched', mouth: 'lips', lips: H('#a82a3a'), lashes: true, mole: true, earring: true, female: true, collar: 'turtle' },
    zhao: { skin: P(['#c8a466', '#8a6446', '#6a4a34', '#48301e', '#20120c']), hair: P(['#5a3a22', '#3a2416', '#20140c']), cloth: P(['#8a6a44', '#664c30', '#463420']), style: 'shaved', rx: 13.5, chin: 49, jaw: 0.95, brows: 'angry', mouth: 'grim', scar: true, collar: 'vest', thickNeck: true },
    su: { skin: P(['#e6d4b2', '#c0a690', '#9a8270', '#665448', '#30241e']), hair: P(['#a89c90', '#7a6c62', '#4a3e38']), cloth: P(['#7a8a5a', '#5a6a40', '#3c4a2a']), style: 'bun', rx: 11, chin: 48, jaw: 0.5, brows: 'flat', mouth: 'stern', old: true, female: true, collar: 'shawl' },
    liu: { skin: P(['#e2c27e', '#c29468', '#9c704e', '#6a4a34', '#2e1e16']), hair: P(['#4a3a2e', '#2e241e', '#181210']), cloth: P(['#5a7aa0', '#3e5a7c', '#2a3e58']), cap: P(['#4a5a72', '#323e52', '#1e2634']), style: 'cap', rx: 12.5, chin: 46, jaw: 0.7, brows: 'flat', mouth: 'grin', smudge: true, collar: 'overalls' },
    stranger: { skin: P(['#c4c49a', '#9a9a7a', '#787c60', '#4e5240', '#24261c']), hair: P(['#5a4e40', '#3a3028', '#201a16']), cloth: P(['#7a8456', '#5a6440', '#3c4430']), style: 'short', rx: 11.5, chin: 48, jaw: 0.6, brows: 'worried', mouth: 'open', bandage: true, stubble: true, bruise: true, collar: 'coat' },
  };

  function portrait(key, opt = {}) {
    const L = CAST[key];
    const b = new PX.Buf(W, HT);
    const [HL, LT, MD, DK, INK] = L.skin;
    const [hL, hM, hD] = L.hair;
    const [cL, cM, cD] = L.cloth;

    // 背景：暗色身高墙横纹
    const KEY = [1, 2, 3];
    const bg = opt.bg || [H('#2e2222'), H('#221818')];
    for (let y = 0; y < HT; y++) b.hline(0, y, W, opt.noBg ? KEY : (y % 7) < 2 ? bg[1] : bg[0]);

    const hw = (y) => {
      if (y < FY - 14 || y > L.chin) return -1;
      if (y < FY) return L.rx * Math.sqrt(Math.max(0, 1 - ((y - FY) / 14.5) ** 2));
      const t = (y - FY) / (L.chin - FY);
      return L.rx * (1 - (1 - L.jaw) * t ** 1.5);
    };
    const inFace = (x, y) => { const w = hw(y + 0.5); return w >= 0 && Math.abs(x + 0.5 - CX) <= w; };

    // ---- 长发（背后） ----
    if (L.style === 'long') {
      for (let y = 18; y < HT; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - CX;
        const half = 15 + Math.sin(y * 0.35) * 1.2 + (y > 50 ? (y - 50) * 0.15 : 0);
        if (Math.abs(dx) < half && y < 66) b.set(x, y, dx > 6 ? hD : hM);
      }
    }
    if (L.style === 'tied') for (let y = 24; y < 64; y++) { const cx = CX + 13 + Math.sin((y - 24) * 0.08) * 2; b.hline(Math.round(cx - 2), y, 4, hM); b.set(Math.round(cx + 1), y, hD); if (y % 9 === 0) b.set(Math.round(cx - 1), y, hL); }

    // ---- 衣服 ----
    const neckW = L.thickNeck ? 8 : L.female ? 4.5 : 6;
    for (let y = 52; y < HT; y++) for (let x = 0; x < W; x++) {
      const ax = Math.abs(x + 0.5 - CX);
      const top = 55 + Math.max(0, ax - neckW - 2) ** 1.5 * 0.12;
      if (y >= top && ax < 27) b.set(x, y, (x + 0.5 - CX) > 8 ? cD : (x + 0.5 - CX) < -16 ? cL : cM);
    }
    // 颈
    for (let y = 40; y < 58; y++) for (let x = 0; x < W; x++) { const dx = x + 0.5 - CX; if (Math.abs(dx) <= neckW) b.set(x, y, dx > neckW * 0.2 ? DK : MD); }
    // 领子
    const coll = L.collar;
    if (coll === 'turtle') for (let y = 50; y < 60; y++) for (let x = 0; x < W; x++) { const dx = x + 0.5 - CX; if (Math.abs(dx) <= neckW + 4) b.set(x, y, dx > 4 ? cD : (y % 3 === 0 ? cD : cM)); }
    if (coll === 'scarf') { const [s1, s2, s3] = L.scarf; for (let y = 48; y < 58; y++) for (let x = 0; x < W; x++) { const dx = x + 0.5 - CX; if (Math.abs(dx) <= neckW + 4.5) b.set(x, y, dx > 3 ? s3 : (y + x) % 4 === 0 ? s3 : s2); } b.rect(CX + 3, 57, 4, 10, L.scarf[1]); b.vline(CX + 6, 57, 10, s3); b.hline(CX - 7, 48, 14, s1); }
    if (coll === 'tunic') { b.rect(CX - neckW - 1, 53, (neckW + 1) * 2, 3, cD); b.vline(CX, 56, 14, INK); for (const y of [59, 64]) b.set(CX - 1, y, cL); b.rect(CX - 15, 59, 2, 2, H('#c03030')); }
    if (coll === 'coat') { b.line(CX - neckW, 53, CX - neckW - 6, 62, cL); b.line(CX + neckW, 53, CX + neckW + 6, 62, INK); b.rect(CX - 15, 60, 3, 2, H('#8a2a2a')); b.rect(CX + 12, 60, 3, 2, H('#6a2020')); }
    if (coll === 'vest') { b.rect(CX - neckW - 2, 54, (neckW + 2) * 2, 16, H('#3a3836')); b.vline(CX - neckW - 3, 55, 15, INK); b.vline(CX + neckW + 2, 55, 15, INK); for (let y = 58; y < HT; y += 4) { b.hline(2, y, CX - neckW - 6, cD); b.hline(CX + neckW + 4, y, 22, cD); } }
    if (coll === 'shawl') for (let y = 52; y < 64; y++) for (let x = 0; x < W; x++) { const dx = x + 0.5 - CX; if (Math.abs(dx) < 26 && y < 64 - Math.abs(dx) * 0.2) b.set(x, y, y > 61 - Math.abs(dx) * 0.2 ? H('#3c4a2a') : dx > 8 ? H('#4a5a34') : (y === 53 ? H('#7a8a58') : H('#5a6a40'))); }
    if (coll === 'overalls') { b.rect(CX - 9, 61, 18, 9, cM); b.rect(CX + 3, 61, 6, 9, cD); for (let x = 0; x < W; x++) for (let y = 55; y < 61; y++) { const ax = Math.abs(x + 0.5 - CX); if (ax > neckW && ax < 27 && y >= 55 + Math.max(0, ax - neckW - 2) ** 1.5 * 0.12) b.set(x, y, ax > 10 && x > CX ? H('#5a5c5e') : H('#7a7c7e')); } b.vline(CX - 8, 55, 7, cM); b.vline(CX + 8, 55, 7, cD); b.set(CX - 8, 61, H('#d8d0b0')); b.set(CX + 8, 61, H('#d8d0b0')); }

    // ---- 脸（平涂两块：亮 + 暗） ----
    for (let y = 0; y < HT; y++) for (let x = 0; x < W; x++) {
      if (!inFace(x, y)) continue;
      const dx = x + 0.5 - CX, w = hw(y + 0.5);
      let c = LT;
      if (dx > w * 0.38 - (y > FY + 6 ? 2 : 0)) c = MD;          // 侧面阴影
      if (dx > w * 0.78) c = DK;
      if (y > L.chin - 3 && dx > -w * 0.4) c = MD;               // 下巴底
      if (y >= FY - 3 && y <= FY + 1 && Math.abs(dx) > 1.5 && Math.abs(dx) < w - 1) c = c === LT ? MD : DK; // 眼窝
      if (L.jowls && y > FY + 9 && Math.abs(dx) > w * 0.55) c = DK;
      b.set(x, y, c);
    }
    // 耳
    const ew = Math.round(hw(FY + 1));
    b.rect(CX - ew - 2, FY - 1, 2, 6, MD); b.set(CX - ew - 1, FY + 1, DK);
    b.rect(CX + ew, FY - 1, 2, 6, DK); b.set(CX + ew, FY + 1, INK);
    if (L.earring) { b.set(CX - ew - 2, FY + 6, H('#f0d060')); b.set(CX - ew - 2, FY + 7, H('#b08a30')); }
    // 脸轮廓（暗侧和下巴用墨线）
    for (let y = FY - 6; y <= L.chin; y++) { const w = hw(y + 0.5); if (w < 0) continue; b.set(Math.round(CX + w - 0.5), y, INK); }
    for (let x = -Math.round(hw(L.chin - 1)) + 1; x < Math.round(hw(L.chin - 1)); x++) b.set(CX + x, L.chin, INK);

    // ---- 头发（前） ----
    const st = L.style;
    const hairMass = (yTop, yLine, sideDown) => {
      for (let y = yTop; y < 40; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - CX, ax = Math.abs(dx);
        const inCap = ((dx) / (L.rx + 2.5)) ** 2 + ((y + 0.5 - (FY - 1)) / 17) ** 2 <= 1;
        if (!inCap) continue;
        const line = yLine(dx);
        const side = ax > hw(y + 0.5) - 2 && y < sideDown;
        if (y < line || side) b.set(x, y, dx > 6 ? hD : hM);
      }
    };
    if (st === 'short') hairMass(12, (dx) => 19 + Math.round(Math.sin(dx * 0.9) * 1.2) + Math.abs(dx) * 0.05, FY + 2);
    if (st === 'tied') hairMass(12, (dx) => 17 + Math.abs(dx) * 0.45, FY + 12);
    if (st === 'bun') { hairMass(12, (dx) => 18 + Math.abs(dx) * 0.2, FY - 2); b.ellipse(CX + 2, 12, 6, 4, hM); b.ellipse(CX + 4, 12, 3, 3, hD); b.line(CX - 3, 11, CX + 6, 14, hL); }
    if (st === 'long') hairMass(11, (dx) => 18 + dx * 0.35 + (dx < -2 ? 2 : 0), FY + 20);
    if (st === 'shaved') for (let y = 13; y < 20; y++) for (let x = 0; x < W; x++) { const dx = x + 0.5 - CX; if (((dx) / (L.rx + 1)) ** 2 + ((y + 0.5 - FY) / 16) ** 2 <= 1 && (x + y) % 2 === 0) b.set(x, y, hD); }
    if (st === 'bald') {
      // 秃顶 + 两鬓灰发 + 头顶高光
      for (let y = 22; y < FY + 6; y++) { const w = Math.round(hw(y + 0.5)); b.rect(CX - w - 1, y, 3, 1, hM); b.rect(CX + w - 2, y, 3, 1, hD); }
      b.ellipse(CX - 2, 19, 5, 2, HL); b.hline(CX - 5, 20, 7, LT);
    }
    if (st === 'cap') {
      const [k1, k2, k3] = L.cap;
      for (let y = 10; y < 21; y++) for (let x = 0; x < W; x++) { const dx = x + 0.5 - CX; if ((dx / (L.rx + 3)) ** 2 + ((y + 0.5 - 21) / 10) ** 2 <= 1) b.set(x, y, dx > 6 ? k3 : dx < -6 ? k1 : k2); }
      b.rect(CX - L.rx - 7, 20, L.rx * 2 + 8, 2, k3); b.hline(CX - L.rx - 7, 20, L.rx * 2 + 8, k1);
      b.vline(CX, 11, 9, k3);
      b.rect(CX - L.rx, 22, 2, 7, hM); b.rect(CX + L.rx - 1, 22, 2, 6, hD);
    }
    // 发丝墨线与亮线
    if (st === 'short' || st === 'tied' || st === 'long' || st === 'bun') {
      const R = PX.rng(key.length * 97);
      for (let i = 0; i < 9; i++) {
        const x0 = CX - 10 + R() * 20, len = 4 + R() * 6, k = (x0 - CX) * 0.08;
        b.line(Math.round(x0), 13 + ((R() * 3) | 0), Math.round(x0 + k * len + (R() - 0.5) * 3), Math.round(14 + len), i % 3 === 0 ? hL : hD);
      }
      if (st === 'long') for (let i = 0; i < 8; i++) { const sx = i < 4 ? CX - 15 + i * 2 : CX + 9 + (i - 4) * 2; for (let y = 30; y < 64; y++) { const xx = Math.round(sx + Math.sin(y * 0.35 + i) * 1.2); const cur = b.get(xx, y); const isHair = (cur[0] === hM[0] && cur[1] === hM[1]) || (cur[0] === hD[0] && cur[1] === hD[1]); if (isHair && (y + i) % 3 !== 0) b.set(xx, y, i % 3 === 0 ? hL : hD); } }
    }
    if (L.bandage) { for (let y = 17; y < 22; y++) { const w = Math.round(hw(Math.max(y, FY - 13)) + 1); b.hline(CX - w, y, w * 2, y === 17 ? H('#f0ece0') : H('#d0c8b4')); } b.rect(CX + 5, 18, 3, 3, H('#8a2a22')); b.line(CX - 8, 21, CX + 6, 17, H('#a8a090')); }

    // ---- 五官（墨线） ----
    const ink = (x0, y0, x1, y1, c = INK) => b.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), c);
    // 眉
    const browY = FY - 5;
    const bt = { flat: [0, 0], worried: [-2, 1], raised: [-1, -1], arched: [-1, 0], angry: [2, -1] }[L.brows];
    for (const e of [-1, 1]) {
      ink(CX + e * 2, browY + bt[0], CX + e * 8, browY + bt[1], L.style === 'bald' ? L.hair[2] : INK);
      if (!L.female) ink(CX + e * 2, browY + bt[0] + 1, CX + e * 7, browY + bt[1] + 1, L.style === 'bald' ? L.hair[2] : INK);
      if (L.brows === 'arched') b.set(CX + e * 5, browY - 1, INK);
    }
    // 眼：半闭的两条线
    for (const e of [-1, 1]) {
      const ex = CX + e * 5;
      ink(ex - 2, FY - 1, ex + 2, FY - 1);                 // 上眼睑
      b.hline(ex - 1, FY, 3, DK);                          // 眼缝
      b.set(ex + (e > 0 ? 0 : 0), FY, INK);                // 瞳孔
      if (L.lashes) b.set(ex + e * 3, FY - 2, INK);
      if (L.tired) ink(ex - 1, FY + 2, ex + 2, FY + 2, DK); // 眼袋
      if (L.bruise && e < 0) { b.rect(ex - 2, FY + 1, 5, 2, H('#5a4a5a')); }
    }
    if (L.glasses) for (const e of [-1, 1]) { const ex = CX + e * 5; b.hline(ex - 3, FY - 2, 7, INK); b.hline(ex - 3, FY + 2, 7, INK); b.vline(ex - 3, FY - 2, 5, INK); b.vline(ex + 3, FY - 2, 5, INK); b.set(ex - 2, FY - 1, HL); b.hline(CX - 1, FY - 1, 2, INK); }
    // 鼻：侧线 + 鼻孔 + 鼻尖高光
    const nb = FY + 7;
    ink(CX + 2, FY + 1, CX + 2, nb - 1, DK);
    ink(CX + 2, nb - 1, CX + 3, nb);
    ink(CX - 2, nb + 1, CX + 2, nb + 1);
    b.set(CX - 3, nb, INK);
    b.rect(CX - 1, nb - 2, 2, 2, HL);
    // 颧骨高光
    b.rect(CX - 8, FY + 4, 3, 2, HL);
    b.rect(CX + 5, FY + 4, 2, 2, LT);
    // 法令纹
    ink(CX - 4, nb + 1, CX - 5, nb + 5, DK);
    ink(CX + 4, nb + 1, CX + 5, nb + 5, L.old ? INK : DK);
    // 嘴
    const my = nb + 5;
    const m = L.mouth;
    if (m === 'flat') { ink(CX - 3, my, CX + 3, my); ink(CX - 1, my + 2, CX + 1, my + 2, DK); }
    if (m === 'small') { ink(CX - 2, my, CX + 2, my); b.set(CX, my + 2, DK); }
    if (m === 'smug') { ink(CX - 4, my + 1, CX - 2, my); ink(CX - 2, my, CX + 3, my); ink(CX + 3, my, CX + 5, my + 1); ink(CX - 2, my + 3, CX + 2, my + 3, DK); ink(CX - 4, my + 5, CX + 4, my + 5, DK); }
    if (m === 'lips') { b.hline(CX - 3, my, 7, L.lips); b.hline(CX - 2, my + 1, 5, L.lips); ink(CX - 3, my, CX + 3, my, PX.hex('#5a1a20')); b.set(CX - 1, my + 1, H('#d06a70')); }
    if (m === 'grim') { ink(CX - 4, my, CX + 4, my); ink(CX - 4, my, CX - 5, my + 1); ink(CX + 4, my, CX + 5, my + 1); ink(CX - 2, my + 2, CX + 2, my + 2, DK); }
    if (m === 'stern') { ink(CX - 3, my, CX + 3, my); b.set(CX - 4, my + 1, INK); b.set(CX + 4, my + 1, INK); }
    if (m === 'grin') { ink(CX - 4, my - 1, CX - 2, my); ink(CX - 2, my, CX + 2, my); ink(CX + 2, my, CX + 4, my - 1); b.hline(CX - 1, my + 1, 3, H('#e8dcc0')); ink(CX - 1, my + 2, CX + 1, my + 2, DK); }
    if (m === 'open') { ink(CX - 2, my, CX + 2, my); b.hline(CX - 1, my + 1, 3, INK); ink(CX - 1, my + 3, CX + 1, my + 3, DK); }
    // 下巴线
    ink(CX - 1, L.chin - 2, CX + 1, L.chin - 2, DK);
    // 特征
    if (L.stubble) for (let y = my - 2; y < L.chin; y++) for (let x = CX - 9; x <= CX + 9; x++) if (inFace(x, y) && (x * 3 + y * 5) % 4 === 0 && !(Math.abs(x - CX) < 4 && Math.abs(y - my) < 2)) b.set(x, y, DK);
    if (L.scar) { ink(CX - 9, FY - 7, CX - 4, FY + 6, H('#d89880')); ink(CX - 10, FY - 7, CX - 5, FY + 6, INK); }
    if (L.mole) b.set(CX + 5, my + 1, INK);
    if (L.smudge) { b.rect(CX + 6, FY + 6, 3, 2, DK); b.set(CX + 7, FY + 8, DK); }
    if (L.jowls) { ink(CX - 9, L.chin - 3, CX - 6, L.chin, DK); ink(CX + 9, L.chin - 3, CX + 6, L.chin); }

    b.emit.fill(1);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = HT;
    const ctx = cv.getContext('2d'); const id = b.toImageData(ctx);
    if (opt.noBg) for (let i = 0; i < id.data.length; i += 4) if (id.data[i] === 1 && id.data[i + 1] === 2 && id.data[i + 2] === 3) id.data[i + 3] = 0;
    ctx.putImageData(id, 0, 0);
    return cv;
  }

  // 头部特写（裁切 32×32，用于名单、关系网）
  function head(key, opt) {
    const src = portrait(key, opt);
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
    cv.getContext('2d').drawImage(src, -12, -10);
    return cv;
  }
  // 画到 UI 上（整数倍）
  function draw(ui, cv, x, y, s = 1) { ui.ctx.imageSmoothingEnabled = false; ui.ctx.drawImage(cv, Math.round(x), Math.round(y), cv.width * s, cv.height * s); }

  return { CAST, portrait, head, draw };
})();
