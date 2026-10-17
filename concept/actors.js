// 角色：场景小人（约 10×20）与档案半身像（40×48），全部程序化绘制
const ACT = (() => {
  const H = PX.hex;
  const SKIN = {
    pale: [H('#f1d3bd'), H('#d9ae95'), H('#a97a68'), H('#6e4a44')],
    warm: [H('#e8bf9a'), H('#c9946f'), H('#96644d'), H('#5e3b33')],
    tan:  [H('#d3a07a'), H('#ad7a58'), H('#7d5240'), H('#4b302a')],
  };
  const shade = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));

  // 人物定义
  const CAST = {
    player: { name: '陈默', age: 29, origin: '逃兵', skin: 'warm', hair: H('#2a2522'), style: 'short', coat: H('#4e5639'), pants: H('#3a3a30'), male: true, stubble: true },
    lin:    { name: '林秋', age: 31, origin: '前护士', skin: 'pale', hair: H('#1c1a1f'), style: 'tied', coat: H('#9a9890'), pants: H('#3b3d48'), male: false, scarf: H('#7a2f34') },
    zhou:   { name: '周建国', age: 56, origin: '前阵线干部', skin: 'warm', hair: H('#8f8c88'), style: 'receding', coat: H('#3a3f47'), pants: H('#2c3036'), male: true, glasses: true, heavy: true },
    ana:    { name: '阿娜', age: 24, origin: '歌手', skin: 'tan', hair: H('#6b2e1e'), style: 'wavy', coat: H('#8c2b2b'), pants: H('#2b2730'), male: false, earring: true },
    zhao:   { name: '赵铁军', age: 38, origin: '矿工', skin: 'tan', hair: H('#2b2420'), style: 'shaved', coat: H('#5b4631'), pants: H('#33302a'), male: true, scar: true, heavy: true },
    su:     { name: '苏曼', age: 45, origin: '教师', skin: 'pale', hair: H('#5a4a40'), style: 'bun', coat: H('#6a5440'), pants: H('#34302c'), male: false, grey: true },
    liu:    { name: '刘小川', age: 26, origin: '机修工', skin: 'warm', hair: H('#2a2522'), style: 'cap', coat: H('#3d5470'), pants: H('#3d5470'), male: true, cap: H('#2f3a48'), smudge: true },
    stranger: { name: '陌生伤兵', age: '?', origin: '？', skin: 'pale', hair: H('#3a3028'), style: 'short', coat: H('#59603f'), pants: H('#3a3a30'), male: true, bandage: true },
  };

  // ------------- 场景小人 -------------
  // (x, y) 为脚底中心
  function person(b, x, y, p, pose = 'stand', facing = 1) {
    const sk = SKIN[p.skin];
    const coat = p.coat, coatD = shade(coat, 0.7), coatL = shade(coat, 1.18);
    const pants = p.pants, pantsD = shade(pants, 0.7);
    const hair = p.hair, hairD = shade(hair, 0.7);
    const boot = H('#1b1714');
    const f = facing; // 1 向右，-1 向左
    const wide = p.heavy ? 1 : 0;

    const head = (hx, hy) => {
      // 5×6 头
      b.rect(hx - 2, hy + 1, 5, 4, sk[1]);
      b.rect(hx - 1, hy + 1, 3, 3, sk[0]);
      b.rect(hx - 1, hy + 5, 3, 1, sk[2]);
      b.set(hx + f * 2, hy + 4, sk[2]);
      // 眼
      b.set(hx + f * 1, hy + 3, H('#1a1214'));
      // 发型
      const hs = p.style;
      if (hs === 'shaved') { b.rect(hx - 2, hy, 5, 1, sk[2]); b.dither(hx - 2, hy, 5, 2, hairD, 0.5); }
      else if (hs === 'receding') { b.rect(hx - 2, hy, 5, 1, sk[1]); b.rect(hx - 2 - (f > 0 ? 0 : -4), hy + 1, 1, 3, hair); b.set(hx - f * 2, hy + 1, hair); b.set(hx - f * 2, hy + 2, hair); b.hline(hx - 1, hy, 3, hair); }
      else if (hs === 'cap') { b.rect(hx - 2, hy - 1, 5, 2, p.cap); b.rect(hx + (f > 0 ? 1 : -3), hy + 1, 3, 1, shade(p.cap, 0.7)); b.set(hx - f * 2, hy + 2, hair); }
      else {
        b.rect(hx - 2, hy, 5, 1, hair); b.rect(hx - 2, hy - 1, 4, 1, hair);
        b.set(hx - f * 2, hy + 1, hair); b.set(hx - f * 2, hy + 2, hair);
        b.set(hx - f * 1, hy + 1, hair);
        if (hs === 'tied' || hs === 'bun') { b.rect(hx - f * 3 - (f > 0 ? 0 : 0), hy, 1, 2, hairD); b.set(hx - f * 3, hy - 1, hair); }
        if (hs === 'wavy') { b.rect(hx - f * 2 - (f > 0 ? 1 : -1) * 0, hy + 1, 1, 6, hair); b.rect(hx - f * 3, hy + 1, 1, 5, hairD); b.set(hx + f * 2, hy + 1, hair); }
      }
      if (p.glasses) { b.set(hx + f, hy + 3, H('#b8c4c8')); b.set(hx + f * 2, hy + 3, H('#6f7a80')); }
      if (p.bandage) { b.hline(hx - 2, hy + 1, 5, H('#d8d2c4')); b.set(hx, hy + 1, H('#8a2a24')); }
      if (p.earring) b.set(hx - f, hy + 5, H('#e0c060'));
      if (p.grey) b.set(hx, hy - 1, H('#a49c94'));
    };

    if (pose === 'stand' || pose === 'work') {
      const top = y - 20;
      head(x, top);
      b.set(x, top + 6, sk[2]);
      // 躯干
      b.rect(x - 3 - wide, top + 7, 7 + wide * 2, 7, coat);
      b.rect(x - 3 - wide, top + 7, 7 + wide * 2, 1, coatL);
      b.rect(x + (f > 0 ? -3 - wide : 3 + wide), top + 8, 1, 6, coatD);
      if (!p.male) { b.set(x - 3 - wide, top + 12, [0, 0, 0, 0].slice(0, 3)); }
      if (p.scarf) { b.rect(x - 2, top + 7, 5, 2, p.scarf); b.set(x - f * 1, top + 9, p.scarf); }
      b.hline(x - 3 - wide, top + 13, 7 + wide * 2, coatD);
      // 手臂
      if (pose === 'work') {
        b.rect(x + f * 3, top + 8, 1, 3, coatD);
        b.rect(x + f * 4, top + 10, 2 * f > 0 ? 2 : 2, 1, coatD);
        b.set(x + f * 5, top + 10, sk[1]); b.set(x + f * 6, top + 10, sk[1]);
      } else {
        b.set(x + f * (3 + wide), top + 13, sk[1]);
        b.set(x - f * (3 + wide), top + 13, sk[2]);
      }
      // 腿
      b.rect(x - 2, top + 14, 2, 5, pants); b.rect(x + 1, top + 14, 2, 5, pantsD);
      b.set(x, top + 14, pantsD);
      b.rect(x - 2, top + 19, 2, 1, boot); b.rect(x + 1, top + 19, 2, 1, boot);
      b.set(x + f * 2 + (f > 0 ? 1 : -1), top + 19, boot);
    } else if (pose === 'sit') {
      // 坐着：比站立矮 5
      const top = y - 15;
      head(x, top);
      b.set(x, top + 6, sk[2]);
      b.rect(x - 3 - wide, top + 7, 7 + wide * 2, 6, coat);
      b.rect(x - 3 - wide, top + 7, 7 + wide * 2, 1, coatL);
      b.rect(x - f * (3 + wide), top + 8, 1, 5, coatD);
      if (p.scarf) b.rect(x - 2, top + 7, 5, 2, p.scarf);
      // 大腿向前
      b.rect(x + (f > 0 ? -1 : -4), top + 12, 6, 2, pants);
      b.rect(x + (f > 0 ? 3 : -4), top + 12, 2, 1, pantsD);
      // 小腿向下
      b.rect(x + (f > 0 ? 3 : -4), top + 14, 2, 3, pantsD);
      b.rect(x + (f > 0 ? 3 : -5), top + 17 - 2 + 2, 3, 1, boot);
      // 手放膝上
      b.set(x + f * 3, top + 11, sk[1]);
    } else if (pose === 'lie') {
      // 躺：头在 x 一侧，身体向 facing 方向延伸，y 为床面
      const hy = y - 5;
      const hx = x;
      b.rect(hx - 2, hy, 4, 5, sk[1]); b.rect(hx - 1, hy + 1, 2, 2, sk[0]);
      b.rect(hx - 2 - (f > 0 ? 1 : -4), hy, 2, 5, hair);
      if (p.bandage) b.vline(hx, hy, 5, H('#d8d2c4'));
      // 被子
      const bx = f > 0 ? hx + 2 : hx - 18;
      b.rect(bx, hy - 1, 16, 6, p.blanket || H('#56604e'));
      b.hline(bx, hy - 1, 16, shade(p.blanket || H('#56604e'), 1.2));
      b.rect(bx + (f > 0 ? 12 : 0), hy - 2, 4, 1, shade(p.blanket || H('#56604e'), 0.8));
    } else if (pose === 'crouch') {
      const top = y - 14;
      head(x + f, top);
      b.rect(x - 3, top + 6, 7, 5, coat);
      b.rect(x - 3, top + 6, 7, 1, coatL);
      b.rect(x - 2, top + 11, 6, 2, pants);
      b.rect(x - 3, top + 13, 3, 1, boot); b.rect(x + 2, top + 13, 3, 1, boot);
      b.set(x + f * 4, top + 9, sk[1]);
    }
  }

  // 剪影（看不清是谁）
  function silhouette(b, x, y, col, pose = 'sit', facing = 1, long = false) {
    const top = pose === 'sit' ? y - 15 : y - 20;
    b.rect(x - 2, top, 5, 6, col);
    if (long) b.rect(x - facing * 3, top + 1, 1, 6, col);
    b.rect(x - 3, top + 6, 7, pose === 'sit' ? 7 : 8, col);
    if (pose === 'sit') b.rect(x + (facing > 0 ? -1 : -4), top + 12, 6, 2, col);
    else b.rect(x - 2, top + 14, 5, 6, col);
  }

  // ------------- 档案半身像 40×48 -------------
  function portrait(b, ox, oy, p, opt = {}) {
    const W = 40, Hh = 48;
    const sk = SKIN[p.skin];
    const cx = 20, cy = 22, rx = p.heavy ? 10 : 9, ry = 12;
    const bg = opt.bg || [H('#1b1f26'), H('#252b33')];
    // 背景：竖向抖动 + 微弱光晕
    if (!opt.noBg) for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - 14, y - 16) / 34;
      b.set(ox + x, oy + y, d < PX.bayer(ox + x, oy + y) * 0.6 + 0.35 ? bg[1] : bg[0]);
    }
    const coat = p.coat, coatD = shade(coat, 0.68), coatL = shade(coat, 1.2), coatDD = shade(coat, 0.5);
    // 肩与衣服
    for (let y = 36; y < Hh; y++) {
      const t = (y - 36) / 12;
      const half = Math.round(9 + t * 9 + (p.heavy ? 2 : 0));
      for (let x = cx - half; x <= cx + half; x++) {
        const s = (x - cx) / half;
        let c = coat;
        if (s > 0.5) c = PX.bayer(ox + x, oy + y) < (s - 0.5) * 2 ? coatDD : coatD;
        else if (s < -0.6 && y < 41) c = coatL;
        b.set(ox + x, oy + y, c);
      }
    }
    // 领口
    for (let y = 36; y < 44; y++) { const k = (y - 36) >> 1; b.set(ox + cx - 3 - k, oy + y, coatDD); b.set(ox + cx + 3 + k, oy + y, coatDD); }
    // 颈
    b.rect(ox + cx - 3, oy + 31, 7, 6, sk[2]);
    b.rect(ox + cx - 3, oy + 31, 3, 4, sk[1]);
    b.rect(ox + cx - 2, oy + 36, 5, 2, sk[3]);
    if (p.scarf) {
      for (let y = 34; y < 41; y++) for (let x = cx - 7; x <= cx + 7; x++) {
        const s = (x - cx) / 7;
        if (Math.abs(s) <= 1 - (y - 34) * 0.05) b.set(ox + x, oy + y, s > 0.4 ? shade(p.scarf, 0.7) : p.scarf);
      }
      b.hline(ox + cx - 6, oy + 34, 12, shade(p.scarf, 1.25));
    }
    // 脸
    const faceW = (dy) => {
      const t = dy / ry;
      if (t < 0) return rx * Math.sqrt(Math.max(0, 1 - t * t));
      return rx * (1 - Math.pow(t, 1.8) * 0.62);
    };
    for (let dy = -ry; dy <= ry; dy++) {
      const w = faceW(dy);
      for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) {
        if (Math.abs(dx) > w + 0.2) continue;
        const s = dx / Math.max(1, w);
        const by = PX.bayer(ox + cx + dx, oy + cy + dy);
        let tone = 0;
        const v = s * 0.9 + (dy > ry * 0.6 ? 0.35 : 0) + (dy < -ry * 0.6 ? 0.1 : 0);
        if (v > 0.62) tone = by < (v - 0.62) * 3 ? 3 : 2;
        else if (v > 0.15) tone = by < (v - 0.15) * 2.2 ? 2 : 1;
        else if (v > -0.35) tone = by < (v + 0.35) * 2 ? 1 : 0;
        b.set(ox + cx + dx, oy + cy + dy, sk[tone]);
      }
    }
    // 耳
    b.rect(ox + cx - rx - 1, oy + cy - 1, 2, 4, sk[1]); b.set(ox + cx - rx, oy + cy, sk[2]);
    b.rect(ox + cx + rx, oy + cy - 1, 2, 4, sk[3]);
    if (p.earring) { b.set(ox + cx - rx - 1, oy + cy + 4, H('#e8cc6a')); b.set(ox + cx - rx - 1, oy + cy + 5, H('#9a7a30')); }
    // 眉眼
    const eyeY = oy + cy - 1;
    const hairD = shade(p.hair, 0.6);
    const brow = p.grey ? H('#6a625c') : hairD;
    b.hline(ox + cx - 6, eyeY - 3, 4, brow); b.hline(ox + cx + 2, eyeY - 3, 4, brow);
    if (p.male) { b.hline(ox + cx - 6, eyeY - 2, 1, brow); b.set(ox + cx + 5, eyeY - 2, brow); }
    for (const ex of [cx - 5, cx + 2]) {
      b.rect(ox + ex, eyeY, 3, 1, H('#d8d0c8'));
      b.set(ox + ex + 1, eyeY, H('#1a1418'));
      b.set(ox + ex + (ex < cx ? 2 : 1), eyeY, H('#1a1418'));
      b.hline(ox + ex, eyeY - 1, 3, sk[3]);
      if (!p.male) b.set(ox + ex + (ex < cx ? -1 : 3), eyeY - 1, H('#1a1418'));
      b.hline(ox + ex, eyeY + 1, 3, sk[2]);
    }
    if (p.age >= 40) { b.set(ox + cx - 6, eyeY + 2, sk[2]); b.set(ox + cx + 5, eyeY + 2, sk[3]); b.hline(ox + cx - 4, oy + cy + 5, 1, sk[2]); b.set(ox + cx + 4, oy + cy + 5, sk[3]); }
    // 鼻
    b.vline(ox + cx + 1, oy + cy + 1, 3, sk[2]);
    b.hline(ox + cx - 1, oy + cy + 4, 3, sk[2]); b.set(ox + cx + 1, oy + cy + 4, sk[3]);
    b.set(ox + cx - 1, oy + cy + 3, sk[0]);
    // 嘴
    const lip = p.male ? sk[3] : H('#9a4a4a');
    b.hline(ox + cx - 2, oy + cy + 7, 5, lip);
    if (!p.male) b.hline(ox + cx - 1, oy + cy + 8, 3, shade(H('#b0605a'), 0.95));
    else b.hline(ox + cx - 1, oy + cy + 8, 3, sk[2]);
    // 胡茬
    if (p.stubble) for (let dy = 4; dy <= 11; dy++) for (let dx = -8; dx <= 8; dx++) {
      if (Math.abs(dx) > faceW(dy) - 0.5) continue;
      if (dy < 6 && Math.abs(dx) < 5) continue;
      if ((dx * 7 + dy * 13) % 3 === 0) b.set(ox + cx + dx, oy + cy + dy, shade(sk[2], 0.85));
    }
    if (p.scar) { for (let i = 0; i < 6; i++) b.set(ox + cx - 6 + i, oy + cy - 4 + i, H('#c9867a')); b.set(ox + cx - 6, oy + cy - 4, H('#e4a89a')); }
    if (p.smudge) { b.dither(ox + cx + 3, oy + cy + 2, 4, 3, H('#3a2e28'), 0.4); }
    if (p.bandage) { b.rect(ox + cx - rx, oy + cy - 9, rx * 2 + 1, 3, H('#d8d2c4')); b.rect(ox + cx + 3, oy + cy - 9, 3, 2, H('#8a2a24')); }
    // 头发
    const hairC = p.hair, hairL = shade(p.hair, 1.5), hairDD = shade(p.hair, 0.45);
    const hairPx = (x, y) => {
      const s = (x - cx) / 12;
      const by = PX.bayer(ox + x, oy + y);
      let c = hairC;
      if (s > 0.35) c = by < (s - 0.35) * 2 ? hairDD : hairD;
      else if (s < -0.2 && s > -0.6 && (x + y) % 5 === 0) c = hairL;
      if (p.grey && (x * 3 + y * 7) % 4 === 0) c = H('#a8a098');
      b.set(ox + x, oy + y, c);
    };
    const st = p.style;
    if (st === 'shaved') {
      for (let dy = -ry; dy <= -4; dy++) { const w = faceW(dy); for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) if (PX.bayer(ox + cx + dx, oy + cy + dy) < 0.55) b.set(ox + cx + dx, oy + cy + dy, shade(p.hair, dx > 3 ? 0.6 : 0.95)); }
    } else if (st === 'cap') {
      for (let dy = -ry - 2; dy <= -5; dy++) { const w = faceW(Math.max(-ry, dy)) + 1.5; for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) b.set(ox + cx + dx, oy + cy + dy, dx > 4 ? shade(p.cap, 0.7) : p.cap); }
      b.rect(ox + cx - 10, oy + cy - 5, 21, 2, shade(p.cap, 0.55));
      b.hline(ox + cx - 10, oy + cy - 5, 21, shade(p.cap, 1.3));
      b.rect(ox + cx - rx, oy + cy - 3, 2, 5, hairC); b.rect(ox + cx + rx - 1, oy + cy - 3, 2, 5, hairDD);
    } else {
      // 通用：头顶发量
      const hl = st === 'receding' ? -8 : -5;
      for (let dy = -ry - 2; dy <= hl; dy++) {
        const w = faceW(Math.max(-ry, dy + 1)) + 2;
        for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) {
          if (st === 'receding' && dy > -ry && Math.abs(dx) < 4) continue;
          hairPx(cx + dx, cy + dy);
        }
      }
      if (st === 'receding') {
        b.rect(ox + cx - rx - 1, oy + cy - 8, 3, 7, hairC); b.rect(ox + cx + rx - 1, oy + cy - 8, 3, 7, hairDD);
        b.dither(ox + cx - 4, oy + cy - ry, 8, 2, hairD, 0.3);
      }
      if (st === 'short') {
        // 鬓角和刘海
        b.rect(ox + cx - rx - 1, oy + cy - 6, 2, 6, hairC); b.rect(ox + cx + rx, oy + cy - 6, 2, 5, hairDD);
        for (let i = 0; i < 6; i++) hairPx(cx - 6 + i, cy - 4 - (i % 2));
      }
      if (st === 'tied' || st === 'bun') {
        // 中分，脸侧碎发
        for (let dx = -8; dx <= 8; dx++) if (Math.abs(dx) > 1) hairPx(cx + dx, cy - 4 - (Math.abs(dx) > 5 ? 0 : 1));
        b.rect(ox + cx - rx - 1, oy + cy - 5, 2, 8, hairC); b.rect(ox + cx + rx, oy + cy - 5, 2, 8, hairDD);
        if (st === 'bun') { for (let y = -4; y <= 3; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 14) hairPx(cx + 2 + x, cy - ry - 4 + y); }
        else { for (let y = 0; y < 14; y++) hairPx(cx + rx + 1 + (y > 6 ? 1 : 0), cy - 3 + y); for (let y = 0; y < 12; y++) hairPx(cx + rx + 2 + (y > 6 ? 1 : 0), cy - 1 + y); }
      }
      if (st === 'wavy') {
        for (let dx = -9; dx <= 9; dx++) if (Math.abs(dx) > 2) hairPx(cx + dx, cy - 4 - (Math.abs(dx) > 6 ? 0 : 1));
        for (let y = -6; y < 18; y++) {
          const wob = Math.round(Math.sin(y * 0.7) * 1);
          for (let k = 0; k < 4; k++) { hairPx(cx - rx - 3 + k + wob, cy + y); hairPx(cx + rx + k - 1 + wob, cy + y); }
        }
      }
    }
    if (p.glasses) {
      const gc = H('#c9d2d6'), gd = H('#5d666c');
      for (const ex of [cx - 6, cx + 1]) { b.hline(ox + ex, eyeY - 2, 5, gc); b.hline(ox + ex, eyeY + 2, 5, gd); b.vline(ox + ex, eyeY - 2, 5, gc); b.vline(ox + ex + 4, eyeY - 2, 5, gd); b.set(ox + ex + 1, eyeY - 1, H('#eef6f8')); }
      b.hline(ox + cx - 1, eyeY - 1, 2, gc);
    }
    // 轮廓光（右侧冷色）
    if (opt.rim !== false) {
      for (let dy = -ry + 2; dy <= ry - 2; dy++) { const w = Math.round(faceW(dy)); b.set(ox + cx + w, oy + cy + dy, H('#7d93b0')); }
    }
  }

  return { CAST, person, silhouette, portrait, shade, SKIN };
})();
