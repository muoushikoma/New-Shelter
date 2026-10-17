// 样张：高精度 UI 头像与图标
window.sceneSheet = function (canvas) {
  const ui = new PX.UI(960, 540);
  ui.rect(0, 0, 960, 540, '#0e1014');
  const keys = ['player', 'lin', 'zhou', 'ana', 'zhao', 'su', 'liu', 'stranger'];
  const names = ['陈默 · 逃兵', '林秋 · 前护士', '周建国 · 前干部', '阿娜 · 歌手', '赵铁军 · 矿工', '苏曼 · 教师', '刘小川 · 机修工', '陌生伤兵'];
  keys.forEach((k, i) => {
    const x = 16 + (i % 4) * 236, y = 12 + Math.floor(i / 4) * 214;
    ui.rect(x, y, 100, 116, '#07080a'); ui.rect(x + 1, y + 1, 98, 114, '#3a3f45');
    HD.draw(ui, HD.portrait(k, 80, 96), x + 10, y + 10);
    HD.draw(ui, HD.portrait(k, 40, 40, { view: HD.HEAD_VIEW }), x + 110, y + 10);
    HD.draw(ui, HD.portrait(k, 28, 28, { view: HD.HEAD_VIEW }), x + 160, y + 10);
    ui.text(names[i], x, y + 122, '#d8d0c0', 12);
  });
  const icons = ['can', 'water', 'fuel', 'med', 'ammo', 'cig', 'candle', 'bandage', 'permit', 'photo'];
  icons.forEach((n, i) => { const x = 16 + i * 60; HD.draw(ui, HD.icon(n, 32), x, 460); HD.draw(ui, HD.icon(n, 14), x + 38, 478); });
  ui.blit(canvas, 2);
};
