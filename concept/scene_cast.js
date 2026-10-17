// 角色设定：平涂 + 墨线肖像
window.sceneCast = function (canvas) {
  const ui = new PX.UI(960, 540);
  ui.rect(0, 0, 960, 540, '#141012');
  ui.text('避难所 · 角色头像风格试验（平涂 + 墨线）', 24, 12, '#c8b8a0', 12);
  const keys = ['player', 'lin', 'zhou', 'ana', 'zhao', 'su', 'liu', 'stranger'];
  const names = ['陈默 · 29 · 逃兵', '林秋 · 31 · 前护士', '周建国 · 56 · 前干部', '阿娜 · 24 · 歌手', '赵铁军 · 38 · 矿工', '苏曼 · 45 · 教师', '刘小川 · 26 · 机修工', '陌生伤兵'];
  keys.forEach((k, i) => {
    const x = 24 + (i % 4) * 236, y = 40 + Math.floor(i / 4) * 248;
    ui.rect(x - 4, y - 4, 120, 148, '#060505'); ui.rect(x - 2, y - 2, 116, 144, '#4a3e36');
    LA.draw(ui, LA.portrait(k), x, y, 2);
    LA.draw(ui, LA.head(k), x + 126, y, 2);
    LA.draw(ui, LA.head(k), x + 126, y + 74, 1);
    ui.text(names[i], x, y + 150, '#d8c8b0', 12);
  });
  ui.blit(canvas, 2);
};
