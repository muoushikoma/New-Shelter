// 概念图 2：叙事事件 ——「第一次分配会议」
window.sceneMeeting = function (canvas) {
  const H = PX.hex, C = ACT.CAST, sh = ACT.shade;
  const W = 480, HT = 270;
  const b = new PX.Buf(W, HT);
  const R = PX.rng(42);

  // 后墙：瓷砖 + 污渍
  b.vramp(0, 0, W, 150, [H('#3a3c38'), H('#44463f'), H('#4a4a42')]);
  for (let y = 4; y < 150; y += 9) b.hline(0, y, W, H('#33352f'));
  for (let y = 0; y < 150; y += 9) for (let x = (y / 9) % 2 ? 6 : 0; x < W; x += 13) b.vline(x, y, 9, H('#35372f'));
  for (let k = 0; k < 60; k++) { const sx = (R() * W) | 0, sy = (R() * 140) | 0; b.dither(sx, sy, 4 + ((R() * 12) | 0), 3 + ((R() * 10) | 0), H('#2c2e29'), 0.3); }
  for (let k = 0; k < 12; k++) { const sx = (R() * W) | 0; b.dither(sx, 0, 3, 10 + ((R() * 40) | 0), H('#30332e'), 0.45); }
  // 墙裙
  b.rect(0, 120, W, 30, H('#4a3a2c')); b.hline(0, 120, W, H('#6a5440'));
  // 管道
  b.rect(0, 8, W, 4, H('#39424a')); b.hline(0, 8, W, H('#5a646c'));
  for (let x = 20; x < W; x += 60) { b.rect(x, 7, 4, 6, H('#6a3c24')); }
  b.rect(440, 12, 4, 108, H('#39424a')); b.vline(440, 12, 108, H('#5a646c'));

  // 领袖画像（大）
  b.rect(206, 18, 68, 80, H('#3a2a1a')); b.rect(208, 20, 64, 76, H('#6a5232'));
  b.rect(211, 23, 58, 70, H('#a8946a'));
  // 画中人（简化剪影 + 军帽）
  b.ellipse(240, 48, 12, 14, H('#7a6448')); b.rect(226, 32, 28, 6, H('#4a3a2a')); b.rect(222, 37, 36, 3, H('#3a2a1a'));
  b.rect(220, 64, 40, 29, H('#5a4434')); b.rect(236, 64, 8, 10, H('#a8946a')); b.rect(238, 66, 4, 8, H('#8a2a2a'));
  b.rect(234, 52, 12, 2, H('#5a4434'));
  b.dither(211, 23, 58, 70, H('#8a7a58'), 0.3);
  // 画像被人用刀划过 + 有人在上面写了字
  b.line(214, 30, 262, 86, H('#2a1e14')); b.line(215, 30, 263, 86, H('#4a3a28'));
  // 两侧标语
  const banner = (x0, y0, w) => { b.rect(x0, y0, w, 12, H('#5a1a1a')); b.rect(x0 + 1, y0 + 1, w - 2, 10, H('#8c2626')); for (let i = 0; i < Math.floor((w - 8) / 9); i++) b.rect(x0 + 5 + i * 9, y0 + 3, 6, 6, H('#d8c8a0')); };
  banner(96, 30, 96); banner(288, 30, 96);
  // 墙上的日历与划痕计数
  b.rect(40, 40, 30, 36, H('#cfc4a8')); b.rect(40, 40, 30, 8, H('#8c2626'));
  for (let i = 0; i < 17; i++) { const gx = 43 + (i % 5) * 5, gy = 52 + Math.floor(i / 5) * 6; b.vline(gx, gy, 4, H('#2a2a2a')); if (i % 5 === 4) b.line(gx - 16, gy + 3, gx, gy, H('#8a2020')); }
  // 挂着的收音机
  b.rect(400, 56, 30, 18, H('#5a3a24')); b.rect(402, 58, 16, 14, H('#3a2a1a'));
  for (let y = 59; y < 72; y += 2) b.hline(403, y, 14, H('#6a5040'));
  b.ellipse(424, 62, 2, 2, H('#cfc4a8')); b.ellipse(424, 69, 2, 2, H('#cfc4a8'));
  b.rectGlow(421, 58, 2, 1, H('#ffb040'));
  b.line(430, 56, 446, 40, H('#2a2a2a'));

  // 吊灯
  b.vline(240, 0, 100, H('#151515'));
  b.rect(232, 100, 17, 4, H('#2a2a28')); b.hline(232, 100, 17, H('#4a4a46'));
  b.rect(234, 104, 13, 2, H('#1a1a1a'));
  b.rectGlow(237, 104, 7, 4, H('#fff0c8')); b.rectGlow(238, 108, 5, 1, H('#ffe0a0'));

  // ---------- 人物（半身） ----------
  const seat = [
    // key, x, y 偏移（站着的更高）
    ['su', 96, 104],
    ['ana', 140, 106],
    ['zhou', 220, 92],
    ['lin', 300, 106],
    ['liu', 344, 106],
    ['zhao', 392, 90],
  ];
  for (const [k, x, y] of seat) {
    const cv = LA.portrait(k, { noBg: true });
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    for (let j = 0; j < cv.height; j++) for (let i = 0; i < cv.width; i++) {
      const o = (j * cv.width + i) * 4;
      if (d[o + 3]) b.set(x - 28 + i, y - 18 + j, [d[o], d[o + 1], d[o + 2]]);
    }
  }
  // 周建国拿着账本（举在胸前）
  b.rect(214, 130, 18, 12, H('#cfc4a8')); b.rect(214, 130, 18, 2, H('#4a2a2a')); b.vline(222, 130, 12, H('#8a7a60'));
  for (let i = 0; i < 4; i++) b.hline(216, 134 + i * 2, 5, H('#5a5a6a'));
  b.rect(210, 136, 5, 5, ACT.SKIN.warm[1]); b.rect(231, 136, 5, 5, ACT.SKIN.warm[2]);

  // ---------- 桌子 ----------
  b.rect(60, 148, 370, 6, H('#7a5434')); b.hline(60, 148, 370, H('#a07448')); b.hline(60, 153, 370, H('#3a2414'));
  for (let x = 64; x < 430; x += 23) b.hline(x, 150, 9, H('#6a4a2c'));
  b.rect(60, 154, 370, 26, H('#4a3220')); for (let x = 60; x < 430; x += 37) b.vline(x, 154, 26, H('#3a2414'));
  b.dither(60, 170, 370, 10, H('#2a1a10'), 0.5);
  // 桌上的配给：罐头一排
  for (let i = 0; i < 6; i++) {
    const cx0 = 224 + i * 6 - 18;
    b.rect(cx0, 139, 5, 9, H('#8a8a80')); b.rect(cx0, 141, 5, 4, H('#9a3a2a')); b.hline(cx0, 139, 5, H('#c4c4b8')); b.vline(cx0 + 4, 139, 9, H('#5a5a54'));
  }
  // 一小袋面粉、半块黑面包
  b.ellipse(272, 144, 7, 4, H('#cfc8b8')); b.hline(267, 141, 10, H('#e8e2d4'));
  b.ellipse(186, 145, 6, 3, H('#5a3a1a')); b.hline(181, 143, 10, H('#7a5230'));
  // 手枪（在周建国手边）
  b.rect(246, 144, 10, 3, H('#2a2c30')); b.rect(246, 146, 3, 3, H('#3a2a1a')); b.hline(246, 144, 10, H('#5a5e66'));
  // 搪瓷杯、烟灰
  b.rect(118, 141, 6, 7, H('#d8dcd8')); b.hline(118, 141, 6, H('#3a5a8a')); b.set(124, 143, H('#d8dcd8')); b.set(124, 145, H('#d8dcd8'));
  b.rect(352, 145, 7, 3, H('#4a4a48')); b.set(354, 144, H('#e8e0d0')); b.rectGlow(356, 144, 1, 1, H('#ff6a2a'));
  // 烟雾
  for (let k = 0; k < 18; k++) b.set(356 + Math.round(Math.sin(k * 0.6) * 2), 143 - k * 2, H('#6a6a70'));

  // 前景：玩家背影（过肩视角）
  const fg = H('#0c0b0d');
  b.ellipse(48, 196, 26, 30, fg); b.rect(10, 214, 80, 60, fg); b.ellipse(56, 168, 11, 13, fg);
  b.hline(46, 156, 18, H('#2a2622')); // 头发边缘光
  b.vline(67, 162, 10, H('#3a2e26'));
  b.ellipse(452, 210, 30, 34, fg); b.rect(426, 228, 60, 50, fg);

  // 光照
  b.clearLight(0.14);
  b.addLight(240, 106, 240, H('#ffd8a0'), 1.15);
  b.addLight(240, 130, 300, H('#ffc890'), 0.35);
  b.addLight(470, 120, 110, H('#6a7aa0'), 0.35);
  b.addLight(240, 150, 90, H('#ffe0b0'), 0.6);
  b.addLight(421, 60, 30, H('#ff9a40'), 0.5);
  const ctx = PX.present(b, canvas, 4, { levels: 8, tint: [0.42, 0.48, 0.75] });

  // ---------- UI ----------
  const ui = new PX.UI(960, 540);
  const T = (s, x, y, c, sz, o) => ui.text(s, x, y, c, sz, o);
  // 事件标题
  ui.rect(0, 12, 380, 30, 'rgba(10,8,8,0.85)'); ui.rect(0, 12, 6, 30, '#8c2626');
  T('事件', 16, 15, '#c87a6a', 12); T('第一次分配会议', 52, 15, '#f0e0c0', 12);
  T('第 4 天 · 19:20 · 公共区 · 库存可撑 9 天', 16, 28, '#8a8070', 12);
  // 站队统计
  ui.panel(744, 12, 204, 74, { rivets: false, base: 'rgba(12,12,14,0.88)' });
  T('当前态度（你能看出的）', 754, 18, '#9aa0a8', 12);
  const st = [['支持', 2, '#6ab06a'], ['反对', 1, '#c05050'], ['观望', 3, '#8a8a8a']];
  st.forEach(([n, v, c], i) => { ui.rect(754 + i * 64, 40, 10, 10, c); T(`${n} ${v}`, 768 + i * 64, 38, '#d8d0c0', 12); });
  ui.rect(754, 60, 184, 10, '#050506'); ui.rect(755, 61, 60, 8, '#6ab06a'); ui.rect(815, 61, 30, 8, '#c05050'); ui.rect(845, 61, 92, 8, '#4a4a4a');

  // NPC 反应气泡
  const bubble = (sx, sy, txt, fg = '#e8dcc0', bd = '#6a6050') => {
    const w = ui.measure(txt) + 10, x0 = sx * 2 - (w >> 1), y0 = sy * 2;
    ui.rect(x0 - 1, y0 - 1, w + 2, 18, '#050505'); ui.rect(x0, y0, w, 16, bd); ui.rect(x0 + 1, y0 + 1, w - 2, 14, 'rgba(16,16,18,0.95)');
    ui.rect(sx * 2 - 2, y0 + 16, 5, 2, bd); ui.rect(sx * 2 - 1, y0 + 18, 3, 2, bd);
    T(txt, x0 + 5, y0 + 1, fg, 12);
  };
  bubble(96, 82, '皱眉', '#e8a090', '#7a3a3a');
  bubble(140, 88, '（在看你）', '#ff9ab0', '#7a3a5a');
  bubble(300, 88, '……', '#c8d8e8');
  bubble(344, 88, '（盯着罐头）', '#e8c880', '#6a5a30');
  bubble(392, 70, '点头', '#a0d890', '#3a6a3a');
  // 名字
  const nm = (sx, sy, s) => { const w = ui.measure(s) + 8; ui.rect(sx * 2 - (w >> 1), sy * 2, w, 15, 'rgba(0,0,0,0.6)'); T(s, sx * 2, sy * 2 + 1, '#a8a098', 12, { align: 'center' }); };
  nm(96, 158, '苏曼'); nm(140, 158, '阿娜'); nm(222, 158, '周建国'); nm(300, 158, '林秋'); nm(344, 158, '刘小川'); nm(392, 158, '赵铁军');

  // 对话框
  const dx = 120, dy = 352, dw = 720, dh = 180;
  ui.panel(dx, dy, dw, dh, { base: 'rgba(14,12,12,0.95)', rim: '#4a3a30' });
  ui.rect(dx + 9, dy + 12, 116, 144, '#07080a'); ui.rect(dx + 10, dy + 13, 114, 142, '#5a4030');
  LA.draw(ui, LA.portrait('zhou'), dx + 11, dy + 14, 2);
  T('周建国', dx + 136, dy + 10, '#e8c890', 12);
  T('前阵线干部 · 持有仓库钥匙 · 持枪', dx + 192, dy + 10, '#7a7068', 12);
  ui.para('「同志们——各位。从今天起，配给按贡献来分。干活多的多吃，这很公平。账本我来记，钥匙我来保管。有意见的，现在说。」', dx + 136, dy + 30, dw - 150, '#e8e0d0', 12, 17);
  // 选项
  const choices = [
    ['1', '「同意。总得有人管。」', [['周建国 信任↑', '#6ab06a'], ['苏曼 失望', '#c05050']]],
    ['2', '「谁来定什么叫贡献？你吗？」', [['说服 42/40', '#d8b060'], ['周建国 记恨', '#c05050']]],
    ['3', '「我提议投票。」', [['召开表决', '#8ab0d8']]],
    ['4', '「……先把桌上的枪收起来。」', [['需要 勇气', '#d8b060'], ['赵铁军 ？', '#8a8a8a']]],
    ['5', '（沉默，看别人怎么说）', [['不表态', '#8a8a8a']]],
  ];
  let cy = dy + 88;
  choices.forEach(([k, s, tags], i) => {
    const hot = i === 1;
    if (hot) { ui.rect(dx + 132, cy - 1, dw - 144, 17, '#3a2418'); ui.rect(dx + 132, cy - 1, 3, 17, '#e8a060'); }
    T(k, dx + 140, cy, hot ? '#f0c080' : '#8a8078', 12);
    T(s, dx + 156, cy, hot ? '#f8ecd8' : '#c8c0b0', 12);
    let tx = dx + 156 + ui.measure(s) + 12;
    for (const [t, c] of tags) { const w = ui.measure(t) + 8; ui.rect(tx, cy, w, 15, 'rgba(255,255,255,0.05)'); ui.rect(tx, cy, 2, 15, c); T(t, tx + 5, cy, c, 12); tx += w + 6; }
    cy += 17;
  });
  // 倒计时：其他人不会等你
  ui.rect(dx + 136, dy + dh - 8, dw - 148, 3, '#2a2420'); ui.rect(dx + 136, dy + dh - 8, Math.round((dw - 148) * 0.6), 3, '#c87a3a');
  T('NPC 不会等你：沉默太久，别人会先开口', dx + dw - 12, dy + 10, '#6a6058', 12, { align: 'right' });

  ui.blit(canvas, 2);
};
