// 《请出示证件》风格样张 2：人员登记表
window.scenePPCast = function (canvas) {
  const ui = new PX.UI(960, 540);
  const T = (s, x, y, c, sz, o) => ui.text(s, x, y, c, sz, o);
  // 桌面
  ui.rect(0, 0, 960, 540, '#3e2c20');
  for (let y = 0; y < 540; y += 2) if (Math.sin(y * 0.37) + Math.sin(y * 0.11) > 1.1) ui.rect(0, y, 960, 2, '#36261b');
  // 登记表
  ui.rect(26, 10, 908, 524, '#1e1610');
  ui.rect(24, 8, 908, 524, '#bdb497');
  for (let i = 0; i < 1600; i++) { const x = 24 + ((Math.sin(i * 91.7) * 0.5 + 0.5) * 906) | 0, y = 8 + ((Math.sin(i * 37.3) * 0.5 + 0.5) * 522) | 0; ui.rect(x, y, 2, 2, i % 2 ? '#b2a98c' : '#c6be a2'.replace(' ', '')); }
  ui.rect(24, 8, 908, 40, '#7a2a22');
  T('统一阵线国 · 民防委员会', 40, 12, '#e8d8b0', 12);
  T('第 7 号避难所  人员登记表', 40, 28, '#e8d8b0', 12);
  T('表 MF-12　|　填表人：周建国　|　第 3 天', 916, 20, '#d8b890', 12, { align: 'right' });
  const keys = ['player', 'lin', 'zhou', 'ana', 'zhao', 'su', 'liu', 'stranger'];
  const info = {
    player: ['陈默', '29 · 男', '自称：工人', '证件：无', '#7a2a22'],
    lin: ['林秋', '31 · 女', '护士', '持药箱', '#3a3a3a'],
    zhou: ['周建国', '56 · 男', '区粮站副站长', '持仓库钥匙', '#3a3a3a'],
    ana: ['阿娜', '24 · 女', '歌手', '外地口音', '#3a3a3a'],
    zhao: ['赵铁军', '38 · 男', '矿工', '有前科？', '#7a2a22'],
    su: ['苏曼', '45 · 女', '中学教师', '', '#3a3a3a'],
    liu: ['刘小川', '26 · 男', '机修工', '', '#3a3a3a'],
    stranger: ['（不详）', '约 30 · 男', '伤兵', '身份不明', '#7a2a22'],
  };
  keys.forEach((k, i) => {
    const x = 44 + (i % 4) * 222, y = 60 + Math.floor(i / 4) * 236;
    // 照片 + 回形针
    ui.rect(x - 2, y - 2, 132, 164, '#2a2420');
    const cv = PP.portrait(k, 64, 80);
    ui.ctx.imageSmoothingEnabled = false; ui.ctx.drawImage(cv, x, y, 128, 160);
    ui.rect(x + 100, y - 8, 6, 22, '#8a9090'); ui.rect(x + 102, y - 6, 2, 18, '#bcc4c4');
    const [n, a, o, note, nc] = info[k];
    const fx = x + 136;
    T('编号', fx, y, '#5a5040', 12); T(`07-00${i + 1}`, fx, y + 14, '#2a2420', 12);
    T('姓名', fx, y + 36, '#5a5040', 12); T(n, fx, y + 50, '#2a2420', 12);
    T('年龄', fx, y + 72, '#5a5040', 12); T(a, fx, y + 86, '#2a2420', 12);
    T('出身', fx, y + 108, '#5a5040', 12); T(o, fx, y + 122, '#2a2420', 12);
    ui.rect(x, y + 168, 200, 1, '#8a8068');
    if (note) T(note, x, y + 174, nc, 12);
    ui.rect(x, y + 194, 200, 1, '#8a8068');
  });
  // 印章
  const stamp = (cx, cy, txt, col) => {
    ui.ctx.strokeStyle = col; ui.ctx.lineWidth = 2;
    ui.rect(cx - 40, cy - 14, 80, 2, col); ui.rect(cx - 40, cy + 12, 80, 2, col); ui.rect(cx - 40, cy - 14, 2, 28, col); ui.rect(cx + 38, cy - 14, 2, 28, col);
    T(txt, cx, cy - 7, col, 12, { align: 'center' });
  };
  stamp(860, 520, '已 登 记', '#a8302a');
  stamp(130, 210, '无 证 件', '#a8302a');
  stamp(820, 274, '待 核 实', '#a8302a');
  ui.blit(canvas, 2);
};
