import type { ItemKey, LocId } from '../sim/types';

export interface LocDef {
  id: LocId; name: string; desc: string; travel: number; // 单程分钟
  danger: [number, number, number, number];             // 各阶段的危险度 0..100
  loot?: [ItemKey, number, number, number][];            // 物品, 最少, 最多, 概率
  x: number;                                             // 地表全景图上的位置（世界像素）
  phases?: number[];                                     // 只在这些阶段存在
}

export const LOCS: Record<LocId, LocDef> = {
  houses: { id: 'houses', name: '民房', desc: '被炸塌的居民楼。邻居们没来得及带走的东西还在。', travel: 40, danger: [15, 30, 30, 20], x: 90,
    loot: [['food', 3, 8, 0.9], ['candle', 1, 3, 0.5], ['blanket', 1, 1, 0.4], ['alcohol', 1, 1, 0.3], ['valuables', 1, 2, 0.35], ['cigs', 2, 8, 0.5], ['crowbar', 1, 1, 0.15], ['condom', 1, 3, 0.2], ['knife', 1, 1, 0.15]] },
  grain: { id: 'grain', name: '国营粮站', desc: '粮站的仓库早被人撬开过，但地窖里也许还有东西。', travel: 50, danger: [20, 40, 45, 25], x: 150,
    loot: [['food', 6, 14, 0.9], ['seeds', 1, 1, 0.6], ['fuel', 3, 7, 0.35], ['tools', 1, 1, 0.2]] },
  hospital: { id: 'hospital', name: '镇医院', desc: '医院挨过两次炸。药柜在三楼，楼梯塌了一半。', travel: 60, danger: [25, 45, 45, 25], x: 210,
    loot: [['meds', 1, 3, 0.65], ['bandage', 1, 4, 0.75], ['filter', 1, 1, 0.45], ['alcohol', 1, 1, 0.3], ['blanket', 1, 1, 0.3]] },
  church: { id: 'church', name: '教堂', desc: '关了二十年的教堂，钟楼被打掉了一半。', travel: 45, danger: [10, 25, 25, 15], x: 60,
    loot: [['candle', 2, 6, 0.85], ['seeds', 1, 1, 0.4], ['alcohol', 1, 2, 0.45], ['blanket', 1, 2, 0.4], ['food', 2, 5, 0.6]] },
  party: { id: 'party', name: '阵线党部', desc: '党部大楼。档案被烧了一半，剩下的散了一地。', travel: 55, danger: [35, 55, 70, 40], x: 270,
    loot: [['radioParts', 1, 1, 0.45], ['blankPermit', 1, 1, 0.3], ['cigs', 5, 15, 0.6], ['alcohol', 1, 2, 0.5], ['pistol', 1, 1, 0.12], ['ammo', 2, 6, 0.35], ['valuables', 1, 2, 0.3]] },
  station: { id: 'station', name: '火车站', desc: '最后一列火车没有开出去。车厢里塞满了东西和尸体。', travel: 70, danger: [30, 55, 50, 35], x: 330,
    loot: [['fuel', 5, 12, 0.75], ['parts', 1, 2, 0.5], ['radioParts', 1, 1, 0.35], ['food', 3, 7, 0.55], ['filter', 1, 1, 0.25], ['tools', 1, 1, 0.3], ['rifle', 1, 1, 0.08], ['ammo', 2, 8, 0.3]] },
  border: { id: 'border', name: '边境哨所', desc: '界河边的哨所。河对岸就是另一个国家。雷区标记被雪埋了。', travel: 90, danger: [45, 60, 60, 45], x: 440,
    loot: [['ammo', 2, 10, 0.5], ['rifle', 1, 1, 0.2], ['papers', 1, 1, 0.3], ['map', 1, 1, 0.25], ['food', 1, 3, 0.4]] },
  camp: { id: 'camp', name: '军方营地', desc: '火车站旁的物资交换点。探照灯整夜开着。', travel: 75, danger: [25, 35, 40, 30], x: 375 },
  market: { id: 'market', name: '黑市', desc: '废弃的电影院地下室。烟雾、外币、低声说话的人。', travel: 50, danger: [20, 25, 25, 20], x: 240, phases: [2, 3, 4] },
  redcross: { id: 'redcross', name: '红十字救助站', desc: '教堂后院的白帐篷，屋顶画着红十字。', travel: 50, danger: [5, 5, 10, 5], x: 30, phases: [3, 4] },
};
export const LOC_LIST: LocId[] = ['church', 'houses', 'grain', 'hospital', 'market', 'party', 'station', 'camp', 'border', 'redcross'];
