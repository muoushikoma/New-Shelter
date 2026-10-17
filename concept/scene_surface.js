// 概念图 4：夜间地表搜刮（灰河镇 · 国营粮站）
window.sceneSurface = function (canvas) {
  const H = PX.hex, C = ACT.CAST, sh = ACT.shade, P = ACT.person;
  const W = 480, HT = 270;
  const b = new PX.Buf(W, HT);
  const R = PX.rng(2024);
  const GY = 214; // 地面

  // 天空
  b.vramp(0, 0, W, 150, [H('#07080f'), H('#0e1120'), H('#1d1826'), H('#3a2026'), H('#6a2e20')]);
  for (let i = 0; i < 30; i++) { const x = (R() * W) | 0, y = (R() * 50) | 0; b.set(x, y, H('#4a5070')); b.glow(x, y); }
  // 远景城市燃烧
  for (let x = 0; x < W; x++) {
    const h = 20 + Math.round(Math.abs(Math.sin(x * 0.05) * 14 + Math.sin(x * 0.17) * 6));
    b.vline(x, 150 - h, h + 10, H('#14121a'));
    if (R() < 0.04) { b.set(x, 150 - h + 4 + ((R() * 10) | 0), H('#e07a2a')); b.glow(x, 150 - h + 4); }
  }
  // 烟柱
  for (const sx of [120, 330, 410]) for (let y = 30; y < 140; y++) {
    const w = 4 + (140 - y) * 0.12, xo = Math.sin(y * 0.06 + sx) * 6 + (140 - y) * 0.15;
    b.dither(Math.round(sx + xo - w), y, Math.round(w * 2), 1, H('#2a2228'), 0.55);
  }
  // 中景：教堂（钟楼被炸了一半）
  b.rect(60, 96, 30, 70, H('#1c1a22')); b.rect(64, 78, 14, 20, H('#1c1a22'));
  for (let i = 0; i < 8; i++) b.hline(67 - (i >> 1), 70 + i, 8 - (i < 4 ? 4 - i : 0), H('#1c1a22'));
  b.rect(68, 84, 4, 6, H('#2a1810')); b.rectGlow(69, 86, 2, 3, H('#c06020'));
  // 中景：水塔、电线杆
  b.rect(400, 104, 20, 10, H('#1a1820')); b.vline(402, 114, 50, H('#1a1820')); b.vline(417, 114, 50, H('#1a1820'));
  for (let x = 0; x < W; x += 70) { b.vline(x + 20, 120, 50, H('#1a1820')); b.hline(x + 16, 124, 9, H('#1a1820')); }
  for (let x = 0; x < W; x++) b.set(x, 125 + Math.round(Math.cosh((x % 70 - 35) / 30) * 2) - 2, H('#151319'));

  // ---------- 近景建筑：国营粮站（剖面） ----------
  const bx = 120, bw = 150, by = 120;
  // 外墙
  b.rect(bx, by, bw, GY - by, H('#6a625a'));
  for (let y = by; y < GY; y += 5) for (let x = bx + ((y / 5) % 2 ? 0 : 4); x < bx + bw; x += 9) b.vline(x, y, 5, H('#5a524a'));
  for (let y = by; y < GY; y += 5) b.hline(bx, y, bw, H('#5a524a'));
  // 炸开的屋顶轮廓
  for (let x = bx; x < bx + bw; x++) {
    const bite = x > bx + 70 && x < bx + 120 ? Math.round(18 - Math.abs(x - bx - 95) * 0.7) : 0;
    for (let y = by; y < by + Math.max(0, bite); y++) b.set(x, y, H('#1d1826'));
  }
  // 内部（剖开）
  b.rect(bx + 6, by + 8, bw - 12, 36, H('#4a443c')); b.rect(bx + 6, by + 50, bw - 12, GY - by - 52, H('#46403a'));
  b.rect(bx + 6, by + 8, bw - 12, 2, H('#2a2622')); b.hline(bx + 6, by + 64, bw - 12, H('#3a5040'));
  b.rect(bx, by + 44, bw, 6, H('#5a5450')); b.hline(bx, by + 44, bw, H('#7a7470'));
  // 楼板断裂
  for (let x = bx + 80; x < bx + 110; x++) b.vline(x, by + 44, 6, H('#1d1826'));
  b.line(bx + 80, by + 44, bx + 95, by + 62, H('#5a5450')); b.line(bx + 81, by + 44, bx + 96, by + 62, H('#4a4440'));
  // 招牌
  b.rect(bx + 20, by - 10, 80, 10, H('#5a1a1a')); b.rect(bx + 21, by - 9, 78, 8, H('#8c2626'));
  for (let i = 0; i < 4; i++) b.rect(bx + 30 + i * 16, by - 7, 8, 4, H('#d8c8a0'));
  b.line(bx + 99, by - 10, bx + 104, by - 2, H('#3a3a3a'));
  // 楼上：倒塌的货架、几袋粮
  for (let i = 0; i < 3; i++) { b.rect(bx + 12 + i * 22, by + 14, 18, 2, H('#5a3c24')); b.rect(bx + 12 + i * 22, by + 30, 18, 2, H('#5a3c24')); }
  b.line(bx + 60, by + 14, bx + 76, by + 42, H('#5a3c24'));
  b.ellipse(bx + 20, by + 40, 6, 3, H('#b8ae94')); b.ellipse(bx + 32, by + 40, 6, 3, H('#a89e84'));
  // 楼下：柜台、散落的票证、保险柜
  b.rect(bx + 14, GY - 14, 50, 14, H('#5a3c24')); b.hline(bx + 14, GY - 14, 50, H('#7a5434'));
  b.rect(bx + 120, GY - 20, 16, 20, H('#3a4044')); b.ellipse(bx + 128, GY - 10, 3, 3, H('#8a9096'));
  for (let i = 0; i < 12; i++) b.set(bx + 70 + ((R() * 40) | 0), GY - 1 - ((R() * 2) | 0), H('#d8ccb0'));
  // 墙上残存的宣传画（被撕了一半）
  b.rect(bx + 74, by + 60, 20, 26, H('#c8b890')); b.rect(bx + 76, by + 62, 16, 10, H('#8c2626'));
  b.rect(bx + 80, by + 74, 8, 10, H('#5a4434'));
  for (let y = by + 70; y < by + 86; y++) for (let x = bx + 84; x < bx + 94; x++) if (x - bx - 84 > (y - by - 70) * 0.6) b.set(x, y, H('#36322c'));
  // 门洞
  b.rect(bx + bw - 2, GY - 26, 6, 26, H('#1a1612'));

  // ---------- 右侧：燃烧的军车 ----------
  const tx = 318;
  b.rect(tx, GY - 18, 52, 12, H('#2a2c24')); b.rect(tx + 34, GY - 26, 18, 10, H('#2a2c24'));
  b.rect(tx + 37, GY - 24, 8, 5, H('#1a1612'));
  b.ellipse(tx + 10, GY - 5, 5, 5, H('#141414')); b.ellipse(tx + 42, GY - 5, 5, 5, H('#141414'));
  b.dither(tx, GY - 18, 34, 12, H('#1a1a14'), 0.5);
  // 火焰
  for (let k = 0; k < 140; k++) {
    const fx = tx + 4 + ((R() * 30) | 0), fy = GY - 18 - ((R() * R() * 24) | 0);
    const t = (GY - 18 - fy) / 24;
    b.set(fx, fy, t < 0.25 ? H('#fff0a0') : t < 0.5 ? H('#ffb040') : t < 0.75 ? H('#e05a20') : H('#8a2a14'));
    b.glow(fx, fy);
  }

  // 反坦克拒马
  const hedge = (x0) => { b.line(x0, GY, x0 + 10, GY - 10, H('#3a3a3a')); b.line(x0 + 10, GY, x0, GY - 10, H('#3a3a3a')); b.line(x0 + 5, GY + 1, x0 + 5, GY - 12, H('#2a2a2a')); };
  hedge(290); hedge(450);
  // 地面雪
  for (let x = 0; x < W; x++) {
    const top = GY + Math.round(Math.sin(x * 0.07) * 1.2);
    b.vline(x, top, HT - top, H('#b8c0cc'));
    b.vline(x, top + 6, HT - top, H('#8a94a4'));
    b.set(x, top, H('#dfe4ec'));
  }
  b.dither(0, GY + 12, W, HT - GY - 12, H('#6a7486'), 0.5);
  // 脚印
  for (let i = 0; i < 12; i++) b.rect(150 + i * 7, GY + 4 + (i % 2) * 2, 2, 1, H('#7a8494'));
  // 雪地里的尸体（平民）
  b.rect(214, GY + 2, 16, 4, H('#3a3040')); b.rect(229, GY + 2, 4, 3, ACT.SKIN.pale[2]); b.dither(212, GY + 1, 22, 2, H('#c8d0dc'), 0.5);
  b.ellipse(222, GY + 7, 10, 1, H('#5a2a2a'));

  // 人物：玩家蹲在粮站门口阴影里
  P(b, 280, GY, { ...C.player, coat: H('#3a4030') }, 'crouch', 1);
  b.rect(273, GY - 12, 5, 7, H('#4a3a28')); // 背包
  // 巡逻兵
  const soldier = { name: '巡逻兵', skin: 'pale', hair: H('#222'), style: 'cap', cap: H('#3a4a30'), coat: H('#4a5236'), pants: H('#3a4030'), male: true };
  P(b, 430, GY, soldier, 'stand', -1);
  b.line(424, GY - 13, 434, GY - 21, H('#1a1612')); b.line(425, GY - 13, 435, GY - 21, H('#3a2a1a'));
  b.rectGlow(424, GY - 12, 2, 1, H('#ffffe0'));
  P(b, 458, GY, soldier, 'stand', -1);

  // 前景：左侧近处残墙 + 瓦砾（剪影）
  const fgc = H('#100e12');
  b.rect(0, 70, 34, GY - 70, H('#2a2628')); b.rect(30, 70, 4, GY - 70, H('#1a1618'));
  for (let y = 80; y < GY; y += 30) { b.rect(8, y, 14, 16, H('#141216')); b.hline(8, y + 16, 14, H('#c8d0dc')); }
  for (let y = 70; y < 90; y++) for (let x = 0; x < 34; x++) if (y - 70 < Math.abs(Math.sin(x * 0.5)) * 14) b.set(x, y, H('#1d1826'));
  for (let i = 0; i < 40; i++) { const rx = ((R() * W) | 0), ry = HT - ((R() * 18) | 0); b.rect(rx, ry, 3 + ((R() * 8) | 0), 2 + ((R() * 4) | 0), fgc); }
  b.line(380, HT, 440, HT - 28, fgc); b.line(381, HT, 441, HT - 28, fgc); b.line(440, HT - 28, 448, HT - 24, fgc);
  for (let x = 100; x < 300; x += 5) b.set(x, HT - 12 + ((x >> 2) % 2), H('#2a2830'));
  // 屋顶积雪
  for (let x = bx; x < bx + bw; x++) { let y = by; while (y < GY && b.get(x, y)[2] > 30 && b.get(x, y)[0] < 40) y++; b.set(x, y, H('#dfe4ec')); }
  // 雪花
  for (let i = 0; i < 260; i++) { const x = (R() * W) | 0, y = (R() * HT) | 0; b.set(x, y, R() < 0.5 ? H('#e8ecf4') : H('#9aa4b4')); if (R() < 0.6) b.glow(x, y); }

  // 光照
  b.clearLight(0.3);
  b.addLight(-40, -40, 420, H('#9ab0e0'), 0.45); // 月光
  b.addLight(240, 100, 400, H('#ff7a3a'), 0.3);
  b.addLight(tx + 18, GY - 26, 150, H('#ff8a30'), 1.5);
  b.addLight(424, GY - 12, 130, H('#f0f4d0'), 1.2, null, [Math.PI, 0.22]);
  b.addLight(69, 86, 40, H('#ff6a20'), 0.6);
  b.addLight(200, 0, 300, H('#d8e4ff'), 0.9, null, [Math.PI * 0.62, 0.035]); // 探照灯
  PX.present(b, canvas, 4, { levels: 8, tint: [0.45, 0.52, 0.85] });

  // ---------- UI ----------
  const ui = new PX.UI(960, 540);
  const T = (s, x, y, c, sz, o) => ui.text(s, x, y, c, sz, o);
  // 巡逻兵视野（半透明红色锥）
  ui.ctx.fillStyle = 'rgba(200,40,30,0.13)';
  ui.ctx.beginPath(); ui.ctx.moveTo(848, GY * 2 - 24); ui.ctx.lineTo(610, GY * 2 - 110); ui.ctx.lineTo(610, GY * 2 + 30); ui.ctx.closePath(); ui.ctx.fill();
  for (let x = 610; x < 848; x += 6) { const t = (x - 610) / 238; ui.rect(x, Math.round(GY * 2 - 110 + t * 86), 3, 1, 'rgba(255,90,70,0.5)'); ui.rect(x, Math.round(GY * 2 + 30 - t * 54), 3, 1, 'rgba(255,90,70,0.5)'); }
  // 巡逻兵状态
  ui.rect(812, GY * 2 - 70, 90, 16, 'rgba(40,8,8,0.9)'); ui.rect(812, GY * 2 - 70, 2, 16, '#e05040'); T('巡逻兵 · 警觉 34%', 818, GY * 2 - 70, '#ffb0a0', 12);
  // 玩家
  ui.rect(554, GY * 2 - 56, 11, 2, '#f0d040'); ui.rect(556, GY * 2 - 54, 7, 2, '#f0d040'); ui.rect(558, GY * 2 - 52, 3, 2, '#f0d040');
  // 可搜刮点
  const loot = (sx, sy, s, c = '#e8d080') => { ui.rect(sx * 2 - 4, sy * 2 - 4, 9, 9, '#07080a'); ui.rect(sx * 2 - 3, sy * 2 - 3, 7, 7, c); ui.rect(sx * 2 - 1, sy * 2 - 1, 3, 3, '#07080a'); const w = ui.measure(s) + 8; ui.rect(sx * 2 + 8, sy * 2 - 8, w, 15, 'rgba(0,0,0,0.7)'); T(s, sx * 2 + 12, sy * 2 - 7, c, 12); };
  loot(146, by + 36, '面粉 ×2（楼上，楼梯断了）');
  loot(248, GY + 8 - 18, '尸体 · 未搜', '#c8c0d0');
  loot(bx + 128, GY - 30, '保险柜 · 需撬棍', '#a0a8b0');

  // 左上：行动状态
  ui.panel(10, 10, 300, 112, { title: '地表搜刮 · 灰河镇 / 国营粮站', titleBg: '#1a2230', titleCol: '#a8c0e0' });
  T('02:10', 22, 32, '#e8dcc0', 12); T('距天亮 4 小时 · 外出 1 小时 05 分', 66, 32, '#8a9098', 12);
  const row = (y, n, v, c, txt) => { T(n, 22, y, '#9aa0a8', 12); ui.bar(62, y + 2, 160, 10, v, c); T(txt, 230, y, '#c8c0b0', 12); };
  row(52, '体温', 0.42, '#7ab0e0', '35.6°C');
  row(70, '噪音', 0.18, '#e0b040', '低');
  row(88, '负重', 0.6, '#a08a60', '12/20 kg');
  // 右上：小镇地图
  ui.panel(760, 10, 190, 150, { title: '灰河镇', titleBg: '#1a2230', titleCol: '#a8c0e0' });
  const mp = { 避难所: [790, 130], 粮站: [840, 96], 医院: [900, 60], 党部: [880, 118], 车站: [800, 50], 哨所: [930, 140] };
  const lines = [['避难所', '粮站'], ['粮站', '车站'], ['粮站', '党部'], ['党部', '医院'], ['党部', '哨所'], ['车站', '医院']];
  for (const [a, c] of lines) { const [x0, y0] = mp[a], [x1, y1] = mp[c]; const n = Math.hypot(x1 - x0, y1 - y0) | 0; for (let i = 0; i < n; i += 3) ui.rect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1, '#5a6470'); }
  for (const [n, [x, y]] of Object.entries(mp)) {
    const cur = n === '粮站', danger = n === '哨所' || n === '党部';
    ui.rect(x - 3, y - 3, 7, 7, cur ? '#f0d040' : danger ? '#c04040' : '#8a96a0');
    T(n, x + 6, y - 7, cur ? '#f0d040' : danger ? '#e08070' : '#a0a8b0', 12);
  }
  // 底部：背包
  ui.panel(10, 452, 420, 78, { title: '背包', titleBg: '#2a2418' });
  const items = [['罐头', 3, '#c8a060'], ['蜡烛', 5, '#e8e0c8'], ['绷带', 2, '#e8e8e0'], ['香烟', 1, '#e8a060'], ['阵线证件', 1, '#c04040'], ['照片', 1, '#a0a0a0']];
  items.forEach(([n, q, c], i) => {
    const x = 20 + i * 68, y = 472;
    ui.rect(x, y, 62, 50, '#0a0b0d'); ui.rect(x + 1, y + 1, 60, 48, '#1e2126');
    ui.rect(x + 23, y + 8, 16, 16, c); ui.rect(x + 23, y + 8, 16, 2, 'rgba(255,255,255,0.3)');
    T(n, x + 31, y + 28, '#c8c0b0', 12, { align: 'center' });
    T('×' + q, x + 58, y + 2, '#8a9098', 12, { align: 'right' });
  });
  // 提示
  ui.rect(600, 500, 350, 30, 'rgba(0,0,0,0.6)');
  T('[Shift] 屏息   [E] 搜刮   [Q] 扔石头引开   [R] 撤回', 610, 508, '#a8b0b8', 12);

  ui.blit(canvas, 2);
};
