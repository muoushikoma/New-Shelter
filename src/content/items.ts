import type { ItemKey } from '../sim/types';

export interface ItemDef { name: string; value: number; weight: number; desc: string; unit?: string }

// value：在黑市/交易中的大致价值（1 = 一份口粮）
export const ITEMS: Record<ItemKey, ItemDef> = {
  food: { name: '口粮', value: 1, weight: 0.5, desc: '一份罐头或干粮，约 800 千卡。', unit: '份' },
  water: { name: '水', value: 0.15, weight: 1, desc: '饮用水。', unit: 'L' },
  fuel: { name: '燃料', value: 0.8, weight: 1, desc: '柴油。发电机每小时烧约 0.16 升。', unit: 'L' },
  meds: { name: '药品', value: 6, weight: 0.1, desc: '抗生素与退烧药。最硬的硬通货。', unit: '支' },
  bandage: { name: '绷带', value: 1.5, weight: 0.1, desc: '止血、包扎伤口。', unit: '卷' },
  cigs: { name: '香烟', value: 0.6, weight: 0.05, desc: '缓解压力。也是货币。', unit: '支' },
  alcohol: { name: '酒', value: 2.5, weight: 0.7, desc: '暂时忘掉一切。', unit: '瓶' },
  ammo: { name: '子弹', value: 1, weight: 0.05, desc: '', unit: '发' },
  pistol: { name: '手枪', value: 15, weight: 1, desc: '一把旧手枪。谁拿着它，谁说话就大声。', unit: '把' },
  rifle: { name: '步枪', value: 20, weight: 4, desc: '', unit: '支' },
  knife: { name: '刀', value: 3, weight: 0.3, desc: '', unit: '把' },
  crowbar: { name: '撬棍', value: 3, weight: 2, desc: '能撬开锁住的门。', unit: '根' },
  tools: { name: '工具', value: 3, weight: 2, desc: '扳手、钳子、螺丝刀。', unit: '套' },
  parts: { name: '零件', value: 2, weight: 1, desc: '发电机零件。', unit: '个' },
  blankPermit: { name: '空白通行证', value: 10, weight: 0.05, desc: '盖了一半章的空白证件。', unit: '张' },
  stamp: { name: '内务处印章', value: 12, weight: 0.2, desc: '真的印章。', unit: '枚' },
  pass: { name: '通行证', value: 30, weight: 0.05, desc: '军方签发的边境通行证。', unit: '张' },
  forgedPass: { name: '伪造通行证', value: 15, weight: 0.05, desc: '看起来像真的。', unit: '张' },
  seeds: { name: '菌种与种子', value: 3, weight: 0.2, desc: '可以在地下种蘑菇和豆芽。', unit: '包' },
  condom: { name: '避孕套', value: 1, weight: 0.01, desc: '', unit: '个' },
  valuables: { name: '值钱物件', value: 5, weight: 0.2, desc: '手表、金戒指、外币。', unit: '件' },
  candle: { name: '蜡烛', value: 0.5, weight: 0.1, desc: '停电时唯一的光。', unit: '根' },
  blanket: { name: '毛毯', value: 2, weight: 1.5, desc: '', unit: '条' },
  map: { name: '边境地图', value: 8, weight: 0.05, desc: '标着雷区和界河浅滩。', unit: '张' },
  radioParts: { name: '电台零件', value: 4, weight: 0.5, desc: '真空管和线圈。', unit: '套' },
  filter: { name: '滤水器材', value: 4, weight: 1, desc: '可以过滤地下渗水。', unit: '套' },
  storageKey: { name: '仓库钥匙', value: 0, weight: 0, desc: '仓库唯一的钥匙。', unit: '把' },
  archiveKey: { name: '档案室钥匙', value: 0, weight: 0, desc: '一把生锈的旧钥匙。', unit: '把' },
  papers: { name: '他人证件', value: 6, weight: 0.05, desc: '一个死人的证件。', unit: '份' },
};

export const TRADEABLE: ItemKey[] = ['food', 'water', 'fuel', 'meds', 'bandage', 'cigs', 'alcohol', 'ammo', 'knife', 'crowbar', 'tools', 'parts', 'blankPermit', 'seeds', 'condom', 'valuables', 'candle', 'blanket', 'map', 'radioParts', 'filter', 'pistol', 'pass', 'forgedPass', 'papers', 'stamp'];
