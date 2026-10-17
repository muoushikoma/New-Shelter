// 角色池：每局从中抽取，并对人格、技能、物品做随机扰动
import type { Look } from '../art/actors';
import type { ItemKey, OriginKey, Personality, SkillKey } from '../sim/types';

export interface PersonTemplate {
  key: string; name: string; age: number; gender: 'm' | 'f'; orientation?: 'straight' | 'gay' | 'bi';
  origin: OriginKey; originText: string; bio: string;
  look: Look;
  skills: Partial<Record<SkillKey, number>>;
  pers: Partial<Personality>;
  traits: string[];
  secrets: { id: string; text: string; severity: number }[];
  goals: string[];           // 倾向追求的目标节点
  inv?: Partial<Record<ItemKey, number>>;
  knows?: string[];
  conds?: string[];
}

export const POOL: PersonTemplate[] = [
  {
    key: 'lin', name: '林秋', age: 31, gender: 'f', origin: 'nurse', originText: '前护士',
    bio: '镇医院的护士。医院挨炸那天她在值夜班，是从废墟里爬出来的。',
    look: { skin: 'pale', hair: '#1c1a1f', style: 'tied', coat: '#9a9890', pants: '#3b3d48', male: false, scarf: '#7a2f34' },
    skills: { medic: 70, cook: 30, persuade: 35 },
    pers: { power: 20, morality: 70, fear: 45, attach: 50, lust: 45, social: 45, agree: 70, neuro: 60, regime: 'cynic' },
    traits: ['温柔', '失眠'], secrets: [{ id: 'lin_morphine', text: '她偷偷留了一支吗啡给自己。', severity: 40 }, { id: 'lin_husband', text: '她丈夫是被内务处带走的。', severity: 30 }],
    goals: ['S_SELF', 'E_CROSS', 'L_PARTNER'], inv: { meds: 2, bandage: 2 },
  },
  {
    key: 'zhou', name: '周建国', age: 56, gender: 'm', origin: 'cadre', originText: '前阵线干部',
    bio: '区粮站副站长。三十年党龄，说话总带着会议腔。',
    look: { skin: 'warm', hair: '#8f8c88', style: 'receding', coat: '#3a3f47', pants: '#2c3036', male: true, glasses: true, heavy: true },
    skills: { persuade: 60, forgery: 30, scavenge: 20 },
    pers: { power: 88, morality: 30, fear: 25, attach: 20, lust: 55, social: 55, agree: 30, neuro: 55, regime: 'loyal' },
    traits: ['精于算计', '怕死', '口才', '识字记账', '心脏病'], secrets: [{ id: 'zhou_hoard', text: '他在档案室后面私藏了罐头。', severity: 60 }, { id: 'zhou_informer', text: '他曾给内务处写过举报信。', severity: 80 }],
    goals: ['P_LEADER', 'E_PASS', 'D_PATRON'], inv: { archiveKey: 1, cigs: 6 }, knows: ['K_MIL'], conds: ['heart'],
  },
  {
    key: 'ana', name: '阿娜', age: 24, gender: 'f', orientation: 'bi', origin: 'singer', originText: '歌手',
    bio: '边境那边来的少数民族歌手，在镇上的俱乐部唱歌。她说话带着口音。',
    look: { skin: 'tan', hair: '#6b2e1e', style: 'wavy', coat: '#8c2b2b', pants: '#2b2730', male: false, earring: true },
    skills: { persuade: 55, stealth: 40, cook: 20 },
    pers: { power: 40, morality: 45, fear: 50, attach: 45, lust: 65, social: 75, agree: 55, neuro: 45, regime: 'rebel' },
    traits: ['乐观', '烟瘾'], secrets: [{ id: 'ana_smuggler', text: '她认识河对岸的走私者。', severity: 50 }],
    goals: ['E_CROSS', 'L_PARTNER', 'W_MARKET'], inv: { cigs: 8, valuables: 1 }, knows: ['K_SMUG'],
  },
  {
    key: 'zhao', name: '赵铁军', age: 38, gender: 'm', origin: 'miner', originText: '矿工',
    bio: '煤矿工人，坐过两年牢。力气大，脾气更大。',
    look: { skin: 'tan', hair: '#2b2420', style: 'shaved', coat: '#5b4631', pants: '#33302a', male: true, scar: true, heavy: true },
    skills: { combat: 70, mechanic: 30, scavenge: 50 },
    pers: { power: 60, morality: 40, fear: 80, attach: 30, lust: 70, social: 35, agree: 30, neuro: 50, regime: 'rebel' },
    traits: ['暴躁', '酗酒', '勤劳'], secrets: [{ id: 'zhao_prison', text: '他坐牢是因为打死过一个工头。', severity: 60 }],
    goals: ['P_LEADER', 'W_HOARD', 'L_PARTNER'], inv: { pistol: 1, ammo: 4, alcohol: 1 },
  },
  {
    key: 'su', name: '苏曼', age: 45, gender: 'f', origin: 'teacher', originText: '中学教师',
    bio: '镇中学的语文老师。她写得一手好字，学生们都怕她。',
    look: { skin: 'pale', hair: '#5a4a40', style: 'bun', coat: '#6a5440', pants: '#34302c', male: false, grey: true },
    skills: { forgery: 60, persuade: 50, medic: 20 },
    pers: { power: 45, morality: 80, fear: 55, attach: 30, lust: 25, social: 50, agree: 45, neuro: 40, regime: 'rebel' },
    traits: ['正直', '记仇'], secrets: [{ id: 'su_samizdat', text: '她抄写过禁书。', severity: 45 }],
    goals: ['S_REBUILD', 'R_EXPOSE', 'S_SELF'], inv: { candle: 2 },
  },
  {
    key: 'liu', name: '刘小川', age: 26, gender: 'm', origin: 'mechanic', originText: '机修工',
    bio: '镇上修拖拉机的。什么都能修，就是不会拒绝别人。',
    look: { skin: 'warm', hair: '#2a2522', style: 'cap', coat: '#3d5470', pants: '#3d5470', male: true, cap: '#2f3a48', smudge: true },
    skills: { mechanic: 75, scavenge: 40, stealth: 30 },
    pers: { power: 15, morality: 60, fear: 40, attach: 70, lust: 50, social: 55, agree: 80, neuro: 45, regime: 'cynic' },
    traits: ['勤劳', '老实'], secrets: [{ id: 'liu_crush', text: '他暗恋着避难所里的某个人。', severity: 15 }],
    goals: ['S_SELF', 'L_PARTNER', 'D_PATRON'], inv: { tools: 1, parts: 1 },
  },
  {
    key: 'he', name: '何神父', age: 62, gender: 'm', origin: 'priest', originText: '神父',
    bio: '镇上那座被关了二十年的教堂的神父。教堂刚被炸开，他却好像松了口气。',
    look: { skin: 'pale', hair: '#c8c4bc', style: 'receding', coat: '#1e1e22', pants: '#1e1e22', male: true, grey: true },
    skills: { persuade: 55, medic: 30, scavenge: 20 },
    pers: { power: 10, morality: 90, fear: 70, attach: 20, lust: 5, social: 60, agree: 80, neuro: 25, regime: 'rebel' },
    traits: ['虔诚', '慷慨'], secrets: [{ id: 'he_route', text: '他知道教堂地窖有一条通往河边的旧路。', severity: 50 }],
    goals: ['S_REBUILD', 'S_RESCUE'], inv: { candle: 4, alcohol: 1 }, knows: ['K_SMUG'],
  },
  {
    key: 'wang', name: '王翠', age: 41, gender: 'f', origin: 'trader', originText: '倒爷',
    bio: '在边境做了十几年小买卖，什么都能弄到，什么都有价钱。',
    look: { skin: 'warm', hair: '#3a2a22', style: 'bun', coat: '#5a4a6a', pants: '#2a2630', male: false, earring: true },
    skills: { persuade: 65, scavenge: 45, stealth: 35 },
    pers: { power: 60, morality: 25, fear: 55, attach: 25, lust: 45, social: 70, agree: 40, neuro: 35, regime: 'cynic' },
    traits: ['吝啬', '精于算计', '烟瘾'], secrets: [{ id: 'wang_stash', text: '她的大衣内衬里缝着金戒指。', severity: 35 }],
    goals: ['W_MARKET', 'W_HOARD', 'E_CROSS'], inv: { valuables: 3, cigs: 15, condom: 3 }, knows: ['K_SMUG', 'K_MARKET'],
  },
  {
    key: 'jiang', name: '蒋小舟', age: 21, gender: 'm', origin: 'student', originText: '大学生',
    bio: '回家过寒假的大学生。他相信战争结束后一切都会不一样。',
    look: { skin: 'pale', hair: '#2a2420', style: 'short', coat: '#4a5a6a', pants: '#2a2e36', male: true, glasses: true },
    skills: { forgery: 35, persuade: 45, mechanic: 25 },
    pers: { power: 50, morality: 75, fear: 35, attach: 40, lust: 55, social: 60, agree: 55, neuro: 60, regime: 'rebel' },
    traits: ['理想主义', '失眠'], secrets: [{ id: 'jiang_leaflet', text: '他在学校发过传单，内务处在找他。', severity: 70 }],
    goals: ['R_EXPOSE', 'S_REBUILD', 'L_PARTNER'], inv: { candle: 1 },
  },
  {
    key: 'ye', name: '叶琳', age: 28, gender: 'f', orientation: 'gay', origin: 'soldier', originText: '通讯兵',
    bio: '前线通讯兵，部队溃散后一个人走回来的。她不太说话。',
    look: { skin: 'pale', hair: '#3a3028', style: 'short', coat: '#59603f', pants: '#3a3a30', male: false },
    skills: { combat: 50, mechanic: 45, stealth: 55 },
    pers: { power: 35, morality: 55, fear: 75, attach: 20, lust: 40, social: 25, agree: 40, neuro: 55, regime: 'cynic' },
    traits: ['冷漠', '噩梦'], secrets: [{ id: 'ye_deserter', text: '她也是逃兵。', severity: 70 }],
    goals: ['E_CROSS', 'R_RADIO'], inv: { knife: 1, radioParts: 1 }, knows: ['K_MIL'],
  },
  {
    key: 'han', name: '老韩', age: 52, gender: 'm', origin: 'farmer', originText: '农场工人',
    bio: '国营农场的老工人。他口袋里总装着几粒种子，说是习惯。',
    look: { skin: 'tan', hair: '#5a5048', style: 'short', coat: '#5a5040', pants: '#3a3428', male: true, stubble: true, grey: true },
    skills: { cook: 50, scavenge: 40, mechanic: 20 },
    pers: { power: 25, morality: 65, fear: 50, attach: 40, lust: 30, social: 40, agree: 65, neuro: 30, regime: 'loyal' },
    traits: ['勤劳', '固执'], secrets: [{ id: 'han_son', text: '他儿子在军队里，生死不明。', severity: 20 }],
    goals: ['S_SELF', 'S_REBUILD'], inv: { seeds: 1 },
  },
  {
    key: 'marina', name: '玛丽娜', age: 33, gender: 'f', origin: 'foreigner', originText: '外国记者',
    bio: '外国通讯社的记者，签证在战争开始前一天到期。她的护照可能比命还值钱。',
    look: { skin: 'pale', hair: '#c8a060', style: 'long', coat: '#6a6a5a', pants: '#2a2a30', male: false },
    skills: { persuade: 55, stealth: 40, forgery: 25 },
    pers: { power: 30, morality: 60, fear: 60, attach: 35, lust: 50, social: 65, agree: 50, neuro: 50, regime: 'rebel' },
    traits: ['好奇', '烟瘾'], secrets: [{ id: 'marina_film', text: '她藏着拍下屠杀的胶卷。', severity: 65 }],
    goals: ['E_CROSS', 'S_RESCUE'], inv: { valuables: 2, cigs: 10 }, knows: ['K_REDCROSS'],
  },
];

// 主角出身
export interface Origin { key: OriginKey; label: string; desc: string; skills: Partial<Record<SkillKey, number>>; inv: Partial<Record<ItemKey, number>>; knows: string[]; secret: string; coat: string; pants: string; style: 'short' | 'tied' | 'cap' | 'bun' | 'long' }
export const ORIGINS: Origin[] = [
  { key: 'deserter', label: '逃兵', desc: '你从溃散的部队里跑了回来。宪兵在找你。会打仗，懂军队的规矩。', skills: { combat: 55, stealth: 50, scavenge: 40 }, inv: { knife: 1, ammo: 2 }, knows: ['K_MIL'], secret: '你是逃兵。被宪兵抓到就是枪毙。', coat: '#4e5639', pants: '#3a3a30', style: 'short' },
  { key: 'cadre', label: '前干部', desc: '你在区里的机关坐过办公室。你认识人，也知道人们怎么看你。', skills: { persuade: 60, forgery: 40 }, inv: { cigs: 10, valuables: 1 }, knows: ['K_MIL'], secret: '你的签名出现在一份流放名单上。', coat: '#3a3f47', pants: '#2c3036', style: 'short' },
  { key: 'nurse', label: '医务人员', desc: '你在卫生所工作。在这里，会治病的人谁都不敢得罪。', skills: { medic: 65, cook: 25 }, inv: { meds: 1, bandage: 3 }, knows: [], secret: '你曾给内务处的人开过假病历。', coat: '#a8a8a0', pants: '#3b3d48', style: 'tied' },
  { key: 'worker', label: '工人', desc: '你在拖拉机站干活，手上全是茧。能修，能扛，能熬。', skills: { mechanic: 55, scavenge: 45, combat: 35 }, inv: { tools: 1 }, knows: [], secret: '你偷过厂里的零件拿去黑市卖。', coat: '#3d5470', pants: '#2a3442', style: 'cap' },
  { key: 'teacher', label: '知识分子', desc: '你教书，写字，读过不该读的书。笔有时比枪有用。', skills: { forgery: 55, persuade: 50 }, inv: { candle: 2 }, knows: [], secret: '你的抽屉里有一本禁书。', coat: '#5a4a3a', pants: '#2e2a26', style: 'bun' },
  { key: 'foreigner', label: '外国人', desc: '你持有外国护照。这在边境可能是一张门票，也可能是间谍罪。', skills: { persuade: 45, stealth: 35 }, inv: { valuables: 2 }, knows: ['K_REDCROSS'], secret: '你的护照已经过期。', coat: '#6a6a5a', pants: '#2a2a30', style: 'long' },
];

export const MALE_NAMES = ['陈默', '李卫', '张晨', '王远', '许冬', '高原', '孙北', '方舟'];
export const FEMALE_NAMES = ['陈默', '李薇', '张宁', '许冬', '沈月', '方晴', '孙雪', '高岚'];

// 访客（来敲门的人）随机生成用
export const VISITOR_NAMES_M = ['孙立新', '马德胜', '钱伟', '黄海', '田野', '冯刚'];
export const VISITOR_NAMES_F = ['赵小梅', '刘芳', '吴静', '郑红', '周雅', '何琴'];
