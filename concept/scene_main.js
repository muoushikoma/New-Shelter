// 概念图 1：避难所侧剖面主界面（夜，第 17 天）
function sceneMain(canvas) {
  const H = PX.hex, P = ACT.person, C = ACT.CAST, sh = ACT.shade;
  const W = 480, HT = 270;
  const b = new PX.Buf(W, HT);
  const R = PX.rng(1717);

  const col = {
    sky: [H('#0b0d16'), H('#141826'), H('#231d2a'), H('#3a2228'), H('#5a2a22')],
    snow: H('#c9d1dc'), snowD: H('#8994a6'),
    earth: [H('#2a211c'), H('#231b17'), H('#1b1512')],
    conc: H('#5c5e5c'), concD: H('#3e403f'), concL: H('#77797a'), concDD: H('#2a2b2b'),
    wall: H('#4a4c48'), wallD: H('#3a3c39'), tile: H('#56594f'),
    floor: H('#2f2d2a'), rust: H('#6a3c24'), rustL: H('#8e5232'),
    wood: H('#6a4a30'), woodD: H('#4a3220'), woodL: H('#8a6440'),
    metal: H('#5a646c'), metalD: H('#39424a'), metalL: H('#8a96a0'),
    red: H('#8c2626'), redD: H('#5a1a1a'), cream: H('#cfc4a8'),
  };

  // ---------- 天空与地表 ----------
  b.vramp(0, 0, W, 62, col.sky);
  // 远方火光地平线
  for (let x = 0; x < W; x++) {
    const fire = Math.max(0, Math.sin(x * 0.021 + 1.2) * 0.5 + Math.sin(x * 0.067) * 0.3) * (x > 230 ? 1 : 0.35);
    const h = Math.round(fire * 8);
    for (let y = 0; y < h; y++) if (PX.bayer(x, 48 - y) < 1 - y / (h + 1)) b.set(x, 48 - y, H('#8a3a1e'));
  }
  // 星
  for (let i = 0; i < 40; i++) { const x = (R() * W) | 0, y = (R() * 26) | 0; b.set(x, y, H('#5a6280')); b.glow(x, y); }
  // 远景废墟剪影
  const ruinFar = H('#171620'), ruinNear = H('#100f15');
  let x = 0;
  while (x < W) {
    const w = 8 + ((R() * 22) | 0), h = 6 + ((R() * 18) | 0);
    b.rect(x, 52 - h, w, h + 4, ruinFar);
    // 断裂顶部
    for (let i = 0; i < w; i += 2) if (R() < 0.4) b.rect(x + i, 52 - h - 1 - ((R() * 3) | 0), 2, 3, ruinFar);
    // 燃烧的窗
    if (x > 200 && R() < 0.5) { const wx = x + 2 + ((R() * (w - 4)) | 0), wy = 52 - h + 2 + ((R() * (h - 4)) | 0); b.set(wx, wy, H('#e0802a')); b.glow(wx, wy); }
    x += w + ((R() * 6) | 0);
  }
  // 教堂尖顶 + 水塔
  b.rect(300, 22, 6, 32, ruinFar); for (let i = 0; i < 10; i++) b.hline(303 - (i >> 1), 12 + i, 1 + (i >> 1) * 2, ruinFar);
  b.rect(410, 26, 14, 8, ruinFar); b.vline(412, 34, 20, ruinFar); b.vline(421, 34, 20, ruinFar); b.line(412, 34, 421, 46, ruinFar);
  // 边境哨塔 + 探照灯
  b.rect(336, 20, 3, 40, ruinNear); b.rect(346, 20, 3, 40, ruinNear); b.rect(333, 16, 19, 6, ruinNear);
  b.line(336, 30, 349, 44, ruinNear); b.line(349, 30, 336, 44, ruinNear);
  b.rectGlow(340, 18, 3, 2, H('#f4f0d8'));
  // 近景：铁丝网围栏
  for (let px = 250; px < W; px += 14) { b.vline(px, 50, 12, H('#1e1c22')); }
  for (let px = 250; px < W; px++) { b.set(px, 52 + ((px >> 1) % 2), H('#2a2830')); b.set(px, 56 + (((px + 1) >> 1) % 2), H('#2a2830')); }
  // 警示牌
  b.rect(286, 50, 12, 7, H('#a89a6a')); b.rect(287, 51, 10, 5, H('#8c2626')); b.vline(292, 57, 5, H('#1e1c22'));
  // 枯树
  b.vline(150, 34, 28, ruinNear); b.line(150, 42, 141, 33, ruinNear); b.line(150, 46, 160, 38, ruinNear); b.line(145, 38, 143, 30, ruinNear);
  // 地面雪层
  for (let gx = 0; gx < W; gx++) {
    const top = 60 + Math.round(Math.sin(gx * 0.08) * 1.2 + Math.sin(gx * 0.31));
    b.vline(gx, top, 64 - top, col.snow);
    b.set(gx, top, H('#e4e8f0'));
    b.vline(gx, 64, 2, col.snowD);
  }
  // 弹坑
  b.ellipse(210, 63, 14, 3, H('#2a2428')); b.ellipse(210, 62, 11, 2, H('#1a1618'));
  // 入口掩体（混凝土块）
  b.rect(20, 46, 44, 18, col.conc); b.rect(20, 46, 44, 2, col.concL); b.rect(56, 48, 8, 16, col.concD);
  b.rect(16, 44, 52, 3, col.concL); b.hline(16, 44, 52, H('#e4e8f0')); b.hline(16, 43, 50, col.snow);
  b.rect(30, 52, 16, 12, col.concDD); b.rect(31, 53, 14, 11, H('#1a1612')); // 门洞
  b.rect(32, 54, 12, 10, col.rust); b.rect(33, 55, 4, 8, col.rustL); b.vline(38, 54, 10, col.redD);
  b.rect(36, 47, 9, 4, col.cream); b.rect(37, 48, 7, 2, col.red); // 民防标志
  // 积雪
  b.hline(20, 45, 44, col.snow);

  // ---------- 地下：土层 ----------
  for (let y = 66; y < 270; y++) for (let x0 = 0; x0 < W; x0++) {
    const n = Math.sin(x0 * 0.13 + y * 0.31) + Math.sin(x0 * 0.041 - y * 0.12) * 1.5;
    b.set(x0, y, n > 1 ? col.earth[0] : n > -0.8 ? col.earth[1] : col.earth[2]);
  }
  for (let i = 0; i < 160; i++) { const sx = (R() * W) | 0, sy = 66 + ((R() * 200) | 0); b.rect(sx, sy, 2, 1, H('#3a2e26')); b.set(sx, sy + 1, H('#14100e')); }
  // 管道
  b.rect(0, 70, 360, 2, col.metalD); b.hline(0, 70, 360, col.metal);
  for (let px = 10; px < 360; px += 40) b.rect(px, 69, 3, 4, col.rust);

  // ---------- 房间结构 ----------
  const FL = [
    { y: 78, h: 42 },
    { y: 128, h: 42 },
    { y: 178, h: 44 },
  ];
  // 外壳混凝土
  b.rect(4, 72, 352, 156, col.concD);
  for (let y = 72; y < 228; y += 6) b.hline(4, y, 352, sh(col.concD, 0.88));
  const rooms = [];
  function room(x0, fl, w, opt = {}) {
    const F = FL[fl];
    const r = { x: x0, y: F.y, w, h: F.h, ...opt };
    rooms.push(r);
    // 墙面
    b.rect(x0, F.y, w, F.h, opt.wall || col.wall);
    // 瓷砖 / 板缝
    for (let yy = F.y + 4; yy < F.y + F.h - 10; yy += 7) b.hline(x0, yy, w, opt.wallD || col.wallD);
    for (let yy = F.y; yy < F.y + F.h; yy += 7) for (let xx = x0 + ((yy / 7) % 2 ? 4 : 0); xx < x0 + w; xx += 9) b.vline(xx, yy, 4, opt.wallD || col.wallD);
    // 墙裙
    b.rect(x0, F.y + F.h - 12, w, 10, opt.dado || H('#3b4a44'));
    b.hline(x0, F.y + F.h - 12, w, sh(opt.dado || H('#3b4a44'), 1.3));
    // 污渍与霉斑
    for (let k = 0; k < w / 6; k++) { const sx = x0 + ((R() * w) | 0), sy = F.y + ((R() * (F.h - 4)) | 0); b.dither(sx, sy, 3 + ((R() * 6) | 0), 2 + ((R() * 6) | 0), H('#2e302c'), 0.3); }
    // 水渍（顶部往下）
    for (let k = 0; k < 3; k++) { const sx = x0 + ((R() * w) | 0); b.dither(sx, F.y, 2, 6 + ((R() * 14) | 0), H('#363a38'), 0.45); }
    // 地板
    b.rect(x0, F.y + F.h - 2, w, 2, col.floor);
    b.hline(x0, F.y + F.h - 2, w, H('#46423c'));
    // 天花板阴影
    b.dither(x0, F.y, w, 3, H('#202220'), 0.6);
    return r;
  }
  // 楼板
  for (const F of FL) { b.rect(4, F.y + F.h, 352, 6, col.conc); b.hline(4, F.y + F.h, 352, col.concL); b.hline(4, F.y + F.h + 5, 352, col.concDD); for (let px = 8; px < 352; px += 11) b.set(px, F.y + F.h + 3, col.rust); }
  b.rect(4, 72, 352, 6, col.conc); b.hline(4, 77, 352, col.concDD);

  const rEntr = room(8, 0, 62, { wall: H('#4b4a46') });
  const rStor = room(72, 0, 90);
  const rKit = room(164, 0, 100, { dado: H('#4a3a2c') });
  const rVent = room(266, 0, 86);
  const rDorm = room(8, 1, 122, { dado: H('#3a3f4a') });
  const rGen = room(132, 1, 82, { wall: H('#45463f') });
  const rInf = room(216, 1, 80, { wall: H('#5a5f5c'), dado: H('#6a7470') });
  const rWc = room(298, 1, 54);
  const rArch = room(8, 2, 74, { wall: H('#3e3c38') });
  const rHid = room(84, 2, 70, { wall: H('#3a3530'), dado: H('#3a3530') });
  // 坍塌区：没有完整房间
  b.rect(156, 178, 196, 44, H('#1e1a17'));
  // 隔墙
  for (const r of rooms) { b.rect(r.x - 2, r.y, 2, r.h, col.conc); b.vline(r.x - 2, r.y, r.h, col.concL); }
  b.rect(352, 78, 4, 144, col.conc);

  // ---------- 入口 / 气闸 ----------
  {
    const y0 = rEntr.y, fy = y0 + rEntr.h - 2;
    // 竖井梯子通向地表
    b.rect(34, 64, 10, 14, H('#1a1612'));
    for (let ly = 64; ly < fy; ly += 3) b.hline(35, ly, 8, col.metal);
    b.vline(35, 64, fy - 64, col.metalD); b.vline(42, 64, fy - 64, col.metalD);
    // 防爆门
    b.rect(10, y0 + 8, 18, 32, col.metalD); b.rect(11, y0 + 9, 16, 30, col.metal);
    b.ellipse(19, y0 + 22, 5, 5, col.metalD); b.ellipse(19, y0 + 22, 3, 3, col.metal);
    b.hline(14, y0 + 22, 11, col.rustL); b.vline(19, y0 + 17, 11, col.rustL);
    for (let k = 0; k < 6; k++) { b.set(12, y0 + 11 + k * 5, col.metalL); b.set(25, y0 + 11 + k * 5, col.metalL); }
    // 黄黑警示条
    for (let i = 0; i < 18; i++) b.set(10 + i, y0 + 41, (i >> 1) % 2 ? H('#c8a020') : H('#1a1a1a'));
    // 衣钩上的外套、防毒面具
    b.hline(48, y0 + 12, 18, col.woodD);
    b.rect(50, y0 + 13, 5, 12, H('#4e5639')); b.rect(58, y0 + 13, 5, 10, H('#5b4631'));
    b.ellipse(65, y0 + 16, 2, 2, H('#2a2e2a'));
    // 红色应急灯
    b.rectGlow(54, y0 + 3, 4, 2, H('#ff3a2a'));
    // 沙袋
    for (let i = 0; i < 3; i++) b.ellipse(52 + i * 6, fy - 2, 3, 2, H('#7a6a4a'));
  }

  // ---------- 仓库 ----------
  {
    const y0 = rStor.y, fy = y0 + rStor.h - 2;
    // 铁丝笼
    b.rect(76, y0 + 6, 52, fy - y0 - 6, H('#2b2d2c'));
    for (let sx = 76; sx < 128; sx += 3) b.vline(sx, y0 + 6, fy - y0 - 6, H('#5a5f60'));
    for (let sy = y0 + 6; sy < fy; sy += 3) b.hline(76, sy, 52, H('#4a4f50'));
    // 货架与罐头（大半空了）
    for (const sy of [y0 + 13, y0 + 23, y0 + 33]) {
      b.rect(78, sy, 46, 2, col.woodD); b.hline(78, sy, 46, col.wood);
    }
    const cans = [[80, 13, 4], [92, 13, 2], [80, 23, 1], [104, 23, 3], [86, 33, 2], [112, 33, 1]];
    for (const [cx0, cy0, n] of cans) for (let i = 0; i < n; i++) {
      b.rect(cx0 + i * 4, y0 + cy0 - 4, 3, 4, H('#8a8a80')); b.hline(cx0 + i * 4, y0 + cy0 - 3, 3, H('#9a3a2a')); b.set(cx0 + i * 4, y0 + cy0 - 4, H('#c4c4b8'));
    }
    // 空位上的灰尘印
    b.hline(96, y0 + 22, 6, H('#3a3630'));
    // 大锁（门开着！）
    b.rect(127, y0 + 18, 2, 18, H('#3a3c3c'));
    b.rect(131, y0 + 24, 4, 4, H('#a08a40')); b.set(132, y0 + 23, H('#c8b060')); b.set(133, y0 + 22, H('#c8b060'));
    // 岗哨：空箱子 + 靠着的步枪 + 煤油灯
    b.rect(140, fy - 7, 12, 7, col.wood); b.hline(140, fy - 7, 12, col.woodL); b.line(140, fy - 7, 151, fy - 1, col.woodD);
    b.line(155, fy - 1, 158, fy - 18, H('#2a2420')); b.line(156, fy - 1, 159, fy - 18, H('#4a3a28'));
    b.rect(144, fy - 11, 3, 4, H('#5a5040')); b.rectGlow(145, fy - 10, 1, 2, H('#ffcc66'));
    // 标签
    b.rect(90, y0 + 3, 20, 3, col.cream); b.hline(91, y0 + 4, 18, col.redD);
  }

  // ---------- 厨房 / 公共区 ----------
  {
    const y0 = rKit.y, fy = y0 + rKit.h - 2;
    // 领袖画像（褪色）+ 标语
    b.rect(196, y0 + 5, 14, 17, col.woodD); b.rect(197, y0 + 6, 12, 15, H('#8a7a5a'));
    b.ellipse(203, y0 + 11, 3, 3, H('#5a4a38')); b.rect(199, y0 + 15, 9, 6, H('#4a3a30'));
    b.dither(197, y0 + 6, 12, 15, H('#6a5a44'), 0.25);
    b.line(197, y0 + 6, 208, y0 + 20, H('#3a2e24')); // 被划了一道
    b.rect(214, y0 + 7, 44, 6, col.redD); b.rect(215, y0 + 8, 42, 4, col.red);
    for (let i = 0; i < 6; i++) b.rect(218 + i * 7, y0 + 9, 4, 2, H('#d8c8a0'));
    // 灶台、锅
    b.rect(168, fy - 14, 20, 14, H('#4a4a48')); b.hline(168, fy - 14, 20, H('#6a6a66'));
    b.rect(171, fy - 18, 8, 4, H('#2a2a2c')); b.hline(170, fy - 18, 10, H('#5a5a5c'));
    b.rect(172, fy - 6, 6, 3, H('#1a1a1a')); b.rectGlow(173, fy - 5, 4, 1, H('#d0501a'));
    b.vline(168, y0, fy - 14 - y0, H('#3a3a3a')); // 烟道
    // 桌子
    b.rect(208, fy - 11, 40, 2, col.wood); b.hline(208, fy - 11, 40, col.woodL);
    b.vline(210, fy - 9, 9, col.woodD); b.vline(245, fy - 9, 9, col.woodD);
    // 桌上：账本、搪瓷杯、半截蜡烛
    b.rect(222, fy - 13, 8, 2, col.cream); b.hline(222, fy - 13, 8, H('#e8e0c8')); b.set(225, fy - 13, H('#2a2a4a'));
    b.rect(236, fy - 14, 3, 3, H('#d8dcd8')); b.set(236, fy - 14, H('#3a5a8a'));
    // 凳子
    b.rect(212, fy - 6, 6, 1, col.wood); b.vline(213, fy - 5, 5, col.woodD); b.vline(216, fy - 5, 5, col.woodD);
    // 吊灯
    b.vline(228, y0, 10, H('#1a1a1a'));
    b.rect(225, y0 + 10, 7, 2, H('#3a3a38'));
    b.rectGlow(227, y0 + 12, 3, 2, H('#ffe0a0'));
  }

  // ---------- 通风 / 水房 ----------
  {
    const y0 = rVent.y, fy = y0 + rVent.h - 2;
    // 手摇通风机
    b.rect(276, y0 + 10, 16, 16, col.metalD); b.ellipse(284, y0 + 18, 6, 6, col.metal); b.ellipse(284, y0 + 18, 2, 2, col.metalD);
    for (let a = 0; a < 4; a++) { const ang = a * Math.PI / 2 + 0.4; b.line(284, y0 + 18, 284 + Math.round(Math.cos(ang) * 5), y0 + 18 + Math.round(Math.sin(ang) * 5), col.metalD); }
    b.rect(282, y0, 4, 10, col.metalD); // 通风管
    b.rect(292, y0 + 17, 6, 2, col.metal); b.rect(297, y0 + 17, 2, 6, col.rustL);
    // 水罐
    b.rect(318, y0 + 10, 26, 28, H('#4a5a60')); b.rect(318, y0 + 10, 26, 2, H('#6a7a80')); b.rect(340, y0 + 12, 4, 26, H('#34424a'));
    b.rect(321, y0 + 26, 20, 11, H('#3a4a50')); b.hline(321, y0 + 26, 20, H('#5a8aa0')); // 水位线（约 1/3）
    for (let k = 0; k < 5; k++) b.hline(344, y0 + 14 + k * 5, 2, col.cream);
    b.rect(326, fy - 2, 2, 2, H('#2a3a40')); b.set(327, fy - 4, H('#7ab0c8')); // 滴水
    // 煤油灯（玩家旁）
    b.rect(306, fy - 5, 3, 5, H('#5a5040')); b.rectGlow(307, fy - 4, 1, 2, H('#ffcc66'));
    // CO2 表
    b.rect(300, y0 + 8, 8, 8, H('#cfc4a8')); b.ellipse(304, y0 + 12, 3, 3, H('#e8e0c8')); b.line(304, y0 + 12, 306, y0 + 10, H('#a02020'));
  }

  // ---------- 宿舍 ----------
  {
    const y0 = rDorm.y, fy = y0 + rDorm.h - 2;
    const bunk = (bx) => {
      b.vline(bx, y0 + 10, fy - y0 - 10, col.metalD); b.vline(bx + 24, y0 + 10, fy - y0 - 10, col.metalD);
      b.rect(bx, y0 + 20, 25, 2, col.metal); b.rect(bx, fy - 6, 25, 2, col.metal);
      b.rect(bx + 1, y0 + 18, 23, 2, H('#6a6858')); b.rect(bx + 1, fy - 8, 23, 2, H('#6a6858'));
    };
    bunk(12); bunk(42); bunk(72);
    // 苏曼睡在下铺
    P(b, 15, fy - 8, { ...C.su, blanket: H('#5a4a6a') }, 'lie', 1);
    // 另一个下铺空着：皱成一团的毯子
    b.rect(46, fy - 10, 10, 2, H('#56604e')); b.rect(48, fy - 11, 5, 1, H('#6a7460'));
    // 上铺：被子
    b.rect(74, y0 + 15, 14, 3, H('#4a5a6a'));
    // 第三个铺挂着帘子
    b.rect(70, y0 + 8, 30, 1, H('#2a2a2a'));
    for (let cx0 = 70; cx0 < 100; cx0++) { const fold = (cx0 % 4 < 2); b.vline(cx0, y0 + 9, fy - y0 - 10, fold ? H('#7a5a4a') : H('#6a4a3c')); }
    b.dither(70, fy - 6, 30, 5, H('#4a3428'), 0.5);
    // 床头的私人物品：照片、十字架
    b.rect(104, y0 + 16, 6, 5, col.cream); b.rect(105, y0 + 17, 4, 3, H('#5a5050'));
    b.vline(118, y0 + 12, 6, H('#a08a40')); b.hline(116, y0 + 14, 5, H('#a08a40'));
    // 蜡烛
    b.rect(112, fy - 4, 2, 4, H('#e8e0c8')); b.rectGlow(112, fy - 6, 2, 2, H('#ffcc66'));
  }

  // ---------- 发电机房 ----------
  {
    const y0 = rGen.y, fy = y0 + rGen.h - 2;
    b.rect(146, fy - 20, 40, 20, H('#5a3a2a')); b.rect(146, fy - 20, 40, 2, H('#7a5236'));
    b.rect(150, fy - 26, 20, 6, H('#4a4440')); b.rect(172, fy - 24, 10, 4, H('#3a3430'));
    for (let k = 0; k < 6; k++) b.vline(152 + k * 3, fy - 17, 12, H('#3a2a20'));
    b.rect(176, fy - 16, 8, 8, H('#cfc4a8')); b.ellipse(180, fy - 12, 3, 3, H('#e8e0c8')); b.line(180, fy - 12, 178, fy - 14, H('#a02020'));
    b.rectGlow(148, fy - 6, 2, 2, H('#ff5a1a')); b.rectGlow(152, fy - 6, 2, 2, H('#40ff60'));
    // 排气管
    b.rect(160, y0, 4, fy - 26 - y0, H('#3a3430'));
    // 油桶
    for (const ox of [192, 201]) { b.rect(ox, fy - 12, 8, 12, H('#3a5a3a')); b.hline(ox, fy - 9, 8, H('#2a4a2a')); b.hline(ox, fy - 4, 8, H('#2a4a2a')); b.hline(ox, fy - 12, 8, H('#5a7a5a')); }
    b.ellipse(204, fy - 1, 5, 1, H('#1a1a22'));
    // 火花
    b.rectGlow(141, fy - 15, 1, 1, H('#ffee80')); b.rectGlow(139, fy - 17, 1, 1, H('#ffcc40')); b.rectGlow(143, fy - 18, 1, 1, H('#fff4c0'));
    // 线缆
    for (let k = 0; k < 30; k++) b.set(186 + k, y0 + 4 + Math.round(Math.sin(k / 4) * 1.5), H('#1a1a1a'));
  }

  // ---------- 医务室 ----------
  {
    const y0 = rInf.y, fy = y0 + rInf.h - 2;
    // 红十字
    b.rect(230, y0 + 6, 10, 10, H('#d8d8d0')); b.rect(234, y0 + 7, 2, 8, H('#b02a2a')); b.rect(231, y0 + 10, 8, 2, H('#b02a2a'));
    // 病床
    b.rect(246, fy - 9, 34, 2, col.metal); b.vline(247, fy - 7, 7, col.metalD); b.vline(278, fy - 7, 7, col.metalD);
    b.rect(246, fy - 11, 34, 2, H('#d8d4c8'));
    b.vline(246, fy - 15, 6, col.metal);
    P(b, 251, fy - 11, { ...C.stranger, blanket: H('#8a8678') }, 'lie', 1);
    // 吊瓶
    b.vline(286, y0 + 6, fy - y0 - 6, col.metalD); b.hline(283, y0 + 6, 6, col.metalD);
    b.rect(284, y0 + 7, 3, 6, H('#a8c8d0')); b.line(285, y0 + 13, 268, fy - 13, H('#8aa0a8'));
    // 药柜（几乎空）
    b.rect(220, y0 + 20, 14, 18, H('#c8ccc4')); b.rect(221, y0 + 21, 12, 16, H('#7a8480'));
    b.hline(221, y0 + 28, 12, H('#c8ccc4'));
    b.rect(223, y0 + 25, 2, 3, H('#d8a040')); b.rect(227, y0 + 33, 2, 4, H('#e8e8e0'));
    // 日光灯管
    b.rectGlow(250, y0 + 2, 20, 1, H('#e8f4ff')); b.hline(249, y0 + 1, 22, H('#3a3a3a'));
  }

  // ---------- 厕所 ----------
  {
    const y0 = rWc.y, fy = y0 + rWc.h - 2;
    b.rect(310, fy - 8, 10, 8, H('#5a5a50')); b.hline(309, fy - 8, 12, H('#7a7a70')); b.hline(311, fy - 9, 8, H('#3a3a30'));
    b.rect(330, y0 + 4, 1, fy - y0 - 4, H('#3a3a3a'));
    for (let cx0 = 326; cx0 < 350; cx0++) b.vline(cx0, y0 + 5, 26, cx0 % 3 ? H('#5a6a6a') : H('#4a5a5a'));
    b.dither(300, fy - 3, 50, 3, H('#3a3a28'), 0.4);
  }

  // ---------- 档案室（锁着） ----------
  {
    const y0 = rArch.y, fy = y0 + rArch.h - 2;
    for (let k = 0; k < 4; k++) { b.rect(12 + k * 17, y0 + 8, 14, fy - y0 - 8, H('#4a4e4a')); for (let d = 0; d < 4; d++) { b.hline(13 + k * 17, y0 + 12 + d * 8, 12, H('#2a2e2a')); b.rect(17 + k * 17, y0 + 14 + d * 8, 4, 1, H('#8a8a80')); } }
    // 封条
    b.line(10, y0 + 6, 80, fy - 4, H('#d8ccb0')); b.line(10, y0 + 7, 80, fy - 3, H('#d8ccb0'));
    b.ellipse(45, y0 + 23, 4, 4, H('#9a2020'));
  }

  // ---------- 隐蔽小间 ----------
  {
    const y0 = rHid.y, fy = y0 + rHid.h - 2;
    // 床垫
    b.rect(98, fy - 4, 34, 4, H('#6a5a48')); b.hline(98, fy - 4, 34, H('#8a7a60'));
    b.rect(126, fy - 7, 7, 3, H('#5a4a50'));
    // 酒瓶
    b.rect(140, fy - 6, 2, 6, H('#3a5a3a')); b.set(140, fy - 7, H('#3a5a3a'));
    // 蜡烛
    b.rect(145, fy - 3, 2, 3, H('#e8e0c8')); b.rectGlow(145, fy - 5, 2, 2, H('#ffb050'));
    // 两个人影坐得很近
    ACT.silhouette(b, 112, fy - 3, H('#151214'), 'sit', 1, true);
    ACT.silhouette(b, 119, fy - 3, H('#151214'), 'sit', -1, false);
    // 堆在门口挡住视线的木箱
    b.rect(86, fy - 16, 10, 16, col.woodD); b.line(86, fy - 16, 95, fy - 1, H('#3a2818'));
  }

  // ---------- 坍塌区 ----------
  {
    const y0 = 178, fy = 220;
    for (let i = 0; i < 70; i++) {
      const rx = 158 + ((R() * 190) | 0), ry = fy - ((R() * R() * 30) | 0);
      const w = 3 + ((R() * 9) | 0), h = 2 + ((R() * 5) | 0);
      b.rect(rx, ry - h, w, h, R() < 0.5 ? col.concD : col.conc);
      b.hline(rx, ry - h, w, col.concL);
    }
    for (let i = 0; i < 8; i++) { const rx = 170 + i * 22; b.line(rx, y0, rx + 6 - ((R() * 12) | 0), y0 + 14 + ((R() * 14) | 0), col.rust); }
    b.ellipse(300, fy, 22, 2, H('#1a2a34'));
    b.hline(290, fy - 1, 14, H('#2a4a5a'));
    // 裂缝里漏下的雪光
    b.dither(240, 178, 4, 30, H('#8a94a6'), 0.2);
  }

  // ---------- 人物 ----------
  // 厨房：老周独自坐在桌边写东西
  P(b, 230, rKit.y + rKit.h - 2, C.zhou, 'sit', -1);
  // 通风房：玩家在摇通风机
  P(b, 300, rVent.y + rVent.h - 2, C.player, 'work', -1);
  // 发电机：小刘在修理
  P(b, 139, rGen.y + rGen.h - 2, C.liu, 'crouch', 1);
  // 医务室：林秋
  P(b, 240, rInf.y + rInf.h - 2, C.lin, 'stand', 1);

  // ---------- 光照 ----------
  b.clearLight(0.2);
  // 地表：天光 + 火光
  for (let y = 0; y < 66; y++) for (let x0 = 0; x0 < W; x0++) { const i = y * W + x0; b.light[i] = 0.55; b.lb[i] = 0.25; b.lg[i] = 0.12; b.lr[i] = 0.18; }
  b.addLight(400, 50, 120, H('#ff6a2a'), 0.55);
  b.addLight(342, 19, 240, H('#e8f0ff'), 1.2, [0, 0, W, 66], [Math.PI * 0.9, 0.05]); // 探照灯光柱
  b.addLight(38, 60, 30, H('#8090b0'), 0.3);
  // 地下
  const clipR = (r) => [r.x, r.y, r.w, r.h];
  b.addLight(56, rEntr.y + 4, 44, H('#ff2a1a'), 1.0, clipR(rEntr));
  b.addLight(145, rStor.y + 30, 34, H('#ffb050'), 1.0, clipR(rStor));
  b.addLight(228, rKit.y + 14, 60, H('#ffd08a'), 1.35, clipR(rKit));
  b.addLight(175, rKit.y + 37, 20, H('#ff6020'), 0.8, clipR(rKit));
  b.addLight(307, rVent.y + 36, 34, H('#ffb050'), 1.0, clipR(rVent));
  b.addLight(113, rDorm.y + 34, 70, H('#ffb860'), 1.0, clipR(rDorm));
  b.addLight(30, rDorm.y + 20, 40, H('#7080a0'), 0.45, clipR(rDorm));
  b.addLight(160, rGen.y + 30, 56, H('#ff6a2a'), 1.1, clipR(rGen));
  b.addLight(141, rGen.y + 24, 14, H('#fff0a0'), 0.9, clipR(rGen));
  b.addLight(260, rInf.y + 4, 62, H('#c8e0ff'), 1.25, clipR(rInf));
  b.addLight(146, rHid.y + 38, 34, H('#ff9a40'), 0.95, clipR(rHid));
  b.addLight(242, 180, 30, H('#8a9ab8'), 0.35);

  const ctx = PX.present(b, canvas, 4, { levels: 8, tint: [0.5, 0.58, 0.85] });

  // ---------- UI（960×540，2× 放大） ----------
  const ui = new PX.UI(960, 540);
  const T = (s, x, y, c, sz, o) => ui.text(s, x, y, c, sz, o);
  const ICON = {
    food: ['.oooo.', 'o#@@#o', 'o@##@o', 'o#@@#o', 'o####o', '.oooo.'],
    water: ['..o...', '.o@o..', 'o@@@o.', 'o@#@o.', '.o@o..', '......'],
    fuel: ['oooo..', 'o@@ooo', 'o@@@@o', 'o@#@@o', 'o@@@@o', 'oooooo'],
    med: ['.oooo.', 'o@##@o', 'o####o', 'o@##@o', '.oooo.', '......'],
    ammo: ['.o.o.o', 'o@o@o@', 'o@o@o@', 'o@o@o@', 'o#o#o#', 'oooooo'],
    cig: ['......', '......', 'oooooo', '@@@@#o', 'oooooo', '......'],
  };
  const iconPal = (c1, c2) => ({ o: '#0a0a0a', '@': c1, '#': c2 });

  // 顶部栏
  ui.panel(0, 0, 960, 30, { rivets: false, base: 'rgba(12,13,16,0.94)', rim: '#2c2f33' });
  T('第 17 天', 12, 8, '#e8dcc0', 12);
  T('03:40  深夜', 74, 8, '#9aa4b0', 12);
  ui.rect(160, 6, 1, 18, '#3a3e44');
  T('室温', 170, 8, '#7a828c', 12); T('-4°C', 200, 8, '#8ac0e8', 12);
  T('地表', 240, 8, '#7a828c', 12); T('-21°C', 270, 8, '#6a9ad8', 12);
  ui.rect(318, 6, 1, 18, '#3a3e44');
  const res = [
    ['food', '#c8a060', '#8a6a30', '食物', '41', '#e8dcc0'],
    ['water', '#7ab0d8', '#3a6a90', '水', '96L', '#e8dcc0'],
    ['fuel', '#8aa060', '#4a6030', '燃料', '18L', '#e8a060'],
    ['med', '#e8e8e0', '#b02a2a', '药品', '3', '#e85a4a'],
    ['ammo', '#c8a040', '#7a5a20', '弹药', '7', '#e8dcc0'],
    ['cig', '#e8e0d0', '#c86a30', '香烟', '23', '#e8dcc0'],
  ];
  let rx = 328;
  for (const [ic, c1, c2, label, v, vc] of res) {
    ui.icon(rx, 9, ICON[ic], iconPal(c1, c2), 2);
    T(label, rx + 16, 8, '#7a828c', 12);
    const lw = ui.measure(label);
    T(v, rx + 20 + lw, 8, vc, 12);
    rx += 24 + lw + ui.measure(v) + 4;
  }
  ui.rect(rx, 6, 1, 18, '#3a3e44');
  T('电力', rx + 10, 8, '#7a828c', 12); ui.bar(rx + 40, 11, 50, 8, 0.62, '#d8a040');
  // 战争阶段
  ui.rect(836, 4, 120, 22, '#3a1414'); ui.rect(837, 5, 118, 20, '#5a1c1a');
  T('◆ 阶段二 · 炮火', 844, 8, '#f0c8a0', 12);

  // 广播滚动条
  ui.rect(0, 30, 712, 16, 'rgba(8,8,10,0.75)');
  ui.rect(6, 34, 8, 8, '#a02020'); ui.rect(8, 36, 4, 4, '#ff5040');
  T('广播 · 阵线之声：「……全体公民有义务检举逃兵与动摇分子。坚守岗位者，领袖铭记……」', 20, 32, '#c8b890', 12);

  // NPC 头顶气泡（UI 坐标 = 场景坐标 × 2）
  const bubble = (sx, sy, txt, fg = '#e8dcc0', bg = '#1a1c20', bd = '#8a8070') => {
    const w = ui.measure(txt) + 10, x0 = sx * 2 - (w >> 1), y0 = sy * 2 - 22;
    ui.rect(x0 - 1, y0 - 1, w + 2, 18, '#050505');
    ui.rect(x0, y0, w, 16, bd); ui.rect(x0 + 1, y0 + 1, w - 2, 14, bg);
    ui.rect(sx * 2 - 2, y0 + 16, 5, 2, bd); ui.rect(sx * 2 - 1, y0 + 18, 3, 2, bd); ui.rect(sx * 2, y0 + 20, 1, 1, bd);
    T(txt, x0 + 5, y0 + 1, fg, 12);
  };
  bubble(230, rKit.y + 22, '✎ 记录中', '#e8dcc0');
  bubble(139, rGen.y + 24, '⚙ 修理 63%', '#e8c880');
  bubble(240, rInf.y + 18, '……', '#c8d8e8');
  bubble(116, rHid.y + 25, '？', '#ff9ab0', '#2a1418', '#9a4a5a');
  bubble(146, rStor.y + 20, '! 无人看守', '#ff7a5a', '#2a1210', '#9a3a2a');
  bubble(22, rDorm.y + 32, 'z z', '#8a9ab0');
  // 玩家标记
  const pmx = 300 * 2, pmy = (rVent.y + rVent.h - 24) * 2;
  ui.rect(pmx - 5, pmy - 14, 11, 2, '#f0d040'); ui.rect(pmx - 3, pmy - 12, 7, 2, '#f0d040'); ui.rect(pmx - 1, pmy - 10, 3, 2, '#f0d040');
  T('你', pmx + 8, pmy - 18, '#f0d040', 12, { shadow: '#000' });

  // 房间标签
  const label = (r, txt, c = '#8a9098') => { ui.rect(r.x * 2 + 2, r.y * 2 + 2, ui.measure(txt) + 8, 15, 'rgba(0,0,0,0.55)'); T(txt, r.x * 2 + 6, r.y * 2 + 3, c, 12); };
  label(rEntr, '气闸'); label(rStor, '仓库 · 锁已打开', '#d89a6a'); label(rKit, '公共区'); label(rVent, '通风 / 水房');
  label(rDorm, '宿舍'); label(rGen, '发电机'); label(rInf, '医务室'); label(rWc, '厕所');
  label(rArch, '档案室 · 封存', '#b05a5a'); label(rHid, '隐蔽小间', '#c89aa8');
  ui.rect(160 * 2 + 4, 182 * 2, 110, 15, 'rgba(0,0,0,0.55)'); T('坍塌区 · 未探索', 160 * 2 + 8, 182 * 2 + 1, '#6a7078', 12);

  // ---------- 右侧人物面板 ----------
  const px0 = 716, py0 = 34, pw = 240, ph = 434;
  ui.panel(px0, py0, pw, ph, { title: '人物 · 林秋', titleBg: '#2a1d1a' });
  // 半身像
  const pb = new PX.Buf(40, 48);
  ACT.portrait(pb, 0, 0, C.lin);
  pb.emit.fill(1);
  ui.rect(px0 + 9, py0 + 21, 84, 100, '#07080a'); ui.rect(px0 + 10, py0 + 22, 82, 98, '#3a3f45');
  ui.blitImage(pb, px0 + 11, py0 + 23, 2);
  T('31 岁 · 女', px0 + 102, py0 + 24, '#c8c0b0', 12);
  T('出身：前护士', px0 + 102, py0 + 42, '#c8c0b0', 12);
  T('对政权：犬儒', px0 + 102, py0 + 60, '#a0a8b0', 12);
  // 特质标签
  const tag = (x0, y0, s, c, bg) => { const w = ui.measure(s) + 8; ui.rect(x0, y0, w, 15, bg); T(s, x0 + 4, y0 + 1, c, 12); return w + 4; };
  let tx = px0 + 102;
  tx += tag(tx, py0 + 80, '温柔', '#d8e8c8', '#2a3a24');
  tx += tag(tx, py0 + 80, '失眠', '#c8c8e8', '#26263a');
  tx = px0 + 102;
  tx += tag(tx, py0 + 99, '秘密 ×2', '#e8c8c8', '#3a2222');
  // 需求条
  let by = py0 + 132;
  const needs = [
    ['饥饿', 0.71, '#c8823a'], ['口渴', 0.38, '#5a9ad0'], ['体温', 0.44, '#7ab0e0'],
    ['疲劳', 0.83, '#8a7ac0'], ['压力', 0.66, '#c04a4a'], ['欲望', 0.35, '#c05a9a'],
  ];
  for (const [n, v, c] of needs) { T(n, px0 + 12, by - 2, '#9aa0a8', 12); ui.bar(px0 + 50, by, 178, 10, v, c); by += 16; }
  // 当前行为
  by += 4;
  ui.rect(px0 + 8, by, pw - 16, 1, '#3a3e44'); by += 6;
  T('正在：照看陌生伤兵', px0 + 12, by, '#e8dcc0', 12); by += 18;
  T('意图：（看不清）', px0 + 12, by, '#7a8088', 12); by += 20;
  // 内心
  ui.rect(px0 + 8, by, pw - 16, 52, '#14100e'); ui.rect(px0 + 8, by, 2, 52, '#8a5a3a');
  ui.para('“药只剩三支了。周建国昨天来要了一支，说是给他的心脏……他看我的眼神不对。”', px0 + 16, by + 4, pw - 30, '#d8c8a8', 12, 15);
  by += 58;
  // 对你的看法
  T('她对你', px0 + 12, by, '#9aa0a8', 12); by += 18;
  const rel = [['信任', 62, '#5a8ac8'], ['好感', 48, '#6ab06a'], ['畏惧', 10, '#8a6ac0'], ['欲望', '?', '#c05a9a']];
  let rlx = px0 + 12;
  for (const [n, v, c] of rel) { ui.rect(rlx, by + 3, 6, 6, c); T(`${n} ${v}`, rlx + 9, by, '#c8c0b0', 12); rlx += 56; }
  by += 24;
  // 动作按钮
  const btn = (x0, y0, w, s, hot) => { ui.rect(x0, y0, w, 20, '#07080a'); ui.rect(x0 + 1, y0 + 1, w - 2, 18, hot ? '#5a3a24' : '#2c3036'); ui.rect(x0 + 1, y0 + 1, w - 2, 1, 'rgba(255,255,255,0.12)'); T(s, x0 + (w >> 1), y0 + 3, hot ? '#f0d8b0' : '#c8ccd0', 12, { align: 'center' }); };
  btn(px0 + 10, by, 70, '交谈', true); btn(px0 + 84, by, 70, '交易'); btn(px0 + 158, by, 72, '观察');
  by += 24;
  btn(px0 + 10, by, 70, '示好'); btn(px0 + 84, by, 70, '要求'); btn(px0 + 158, by, 72, '更多…');

  // ---------- 底部：人员与日志 ----------
  const bx0 = 0, by0 = 472;
  ui.panel(bx0, by0, 712, 68, { rivets: false, base: 'rgba(12,13,16,0.94)' });
  // 人员头像条
  const roster = [['player', '你'], ['lin', '林秋'], ['zhou', '周'], ['ana', '阿娜'], ['zhao', '赵'], ['su', '苏曼'], ['liu', '小刘'], ['stranger', '伤兵']];
  let rxx = 8;
  for (const [k, n] of roster) {
    const mb = new PX.Buf(40, 48); ACT.portrait(mb, 0, 0, C[k], { rim: false }); mb.emit.fill(1);
    // 只截取脸部 24×24
    const crop = new PX.Buf(24, 24); for (let y = 0; y < 24; y++) for (let x0 = 0; x0 < 24; x0++) crop.set(x0, y, mb.get(x0 + 8, y + 9)); crop.emit.fill(1);
    const sel = k === 'lin';
    ui.rect(rxx, by0 + 6, 28, 28, sel ? '#d8a040' : '#07080a');
    ui.blitImage(crop, rxx + 2, by0 + 8, 1);
    // 未知位置的人变暗
    if (k === 'ana' || k === 'zhao') { ui.rect(rxx + 2, by0 + 8, 24, 24, 'rgba(0,0,0,0.55)'); T('?', rxx + 10, by0 + 13, '#ff9ab0', 12); }
    if (k === 'stranger') { ui.rect(rxx + 2, by0 + 30, 24, 2, '#c03030'); }
    T(n, rxx + 14, by0 + 37, sel ? '#f0d8a0' : '#8a9098', 12, { align: 'center' });
    rxx += 32;
  }
  ui.rect(rxx + 2, by0 + 6, 1, 54, '#3a3e44');
  // 事件日志
  const logs = [
    ['03:31', '赵铁军 离开了仓库岗哨。', '#d89a6a'],
    ['03:12', '阿娜 不在宿舍。', '#c89aa8'],
    ['02:55', '周建国 在账本上写下了什么。你没看清。', '#c8c0b0'],
    ['01:40', '电台点名了一批「逃兵」。你屏住了呼吸。', '#e8a080'],
  ];
  let ly = by0 + 6;
  for (const [t, s, c] of logs) { T(t, rxx + 12, ly, '#6a7078', 12); T(s, rxx + 52, ly, c, 12); ly += 15; }

  // 右下：时间控制
  ui.panel(716, 472, 240, 68, { rivets: false, base: 'rgba(12,13,16,0.94)' });
  const ctl = ['❚❚', '▶', '▶▶', '▶▶▶'];
  for (let i = 0; i < 4; i++) { ui.rect(726 + i * 40, 482, 36, 22, i === 1 ? '#5a3a24' : '#2c3036'); T(ctl[i], 744 + i * 40, 486, i === 1 ? '#f0d8b0' : '#a0a8b0', 12, { align: 'center' }); }
  T('距天亮 3 小时 20 分', 726, 512, '#7a8088', 12);

  ui.blit(canvas, 2);
}
