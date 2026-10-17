import { lines } from '../content/lines';
// 玩家能做的事：对物件、对人。返回选项与结果文字，由 UI 展示
import type { Action, ItemKey, Person, RoomId, World } from './types';
import { OBJ, ROOM, BEDS } from '../content/layout';
import { ITEMS, TRADEABLE } from '../content/items';
import { mk, canTakeFromStorage, ACTION_NAMES } from './actions';
import { cnt, rel, relAdd, opinion, player, present, roomOf, P, log, nm, addItem, takeItem, addMem, knowFact, tagMethod, hasCond, awake, isNight, day, pron, clamp, bark } from './util';
import { rnd, chance, pick } from '../engine/rng';
import * as social from './social';
import { propose, willingness, CONSENT_NAMES, attraction } from './intimacy';
import { giveKey } from './politics';
import { hasMil } from './goals';

export interface Opt { id: string; label: string; ok?: boolean; why?: string; tip?: string; tags?: [string, string][]; sub?: boolean }
export interface Result { text?: string; action?: Action; ui?: string; arg?: unknown; who?: string; next?: Opt[]; nextFor?: string }

const near = (a: Person, b: Person) => a.present && b.present && a.floor === b.floor && Math.abs(a.x - b.x) < 40;
const kk = (k: ItemKey) => ITEMS[k].name;

// ---------- 物件 ----------
export function objOptions(w: World, id: string): Opt[] {
  const me = player(w); const s = w.shelter; const r = w.politics.rules;
  const O: Opt[] = [];
  const add = (o: Opt) => O.push(o);
  switch (id) {
    case 'door': add({ id: 'out', label: '外出（去地表）', tip: '夜里出去更安全。外出要几个小时。' }); add({ id: 'peek', label: '从观察孔往外看' }); break;
    case 'hatch': add({ id: 'out', label: '爬上竖井，外出' }); break;
    case 'cage':
      add({ id: 'look', label: '查看库存' });
      if (canTakeFromStorage(w, me)) add({ id: 'take', label: '拿东西', sub: true }); else add({ id: 'steal', label: '偷拿', sub: true, tags: [['被看见会出事', '#c05050']] });
      add({ id: 'put', label: '放东西进去', sub: true });
      break;
    case 'post': add({ id: 'guard', label: '站岗（2 小时）' }); break;
    case 'stove': add({ id: 'cook', label: '做饭', ok: cnt(w.storage, 'fuel') >= 0.3, why: '燃料不够' }); add({ id: 'warm', label: '烤火取暖' }); add({ id: 'melt', label: cnt(w.storage, 'fuel') >= 0.5 ? '化雪烧水（耗 0.5 升燃料）' : '化雪（没燃料，很慢）' }); break;
    case 'table':
      add({ id: 'eat', label: '吃东西', ok: cnt(me.inv, 'food') + cnt(me.stash, 'food') > 0, why: '你身上没有吃的' });
      add({ id: 'meeting', label: '召集开会', ok: w.t - w.politics.lastMeeting > 600, why: '今天已经开过会了' });
      if (w.politics.leader === me.id && w.politics.rules.ration === 'leader') add({ id: 'rations', label: '提前分配今天的口粮' });
      break;
    case 'radio':
      add({ id: 'listen', label: '听广播' });
      if (!s.radioFixed) add({ id: 'fixradio', label: '修电台', ok: (cnt(me.inv, 'radioParts') + cnt(w.storage, 'radioParts') > 0 || s.radioWork > 0) && me.skills.mechanic >= 30, why: me.skills.mechanic < 30 ? '你不懂这个（机械<30）' : '需要电台零件' });
      if (s.radioFixed && w.politics.leader === me.id) add({ id: 'callmil', label: `呼叫军方谈判`, ok: !hasMil(w, me), why: '已经有联系了' });
      if (s.radioFixed && w.war.phase >= 3) add({ id: 'callrc', label: '呼叫红十字救援', ok: !w.facts.rcRegistered, why: '已经登记过了' });
      break;
    case 'crank': add({ id: 'crank', label: '摇通风机（30 分钟）' }); break;
    case 'tank': add({ id: 'drink', label: '喝水', ok: s.water >= 0.5, why: '水罐空了' }); if (!s.filterBuilt) add({ id: 'filter', label: '装滤水器', ok: cnt(me.inv, 'filter') + cnt(w.storage, 'filter') > 0 && me.skills.mechanic >= 25, why: '需要滤水器材和一点机械本事' }); break;
    case 'bunks': case 'curtain': case 'mattress': add({ id: 'sleep', label: '睡觉' }); if (id === 'mattress') add({ id: 'stash', label: '藏东西', sub: true }); if (id === 'mattress' && Object.keys(me.stash).length) add({ id: 'unstash', label: '取出藏的东西' }); break;
    case 'gen':
      add({ id: 'repair', label: `修发电机（状况 ${Math.round(s.genHealth)}%）`, ok: me.skills.mechanic >= 20, why: '你不懂机器' });
      add({ id: 'refuel', label: `加油（油箱 ${s.genFuel.toFixed(1)} 升）`, ok: cnt(w.storage, 'fuel') + cnt(me.inv, 'fuel') > 0, why: '没有燃料' });
      add({ id: 'toggle', label: s.power ? '关掉发电机（省油）' : '发动发电机', ok: s.power || (s.genFuel > 0 && s.genHealth > 0), why: '没油或坏了' });
      break;
    case 'barrels': add({ id: 'refuel', label: '给发电机加油', ok: cnt(w.storage, 'fuel') > 0, why: '没有燃料' }); break;
    case 'cot': add({ id: 'rest', label: '躺下养伤（2 小时）' }); break;
    case 'cabinet': add({ id: 'treatself', label: '给自己处理伤病', ok: me.conds.some((c) => ['wound', 'infection', 'fever', 'flu', 'dysentery', 'frostbite', 'hypothermia'].includes(c.type)), why: '你没什么要处理的' }); break;
    case 'bucket': add({ id: 'wash', label: '擦洗身子', ok: s.water >= 2, why: '水不够' }); break;
    case 'files': add({ id: 'search', label: '翻找档案', ok: s.archiveOpen, why: '门锁着' }); break;
    case 'archdoor':
      if (!s.archiveOpen) {
        add({ id: 'unlock', label: '用钥匙开门', ok: cnt(me.inv, 'archiveKey') > 0, why: '你没有钥匙' });
        add({ id: 'pry', label: '撬开', ok: cnt(me.inv, 'crowbar') > 0, why: '需要撬棍' });
      } else add({ id: 'enter', label: '进档案室' });
      w.facts.archiveSeen = true;
      break;
    case 'rubble':
      add({ id: 'clear', label: `清理瓦砾（进度 ${Math.round(s.collapseWork)}%）`, ok: !s.drainFound, why: '已经清开了' });
      if (s.drainFound) add({ id: 'drain', label: '钻进暗渠，去河边（离开避难所）', tags: [['极冷', '#80b0e0'], ['结束这一局', '#c08040']] });
      break;
    case 'farmbed': add({ id: 'farm', label: s.farmBuilt ? `照料种植床（${Math.round(s.farm)}%）` : '搭种植床，种下种子', ok: s.farmBuilt || cnt(me.inv, 'seeds') + cnt(w.storage, 'seeds') > 0, why: '需要菌种与种子' }); break;
  }
  return O;
}

export function doObj(w: World, id: string, opt: string, arg?: unknown): Result {
  const me = player(w); const s = w.shelter;
  const O = OBJ[id];
  const act = (type: Action['type'], dur: number, extra: Partial<Action> = {}) => ({ action: { ...mk(type, O.room, { obj: id, dur }), playerCmd: true, ...extra } as Action });
  switch (opt) {
    case 'out': return { ui: 'map' };
    case 'peek': return { text: isNight(w) ? '外面一片漆黑。远处的探照灯一下一下地扫过雪地。' : '灰白的天，灰白的雪。镇子在冒烟。' };
    case 'look': return { ui: 'storage' };
    case 'take': return { ui: 'storage', arg: 'take' };
    case 'steal': return { ui: 'storage', arg: 'steal' };
    case 'put': return { ui: 'storage', arg: 'put' };
    case 'guard': return act('guard', 120);
    case 'cook': return act('cook', 40);
    case 'warm': return act('warm', 30);
    case 'melt': return act('melt', 40);
    case 'eat': return act('eat', 12);
    case 'meeting': return { ui: 'meeting' };
    case 'rations': return { ui: 'rations' };
    case 'listen': return act('listen', 25);
    case 'fixradio': return act('fixradio', 60);
    case 'callmil': { w.facts[`C_MIL:${me.id}`] = w.war.phase >= 3 ? 'occupier' : 'regime'; tagMethod(me, '威望'); return { text: '电流声里传来一个不耐烦的声音。你报上了避难所的名字和人数。「……知道了。有事来火车站。」\n\n【你与军方建立了联系】' }; }
    case 'callrc': { w.facts.rcRegistered = true; w.facts.rcBy = me.id; tagMethod(me, '合作'); for (const q of present(w)) relAdd(w, q.id, me.id, { respect: 5 }); return { text: '你一遍遍地重复着避难所的坐标。很久以后，一个女人的声音回答：「收到。我们会把你们列入名单。」' }; }
    case 'crank': return act('crank', 30);
    case 'drink': return act('drink', 4);
    case 'filter': return act('buildfilter', 90);
    case 'sleep': {
      const bi = me.bed !== undefined ? me.bed : BEDS.findIndex((b, i) => !w.people.some((q) => q.alive && q.bed === i));
      if (bi >= 0 && me.bed === undefined) me.bed = bi;
      return { action: { ...mk('sleep', O.room, { obj: id, dur: 600 }), playerCmd: true } };
    }
    case 'stash': return { ui: 'stash' };
    case 'unstash': { for (const [k, v] of Object.entries(me.stash)) addItem(me.inv, k as ItemKey, v || 0); me.stash = {}; return { text: '你把藏着的东西都取了出来。' }; }
    case 'repair': return act('repair', 60);
    case 'refuel': return act('refuel', 10);
    case 'toggle': {
      if (s.power) { s.power = false; w.facts.powerOffByRule = true; log(w, '你关掉了发电机。黑暗压了下来。', { col: '#a8a098' }); for (const q of present(w)) if (q !== me && q.pers.neuro > 60) relAdd(w, q.id, me.id, { resentment: 2 }); return { text: '发电机的声音停了。安静得让人心慌。' }; }
      delete w.facts.powerOffByRule; s.power = true; return { text: '发电机咳嗽了几声，转起来了。灯亮了。' };
    }
    case 'rest': return act('rest', 120);
    case 'treatself': social.treat(w, me, me); return { text: '你给自己处理了一下。' };
    case 'wash': return act('wash', 12);
    case 'search': return act('search', 30);
    case 'unlock': s.archiveOpen = true; w.facts.archiveOpenedBy = me.id; return { text: '锁转动了。门后面是一股霉味和纸张的味道。' };
    case 'pry': { s.archiveOpen = true; w.facts.archiveOpenedBy = me.id; tagMethod(me, '暴力'); const seen = social.witnesses(w, me); for (const q of seen) relAdd(w, q.id, me.id, { trust: -3 }); return { text: '撬棍「嘎」的一声，门开了。封条断成两截。' + (seen.length ? `\n${seen.map((q) => q.name).join('、')}看见了。` : '') }; }
    case 'enter': return { action: { ...mk('idle', 'archive', { x: 40, dur: 5 }), playerCmd: true } };
    case 'clear': return act('clear', 90);
    case 'drain': return { ui: 'drain' };
    case 'farm': return act('farm', s.farmBuilt ? 30 : 60);
  }
  return {};
}

// 仓库操作
export function storageTake(w: World, k: ItemKey, n: number, steal: boolean): string {
  const me = player(w);
  if (steal) { me.action = { ...mk('steal', 'storage', { obj: 'cage', dur: 6, item: k, data: { n } }), playerCmd: true, secret: true }; return ''; }
  const got = takeItem(w.storage, k, n); addItem(me.inv, k, got);
  if (got && w.politics.rules.ration !== 'free' && (w.shelter.keyHolder === me.id || w.politics.leader === me.id)) {
    // 保管人自己拿：别人会怎么看
    const seen = social.witnesses(w, me);
    for (const q of seen) relAdd(w, q.id, me.id, { trust: -2 * got, resentment: got });
    if (k === 'food') w.politics.abuses += 0.3 * got;
  }
  return `拿了${kk(k)}×${got}。`;
}
export function storagePut(w: World, k: ItemKey, n: number): string {
  const me = player(w);
  const got = takeItem(me.inv, k, n); addItem(w.storage, k, got);
  if (got) { for (const q of social.witnesses(w, me)) relAdd(w, q.id, me.id, { trust: 1 + ITEMS[k].value * got * 0.3, respect: 1 }); tagMethod(me, '合作'); }
  return `放进去${kk(k)}×${got}。`;
}
export function stashPut(w: World, k: ItemKey, n: number): string {
  const me = player(w);
  me.action = { ...mk('hoard', 'lower', { obj: 'mattress', dur: 5, item: k, data: { n } }), playerCmd: true, secret: true };
  return '';
}

// ---------- 人 ----------
export function talkOptions(w: World, t: Person): Opt[] {
  const me = player(w);
  const r = rel(w, t.id, me.id);
  const O: Opt[] = [];
  if (!t.alive) return [{ id: 'none', label: '……', ok: false }];
  const sleeping = t.action?.type === 'sleep' && t.action.t > 0;
  if (sleeping) {
    O.push({ id: 'wake', label: `叫醒${pron(t)}` });
    O.push({ id: 'pickpocket', label: `趁${pron(t)}睡着翻${pron(t)}的东西`, tags: [[`潜行 ${me.skills.stealth}`, '#d8b060'], ['偷窃', '#c05050']] });
    return O;
  }
  O.push({ id: 'chat', label: '聊天' });
  O.push({ id: 'ask', label: '打听……', sub: true });
  if (t.needs.stress > 50 || t.conds.some((c) => c.type === 'grief' || c.type === 'trauma')) O.push({ id: 'comfort', label: '安慰' });
  O.push({ id: 'give', label: '送东西', sub: true });
  O.push({ id: 'trade', label: '交易' });
  O.push({ id: 'beg', label: '讨点吃的', ok: cnt(t.inv, 'food') > 0 || w.shelter.keyHolder === t.id, why: `${pron(t)}身上没有吃的` });
  O.push({ id: 'flirt', label: '示好', tags: [['暧昧', '#c05a9a']] });
  O.push({ id: 'intim', label: '求欢', tags: [['亲密', '#c05a9a']], tip: '去一个没人的地方。对方会不会答应，取决于你们的关系和处境。' });
  O.push({ id: 'dealintim', label: '用东西换（交易关系）', sub: true, tags: [['交易', '#c08040']] });
  if (w.settings.coercion && w.politics.leader === me.id) O.push({ id: 'coerce', label: '以领导者的身份要求', tags: [['胁迫', '#c03030']], tip: '这是滥用权力。后果会很严重。' });
  O.push({ id: 'help', label: '请' + pron(t) + '帮忙……', sub: true });
  if (me.partner === t.id) O.push({ id: 'plan', label: '商量将来', ok: !w.facts[`plan:${me.id}`], why: '你们已经说好了' });
  if (w.politics.leader === t.id) O.push({ id: 'pledge', label: '效忠', tags: [['依附', '#8a6ac0']] });
  if (w.shelter.keyHolder === t.id) O.push({ id: 'askkey', label: '要仓库钥匙' });
  if (cnt(t.inv, 'archiveKey')) O.push({ id: 'askarch', label: '要档案室钥匙' });
  O.push({ id: 'tell', label: '告诉' + pron(t) + '别人的秘密……', sub: true, tags: [['揭发', '#d8b060']] });
  O.push({ id: 'threaten', label: '威胁', tags: [['恐吓', '#c05050']], sub: true });
  O.push({ id: 'fight', label: '动手', tags: [['暴力', '#c03030']] });
  O.push({ id: 'observe', label: '观察' });
  return O;
}

export function subOptions(w: World, t: Person, id: string): Opt[] {
  const me = player(w);
  const O: Opt[] = [];
  switch (id) {
    case 'ask':
      O.push({ id: 'ask:K_MIL', label: '军方在哪里？' }); O.push({ id: 'ask:K_SMUG', label: '有没有办法过河？' }); O.push({ id: 'ask:K_REDCROSS', label: '有没有人在救人？' });
      O.push({ id: 'ask:self', label: `你以前是做什么的？` }); O.push({ id: 'ask:want', label: '你想要什么？' });
      for (const q of present(w)) if (q !== t && !q.isPlayer) O.push({ id: 'ask:about:' + q.id, label: `你觉得${q.name}怎么样？` });
      O.push({ id: 'ask:key', label: '谁拿着钥匙？' });
      break;
    case 'give': case 'dealintim':
      for (const k of TRADEABLE) if (cnt(me.inv, k) >= 1) O.push({ id: `${id}:${k}`, label: `${kk(k)}×1（你有 ${Math.floor(cnt(me.inv, k))}）` });
      if (id === 'dealintim') for (const k of ['food', 'meds', 'cigs', 'valuables'] as ItemKey[]) if (cnt(me.inv, k) >= 2) O.push({ id: `${id}:${k}:2`, label: `${kk(k)}×2` });
      if (!O.length) O.push({ id: 'none', label: '你身上没什么可给的', ok: false });
      break;
    case 'help':
      if (!w.shelter.radioFixed && t.skills.mechanic >= 40) O.push({ id: 'help:radio', label: '修电台', ok: cnt(me.inv, 'radioParts') + cnt(w.storage, 'radioParts') > 0 || w.shelter.radioWork > 0, why: '需要电台零件' });
      if (!w.shelter.archiveOpen && t.skills.mechanic >= 60) O.push({ id: 'help:pick', label: '撬开档案室的锁' });
      if (t.skills.forgery >= 40) O.push({ id: 'help:forge', label: '帮我伪造一张通行证', ok: cnt(me.inv, 'blankPermit') > 0 && (cnt(me.inv, 'stamp') > 0 || w.shelter.archiveOpen), why: '需要空白证件和印章（或档案室已打开）' });
      if (t.skills.medic >= 35) O.push({ id: 'help:treat', label: '帮我看看伤病' });
      if ((t.id === 'ana' || t.id === 'wang') && t.knows.K_SMUG) O.push({ id: 'help:intro', label: '介绍我认识走私的人' });
      O.push({ id: 'help:trip', label: '跟我一起出去', ok: t.health > 50, why: `${pron(t)}身体不行` });
      if (t.skills.mechanic >= 30 && !w.shelter.filterBuilt && cnt(w.storage, 'filter') + cnt(me.inv, 'filter') > 0) O.push({ id: 'help:filter', label: '装滤水器' });
      break;
    case 'tell': {
      const known = w.people.flatMap((q) => q !== t && q !== me ? q.secrets.filter((s) => s.known.includes(me.id) && !s.known.includes(t.id)).map((s) => ({ q, s })) : []);
      for (const { q, s } of known) O.push({ id: `tell:${q.id}:${s.id}`, label: `${q.name}：${s.text}` });
      for (const r of w.rumors) if (me.knows['rumor:' + r.id] && !t.knows['rumor:' + r.id] && !r.about.includes(t.id)) O.push({ id: `rumor:${r.id}`, label: r.text });
      if (!O.length) O.push({ id: 'none', label: '你不知道什么值得说的', ok: false });
      break;
    }
    case 'threaten':
      O.push({ id: 'threat:food', label: '把吃的交出来', ok: cnt(t.inv, 'food') + cnt(t.stash, 'food') > 0, why: `${pron(t)}没有吃的` });
      if (cnt(t.inv, 'pistol')) O.push({ id: 'threat:pistol', label: '把枪交出来' });
      if (w.shelter.keyHolder === t.id) O.push({ id: 'threat:key', label: '把仓库钥匙交出来' });
      if (cnt(t.inv, 'archiveKey')) O.push({ id: 'threat:archiveKey', label: '把档案室钥匙交出来' });
      O.push({ id: 'threat:quiet', label: '「管好你的嘴。」' });
      break;
  }
  return O;
}

// 执行对人的选项。返回 NPC 的回应
export function doTalk(w: World, t: Person, id: string): Result {
  const me = player(w);
  const r = rel(w, t.id, me.id);
  const op = opinion(w, t.id, me.id);
  const say = (s: string) => ({ text: s, who: t.id });
  r.lastTalk = w.t; rel(w, me.id, t.id).lastTalk = w.t;
  const [head, a1, a2, a3] = id.split(':');
  switch (head) {
    case 'wake': t.action = null; relAdd(w, t.id, me.id, { affection: -2 }); return say(pick(w.rng, ['……干嘛？', '（揉着眼睛）什么事？', '你最好有正经事。']));
    case 'pickpocket': {
      const ok = rnd(w.rng) * 100 < me.skills.stealth + 30;
      if (!ok) { t.action = null; relAdd(w, t.id, me.id, { trust: -30, resentment: 25 }); social.addRumor(w, t, `steal:${me.id}:${w.t}`, `${me.name}半夜翻${t.name}的东西。`, [me.id], 50); return say(`${t.name}醒了，一把抓住你的手腕。「你在干什么？」`); }
      const items = Object.entries(t.inv).filter(([, v]) => v);
      return { text: `你轻轻摸了摸${t.name}的口袋。${items.length ? '' : '什么都没有。'}`, next: items.map(([k, v]) => ({ id: `lift:${k}`, label: `拿走${ITEMS[k as ItemKey].name}（${Math.floor(v || 0)}）` })), nextFor: t.id };
    }
    case 'lift': { const k = a1 as ItemKey; const got = takeItem(t.inv, k, k === 'food' || k === 'cigs' ? 1 : 1); addItem(me.inv, k, got); if (k === 'storageKey') giveKey(w, me); w.stats.thefts++; tagMethod(me, '偷窃'); const seen = social.witnesses(w, me, [t]); if (seen.length) { for (const q of seen) relAdd(w, q.id, me.id, { trust: -15 }); return { text: `你拿到了${kk(k)}。但${seen.map((q) => q.name).join('、')}看见了。` }; } return { text: `你拿到了${kk(k)}。没人看见。` }; }
    case 'chat': {
      social.chat(w, me, t);
      const lines = chatLine(w, t);
      return say(lines);
    }
    case 'ask': return say(answer(w, t, a1, a2));
    case 'comfort': social.comfort(w, me, t); tagMethod(me, '合作'); return say(pick(w.rng, ['……谢谢你。', '（靠在你肩上，很久没说话）', '我没事。……其实有事。', '你也不容易。']));
    case 'give': { const k = a1 as ItemKey; social.giveItem(w, me, t, k, 1); tagMethod(me, '合作'); return say(t.needs.hunger < 40 && k === 'food' ? '（几乎是抢过去的）……谢谢。我记住了。' : pick(w.rng, ['谢谢。', '……你要什么？', '我记着。'])); }
    case 'trade': return { ui: 'trade', arg: t.id };
    case 'beg': { const before = cnt(me.inv, 'food'); social.beg(w, me, t, 'food'); return say(cnt(me.inv, 'food') > before ? '拿去吧。' : pick(w.rng, ['不行。', '大家都一样饿。', '我自己都不够。'])); }
    case 'flirt': social.chat(w, me, t); { const before = rel(w, t.id, me.id).desire; const intim = require_intim(); intim.flirt(w, me, t); return say(rel(w, t.id, me.id).desire > before ? pick(w.rng, ['……你真会说话。', '（笑了一下，没有躲开）', '冷吗？过来点。']) : pick(w.rng, ['别这样。', '我没心情。', '……']));}
    case 'intim': case 'dealintim': case 'coerce': {
      const deal: [ItemKey, number] | null = head === 'dealintim' ? [a1 as ItemKey, Number(a2 || 1)] : null;
      const res = propose(w, me, t, { motive: [], deal, coerce: head === 'coerce' });
      if (res.consent === 'refused') return say(head === 'dealintim' ? pick(w.rng, ['你把我当什么人了？', '……不。', '拿着你的东西走开。']) : head === 'coerce' ? '「你敢。」' : pick(w.rng, ['……不了。', '我们还没到那一步。', '别。', '你误会了。']) + (res.why ? `（${res.why}）` : ''));
      if (head === 'coerce') { w.politics.abuses += 2; tagMethod(me, '胁迫'); }
      const how = { eager: '握住了你的手。', willing: '点了点头。', reluctant: '沉默了很久，然后低下了头。', coerced: '没有说话。', refused: '' }[res.consent];
      return { text: `${t.name}${how}（${CONSENT_NAMES[res.consent]}）`, who: t.id };
    }
    case 'help': return help(w, t, a1);
    case 'plan': {
      if (r.trust < 65) return say('……我不知道。现在想不了那么远。');
      const both = me.goals.includes('E_CROSS') || t.goals.includes('E_CROSS');
      w.facts[`plan:${me.id}`] = both ? 'leave' : 'stay'; w.facts[`plan:${t.id}`] = w.facts[`plan:${me.id}`];
      if (!t.goals.includes('E_CROSS') && both) t.goals.unshift('E_CROSS');
      return say(both ? '「如果有机会过河……我们一起走。说好了。」' : '「不管外面变成什么样，我们就在这里，一起。」');
    }
    case 'pledge': {
      if (r.trust < 55) { relAdd(w, t.id, me.id, { trust: 6 }); return say('「嗯。我会看你表现。」'); }
      w.facts[`patron:${me.id}`] = t.id; tagMethod(me, '依附'); relAdd(w, t.id, me.id, { trust: 10, affection: 5 });
      return say('「好。跟着我，不会让你饿着。」');
    }
    case 'askkey': case 'askarch': {
      const k: ItemKey = head === 'askkey' ? 'storageKey' : 'archiveKey';
      const ok = r.trust >= 70 || r.fear >= 60 || ['lovers', 'affair', 'patronage'].includes(r.state);
      if (!ok) { relAdd(w, t.id, me.id, { trust: -3 }); return say('「凭什么给你？」'); }
      takeItem(t.inv, k, 1); addItem(me.inv, k, 1); if (k === 'storageKey') giveKey(w, me);
      return say(r.fear >= 60 ? '（把钥匙扔在地上，转身走了）' : '「……拿去。别让我后悔。」');
    }
    case 'tell': {
      const q = P(w, a1)!; const s = q.secrets.find((x) => x.id === a2)!;
      s.known.push(t.id); relAdd(w, t.id, q.id, { trust: -s.severity * 0.3, respect: -s.severity * 0.15 }); relAdd(w, t.id, me.id, { trust: 3 });
      tagMethod(me, '揭发');
      if (Math.random() < 0.3) relAdd(w, q.id, me.id, { resentment: 15 });
      return say(pick(w.rng, ['……真的？', '我就知道。', '这话你别再跟别人说了。', '（脸色变了）']));
    }
    case 'rumor': { const rr = w.rumors.find((x) => x.id === a1)!; t.knows['rumor:' + rr.id] = true; for (const who of rr.about) social.applyRumorJudgement(w, t, who, rr, rel(w, t.id, me.id).trust / 100); return say(pick(w.rng, ['……真的？', '难怪。', '你从哪儿听来的？'])); }
    case 'threat': {
      const myPow = me.skills.combat + (cnt(me.inv, 'pistol') ? 40 : 0) + (w.politics.leader === me.id ? 20 : 0);
      const theirs = t.skills.combat + (cnt(t.inv, 'pistol') ? 40 : 0) + t.pers.fear / 2;
      tagMethod(me, '暴力');
      if (myPow + rnd(w.rng) * 30 > theirs) {
        relAdd(w, t.id, me.id, { fear: 20, resentment: 15, trust: -15 });
        addMem(t, w, { kind: 'threatened', who: me.id, w: -40, text: `${me.name}威胁我。` });
        if (a1 === 'quiet') return say('（不敢看你）……我什么都不会说。');
        if (a1 === 'key') { takeItem(t.inv, 'storageKey', 1); giveKey(w, me); return say('（把钥匙扔给你，手在抖）'); }
        const k = a1 as ItemKey;
        const got = takeItem(t.inv, k, k === 'food' ? 3 : 1) || takeItem(t.stash, k, k === 'food' ? 3 : 1);
        addItem(me.inv, k, got);
        for (const q of social.witnesses(w, me, [t])) relAdd(w, q.id, me.id, { fear: 8, trust: -8 });
        return say(`（把东西交了出来，手在抖）`);
      }
      relAdd(w, t.id, me.id, { resentment: 20, fear: -5 });
      return say(pick(w.rng, ['「你吓唬谁呢？」', '（冷笑一声）', '「再说一遍试试。」']));
    }
    case 'fight': social.fight(w, me, t, '你先动的手'); return say('……');
    case 'observe': return { ui: 'person', arg: t.id };
  }
  return {};
}

import * as intimMod from './intimacy';
function require_intim() { return intimMod; }

function help(w: World, t: Person, what: string): Result {
  const me = player(w);
  const r = rel(w, t.id, me.id);
  const willing = r.trust * 0.5 + r.affection * 0.3 + r.debt * 0.5 + t.pers.agree * 0.3 - r.resentment * 0.6;
  const say = (s: string) => ({ text: s, who: t.id });
  if (willing < 35 && what !== 'trip') return say(pick(w.rng, ['我为什么要帮你？', '我没空。', '……以后再说吧。']));
  switch (what) {
    case 'radio': t.action = mk('fixradio', 'kitchen', { obj: 'radio', dur: 120, who: t }); relAdd(w, me.id, t.id, { debt: 5 }); tagMethod(me, '合作'); return say('「我试试。零件呢？」');
    case 'pick': w.shelter.archiveOpen = true; w.facts.archiveOpenedBy = t.id; tagMethod(me, '合作'); return say('（用一根铁丝捅了几下）「开了。别说是我弄的。」');
    case 'forge': { takeItem(me.inv, 'blankPermit', 1); const q = clamp(t.skills.forgery + (cnt(me.inv, 'stamp') ? 25 : 15) + rnd(w.rng) * 15); addItem(me.inv, 'forgedPass', 1); w.facts[`forgeQ:${me.id}`] = q; relAdd(w, me.id, t.id, { debt: 10 }); t.knows['forger:' + me.id] = true; tagMethod(me, '欺骗'); return say(`（写了一个晚上）「拿去。别说是我写的。」\n【得到伪造通行证，以假乱真程度 ${Math.round(q)}】`); }
    case 'treat': social.treat(w, t, me); return say('「坐好，别动。」');
    case 'intro': w.facts[`C_SMUG:${me.id}`] = true; knowFact(w, me, 'K_SMUG'); w.locs.market.known = true; tagMethod(me, '合作'); return say('「去老电影院地下室，找戴毛线帽的人。就说是我让你去的。」\n【你与走私者搭上了线】');
    case 'filter': t.action = mk('buildfilter', 'vent', { obj: 'tank', dur: 90, who: t }); return say('「行，我去弄。」');
    case 'trip': {
      if (willing < 25 && t.pers.fear < 50) return say('「出去？你疯了。」');
      w.facts.tripCompanion = t.id; return { text: `${t.name}点了点头：「什么时候走，叫我。」`, who: t.id, ui: 'map' };
    }
  }
  return {};
}

function chatLine(w: World, t: Person): string {
  const me = player(w);
  const op = opinion(w, t.id, me.id);
  const n = t.needs;
  if (n.hunger < 25) return pick(w.rng, lines('chat.hungry', ['我饿得眼睛都花了。', '你身上……有吃的吗？', '再这样下去，我会做出什么事来，我自己都不知道。']));
  if (n.warmth < 25) return pick(w.rng, lines('chat.cold', ['冷……冷得睡不着。', '我的脚趾没知觉了。']));
  if (n.stress > 75) return pick(w.rng, lines('chat.stressed', ['我受不了了。', '你听，炮声又近了。', '我们会死在这里的，对不对？']));
  if (t.conds.some((c) => c.type === 'grief')) return '……我老是梦见' + (t.mem.find((m) => m.kind === 'death')?.text.replace('死了。', '') || '他') + '。';
  if (op < 0) return pick(w.rng, lines('chat.hostile', ['有话快说。', '我跟你没什么好聊的。', '……']));
  if (t.partner === me.id) return pick(w.rng, lines('chat.partner', ['你今天还好吗？', '晚上……一起睡吧，暖和。', '等这一切结束了，你想去哪儿？']));
  const lead = P(w, w.politics.leader);
  const pool = [t.bio, t.thought ? `（${t.thought}）` : '', lead && lead !== t ? (opinion(w, t.id, lead.id) < 20 ? `${lead.name}？哼。` : `${lead.name}还算靠得住。`) : '', w.war.phase >= 2 ? '你听说了吗？镇子西边全炸平了。' : '你觉得战争什么时候结束？', t.traits.includes('烟瘾') ? '有烟吗？' : '', ...lines('chat.general', [])].filter(Boolean);
  return pick(w.rng, pool);
}

function answer(w: World, t: Person, what: string, arg?: string): string {
  const me = player(w);
  const r = rel(w, t.id, me.id);
  const open = r.trust >= 55 || r.debt > 20 || r.affection > 65;
  switch (what) {
    case 'K_MIL': case 'K_SMUG': case 'K_REDCROSS': {
      if (!t.knows[what]) return '我不知道。';
      if (!open) return '（看了你一眼）……我怎么知道。';
      knowFact(w, me, what);
      if (what === 'K_MIL') { w.locs.camp.known = true; return '火车站旁边，探照灯那儿。军队在那儿设了个交换点。有东西就能换通行证——如果你有足够的东西。'; }
      if (what === 'K_SMUG') { w.locs.market.known = true; return '老电影院的地下室。那儿有人做过河的生意。要付得起。'; }
      w.locs.redcross.known = true; return '我听说红十字的人会在教堂那边设救助站。';
    }
    case 'self': return t.bio;
    case 'want': {
      if (!open) return '活着。还能想要什么？';
      const g = t.goals[0] || '';
      const map: Record<string, string> = { E_CROSS: '过河。离开这个国家。', E_PASS: '一张通行证。', P_LEADER: '这里需要有人做主。', W_HOARD: '多攒点东西。谁知道明天会怎样。', L_PARTNER: '……有个人陪着。', S_SELF: '让这里能自己活下去，不靠外面。', S_REBUILD: '等仗打完了，这里也许能变成一个像样的地方。', R_EXPOSE: '让该付出代价的人付出代价。', D_PATRON: '跟着一个靠得住的人。', R_RADIO: '修好那台电台，听听外面到底怎么样了。', W_MARKET: '做点买卖。', S_RESCUE: '等救援。' };
      if (g.startsWith('REVENGE:')) return `${nm(w, g.slice(8))}欠我的，我会讨回来。`;
      return map[g] || '活着。';
    }
    case 'about': {
      const q = P(w, arg)!;
      const o = opinion(w, t.id, q.id);
      if (!open && o < 30) return '……不好说。';
      const sec = q.secrets.find((s) => s.known.includes(t.id));
      if (sec && open && r.trust > 65) { if (!sec.known.includes(me.id)) sec.known.push(me.id); return `（压低声音）${sec.text}`; }
      const rum = w.rumors.find((x) => x.about.includes(q.id) && t.knows['rumor:' + x.id]);
      if (rum && open) { me.knows['rumor:' + rum.id] = true; return `我听说……${rum.text}`; }
      return o > 55 ? `${q.name}人不错。` : o < 10 ? `离${q.name}远点。` : `${q.name}？还行吧。`;
    }
    case 'key': { const k = P(w, w.shelter.keyHolder); const a = w.people.find((x) => x.alive && cnt(x.inv, 'archiveKey') > 0); return `${k ? `仓库钥匙在${k.isPlayer ? '你' : k.name}那儿。` : '仓库没锁。'}${a && open ? `档案室的钥匙？好像在${a.isPlayer ? '你' : a.name}身上。` : ''}`; }
  }
  return '……';
}

// 是否靠得够近（UI 用来决定先走过去）
export function isNear(w: World, t: Person) { return near(player(w), t); }
export function walkTo(w: World, room: RoomId, x: number) { const me = player(w); me.action = { ...mk('idle', room, { x, dur: 1 }), playerCmd: true }; me.queue = []; }
export { ACTION_NAMES };
