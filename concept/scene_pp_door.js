// 《请出示证件》风格样张 1：「门外有人」——防爆门观察窗 + 桌面证件比对
window.scenePPDoor = function (canvas) {
  const H = PX.hex;
  const b = new PX.Buf(480, 270);
  const R = PX.rng(303);

  // ---------- 上方：避难所入口俯视图（art 坐标 0..88） ----------
  for (let y = 0; y < 88; y++) for (let x = 0; x < 480; x++) {
    const n = R();
    b.set(x, y, n < 0.12 ? H('#868c90') : n > 0.9 ? H('#b0b6b8') : H('#9ca2a4'));
  }
  // 道路与车辙
  for (let x = 0; x < 480; x++) for (let y = 50; y < 68; y++) if (R() < 0.85) b.set(x, y + Math.round(Math.sin(x * 0.03) * 1.5), R() < 0.2 ? H('#5e6264') : H('#72767a'));
  for (let x = 0; x < 480; x++) { b.set(x, 54 + Math.round(Math.sin(x * 0.03) * 1.5), H('#4e5254')); b.set(x, 63 + Math.round(Math.sin(x * 0.03) * 1.5), H('#4e5254')); }
  // 弹坑
  b.ellipse(262, 30, 12, 8, H('#5a5654')); b.ellipse(262, 30, 9, 6, H('#3a3634')); b.dither(248, 20, 28, 20, H('#4a4644'), 0.2);
  // 烧毁的轿车
  b.rect(196, 18, 26, 12, H('#2e2a28')); b.rect(200, 20, 18, 8, H('#1e1a18')); b.dither(196, 18, 26, 12, H('#4a3a30'), 0.25);
  // 入口掩体（俯视）
  b.rect(18, 8, 66, 48, H('#5c5e5a')); b.rect(18, 8, 66, 3, H('#767874'));
  b.ellipse(60, 20, 18, 9, H('#c4c8ca')); b.ellipse(30, 44, 12, 7, H('#b8bcbe')); b.ellipse(70, 46, 9, 5, H('#c4c8ca')); // 屋顶积雪
  b.rect(40, 52, 20, 6, H('#2a2826')); b.rect(43, 53, 14, 4, H('#5a3424')); // 防爆门
  b.ellipse(36, 26, 5, 5, H('#3a3c3a')); b.ellipse(36, 26, 3, 3, H('#5c5e5a')); // 通风口
  // 门前的脚印
  for (let i = 0; i < 16; i++) b.rect(50 + i * 4 + (i % 2), 60 + Math.round(i * 0.4), 2, 1, H('#6a7074'));
  // 铁丝网
  for (let x = 0; x < 480; x += 2) b.set(x, 80 + ((x >> 1) % 2), H('#4a4c4c'));
  for (let x = 6; x < 480; x += 18) { b.rect(x, 77, 2, 6, H('#3a3836')); }
  // 俯视小人：帽子圆 + 肩膀 + 影子
  const top = (x, y, coat, hat, opt = {}) => {
    b.ellipse(x + 3, y + 3, 6, 3, H('#7a8084')); // 影子
    b.ellipse(x, y, 5, 3, H(coat)); b.hline(x - 4, y - 2, 8, ACT.shade(H(coat), 1.25));
    b.ellipse(x, y - 1, 2.6, 2.6, H(hat)); b.set(x - 1, y - 2, ACT.shade(H(hat), 1.3));
    if (opt.boots) { b.rect(x - 2, y + 3, 2, 2, H(opt.boots)); b.rect(x + 1, y + 3, 2, 2, H(opt.boots)); }
    if (opt.bundle) b.ellipse(x + 5, y + 1, 2, 2, H('#8a7a5a'));
  };
  top(50, 64, '#4a4038', '#5a4634', { boots: '#2c3424' }); // 访客：军靴
  top(78, 70, '#5a3a3a', '#6a6460', { bundle: true });
  top(94, 72, '#3e3e44', '#8a8680');
  top(108, 70, '#4a5038', '#4a4a3a');
  b.ellipse(124, 74, 4, 2, H('#3a3a3e')); // 坐在雪里的人
  // 军车 + 探照灯照出的雪地
  b.ellipse(330, 30, 34, 14, H('#c4cacc')); b.ellipse(330, 30, 26, 10, H('#d4d8da'));
  b.rect(392, 22, 48, 20, H('#3e4432')); b.rect(392, 22, 34, 20, H('#4e5640')); b.rect(426, 24, 14, 16, H('#323626'));
  for (let x = 394; x < 424; x += 4) b.vline(x, 22, 20, H('#444a36'));
  top(376, 36, '#4a5236', '#3a4a30'); top(384, 46, '#4a5236', '#3a4a30');
  // 落雪
  for (let i = 0; i < 160; i++) b.set((R() * 480) | 0, (R() * 88) | 0, H('#e4e8ea'));
  // 墙体分隔
  b.rect(0, 88, 480, 7, H('#3a3c3c')); b.hline(0, 88, 480, H('#5a5c5c')); b.hline(0, 94, 480, H('#1e2020'));

  // ---------- 左：防爆门 ----------
  b.rect(0, 95, 165, 175, H('#4a4e4e'));
  for (let y = 99; y < 270; y += 24) for (const x of [5, 158]) { b.rect(x, y, 2, 2, H('#6a6e6e')); b.set(x, y, H('#8a8e8e')); }
  b.dither(0, 95, 165, 175, H('#3e4242'), 0.18);
  b.dither(0, 230, 40, 40, H('#5a3a2a'), 0.25); // 锈
  // 观察窗外框
  b.rect(10, 100, 145, 97, H('#1e2020')); b.rect(12, 102, 141, 93, H('#2a3034'));
  // 窗外：夜、雪、手电光圈
  for (let y = 102; y < 195; y++) for (let x = 12; x < 153; x++) {
    const d = Math.hypot(x - 82, y - 150) / 70;
    const c = d < 0.55 ? H('#5a6466') : d < 0.8 ? (((x + y) & 1) ? H('#4a5254') : H('#5a6466')) : H('#3a4244');
    b.set(x, y, c);
  }
  for (let i = 0; i < 50; i++) b.set(13 + ((R() * 139) | 0), 103 + ((R() * 90) | 0), H('#c8d0d2'));
  // 观察窗下沿、对讲格栅
  b.rect(10, 197, 145, 4, H('#5a5e5e')); b.hline(10, 197, 145, H('#7a7e7e'));
  for (let y = 205; y < 214; y += 3) b.rect(30, y, 105, 1, H('#1e2020'));

  // ---------- 右：桌面 ----------
  for (let y = 95; y < 270; y++) for (let x = 165; x < 480; x++) {
    const n = Math.sin(y * 0.9 + Math.sin(x * 0.02) * 4);
    b.set(x, y, n > 0.75 ? H('#4e3828') : n < -0.6 ? H('#3a2a1e') : H('#44301f'));
  }
  b.vline(165, 95, 175, H('#1e1612'));
  b.emit.fill(1);
  PX.present(b, canvas, 4, {});

  // ---------- UI 层 ----------
  const ui = new PX.UI(960, 540);
  const T = (s, x, y, c, sz, o) => ui.text(s, x, y, c, sz, o);
  const paper = (x, y, w, h, col = '#c4bc9e', sh = '#1a120c') => { ui.rect(x + 3, y + 3, w, h, sh); ui.rect(x, y, w, h, col); };
  const INK = '#2a241e', DIM = '#6a604c', RED = '#a82e26';

  // 访客头像（观察窗内，4× 像素）
  ui.ctx.imageSmoothingEnabled = false;
  ui.ctx.drawImage(PP.portrait('visitor', 64, 80, { transparent: true }), 101, 230, 128, 160);
  // 呼出的白气
  for (let i = 0; i < 14; i++) ui.rect(178 + (i % 5) * 4 + (i > 6 ? 6 : 0), 334 - Math.floor(i / 3) * 4, 4, 2, 'rgba(220,226,228,0.5)');

  // 俯视图标注
  ui.rect(0, 0, 360, 20, 'rgba(20,22,22,0.8)');
  T('第 3 天  21:40  ·  7 号避难所入口  ·  门外 -19°C', 8, 3, '#d8d8cc', 12);
  ui.rect(112, 108, 74, 15, 'rgba(20,22,22,0.75)'); T('排队 4 人', 116, 109, '#d8d8cc', 12);
  ui.rect(724, 106, 120, 15, 'rgba(20,22,22,0.75)'); T('宪兵车 · 搜捕逃兵', 728, 107, '#e8b0a0', 12);

  // 对讲记录
  ui.rect(12, 432, 304, 100, '#1c1e1e'); ui.rect(12, 432, 304, 14, '#2c3030');
  T('对讲记录', 18, 432, '#8a9090', 12);
  const lines = [
    ['他', '「我是送信的……镇上全炸了，开开门吧。」', '#c8c8bc'],
    ['你', '「送信的穿军靴？」', '#e8d090'],
    ['他', '「……路上捡的。」', '#c8c8bc'],
    ['他', '「求你了，我一个人，什么都不要。」', '#c8c8bc'],
  ];
  lines.forEach(([w, s, c], i) => { T(w, 18, 450 + i * 19, w === '你' ? '#e8d090' : '#8a9090', 12); T(s, 40, 450 + i * 19, c, 12); });

  // —— 证件 ——
  paper(346, 204, 214, 138, '#b8b894');
  ui.rect(346, 204, 214, 18, '#6a2a22');
  T('统一阵线国  公民证', 354, 206, '#e8d8b0', 12);
  ui.rect(354, 230, 52, 66, '#2a2420');
  ui.ctx.drawImage(PP.portrait('visitor', 24, 30, { bg: [H('#8a8e86'), H('#7a7e76')] }), 356, 232, 48, 60);
  const f = [['姓名', '孙立新'], ['出生', '1982.03.11'], ['住址', '灰河镇邮政街 14 号'], ['职业', '邮递员'], ['签发', '第三内务处']];
  f.forEach(([k, v], i) => { T(k, 414, 228 + i * 21, DIM, 12); T(v, 448, 228 + i * 21, INK, 12); });
  T('No. GH-0417-2291', 354, 322, DIM, 12);
  // 钢印
  ui.ctx.strokeStyle = 'rgba(168,46,38,0.7)'; ui.ctx.lineWidth = 2; ui.ctx.beginPath(); ui.ctx.arc(396, 290, 15, 0, Math.PI * 2); ui.ctx.stroke();

  // —— 门规（手写） ——
  paper(574, 200, 168, 178, '#d0c8aa');
  for (let y = 222; y < 374; y += 18) ui.rect(580, y + 14, 156, 1, '#a8a088');
  T('门规（第 2 天 · 众议）', 582, 204, INK, 12);
  ['1. 天黑后不开门', '2. 带武器的不开', '3. 进一人，口粮 -1', '4. 先问清来历', '', '—— 周建国 记'].forEach((s, i) => T(s, 582, 224 + i * 18, i === 0 ? RED : INK, 12));

  // —— 广播通缉名单（抄录） ——
  paper(756, 200, 190, 136, '#c8c4b0');
  T('广播 · 逃兵名单（抄录）', 762, 204, INK, 12);
  ['王德顺  二营', '孙立新  四营', '李保国  四营', '何  平  后勤', '……'].forEach((s, i) => T(s, 762, 226 + i * 19, INK, 12));
  T('举报者 奖励口粮 5 份', 762, 314, RED, 12);

  // —— 身后的人 ——
  paper(346, 356, 214, 114, '#2a2c2c', '#141414');
  T('身后的人', 352, 358, '#8a9090', 12);
  ui.ctx.drawImage(PP.portrait('zhao', 32, 40, { bg: [H('#4a5250'), H('#3e4644')] }), 352, 376, 64, 80);
  ui.ctx.drawImage(PP.portrait('lin', 32, 40, { bg: [H('#4a5250'), H('#3e4644')] }), 456, 376, 64, 80);
  T('赵铁军', 384, 456, '#c8c8bc', 12, { align: 'center' }); T('林秋', 488, 456, '#c8c8bc', 12, { align: 'center' });
  ui.rect(420, 378, 32, 30, '#1c1e1e'); T('别开', 424, 384, '#e8a090', 12);
  ui.rect(522, 400, 34, 44, '#1c1e1e'); T('零下', 524, 404, '#a0c0d8', 12); T('十九', 524, 422, '#a0c0d8', 12);

  // —— 口粮账 ——
  paper(574, 390, 168, 80, '#c4bc9e');
  T('口粮', 580, 394, DIM, 12);
  T('41 份 / 8 人', 580, 412, INK, 12); T('可撑 5.1 天', 580, 430, INK, 12);
  T('放他进来 → 4.6 天', 580, 448, RED, 12);

  // —— 检查模式 ——
  ui.rect(756, 344, 190, 34, '#7a2a22'); ui.rect(758, 346, 186, 30, '#9a3428');
  T('◎ 检查模式（开）', 851, 353, '#f0e0c8', 12, { align: 'center' });
  // 矛盾连线
  const box = (x, y, w, h) => { ui.rect(x, y, w, 2, RED); ui.rect(x, y + h - 2, w, 2, RED); ui.rect(x, y, 2, h); ui.rect(x, y, 2, h, RED); ui.rect(x + w - 2, y, 2, h, RED); };
  const link = (x0, y0, x1, y1) => { const n = Math.hypot(x1 - x0, y1 - y0) | 0; for (let i = 0; i < n; i += 4) ui.rect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 2, 2, RED); };
  box(444, 225, 52, 18); box(760, 242, 96, 18); link(496, 234, 760, 251);
  ui.rect(600, 384, 0, 0, RED);
  box(92, 120, 22, 18); box(444, 288, 54, 18); link(114, 136, 444, 296);
  const tag = (x, y, s) => { const w = ui.measure(s) + 10; ui.rect(x, y, w, 16, RED); T(s, x + 5, y + 1, '#f8e8d8', 12); };
  tag(590, 180, '矛盾：姓名在逃兵名单上');
  tag(236, 176, '矛盾：邮递员 · 军靴');

  // —— 决定 ——
  const btn = (x, w, s, bg, fg) => { ui.rect(x + 2, 484, w, 46, '#120c08'); ui.rect(x, 482, w, 46, bg); ui.rect(x, 482, w, 3, 'rgba(255,255,255,0.18)'); T(s, x + w / 2, 497, fg, 12, { align: 'center' }); };
  btn(346, 140, '开门', '#3e5a34', '#e0f0d0');
  btn(494, 140, '不开', '#6a2620', '#f8d8d0');
  btn(642, 146, '叫醒大家表决', '#3a3c3e', '#d8d8d0');
  btn(796, 150, '记下名字（举报）', '#2a2018', '#e8b090');

  ui.blit(canvas, 2);
};
