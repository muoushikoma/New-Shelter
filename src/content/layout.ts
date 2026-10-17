// 避难所布局（世界像素坐标，480×270 缓冲区）
import type { RoomId } from '../sim/types';

export const FLOORS = [
  { y: 78, h: 42 },
  { y: 128, h: 42 },
  { y: 178, h: 44 },
];
export const floorY = (f: number) => FLOORS[f].y + FLOORS[f].h - 2; // 脚底所在 y

export interface RoomDef { id: RoomId; name: string; floor: number; x: number; w: number }
export const ROOMS: RoomDef[] = [
  { id: 'entrance', name: '气闸', floor: 0, x: 8, w: 62 },
  { id: 'storage', name: '仓库', floor: 0, x: 72, w: 90 },
  { id: 'kitchen', name: '公共区', floor: 0, x: 164, w: 100 },
  { id: 'vent', name: '通风 / 水房', floor: 0, x: 266, w: 86 },
  { id: 'dorm', name: '宿舍', floor: 1, x: 8, w: 122 },
  { id: 'generator', name: '发电机', floor: 1, x: 132, w: 82 },
  { id: 'infirmary', name: '医务室', floor: 1, x: 216, w: 80 },
  { id: 'washroom', name: '厕所', floor: 1, x: 298, w: 54 },
  { id: 'archive', name: '档案室', floor: 2, x: 8, w: 74 },
  { id: 'lower', name: '下层小间', floor: 2, x: 84, w: 70 },
  { id: 'collapse', name: '坍塌区', floor: 2, x: 156, w: 196 },
];
export const ROOM: Record<string, RoomDef> = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
export const roomName = (id: RoomId) => (id === 'outside' ? '地表' : ROOM[id]?.name || id);

// 梯子：floor a 与 a+1 之间
export const LADDERS = [
  { a: 0, b: 1, x: 52 },
  { a: 1, b: 2, x: 140 },
];
export const SURFACE_LADDER_X = 38;

export function roomAt(floor: number, x: number): RoomId {
  for (const r of ROOMS) if (r.floor === floor && x >= r.x - 1 && x < r.x + r.w + 1) return r.id;
  return floor === 0 ? 'entrance' : floor === 1 ? 'dorm' : 'lower';
}

// 可交互物件
export interface ObjDef { id: string; room: RoomId; x: number; name: string; w: number }
export const OBJECTS: ObjDef[] = [
  { id: 'door', room: 'entrance', x: 19, name: '防爆门', w: 18 },
  { id: 'hatch', room: 'entrance', x: 38, name: '通往地表的竖井', w: 8 },
  { id: 'cage', room: 'storage', x: 100, name: '仓库铁笼', w: 52 },
  { id: 'post', room: 'storage', x: 146, name: '岗哨', w: 14 },
  { id: 'stove', room: 'kitchen', x: 178, name: '炉灶', w: 20 },
  { id: 'table', room: 'kitchen', x: 228, name: '长桌', w: 40 },
  { id: 'radio', room: 'kitchen', x: 256, name: '收音机', w: 10 },
  { id: 'crank', room: 'vent', x: 284, name: '手摇通风机', w: 16 },
  { id: 'tank', room: 'vent', x: 331, name: '储水罐', w: 26 },
  { id: 'bunks', room: 'dorm', x: 40, name: '床铺', w: 60 },
  { id: 'curtain', room: 'dorm', x: 108, name: '挂帘子的床', w: 26 },
  { id: 'gen', room: 'generator', x: 170, name: '发电机', w: 40 },
  { id: 'barrels', room: 'generator', x: 202, name: '油桶', w: 16 },
  { id: 'cot', room: 'infirmary', x: 262, name: '病床', w: 34 },
  { id: 'cabinet', room: 'infirmary', x: 227, name: '药柜', w: 14 },
  { id: 'bucket', room: 'washroom', x: 316, name: '水桶与便桶', w: 20 },
  { id: 'files', room: 'archive', x: 42, name: '档案柜', w: 60 },
  { id: 'archdoor', room: 'lower', x: 88, name: '档案室的门', w: 8 },
  { id: 'mattress', room: 'lower', x: 117, name: '床垫', w: 28 },
  { id: 'rubble', room: 'collapse', x: 170, name: '瓦砾', w: 20 },
  { id: 'farmbed', room: 'lower', x: 96, name: '种植床', w: 12 },
];
export const OBJ: Record<string, ObjDef> = Object.fromEntries(OBJECTS.map((o) => [o.id, o]));

// 某个房间里的「站位」（让人不会叠在一起）
export function spotIn(room: RoomId, k: number): number {
  const r = ROOM[room];
  if (!r) return 40;
  const n = Math.max(3, Math.floor((r.w - 12) / 9));
  const i = ((k % n) + n) % n;
  return r.x + 8 + i * Math.floor((r.w - 16) / (n - 1 || 1));
}

// 床位（宿舍 6 张 + 小间床垫 2 + 病床 1）
export const BEDS: { room: RoomId; x: number; upper: boolean; private: boolean }[] = [
  { room: 'dorm', x: 18, upper: false, private: false },
  { room: 'dorm', x: 18, upper: true, private: false },
  { room: 'dorm', x: 74, upper: false, private: false },
  { room: 'dorm', x: 74, upper: true, private: false },
  { room: 'dorm', x: 104, upper: false, private: true },
  { room: 'dorm', x: 104, upper: true, private: true },
  { room: 'lower', x: 110, upper: false, private: true },
  { room: 'lower', x: 124, upper: false, private: true },
  { room: 'infirmary', x: 254, upper: false, private: false },
];
