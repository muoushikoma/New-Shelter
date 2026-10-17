// 模拟层数据结构：全部是纯数据，可直接 JSON 序列化存档
import type { RngState } from '../engine/rng';
import type { Look } from '../art/actors';

export type NeedKey = 'hunger' | 'thirst' | 'warmth' | 'energy' | 'hygiene' | 'stress' | 'desire';
// hunger/thirst/warmth/energy/hygiene：100 = 满足，0 = 极度匮乏；stress：0 = 平静，100 = 崩溃；desire：0 = 无，100 = 强烈
export type SkillKey = 'medic' | 'mechanic' | 'cook' | 'combat' | 'stealth' | 'persuade' | 'forgery' | 'scavenge';
export type OriginKey = 'deserter' | 'cadre' | 'nurse' | 'worker' | 'teacher' | 'foreigner' | 'singer' | 'miner' | 'mechanic' | 'priest' | 'trader' | 'farmer' | 'soldier' | 'student';
export type Regime = 'loyal' | 'cynic' | 'rebel';
export type ItemKey =
  | 'food' | 'water' | 'fuel' | 'meds' | 'bandage' | 'cigs' | 'alcohol' | 'ammo' | 'pistol' | 'rifle' | 'knife'
  | 'crowbar' | 'tools' | 'parts' | 'blankPermit' | 'stamp' | 'pass' | 'forgedPass' | 'seeds' | 'condom'
  | 'valuables' | 'candle' | 'blanket' | 'map' | 'radioParts' | 'filter' | 'storageKey' | 'archiveKey' | 'papers';

export interface Personality {
  power: number;     // 权力欲
  morality: number;  // 道德底线
  fear: number;      // 恐惧阈值（高 = 胆大）
  attach: number;    // 依附性
  lust: number;      // 亲密/欲望需求强度
  social: number;    // 外向
  agree: number;     // 宜人
  neuro: number;     // 神经质
  regime: Regime;
}

export interface Condition { type: CondType; sev: number; since: number }
export type CondType = 'wound' | 'infection' | 'fever' | 'flu' | 'dysentery' | 'frostbite' | 'heart' | 'pregnant' | 'trauma' | 'drunk' | 'captive' | 'hypothermia' | 'starving' | 'grief';

export interface Memory {
  t: number;              // 游戏分钟
  kind: string;           // 例如 'gave_food' 'stole' 'intimacy' 'betrayed' 'saved'
  who?: string;           // 主要相关人
  about?: string;         // 第三人
  w: number;              // 情绪权重 -100..100
  text: string;
  tags?: string[];
}

export type RelState = 'stranger' | 'acquainted' | 'friend' | 'flirting' | 'lovers' | 'affair' | 'transactional' | 'patronage' | 'domination' | 'enemy';
export interface Relation {
  trust: number; affection: number; fear: number; desire: number; respect: number; resentment: number; debt: number;
  state: RelState; times: number; lastTalk: number; flirts: number;
}

export interface Secret { id: string; text: string; severity: number; known: string[] }

export type ActionType =
  | 'idle' | 'move' | 'eat' | 'drink' | 'sleep' | 'warm' | 'wash' | 'work' | 'chat' | 'comfort' | 'flirt' | 'intimacy'
  | 'steal' | 'hoard' | 'smoke' | 'booze' | 'pray' | 'guard' | 'treat' | 'rest' | 'expedition' | 'away' | 'wander'
  | 'cook' | 'crank' | 'refuel' | 'repair' | 'clear' | 'fixradio' | 'forge' | 'farm' | 'meeting' | 'take' | 'give'
  | 'listen' | 'sing' | 'cry' | 'fight' | 'search' | 'wait' | 'melt' | 'buildfilter';

export interface Action {
  type: ActionType;
  room: RoomId;
  x: number;            // 目标位置
  dur: number;          // 持续分钟（到达后）
  t: number;            // 已执行分钟
  target?: string;      // 目标人物
  item?: ItemKey;
  data?: Record<string, unknown>;
  reason?: string;      // 给玩家看的「为什么」
  secret?: boolean;     // 需要避人耳目
  playerCmd?: boolean;
}

export type RoomId = 'entrance' | 'storage' | 'kitchen' | 'vent' | 'dorm' | 'generator' | 'infirmary' | 'washroom' | 'lower' | 'archive' | 'collapse' | 'outside';

export interface Person {
  id: string; name: string; age: number; gender: 'm' | 'f'; orientation: 'straight' | 'gay' | 'bi';
  origin: OriginKey; originText: string; bio: string;
  isPlayer: boolean; alive: boolean; present: boolean; deathCause?: string; deathDay?: number; leftReason?: string;
  look: Look;
  skills: Record<SkillKey, number>;
  pers: Personality;
  traits: string[];
  needs: Record<NeedKey, number>;
  health: number;
  conds: Condition[];
  inv: Partial<Record<ItemKey, number>>;
  stash: Partial<Record<ItemKey, number>>;
  floor: number; x: number; px: number; pfloor: number; // 位置（px/pfloor 为上一帧，用于插值）
  facing: number; walkFrame: number;
  climb: { to: number; left: number } | null;
  external?: boolean;
  action: Action | null;
  queue: Action[];
  goals: string[];              // 追求的目标节点
  agenda: Record<string, number>; // 目标节点上的进度/冷却
  secrets: Secret[];
  knows: Record<string, boolean>;
  mem: Memory[];
  role: 'leader' | 'keeper' | 'guard' | null;
  work: number;                 // 今日劳动分钟
  workTotal: number;
  tags: Record<string, number>; // 达成方式统计（交易/合作/欺骗/暴力/亲密/牺牲他人…）
  bark?: { text: string; until: number };
  thought: string;
  bed?: number;
  joinedDay: number;
  partner?: string | null;
}

export interface Rules {
  ration: 'equal' | 'contribution' | 'leader' | 'free';
  rationSize: number;            // 每人每日份数
  door: 'closed' | 'vote' | 'useful' | 'open';
  weapons: 'common' | 'leader' | 'own';
  intimacy: 'free' | 'banned' | 'leaderPrivilege';
  punishment: 'warning' | 'ration' | 'confine' | 'expel';
  decision: 'assembly' | 'leader';
  ballot: 'open' | 'secret';
  storageLocked: boolean;
  nightWatch: boolean;
}

export interface LogEntry { t: number; text: string; col?: string; who?: string[] ; important?: boolean }
export interface Rumor { id: string; fact: string; text: string; about: string[]; t: number; truth: boolean; severity: number }

export interface Visitor { personId: string; kind: string; arrived: number }

export interface WarState {
  phase: number;
  phaseStart: number[];        // 每个阶段开始的天数
  endDay: number;
  outcome: 'ceasefire' | 'regime' | 'occupation' | 'collapse' | null;
  passSlots: number;           // 本阶段军方还能给出的通行证
  smugSeats: number;
}

export type LocId = 'grain' | 'hospital' | 'party' | 'station' | 'church' | 'houses' | 'border' | 'camp' | 'market' | 'redcross';
export interface LocState { looted: number; known: boolean; visits: number }

export interface Expedition {
  members: string[]; loc: LocId; leaveAt: number; returnAt: number; purpose: string; carry: Partial<Record<ItemKey, number>>;
  resolved: boolean; npcOnly: boolean;
}

export interface Encounter { kind: string; text: string; options: { id: string; label: string; tip?: string }[] }
export interface Trip {
  loc: LocId; members: string[]; stage: 'going' | 'at' | 'back' | 'done'; until: number; notes: string[];
  encounter: Encounter | null; searches: number; arrivedAt: number; result: string[];
}

export interface PendingEvent { id: string; t: number; ctx: Record<string, unknown> }

export interface Settings { adult: boolean; coercion: boolean; pregnancy: boolean; speed: number; autoPause: boolean; autoNeeds?: boolean }

export interface World {
  version: number;
  seed: number;
  rng: RngState;
  t: number;                     // 游戏分钟（第 1 天 08:00 起）
  people: Person[];
  rel: Record<string, Record<string, Relation>>;
  storage: Partial<Record<ItemKey, number>>;
  shelter: {
    power: boolean; genFuel: number; genHealth: number; co2: number; water: number;
    tempOut: number; rooms: Record<string, { temp: number; lit: boolean }>;
    archiveOpen: boolean; collapseWork: number; drainFound: boolean; radioWork: number; radioFixed: boolean;
    farm: number; farmBuilt: boolean; filterBuilt: boolean; candles: number; doorOpen: boolean;
    keyHolder: string | null; damage: number;
  };
  politics: {
    leader: string | null; legitimacy: number; rules: Rules; lastMeeting: number; meetings: number;
    abuses: number; history: string[]; rationsDoneDay: number;
  };
  war: WarState;
  locs: Record<LocId, LocState>;
  expeditions: Expedition[];
  trip: Trip | null;
  facts: Record<string, number | string | boolean>;
  log: LogEntry[];
  rumors: Rumor[];
  pending: PendingEvent[];
  firedEvents: Record<string, number>;
  discovered: Record<string, boolean>;   // 玩家已知的目标节点/解法
  done: Record<string, Record<string, number>>; // 节点完成：done[personId][nodeId] = 时间
  tracked: string[];
  visitors: Visitor[];
  settings: Settings;
  ending: EndingResult | null;
  stats: { deaths: number; births: number; thefts: number; intimacies: number; expeditions: number; daysAlive: number };
  nextId: number;
}

export interface EndingResult {
  title: string; subtitle: string; where: string; who: string; withWhom: string; shelter: string; world: string; how: string;
  lines: string[]; epilogues: { id: string; text: string }[]; day: number; terminal: string;
}
