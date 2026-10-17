// 概念图 3：人物档案 + 关系网（周建国）
window.sceneDossier = function (canvas) {
  const H = PX.hex, C = ACT.CAST, sh = ACT.shade;
  const W = 480, HT = 270;
  const b = new PX.Buf(W, HT);
  const R = PX.rng(7);

  // 桌面：木纹
  for (let y = 0; y < HT; y++) for (let x = 0; x < W; x++) {
    const n = Math.sin(y * 0.9 + Math.sin(x * 0.03) * 3) + Math.sin(y * 0.23 + x * 0.004) * 0.8;
    b.set(x, y, n > 0.9 ? H('#4a3020') : n > -0.5 ? H('#3e2818') : H('#331f12'));
  }
  // 档案夹（打开）
  b.rect(8, 10, 300, 252, H('#8a6a3a')); b.rect(8, 10, 300, 2, H('#a8885a'));
  b.rect(12, 14, 144, 244, H('#d8ccae')); b.rect(160, 14, 144, 244, H('#e0d4b6'));
  b.vline(157, 14, 244, H('#6a5030')); b.vline(158, 14, 244, H('#b8a888'));
  // 纸张纹理 + 污渍
  for (let k = 0; k < 900; k++) { const x = 12 + ((R() * 292) | 0), y = 14 + ((R() * 244) | 0); b.set(x, y, R() < 0.5 ? H('#cfc2a2') : H('#e6dcc2')); }
  b.ellipse(120, 220, 14, 10, H('#c8b890')); b.ellipse(120, 220, 12, 8, H('#d4c6a6'));
  // 回形针
  b.rect(24, 8, 3, 14, H('#9aa0a8')); b.rect(28, 10, 3, 12, H('#9aa0a8')); b.hline(24, 8, 7, H('#c8d0d8'));
  // 右侧：关系网底板（黑板/软木）
  b.rect(314, 10, 160, 252, H('#2a2e2a')); b.rect(316, 12, 156, 248, H('#1e2420'));
  b.dither(316, 12, 156, 248, H('#262c28'), 0.3);
  // 台灯光
  b.clearLight(0.35);
  b.addLight(140, 40, 330, H('#ffe0b0'), 1.05);
  b.addLight(400, 120, 160, H('#a0b0d0'), 0.5);
  // 照片（半身像贴在档案上）
  b.rect(20, 22, 62, 80, H('#f0ece0'));
  // 红色印章
  for (let a = 0; a < 64; a++) { const t = a / 64 * Math.PI * 2; b.set(Math.round(128 + Math.cos(t) * 16), Math.round(44 + Math.sin(t) * 16), H('#a02828')); b.set(Math.round(128 + Math.cos(t) * 15), Math.round(44 + Math.sin(t) * 15), H('#a02828')); }
  const ctx = PX.present(b, canvas, 4, { levels: 10, tint: [0.6, 0.62, 0.75] });

  // ---------- UI ----------
  const ui = new PX.UI(960, 540);
  const T = (s, x, y, c, sz, o) => ui.text(s, x, y, c, sz, o);
  const ink = '#2a221a', inkL = '#5a4a3a', red = '#9a2020';
  // 照片
  LA.draw(ui, LA.portrait('zhou'), 44, 48, 2);
  // 印章文字
  T('机 密', 256, 80, '#a02828', 12, { align: 'center' }); T('边境区', 256, 62, '#a02828', 12, { align: 'center' }); T('民防委', 256, 98, '#a02828', 12, { align: 'center' });
  // 左页：基础信息
  let y = 212;
  T('档案 · No.07-003', 40, y, inkL, 12); y += 20;
  T('周建国', 40, y, ink, 12); T('56 岁 · 男', 100, y, inkL, 12); y += 18;
  T('出身：前阵线干部（区粮站副站长）', 40, y, ink, 12); y += 18;
  T('对政权：忠诚？ / 投机？', 40, y, ink, 12); y += 18;
  T('健康：心脏病（需药）', 40, y, red, 12); y += 24;
  T('—— 特质 ——', 40, y, inkL, 12); y += 18;
  const tags = [['精于算计', '#5a3a1a'], ['怕死', '#5a3a1a'], ['口才', '#2a4a2a'], ['识字记账', '#2a4a2a']];
  let tx = 40;
  for (const [t, c] of tags) { const w = ui.measure(t) + 8; ui.rect(tx, y, w, 15, c); T(t, tx + 4, y + 1, '#e8dcc0', 12); tx += w + 4; if (tx > 270) { tx = 40; y += 18; } }
  y += 26;
  T('—— 人格（你的推测） ——', 40, y, inkL, 12); y += 18;
  const pers = [['权力欲', 0.86, '#8a2a2a'], ['道德底线', 0.32, '#3a5a3a'], ['恐惧阈值', 0.28, '#5a4a7a'], ['依附性', 0.2, '#4a5a7a'], ['欲望', null, '#8a3a6a']];
  for (const [n, v, c] of pers) {
    T(n, 40, y, ink, 12);
    if (v === null) { ui.rect(110, y + 3, 170, 9, '#c8bc9c'); T('？ 信息不足', 116, y, inkL, 12); }
    else { ui.rect(110, y + 3, 170, 9, '#c8bc9c'); ui.rect(110, y + 3, Math.round(170 * v), 9, c); for (let i = 1; i < 10; i++) ui.rect(110 + i * 17, y + 3, 1, 9, 'rgba(0,0,0,0.15)'); }
    y += 17;
  }
  // 右页：记忆与秘密
  y = 40;
  T('—— 他记得的事（与你有关） ——', 330, y, inkL, 12); y += 20;
  const mem = [
    ['D2', '你替他挡下了门外的宪兵。', '恩情 +', '#2a5a2a'],
    ['D4', '你在会上质问「谁来定贡献」。', '记恨 +', red],
    ['D9', '你分给苏曼半罐肉。', '怀疑 +', '#6a4a1a'],
    ['D15', '你和林秋深夜在医务室。', '把柄？', '#6a2a5a'],
  ];
  for (const [d, s, e, c] of mem) {
    T(d, 330, y, inkL, 12); ui.para(s, 362, y, 200, ink, 12, 15);
    T(e, 586, y, c, 12, { align: 'right' }); y += 34;
  }
  y += 4;
  T('—— 秘密 ——', 330, y, inkL, 12); y += 20;
  ui.rect(330, y, 260, 30, '#c8bc9c'); T('✔ 他私藏了 4 罐肉在档案室后面', 336, y + 7, ink, 12); y += 36;
  ui.rect(330, y, 260, 30, '#2a221a');
  for (let i = 0; i < 12; i++) ui.rect(338 + i * 20, y + 12, 14, 6, '#4a3e30');
  T('🔒 未知 · 需要信任 70 或搜查', 336, y + 32, inkL, 12); y += 56;
  T('—— 他想要什么（推测） ——', 330, y, inkL, 12); y += 20;
  ui.para('· 控制仓库，成为这里的“站长”\n· 停火后，有人能证明他“坚守”\n· 林秋。', 330, y, 260, ink, 12, 17);
  y += 62;
  // 亲密 / 成人接口占位标签页
  ui.rect(330, y, 260, 44, 'rgba(60,20,40,0.85)'); ui.rect(330, y, 3, 44, '#8a3a6a');
  T('亲密记录（2 条，已模糊）', 340, y + 5, '#f0a0c8', 12);
  T('[ 成人内容接口 · memory hook ]', 340, y + 23, '#c890b0', 12);

  // ---------- 关系网 ----------
  const nodes = {
    zhou: [790, 250], player: [680, 120], lin: [880, 110], su: [700, 380], zhao: [890, 380], ana: [790, 440], liu: [660, 250], stranger: [910, 250],
  };
  const edges = [
    ['zhou', 'lin', '#c05a9a', 3, false, '欲望'],
    ['zhou', 'zhao', '#5a8ac8', 3, false, '同盟'],
    ['zhou', 'player', '#c04040', 2, false, '戒备'],
    ['zhou', 'su', '#c04040', 3, false, '敌视'],
    ['zhou', 'liu', '#8a6ac0', 2, false, '使唤'],
    ['zhou', 'ana', '#8a8a8a', 1, true, '？'],
    ['zhou', 'stranger', '#d8a040', 2, true, '想告发'],
    ['lin', 'player', '#6ab06a', 2, true, ''],
    ['zhao', 'ana', '#c05a9a', 2, true, ''],
  ];
  ui.rect(632, 24, 312, 18, 'rgba(0,0,0,0.5)');
  T('关系网 · 以周建国为中心', 640, 26, '#d8d0c0', 12);
  for (const [a, c, col, w, dashed, lab] of edges) {
    const [x0, y0] = nodes[a], [x1, y1] = nodes[c];
    const n = Math.hypot(x1 - x0, y1 - y0) | 0;
    for (let i = 0; i < n; i++) {
      if (dashed && (i >> 3) % 2) continue;
      const x = x0 + (x1 - x0) * i / n, yy = y0 + (y1 - y0) * i / n;
      ui.rect(Math.round(x - w / 2), Math.round(yy - w / 2), w, w, col);
    }
    if (lab) { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; const lw = ui.measure(lab) + 6; ui.rect(mx - lw / 2, my - 8, lw, 15, '#101412'); T(lab, mx, my - 7, col, 12, { align: 'center' }); }
  }
  const names = { zhou: '周建国', player: '你', lin: '林秋', su: '苏曼', zhao: '赵铁军', ana: '阿娜', liu: '刘小川', stranger: '伤兵' };
  for (const [k, [x, yy]] of Object.entries(nodes)) {
    const big = k === 'zhou';
    const s = big ? 2 : 1;
    const sz = 32 * s;
    ui.rect(x - sz / 2 - 3, yy - sz / 2 - 3, sz + 6, sz + 6, big ? '#d8a040' : k === 'player' ? '#f0d040' : '#07080a');
    ui.rect(x - sz / 2 - 1, yy - sz / 2 - 1, sz + 2, sz + 2, '#07080a');
    LA.draw(ui, LA.head(k), x - sz / 2, yy - sz / 2, s);
    T(names[k], x, yy + sz / 2 + 4, k === 'player' ? '#f0d040' : '#d8d0c0', 12, { align: 'center', shadow: '#000' });
  }
  // 图例
  const lg = [['信任/同盟', '#5a8ac8'], ['好感', '#6ab06a'], ['欲望', '#c05a9a'], ['畏惧/支配', '#8a6ac0'], ['敌意', '#c04040'], ['利用', '#d8a040']];
  lg.forEach(([n, c], i) => { const lx = 640 + (i % 3) * 100, ly = 494 + Math.floor(i / 3) * 18; ui.rect(lx, ly + 4, 14, 4, c); T(n, lx + 20, ly, '#a8a098', 12); });
  T('- - 虚线 = 你不确定', 640, 494 + 36 - 2, '#6a7068', 12);

  ui.blit(canvas, 2);
};
