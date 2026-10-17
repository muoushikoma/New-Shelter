// 行动：移动、执行、完成后的效果
import type { Action, ActionType, ItemKey, Person, RoomId, World } from './types';
import { ROOM, OBJ, LADDERS, floorY, roomAt, BEDS, spotIn } from '../content/layout';
import { clamp, roomOf, present, peopleIn, addItem, takeItem, cnt, log, nm, addMem, relAdd, bark, hasCond, knowFact, P, isNight, hour, awake, tagMethod } from './util';
import { addCond } from './env';
import { rnd, chance } from '../engine/rng';
import * as social from './social';
import * as war from './war';
import { ITEMS } from '../content/items';

export const ACTION_NAMES: Record<ActionType, string> = {
  idle: '发呆', move: '走动', eat: '吃东西', drink: '喝水', sleep: '睡觉', warm: '取暖', wash: '擦洗身子', work: '干活', chat: '聊天', comfort: '安慰',
  flirt: '调情', intimacy: '亲密', steal: '偷东西', hoard: '藏东西', smoke: '抽烟', booze: '喝酒', pray: '祈祷', guard: '站岗', treat: '治疗', rest: '躺着养伤',
  expedition: '外出搜刮', away: '不在', wander: '踱步', cook: '做饭', crank: '摇通风机', refuel: '给发电机加油', repair: '修发电机', clear: '清理瓦砾',
  fixradio: '修电台', forge: '伪造证件', farm: '照料种植床', meeting: '开会', take: '拿东西', give: '给东西', listen: '听广播', sing: '唱歌', cry: '哭',
  fight: '打架', search: '翻找档案', wait: '等待', melt: '化雪烧水', buildfilter: '装滤水器',
};

const hashOff = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return ((h % 7) + 7) % 7 - 3; };

export function mk(type: ActionType, room: RoomId, opt: Partial<Action> & { obj?: string; who?: Person } = {}): Action {
  let x = opt.x ?? (opt.obj ? OBJ[opt.obj].x : spotIn(room, Math.floor(Math.random() * 6)));
  if (opt.who && opt.obj) x += hashOff(opt.who.id) * 2;
  const r = ROOM[room];
  if (r) x = clamp(x, r.x + 3, r.x + r.w - 3);
  return { type, room, x, dur: opt.dur ?? 20, t: 0, target: opt.target, item: opt.item, data: opt.data, reason: opt.reason, secret: opt.secret, playerCmd: opt.playerCmd };
}

export function setAction(w: World, p: Person, a: Action | null) {
  if (p.action && p.action.type === 'sleep' && a?.type !== 'sleep') p.walkFrame = 0;
  p.action = a;
  if (a && a.reason && !p.isPlayer) p.thought = a.reason;
}

export const atTarget = (p: Person, a: Action) => p.present && !p.climb && p.floor === ROOM[a.room]?.floor && Math.abs(p.x - a.x) < 1.5;

// 可到达性：档案室需开门，坍塌区需清理
export function reachable(w: World, room: RoomId) {
  if (room === 'archive') return w.shelter.archiveOpen;
  return room !== 'outside';
}
export function maxX(w: World, floor: number) {
  if (floor === 2) return w.shelter.drainFound ? 350 : 156 + Math.floor(w.shelter.collapseWork / 100 * 20) + 6;
  return 350;
}
export function minX(w: World, floor: number) { return floor === 2 && !w.shelter.archiveOpen ? 86 : 10; }

const SPEED = 26; // 像素/分钟

export function moveStep(w: World, p: Person, tx: number, tf: number) {
  p.px = p.x; p.pfloor = p.floor;
  if (p.climb) {
    p.climb.left--;
    if (p.climb.left <= 0) { p.floor = p.climb.to; p.climb = null; }
    return;
  }
  let gx = tx;
  if (tf !== p.floor) {
    const dir = tf > p.floor ? 1 : -1;
    const lad = LADDERS.find((l) => (dir > 0 ? l.a === p.floor : l.b === p.floor))!;
    gx = lad.x;
    if (Math.abs(p.x - gx) < 1.5) { p.x = gx; p.climb = { to: p.floor + dir, left: 2 }; return; }
  }
  gx = clamp(gx, minX(w, p.floor), maxX(w, p.floor));
  const d = gx - p.x;
  if (Math.abs(d) <= SPEED) p.x = gx; else p.x += Math.sign(d) * SPEED;
  if (d !== 0) { p.facing = Math.sign(d); p.walkFrame++; }
}

// 每分钟推进一个人的行动
export function stepAction(w: World, p: Person) {
  const a = p.action;
  if (!a) { p.px = p.x; p.pfloor = p.floor; return; }
  if (a.type === 'away' || (a.type === 'expedition' && a.data?.loc !== 'drain')) return;
  const tf = ROOM[a.room]?.floor ?? 0;
  if (!atTarget(p, a)) {
    // 目标房间不可达 → 放弃
    if (!reachable(w, a.room)) { finish(w, p, false); return; }
    moveStep(w, p, a.x, tf);
    // 目标人物移动了，跟上
    if (a.target && ['chat', 'comfort', 'flirt', 'treat', 'give', 'fight'].includes(a.type)) {
      const t = P(w, a.target);
      if (!t || !t.alive || !t.present) { finish(w, p, false); return; }
      if (!t.climb) { a.room = roomOf(t); a.x = t.x + (p.x < t.x ? -5 : 5); }
    }
    a.data = a.data || {};
    a.data.walk = ((a.data.walk as number) || 0) + 1;
    if ((a.data.walk as number) > 90) finish(w, p, false);
    return;
  }
  p.px = p.x; p.pfloor = p.floor;
  if (a.t === 0 && !begin(w, p, a)) { finish(w, p, false); return; }
  a.t++;
  perMinute(w, p, a);
  if (p.action !== a) return;
  if (a.t >= a.dur) complete(w, p, a);
}

function finish(w: World, p: Person, ok: boolean) {
  p.action = null;
  if (p.queue.length) p.action = p.queue.shift()!;
  if (!ok && p.isPlayer) { /* 玩家命令失败时由 UI 提示 */ }
}

// 开始执行：检查前提，返回 false 则取消
function begin(w: World, p: Person, a: Action): boolean {
  const s = w.shelter;
  switch (a.type) {
    case 'eat': if (cnt(p.inv, 'food') < 1 && cnt(p.stash, 'food') < 1) return false; return true;
    case 'drink': return s.water >= 0.5;
    case 'wash': return s.water >= 2;
    case 'refuel': return cnt(w.storage, 'fuel') > 0 || cnt(p.inv, 'fuel') > 0;
    case 'cook': return cnt(w.storage, 'fuel') >= 0.3;
    case 'melt': a.data = { ...(a.data || {}), fuel: cnt(w.storage, 'fuel') >= 0.5 }; if (!a.data.fuel) a.dur = Math.max(a.dur, 60); return true;
    case 'smoke': return cnt(p.inv, 'cigs') >= 1;
    case 'booze': return cnt(p.inv, 'alcohol') >= 0.5;
    case 'fixradio': if (!s.radioFixed && s.radioWork <= 0 && cnt(p.inv, 'radioParts') + cnt(w.storage, 'radioParts') < 1) return false; return !s.radioFixed;
    case 'forge': return cnt(p.inv, 'blankPermit') > 0 && (cnt(p.inv, 'stamp') > 0 || w.shelter.archiveOpen);
    case 'farm': return s.farmBuilt || cnt(p.inv, 'seeds') + cnt(w.storage, 'seeds') > 0;
    case 'buildfilter': return !s.filterBuilt && cnt(p.inv, 'filter') + cnt(w.storage, 'filter') > 0;
    case 'search': return s.archiveOpen;
    case 'treat': { const t = P(w, a.target); return !!t && t.alive && t.present; }
    case 'chat': case 'comfort': case 'flirt': case 'intimacy': case 'fight': { const t = P(w, a.target); if (!t || !t.alive || !t.present || hasCond(t, 'captive')) return false; return social.beginSocial(w, p, t, a); }
    case 'steal': return social.beginSteal(w, p, a);
    case 'sleep': if (p.bed !== undefined) { const b = BEDS[p.bed]; a.room = b.room; a.x = b.x; } return true;
  }
  return true;
}

function perMinute(w: World, p: Person, a: Action) {
  const s = w.shelter, n = p.needs;
  switch (a.type) {
    case 'sleep':
      // 渴醒、饿醒、冻醒
      if (n.thirst < 12 || n.hunger < 6 || n.warmth < 8) { a.t = a.dur; break; }
      // 早上醒来
      if (n.energy >= 97 || (n.energy > 70 && hour(w) >= 7 && hour(w) < 21 && !p.isPlayer) || (p.isPlayer && n.energy >= 99)) a.t = a.dur;
      break;
    case 'crank': s.co2 = clamp(s.co2 - 0.55); p.work++; break;
    case 'repair': s.genHealth = clamp(s.genHealth + 0.06 + p.skills.mechanic / 900); p.work++; if (s.genHealth >= 100) a.t = a.dur; break;
    case 'clear': if (!s.drainFound) { s.collapseWork = clamp(s.collapseWork + 0.1 + p.skills.scavenge / 1500); p.work++; } break;
    case 'fixradio': if (!s.radioFixed) { if (s.radioWork === 0) { if (!takeItem(p.inv, 'radioParts', 1)) takeItem(w.storage, 'radioParts', 1); } s.radioWork = clamp(s.radioWork + 0.04 + p.skills.mechanic / 1200); p.work++; } break;
    case 'guard': case 'work': case 'cook': case 'melt': case 'farm': p.work++; break;
    case 'warm': if (roomOf(p) === 'kitchen') takeItem(w.storage, 'fuel', 0.004); break;
    case 'rest': p.health = clamp(p.health + 0.01); break;
    case 'treat': p.work++; break;
  }
}

function complete(w: World, p: Person, a: Action) {
  const s = w.shelter, n = p.needs;
  switch (a.type) {
    case 'eat': {
      const got = takeItem(p.inv, 'food', 1) || takeItem(p.stash, 'food', 1);
      if (got) {
        n.hunger = clamp(n.hunger + 42);
        if ((w.facts.meals as number) > 0) { w.facts.meals = (w.facts.meals as number) - 1; n.stress = clamp(n.stress - 4); n.warmth = clamp(n.warmth + 6); }
      }
      break;
    }
    case 'drink': s.water = Math.max(0, s.water - 0.5); n.thirst = clamp(n.thirst + 36); break;
    case 'wash': s.water = Math.max(0, s.water - 2); n.hygiene = clamp(n.hygiene + 55); break;
    case 'sleep': if (n.energy > 80) n.stress = clamp(n.stress - 5); break;
    case 'warm': break;
    case 'refuel': {
      const need = 10 - s.genFuel;
      let got = takeItem(p.inv, 'fuel', need); if (got < need) got += takeItem(w.storage, 'fuel', need - got);
      s.genFuel += got;
      if (!s.power && s.genFuel > 0 && s.genHealth > 0 && !w.facts.powerOffByRule) { s.power = true; log(w, `${nm(w, p.id)}重新发动了发电机。`); }
      p.work += 10;
      break;
    }
    case 'repair': if (!s.power && s.genHealth > 20 && s.genFuel > 0 && !w.facts.powerOffByRule) { s.power = true; log(w, `${nm(w, p.id)}修好了发电机，灯又亮了。`, { col: '#a0d890' }); } social.gainRespect(w, p, 4); break;
    case 'cook': takeItem(w.storage, 'fuel', 0.3); w.facts.meals = ((w.facts.meals as number) || 0) + 3 + Math.floor(p.skills.cook / 30); social.gainRespect(w, p, 2); break;
    case 'melt': if (a.data?.fuel) { takeItem(w.storage, 'fuel', 0.5); s.water += 10; } else s.water += 4; break;
    case 'smoke': takeItem(p.inv, 'cigs', 1); n.stress = clamp(n.stress - 9); break;
    case 'booze': takeItem(p.inv, 'alcohol', 0.5); n.stress = clamp(n.stress - 16); addCond(w, p, 'drunk', 60); if (p.traits.includes('暴躁') && chance(w.rng, 0.3)) social.drunkTrouble(w, p); break;
    case 'pray': n.stress = clamp(n.stress - (p.traits.includes('虔诚') ? 14 : 6)); break;
    case 'sing': for (const q of peopleIn(w, roomOf(p))) { q.needs.stress = clamp(q.needs.stress - 5); if (q !== p) relAdd(w, q.id, p.id, { affection: 2 }); } bark(p, w, '♪ ……'); break;
    case 'cry': n.stress = clamp(n.stress - 8); break;
    case 'clear':
      if (s.collapseWork >= 100 && !s.drainFound) {
        s.drainFound = true;
        log(w, `${nm(w, p.id)}在坍塌区尽头搬开了最后一块水泥板——后面是一条排水暗渠，有风从里面吹出来。`, { col: '#a0d8e8', important: true });
        for (const q of present(w)) if (roomOf(q) === 'collapse' || q === p) knowFact(w, q, 'K_DRAIN');
        knowFact(w, p, 'K_DRAIN');
        w.facts.drainBy = p.id;
      }
      break;
    case 'fixradio': if (s.radioWork >= 100 && !s.radioFixed) { s.radioFixed = true; log(w, `${nm(w, p.id)}修好了那台旧电台。现在可以收到别的频道了。`, { col: '#a0d890', important: true }); social.gainRespect(w, p, 6); w.done[p.id] = w.done[p.id] || {}; } break;
    case 'forge': {
      takeItem(p.inv, 'blankPermit', 1);
      const q = clamp(p.skills.forgery + (cnt(p.inv, 'stamp') ? 25 : s.archiveOpen ? 15 : 0) + Math.floor(rnd(w.rng) * 20) - 10);
      addItem(p.inv, 'forgedPass', 1);
      w.facts[`forgeQ:${p.id}`] = Math.max(Number(w.facts[`forgeQ:${p.id}`] || 0), q);
      log(w, `${nm(w, p.id)}伪造了一张通行证。${p.isPlayer ? `（以假乱真程度 ${Math.round(q)}）` : ''}`, { col: '#d8c880', who: [p.id] });
      tagMethod(p, '欺骗');
      break;
    }
    case 'farm':
      if (!s.farmBuilt) { if (!takeItem(p.inv, 'seeds', 1)) takeItem(w.storage, 'seeds', 1); s.farmBuilt = true; s.farm = 5; log(w, `${nm(w, p.id)}在下层小间搭了一个种植床，种下了蘑菇菌种和豆子。`, { col: '#a0d890', important: true }); }
      else { s.farm = clamp(s.farm + 6); if (s.farm >= 100) { s.farm = 15; addItem(w.storage, 'food', 11); log(w, `种植床收获了。仓库里多了 11 份食物。`, { col: '#a0d890', important: true }); w.facts.harvests = ((w.facts.harvests as number) || 0) + 1; } }
      p.work += 10; social.gainRespect(w, p, 2);
      break;
    case 'buildfilter': if (!takeItem(p.inv, 'filter', 1)) takeItem(w.storage, 'filter', 1); s.filterBuilt = true; log(w, `${nm(w, p.id)}在渗水的墙角装好了滤水器。以后不用再化雪了。`, { col: '#a0d890', important: true }); social.gainRespect(w, p, 6); break;
    case 'treat': social.treat(w, p, P(w, a.target)!); break;
    case 'search': searchArchive(w, p); break;
    case 'listen': listenRadio(w, p); break;
    case 'chat': case 'comfort': case 'flirt': case 'intimacy': case 'fight': social.completeSocial(w, p, P(w, a.target)!, a); break;
    case 'steal': social.completeSteal(w, p, a); break;
    case 'hoard': social.completeHoard(w, p, a); break;
    case 'guard': break;
    case 'expedition':
      if (a.data?.loc === 'drain') {
        const risk = 0.35 - (cnt(p.inv, 'map') ? 0.15 : 0);
        if (rnd(w.rng) > risk) { war.leaveForever(w, p, 'crossed'); return; }
        addCond(w, p, 'hypothermia', 70); log(w, `${p.name}浑身湿透地从坍塌区爬回来，牙齿打战，说不出话。`, { col: '#a0c0d8' });
        p.agenda.tripCool = w.t + 3 * 1440;
      }
      break;
    case 'take': {
      const k = (a.item || 'food') as ItemKey;
      if (canTakeFromStorage(w, p)) { const got = takeItem(w.storage, k, (a.data?.n as number) || 1); addItem(p.inv, k, got); if (got && p.isPlayer) log(w, `你从仓库拿了${ITEMS[k].name}×${got}。`); }
      break;
    }
    case 'give': { const t = P(w, a.target); if (t && t.alive && t.present) { const got = social.giveItem(w, p, t, (a.item || 'food') as ItemKey, (a.data?.n as number) || 1); if (got && (t.isPlayer || p.isPlayer)) log(w, `${nm(w, p.id)}把${ITEMS[(a.item || 'food') as ItemKey].name}×${got}给了${nm(w, t.id)}。`, { col: '#a0d890' }); } break; }
  }
  if (['crank', 'repair', 'clear', 'cook', 'melt', 'refuel', 'treat', 'farm', 'guard', 'fixradio', 'buildfilter'].includes(a.type)) {
    p.workTotal += a.dur;
    for (const q of peopleIn(w, roomOf(p))) if (q !== p && awake(q)) relAdd(w, q.id, p.id, { respect: 0.6 });
  }
  finish(w, p, true);
}

function searchArchive(w: World, p: Person) {
  const s = w.shelter;
  const found: string[] = [];
  if (!w.facts.archiveLooted) {
    w.facts.archiveLooted = 1;
    addItem(p.inv, 'blankPermit', 2); found.push('两张空白通行证');
    addItem(p.inv, 'stamp', 1); found.push('一枚内务处印章');
    addItem(p.inv, 'map', 1); found.push('一张标着雷区的边境地图');
    knowFact(w, p, 'K_ARCHIVE_FILES');
    found.push('一摞「民防委员会」档案——里面有镇上人的检举材料');
    // 档案里有人的秘密
    for (const q of w.people) for (const sec of q.secrets) if (['zhou_informer', 'jiang_leaflet', 'su_samizdat', 'lin_husband'].includes(sec.id) && !sec.known.includes(p.id)) { sec.known.push(p.id); found.push(`关于${q.name}的材料`); }
    if (w.facts.zhouHoard === undefined && w.people.some((q) => q.id === 'zhou' && q.alive)) { w.facts.zhouHoardFound = 1; addItem(w.storage, 'food', 0); }
  } else if (!w.facts.archiveLooted2 && rnd(w.rng) < 0.5) {
    w.facts.archiveLooted2 = 1; addItem(p.inv, 'candle', 3); found.push('三根蜡烛');
  }
  // 周建国的私藏
  const zhou = P(w, 'zhou');
  if (zhou && cnt(zhou.stash, 'food') > 0 && rnd(w.rng) < 0.6) {
    found.push(`档案柜后面${cnt(zhou.stash, 'food')}罐肉——是周建国藏的`);
    const sec = zhou.secrets.find((x) => x.id === 'zhou_hoard'); if (sec && !sec.known.includes(p.id)) sec.known.push(p.id);
    if (!p.isPlayer && p.pers.morality > 50) { addItem(w.storage, 'food', takeItem(zhou.stash, 'food', 99)); }
  }
  if (found.length) log(w, `${nm(w, p.id)}在档案室找到了：${found.join('；')}。`, { col: '#d8c880', who: [p.id], important: p.isPlayer });
  else log(w, `${nm(w, p.id)}翻了半天档案柜，什么也没找到。`, { who: [p.id] });
}

function listenRadio(w: World, p: Person) {
  const s = w.shelter;
  const ph = w.war.phase;
  if (!s.radioFixed) {
    p.needs.stress = clamp(p.needs.stress + 3);
    const lines = ['「……阵线之声。前线捷报频传，敌人的挑衅必将被粉碎……」', '「……全体公民有义务检举逃兵与动摇分子。坚守岗位者，领袖铭记……」', '「……坚决不许任何人擅自离开民防岗位……」', '「……奖励举报：每检举一名逃兵，奖励口粮五份……」'];
    if (p.isPlayer) log(w, `广播：${lines[Math.floor(rnd(w.rng) * lines.length)]}`, { col: '#c8b890' });
    return;
  }
  // 修好后可以收到其他频道
  const news: [string, string | null][] = [];
  news.push(['「这里是第 4 集团军后勤处，向灰河地区平民广播：火车站设有物资交换点……」', 'K_MIL']);
  if (ph >= 2) news.push(['（对岸的电台，有人用两种语言念着一串坐标和时间，像是在等人）', 'K_SMUG']);
  if (ph >= 3) news.push(['「……红十字国际委员会：灰河镇教堂设立临时救助站，请需要帮助的平民……」', 'K_REDCROSS']);
  if (ph >= 3) news.push(['「……占领当局通告：所有原阵线干部须于三日内登记……」', null]);
  const [text, fact] = news[Math.floor(rnd(w.rng) * news.length)];
  const fresh = !!fact && !p.knows[fact];
  if (p.isPlayer || (fresh && w.people.some((q) => q.isPlayer && q.present && roomOf(q) === 'kitchen'))) log(w, `${nm(w, p.id)}听到电台：${text}`, { col: '#a0c0d8', who: [p.id], important: p.isPlayer });
  if (fact) {
    knowFact(w, p, fact);
    if (fact === 'K_MIL') w.locs.camp.known = w.locs.camp.known || p.isPlayer;
    if (fact === 'K_REDCROSS') w.locs.redcross.known = w.locs.redcross.known || p.isPlayer;
  }
  p.needs.stress = clamp(p.needs.stress - 3);
}

// 仓库是否可以正当拿取
export function canTakeFromStorage(w: World, p: Person) {
  const r = w.politics.rules;
  if (w.shelter.keyHolder === p.id || w.politics.leader === p.id) return true;
  if (r.storageLocked) return false;
  return r.ration === 'free';
}

// 给 AI 用的：一个人现在吃得到东西吗？
export function foodAvailable(w: World, p: Person) { return cnt(p.inv, 'food') + cnt(p.stash, 'food'); }

export function interrupt(w: World, p: Person) { p.action = null; p.queue = []; p.climb = null; p.floor = clamp(p.floor, 0, 2); if (p.present) p.x = clamp(p.x, minX(w, p.floor), maxX(w, p.floor)); }

export function itemName(k: ItemKey) { return ITEMS[k].name; }
export { floorY, roomAt };
