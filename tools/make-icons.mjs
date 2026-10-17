// 生成应用图标：24×24 像素画，按整数倍放大到各个尺寸。node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';

const N = 24;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const px = Array.from({ length: N * N }, () => hex('#10141c'));
const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) px[y * N + x] = typeof c === 'string' ? hex(c) : c; };
const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
// 夜空：上深下浅，抖动过渡
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) set(x, y, (y / N) * 16 > bayer[y % 4][x % 4] + 4 ? '#1a2030' : '#0e1118');
// 雪花
for (const [x, y] of [[3, 2], [19, 4], [8, 1], [14, 3], [21, 9], [2, 8]]) set(x, y, '#c8d0dc');
// 地面积雪
for (let y = 17; y < N; y++) for (let x = 0; x < N; x++) set(x, y, (y - 17) * 3 > bayer[y % 4][x % 4] + 2 ? '#8a96a8' : '#c8d0dc');
// 混凝土门楣（半埋在雪里的掩体）
for (let y = 6; y < 19; y++) for (let x = 4; x < 20; x++) set(x, y, y === 6 || x === 4 || x === 19 ? '#5a5e66' : '#43474f');
for (let x = 3; x < 21; x++) { set(x, 5, '#6a6e76'); set(x, 6, '#5a5e66'); }
// 门洞里的暖光（门半开）
for (let y = 9; y < 19; y++) for (let x = 7; x < 17; x++) set(x, y, '#1a1410');
for (let y = 9; y < 19; y++) for (let x = 11; x < 17; x++) set(x, y, (x - 11) * 3 + (y % 2) > 6 ? '#f0c060' : '#c88a3a');
// 半开的铁门
for (let y = 9; y < 19; y++) for (let x = 7; x < 11; x++) set(x, y, x === 7 || y === 9 ? '#6a5a48' : '#544636');
set(9, 13, '#a89070'); set(9, 14, '#a89070');
// 门口地上的光
for (let x = 10; x < 19; x++) set(x, 19, '#e8c890');
for (let x = 12; x < 21; x++) set(x, 20, '#d8b878');
// 门上的红灯
set(11, 7, '#e04a3a'); set(12, 7, '#e04a3a'); set(11, 8, '#8a2a20'); set(12, 8, '#8a2a20');

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let r = 0xffffffff; for (const x of b) r = table[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// size：输出边长；按 floor(size/24) 倍放大，居中，四周填背景色
function render(size, round = false) {
  const k = Math.floor(size / N), off = Math.floor((size - N * k) / 2);
  const buf = Buffer.alloc(size * size * 4);
  const bg = hex('#0e1118');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = Math.floor((x - off) / k), gy = Math.floor((y - off) / k);
    const c = gx >= 0 && gy >= 0 && gx < N && gy < N ? px[gy * N + gx] : bg;
    const i = (y * size + x) * 4;
    const r = size / 2, dx = x - r + 0.5, dy = y - r + 0.5;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = round && dx * dx + dy * dy > r * r ? 0 : 255;
  }
  return png(size, size, buf);
}
mkdirSync('build/android', { recursive: true });
writeFileSync('build/icon.png', render(512));
writeFileSync('electron/icon.png', render(256));
writeFileSync('public/icon.png', render(192));
for (const [d, s] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  writeFileSync(`build/android/ic_launcher-${d}.png`, render(s));
  writeFileSync(`build/android/ic_launcher_round-${d}.png`, render(s, true));
}
console.log('图标已生成：build/icon.png、electron/icon.png、public/icon.png、build/android/');
